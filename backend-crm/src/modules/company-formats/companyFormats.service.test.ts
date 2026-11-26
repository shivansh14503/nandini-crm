import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import { ZodError } from 'zod';
import { prisma } from '../../config/prisma.js';
import { auditService, type AuditEntry } from '../../services/audit.service.js';
import { cacheService } from '../../services/cache.service.js';
import type { AuthUser } from '../../types/user.types.js';
import { COMPANY_FORMATS_CACHE_KEY, companyFormatsService } from './companyFormats.service.js';
import { DEFAULT_DISPLAY_FORMATS } from './core/displayFormats.js';

/**
 * companyFormats.service against a Prisma double: the single CompanyFormatSettings row in memory, a `$transaction`
 * that hands the callback a client over it (rolled back when it throws), audit and cache calls captured. Redis isn't
 * running here, so reads go straight to the double.
 */

const admin: AuthUser = { id: 1, username: 'admin', role: 'Admin' };
const savedAt = new Date('2026-11-26T06:00:00.000Z');

interface Row {
    id: number;
    dateFormat: string;
    timeFormat: string;
    numberGrouping: string;
    updatedBy: string | null;
    updatedAt: Date;
}

const realDelegates = new Map<string, unknown>();
function stubDelegate(name: 'companyFormatSettings' | '$transaction', fake: unknown): void {
    const client = prisma as unknown as Record<string, unknown>;
    if (!realDelegates.has(name)) realDelegates.set(name, client[name]);
    Object.defineProperty(client, name, { value: fake, configurable: true, writable: true });
}
function restoreDelegates(): void {
    for (const [name, real] of realDelegates) Object.defineProperty(prisma, name, { value: real, configurable: true, writable: true });
    realDelegates.clear();
}

function setup(initial: Row | null = null) {
    const state: { row: Row | null; writes: number } = { row: initial ? { ...initial } : null, writes: 0 };
    const audits: AuditEntry[] = [];
    const events: string[] = [];
    const model = {
        findUnique: async () => (state.row ? { ...state.row } : null),
        upsert: async ({ create, update }: { create: Omit<Row, 'updatedAt'>; update: Partial<Row> }) => {
            state.writes++;
            events.push('write');
            state.row = state.row ? { ...state.row, ...update, updatedAt: savedAt } : { ...create, updatedAt: savedAt };
            return { ...state.row };
        },
        deleteMany: async () => {
            state.writes++;
            events.push('write');
            const count = state.row ? 1 : 0;
            state.row = null;
            return { count };
        },
    };
    stubDelegate('companyFormatSettings', model);
    stubDelegate('$transaction', async (fn: (tx: unknown) => Promise<unknown>) => {
        const before = state.row ? { ...state.row } : null;
        try {
            const result = await fn({ companyFormatSettings: model, $queryRaw: async () => [{ result: 0 }] });
            events.push('commit');
            return result;
        } catch (err) {
            state.row = before;
            throw err;
        }
    });
    mock.method(auditService, 'record', async (_tx: unknown, entry: AuditEntry) => {
        audits.push(entry);
    });
    mock.method(cacheService, 'invalidate', async (...keys: string[]) => {
        events.push(`invalidate ${keys.join(' ')}`);
    });
    return { state, audits, events };
}

const stored = (values: Partial<Row> = {}): Row => ({
    id: 1,
    dateFormat: 'DD/MM/YYYY',
    timeFormat: '24h',
    numberGrouping: 'international',
    updatedBy: 'palak',
    updatedAt: new Date('2026-11-20T10:00:00.000Z'),
    ...values,
});

