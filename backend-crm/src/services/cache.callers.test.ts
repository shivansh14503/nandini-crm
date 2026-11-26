import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import { prisma } from '../config/prisma.js';
import { invalidateCityCaches } from '../modules/cities/city.service.js';
import { domainMailStatus } from '../modules/email-verification/localChecks.js';
import { formConfigService, invalidateFormConfigCaches } from '../modules/form-configs/formConfig.service.js';
import { lookupService } from '../modules/lookups/lookup.service.js';
import { invalidatePartnerCaches } from '../modules/partner-companies/partnerCompany.service.js';
import { searchService } from '../modules/search/search.service.js';
import { invalidateUserCaches } from '../modules/users/userEmail.service.js';
import { auditService } from './audit.service.js';
import { CACHE_KEYS, cacheService, type GuardedReadOptions } from './cache.service.js';

/**
 * Which cache read each caller uses: every key a CRM write invalidates must be read with `getOrSetGuarded` (a plain
 * read could cache a value read just before the write, after its invalidation), and keys nothing invalidates stay on
 * the cheaper `getOrSet`. The source reads never run here (the cache calls are stubbed).
 */

interface Read {
    method: 'getOrSet' | 'getOrSetGuarded';
    key: string;
    ttl: number;
    placeholderTtlSeconds?: number;
}

function watchReads(stub: (key: string) => unknown): Read[] {
    const reads: Read[] = [];
    mock.method(cacheService, 'getOrSetGuarded', async (key: string, ttl: number, _fetcher: unknown, options: GuardedReadOptions = {}) => {
        reads.push({ method: 'getOrSetGuarded', key, ttl, placeholderTtlSeconds: options.placeholderTtlSeconds });
        return stub(key);
    });
    mock.method(cacheService, 'getOrSet', async (key: string, ttl: number) => {
        reads.push({ method: 'getOrSet', key, ttl });
        return stub(key);
    });
    return reads;
}

/** The glob patterns (SCAN MATCH) one writer's own invalidator deletes. */
async function patternsOf(invalidate: () => Promise<void>): Promise<string[]> {
    const patterns: string[] = [];
    const spy = mock.method(cacheService, 'invalidatePattern', async (pattern: string) => {
        patterns.push(pattern);
    });
    await invalidate();
    spy.mock.restore();
    return patterns;
}

