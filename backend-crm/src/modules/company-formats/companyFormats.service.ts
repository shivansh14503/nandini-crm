import { ENV } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { prisma, type TransactionClient } from '../../config/prisma.js';
import { auditService, diffRecords } from '../../services/audit.service.js';
import { CACHE_KEYS, cacheService } from '../../services/cache.service.js';
import type { AuthUser } from '../../types/user.types.js';
import { acquireLocks, runInTransaction } from '../shared/transactions.js';
import { DEFAULT_DISPLAY_FORMATS, type DisplayFormats } from './core/displayFormats.js';
import {
    companyFormatsAuditSnapshot,
    formatsOf,
    SETTINGS_ID,
    toCompanyFormatsDto,
    type CompanyFormatsDto,
    type CompanyFormatsRow,
} from './companyFormats.dto.js';
import { saveCompanyFormatsSchema } from './companyFormats.validator.js';

/**
 * Company display formats (Admin › Company formats): one row, id = 1; no row = not customized. Read through a guarded
 * Redis key, because the API, the PDF render and the BullMQ workers (possibly another process) all read it: an
 * in-process memo would go stale in the worker. Saves and resets drop the key after their transaction commits.
 */

/** `cache:lookups:company-formats`: the stored row (or null), JSON, guarded, 1 h. */
export const COMPANY_FORMATS_CACHE_KEY = CACHE_KEYS.lookups('company-formats');
const CACHE_TTL_SECONDS = 3600;
const LOCK_KEY = 'company-formats';

type Db = TransactionClient | typeof prisma;

async function readRow(db: Db): Promise<CompanyFormatsRow | null> {
    const row = await db.companyFormatSettings.findUnique({ where: { id: SETTINGS_ID } });
    return row
        ? { dateFormat: row.dateFormat, timeFormat: row.timeFormat, numberGrouping: row.numberGrouping, updatedBy: row.updatedBy, updatedAt: row.updatedAt.toISOString() }
        : null;
}

/** The stored row through the cache (Redis down: straight from the database). */
const cachedRow = (db: typeof prisma = prisma) => cacheService.getOrSetGuarded(COMPANY_FORMATS_CACHE_KEY, CACHE_TTL_SECONDS, () => readRow(db));

const sameValues = (row: CompanyFormatsRow, f: Pick<DisplayFormats, 'dateFormat' | 'timeFormat' | 'numberGrouping'>) =>
    row.dateFormat === f.dateFormat && row.timeFormat === f.timeFormat && row.numberGrouping === f.numberGrouping;

export const companyFormatsService = {
    /**
     * The formats every server-side formatter uses (PDFs, the morning email, notification texts, audit times). Never
     * throws: when the setting can't be read, the text is written in the defaults (each site's pre-company-formats
     * style) rather than failing a PDF, a reminder or a timeline. `db` is the client reminders and sweeps run on.
     */
    async load(db: typeof prisma = prisma): Promise<DisplayFormats> {
        try {
            return formatsOf(await cachedRow(db));
        } catch (err) {
            logger.warn({ err: (err as Error).message }, 'Company formats could not be read; using the defaults');
            return DEFAULT_DISPLAY_FORMATS;
        }
    },

    /** GET /api/company-formats (any signed-in user). */
    async get(): Promise<CompanyFormatsDto> {
        return toCompanyFormatsDto(await cachedRow(), ENV.BUSINESS_TIMEZONE);
    },

    /** PUT: replaces the setting. Saving the values already stored writes and audits nothing. */
    async save(body: unknown, user: AuthUser): Promise<CompanyFormatsDto> {
        const input = saveCompanyFormatsSchema.parse(body);
        const { row, written } = await runInTransaction(async (tx) => {
            await acquireLocks(tx, [LOCK_KEY]);
            const before = await readRow(tx);
            if (before && sameValues(before, input)) return { row: before, written: false };

            await tx.companyFormatSettings.upsert({
                where: { id: SETTINGS_ID },
                create: { id: SETTINGS_ID, ...input, updatedBy: user.username },
                update: { ...input, updatedBy: user.username },
            });
            // A first save records `customized: false → true` along with any value it changed.
            const changes = diffRecords(companyFormatsAuditSnapshot(formatsOf(before)), companyFormatsAuditSnapshot({ ...input, customized: true }));
            if (Object.keys(changes).length > 0) {
                await auditService.record(tx, { entityType: 'CompanyFormats', entityId: 'company-formats', action: 'UPDATE', changedBy: user.username, changes });
            }
            return { row: await readRow(tx), written: true };
        });
        if (written) await cacheService.invalidate(COMPANY_FORMATS_CACHE_KEY);
        return toCompanyFormatsDto(row, ENV.BUSINESS_TIMEZONE);
    },

    /** DELETE: back to "not customized" (every screen keeps its own pre-company-formats style). No row: nothing to do. */
    async reset(user: AuthUser): Promise<CompanyFormatsDto> {
        const written = await runInTransaction(async (tx) => {
            await acquireLocks(tx, [LOCK_KEY]);
            const before = await readRow(tx);
            if (!before) return false;
            await tx.companyFormatSettings.deleteMany({ where: { id: SETTINGS_ID } });
            const changes = diffRecords(companyFormatsAuditSnapshot(formatsOf(before)), companyFormatsAuditSnapshot(DEFAULT_DISPLAY_FORMATS));
            await auditService.record(tx, { entityType: 'CompanyFormats', entityId: 'company-formats', action: 'UPDATE', changedBy: user.username, changes });
            return true;
        });
        if (written) await cacheService.invalidate(COMPANY_FORMATS_CACHE_KEY);
        return toCompanyFormatsDto(null, ENV.BUSINESS_TIMEZONE);
    },
};