describe('companyFormatsService', () => {
    afterEach(() => {
        mock.restoreAll();
        restoreDelegates();
    });

    it('reads "not customized" when no row exists', async () => {
        setup();
        assert.deepEqual(await companyFormatsService.load(), DEFAULT_DISPLAY_FORMATS);
        const dto = await companyFormatsService.get();
        assert.equal(dto.customized, false);
        assert.equal(dto.updatedBy, null);
        assert.equal(dto.currency.code, 'INR');
    });

    it('reads a saved row through the guarded cache key', async () => {
        setup(stored());
        const reads: string[] = [];
        mock.method(cacheService, 'getOrSetGuarded', async (key: string, _ttl: number, fetcher: () => Promise<unknown>) => {
            reads.push(key);
            return fetcher();
        });
        assert.deepEqual(await companyFormatsService.load(), { dateFormat: 'DD/MM/YYYY', timeFormat: '24h', numberGrouping: 'international', customized: true });
        assert.equal((await companyFormatsService.get()).updatedAt, '2026-11-20T10:00:00.000Z');
        assert.deepEqual(reads, [COMPANY_FORMATS_CACHE_KEY, COMPANY_FORMATS_CACHE_KEY]);
        assert.equal(COMPANY_FORMATS_CACHE_KEY, 'cache:lookups:company-formats');
    });

    it('load() falls back to the defaults when the setting cannot be read', async () => {
        mock.method(cacheService, 'getOrSetGuarded', async () => {
            throw new Error('database unreachable');
        });
        assert.deepEqual(await companyFormatsService.load(), DEFAULT_DISPLAY_FORMATS);
        await assert.rejects(companyFormatsService.get(), /database unreachable/);
    });

    it('a first save writes the row, audits customized false → true and drops the cache after the commit', async () => {
        const { state, audits, events } = setup();
        const dto = await companyFormatsService.save({ dateFormat: 'DD-MMM-YYYY', timeFormat: '12h', numberGrouping: 'indian' }, admin);
        assert.deepEqual(state.row, { id: 1, dateFormat: 'DD-MMM-YYYY', timeFormat: '12h', numberGrouping: 'indian', updatedBy: 'admin', updatedAt: savedAt });
        assert.deepEqual(audits, [
            { entityType: 'CompanyFormats', entityId: 'company-formats', action: 'UPDATE', changedBy: 'admin', changes: { customized: { from: false, to: true } } },
        ]);
        assert.deepEqual(events, ['write', 'commit', `invalidate ${COMPANY_FORMATS_CACHE_KEY}`]);
        assert.equal(dto.customized, true);
        assert.equal(dto.updatedBy, 'admin');
        assert.equal(dto.updatedAt, savedAt.toISOString());
    });

    it('a change audits only the fields that changed', async () => {
        const { audits } = setup(stored());
        await companyFormatsService.save({ dateFormat: 'MM/DD/YYYY', timeFormat: '24h', numberGrouping: 'international' }, admin);
        assert.deepEqual(audits.map((a) => a.changes), [{ dateFormat: { from: 'DD/MM/YYYY', to: 'MM/DD/YYYY' } }]);
    });

    it('saving the stored values writes, audits and invalidates nothing', async () => {
        const { state, audits, events } = setup(stored());
        const dto = await companyFormatsService.save({ dateFormat: 'DD/MM/YYYY', timeFormat: '24h', numberGrouping: 'international' }, admin);
        assert.equal(state.writes, 0);
        assert.deepEqual(audits, []);
        assert.deepEqual(events, ['commit']);
        assert.equal(dto.updatedBy, 'palak');
    });

    it('refuses an invalid body before touching the database', async () => {
        const { state } = setup();
        await assert.rejects(companyFormatsService.save({ dateFormat: 'DD.MM.YYYY', timeFormat: '12h', numberGrouping: 'indian' }, admin), ZodError);
        await assert.rejects(companyFormatsService.save({ dateFormat: 'DD/MM/YYYY', timeFormat: '12h', numberGrouping: 'indian', currency: 'USD' }, admin), ZodError);
        assert.equal(state.writes, 0);
    });

    it('reset deletes the row and audits the way back to the defaults', async () => {
        const { state, audits, events } = setup(stored());
        const dto = await companyFormatsService.reset(admin);
        assert.equal(state.row, null);
        assert.deepEqual(audits, [
            {
                entityType: 'CompanyFormats',
                entityId: 'company-formats',
                action: 'UPDATE',
                changedBy: 'admin',
                changes: {
                    dateFormat: { from: 'DD/MM/YYYY', to: 'DD-MMM-YYYY' },
                    timeFormat: { from: '24h', to: '12h' },
                    numberGrouping: { from: 'international', to: 'indian' },
                    customized: { from: true, to: false },
                },
            },
        ]);
        assert.deepEqual(events, ['write', 'commit', `invalidate ${COMPANY_FORMATS_CACHE_KEY}`]);
        assert.equal(dto.customized, false);
        assert.equal(dto.updatedBy, null);
    });

    it('reset without a row does nothing', async () => {
        const { state, audits, events } = setup();
        const dto = await companyFormatsService.reset(admin);
        assert.equal(state.writes, 0);
        assert.deepEqual(audits, []);
        assert.deepEqual(events, ['commit']);
        assert.equal(dto.customized, false);
    });
});