const matches = (pattern: string, key: string) =>
    new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`).test(key);

describe('cached reads', () => {
    afterEach(() => mock.restoreAll());

    it('reads every key a CRM write invalidates with getOrSetGuarded, and the writers\' invalidators cover each one', async () => {
        const reads = watchReads((key) => (key.startsWith(CACHE_KEYS.search('')) ? { results: {} } : key.includes('form-configs') ? {} : []));
        await lookupService.organizations({});
        await lookupService.contacts({ limit: '20' });
        await lookupService.products({});
        await lookupService.partnerCompanies();
        await lookupService.partnerContacts({});
        await lookupService.cities({ country: 'IN', state: 'IN-DL' });
        await formConfigService.getAllConfigs();
        await formConfigService.getAllConfigs(true);
        await searchService.search({ q: 'Acme' });
        await lookupService.users({});
        await lookupService.users({ includeInactive: 'true' });

        // Each guarded read, with the invalidator of the writes that change it (called for real, Redis stubbed).
        const expected: [key: string, writer: string, invalidate: () => Promise<void>][] = [
            ['cache:lookups:organizations:50', 'organization writes', () => cacheService.invalidateEntityCaches('organizations')],
            ['cache:lookups:contacts:20', 'contact writes', () => cacheService.invalidateEntityCaches('contacts')],
            ['cache:lookups:products:50', 'product writes', () => cacheService.invalidateEntityCaches('products')],
            ['cache:lookups:partner-companies', 'partner company writes', invalidatePartnerCaches],
            ['cache:lookups:partner-contacts', 'partner company writes', invalidatePartnerCaches],
            ['cache:address-master:cities:IN-DL:20', 'city admin writes', () => invalidateCityCaches()],
            ['cache:lookups:form-configs:active', 'form-config writes', invalidateFormConfigCaches],
            ['cache:lookups:form-configs:all', 'form-config writes', invalidateFormConfigCaches],
            ['cache:search:all:1:…', 'any entity write', () => cacheService.invalidateEntityCaches('leads')],
            ['cache:lookups:users:active', 'user email edits (Admin › API Integrations)', invalidateUserCaches],
            ['cache:lookups:users:all', 'user email edits (Admin › API Integrations)', invalidateUserCaches],
        ];
        assert.deepEqual(
            reads.map((read) => [read.method, read.key.replace(/^(cache:search:all:1:)\S+$/, '$1…')]),
            expected.map(([key]) => ['getOrSetGuarded', key]),
        );

        for (const [index, [, writer, invalidate]] of expected.entries()) {
            const { key } = reads[index];
            const patterns = await patternsOf(invalidate);
            assert.ok(
                patterns.some((pattern) => matches(pattern, key)),
                `${key} is read guarded but the invalidation of ${writer} (${patterns.join(', ')}) does not cover it`,
            );
        }
    });

    it('gives search, the slowest read, a placeholder that outlives it and keeps its 30 s value TTL', async () => {
        const reads = watchReads(() => ({ results: {} }));
        await searchService.search({ q: 'Acme', totals: 'true', ids: 'true' });
        assert.equal(reads.length, 1);
        assert.equal(reads[0].ttl, 30);
        assert.equal(reads[0].placeholderTtlSeconds, 180);
    });

    it('keeps the default placeholder for single-query reads', async () => {
        const reads = watchReads((key) => (key.includes('form-configs') ? {} : []));
        await lookupService.organizations({});
        await formConfigService.getAllConfigs();
        assert.deepEqual(
            reads.map((read) => read.placeholderTtlSeconds),
            [undefined, undefined],
        );
    });

    it('leaves keys no CRM write changes on plain getOrSet (nature of calls, countries and states, DNS)', async () => {
        const reads = watchReads((key) => (key.startsWith('cache:email-domain:') ? 'mx' : key.startsWith(CACHE_KEYS.addressMaster) ? { countries: [], subdivisions: [] } : []));
        await lookupService.natureOfCalls();
        await lookupService.addressMaster({});
        await lookupService.addressMaster({ country: 'in' });
        assert.equal(await domainMailStatus('example.com'), 'mx');

        assert.deepEqual(
            reads.map((read) => [read.method, read.key]),
            [
                ['getOrSet', 'cache:lookups:nature-of-calls'],
                ['getOrSet', 'cache:address-master'],
                ['getOrSet', 'cache:address-master:IN'],
                ['getOrSet', 'cache:email-domain:example.com'],
            ],
        );
    });
});

describe('option renames', () => {
    const originalTransaction = prisma.$transaction;
    afterEach(() => {
        mock.restoreAll();
        (prisma as { $transaction: unknown }).$transaction = originalTransaction;
    });

    /** The SQL text of a `$queryRaw` / `$executeRaw` call (tagged template or `Prisma.sql`). */
    const sqlText = (query: unknown) => (Array.isArray(query) ? query.join('?') : (query as { sql: string }).sql);
    const tableOf = (text: string) => /\[dbo\]\.\[(\w+)\]/.exec(text)?.[1] ?? '';

    /**
     * Runs `formConfigService.updateOption` on the 'Hardware' option of Product Category (linked to products.category,
     * a select column, and leads.productCategory, a JSON list) against a fake transaction whose tables hold
     * `recordIds` with that value. Returns what happened, in order.
     */
    async function renameOption(body: Record<string, unknown>, recordIds: Record<string, string[]>): Promise<string[]> {
        const events: string[] = [];
        let option = {
            id: 'opt-1',
            categoryId: 'cat-1',
            value: 'Hardware',
            label: 'Hardware',
            metaJson: null,
            sortOrder: 1,
            isActive: true,
            isSystem: false,
            isDefault: false,
            createdAt: new Date(0),
            updatedAt: new Date(0),
        };
        const tx = {
            dropdownOption: {
                findUnique: async () => option,
                findFirst: async () => null,
                update: async ({ data }: { data: Partial<typeof option> }) => (option = { ...option, ...data }),
            },
            dropdownCategory: { findUnique: async () => ({ key: 'shared_product_category', label: 'Product Category', module: 'shared' }) },
            formFieldDefinition: {
                findMany: async () => [
                    { id: 'f-1', module: 'products', fieldKey: 'category', fieldType: 'select', isSystem: true, defaultValue: null },
                    { id: 'f-2', module: 'leads', fieldKey: 'productCategory', fieldType: 'multiselect', isSystem: true, defaultValue: null },
                ],
                update: async () => ({}),
            },
            tableFilter: { findMany: async () => [] },
            async $queryRaw(query: unknown) {
                const text = sqlText(query);
                if (text.includes('sp_getapplock')) return [{ result: 0 }];
                // columnsOf: the values are the table name, then the column names asked for.
                if (text.includes('INFORMATION_SCHEMA')) return (query as { values: string[] }).values.slice(1).map((name) => ({ name, maxLength: -1 }));
                if (text.includes('SELECT [id] FROM')) return (recordIds[tableOf(text)] ?? []).map((id) => ({ id }));
                throw new Error(`unexpected query: ${text}`);
            },
            async $executeRaw(query: unknown) {
                events.push(`update ${tableOf(sqlText(query))}`);
                return 1;
            },
        };
        (prisma as { $transaction: unknown }).$transaction = async (fn: (client: unknown) => Promise<unknown>) => {
            const result = await fn(tx);
            events.push('commit');
            return result;
        };
        mock.method(auditService, 'record', async () => undefined);
        mock.method(cacheService, 'invalidatePattern', async (pattern: string) => {
            events.push(`drop ${pattern}`);
        });
        mock.method(cacheService, 'invalidateEntityCaches', async (entity: string) => {
            events.push(`drop ${entity} caches`);
        });
        await formConfigService.updateOption('opt-1', body, { id: 1, username: 'admin', role: 'Admin' });
        return events;
    }

    it('drops the entity caches of the modules whose records it rewrote, after the commit', async () => {
        const events = await renameOption({ label: 'Computer Hardware' }, { Product: ['p-1', 'p-2'] });
        // Products' lookup, search and dashboards held 'Hardware'; no lead stored it, so lead caches are left alone.
        assert.deepEqual(events, ['update Product', 'commit', 'drop cache:lookups:form-configs*', 'drop products caches']);
    });

    it('drops only the form configs when no record stored the value, or the option was not renamed', async () => {
        assert.deepEqual(await renameOption({ label: 'Computer Hardware' }, {}), ['commit', 'drop cache:lookups:form-configs*']);
        assert.deepEqual(await renameOption({ isDefault: true }, { Product: ['p-1'] }), ['commit', 'drop cache:lookups:form-configs*']);
    });
});
