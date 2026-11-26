import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import { domainMailStatus } from '../modules/email-verification/localChecks.js';
import { formConfigService } from '../modules/form-configs/formConfig.service.js';
import { lookupService } from '../modules/lookups/lookup.service.js';
import { invalidatePartnerCaches } from '../modules/partner-companies/partnerCompany.service.js';
import { searchService } from '../modules/search/search.service.js';
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

/** The glob patterns CRM writes delete (SCAN MATCH). */
async function writePatterns(): Promise<string[]> {
    const patterns: string[] = [];
    mock.method(cacheService, 'invalidatePattern', async (pattern: string) => {
        patterns.push(pattern);
    });
    for (const entity of ['organizations', 'contacts', 'products', 'partner-companies'] as const) await cacheService.invalidateEntityCaches(entity);
    await invalidatePartnerCaches();
    // Module-private invalidators: city.service `invalidateCityCaches` and formConfig.service `invalidate`.
    patterns.push(`${CACHE_KEYS.addressMaster}:cities:*`, `${CACHE_KEYS.lookups('form-configs')}*`);
    return patterns;
}

const matches = (pattern: string, key: string) =>
    new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`).test(key);

describe('cached reads', () => {
    afterEach(() => mock.restoreAll());

    it('reads every key a CRM write invalidates with getOrSetGuarded, and each one is covered by that invalidation', async () => {
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

        assert.deepEqual(
            reads.map((read) => [read.method, read.key.replace(/^(cache:search:all:1:)\S+$/, '$1…')]),
            [
                ['getOrSetGuarded', 'cache:lookups:organizations:50'],
                ['getOrSetGuarded', 'cache:lookups:contacts:20'],
                ['getOrSetGuarded', 'cache:lookups:products:50'],
                ['getOrSetGuarded', 'cache:lookups:partner-companies'],
                ['getOrSetGuarded', 'cache:lookups:partner-contacts'],
                ['getOrSetGuarded', 'cache:address-master:cities:IN-DL:20'],
                ['getOrSetGuarded', 'cache:lookups:form-configs:active'],
                ['getOrSetGuarded', 'cache:lookups:form-configs:all'],
                ['getOrSetGuarded', 'cache:search:all:1:…'],
            ],
        );

        const patterns = await writePatterns();
        for (const read of reads) {
            assert.ok(
                patterns.some((pattern) => matches(pattern, read.key)),
                `${read.key} is read guarded but no write invalidation covers it`,
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

    it('leaves keys no CRM write changes on plain getOrSet (users, nature of calls, countries and states, DNS)', async () => {
        const reads = watchReads((key) => (key.startsWith('cache:email-domain:') ? 'mx' : key.startsWith(CACHE_KEYS.addressMaster) ? { countries: [], subdivisions: [] } : []));
        await lookupService.users({});
        await lookupService.users({ includeInactive: 'true' });
        await lookupService.natureOfCalls();
        await lookupService.addressMaster({});
        await lookupService.addressMaster({ country: 'in' });
        assert.equal(await domainMailStatus('example.com'), 'mx');

        assert.deepEqual(
            reads.map((read) => [read.method, read.key]),
            [
                ['getOrSet', 'cache:lookups:users:active'],
                ['getOrSet', 'cache:lookups:users:all'],
                ['getOrSet', 'cache:lookups:nature-of-calls'],
                ['getOrSet', 'cache:address-master'],
                ['getOrSet', 'cache:address-master:IN'],
                ['getOrSet', 'cache:email-domain:example.com'],
            ],
        );
    });
});
