import { logger } from '../../config/logger.js';
import { prisma, type TransactionClient } from '../../config/prisma.js';
import { auditService } from '../../services/audit.service.js';
import { CACHE_KEYS, cacheService } from '../../services/cache.service.js';
import type { AuthUser } from '../../types/user.types.js';
import { HttpError } from '../../utils/httpError.js';
import { resolveSubdivision } from '../cities/addressPlaces.js';
import { recalculateLineItemTotals } from '../shared/lineItemTotals.recalculate.js';
import { sameState } from '../shared/lineItemMath.js';
import { acquireLocks, runInTransaction } from '../shared/transactions.js';
import { saveCompanySettingsSchema } from './companySettings.validator.js';

/**
 * Company details (Admin › Company Details): one row, id = 1; no row = nothing set yet. The Company State decides how
 * line items charge GST (Jira CRM-111): IGST to customers in another state, CGST + SGST to customers in the same state;
 * plain GST while it isn't set. Read through a guarded Redis key (opportunity / quotation saves and PDFs read it).
 */

const SETTINGS_ID = 1;
const LOCK_KEY = 'company-settings';
/** `cache:lookups:company-settings`: the stored row (or null), JSON, guarded, 1 h. */
export const COMPANY_SETTINGS_CACHE_KEY = CACHE_KEYS.lookups('company-settings');
const CACHE_TTL_SECONDS = 3600;

type Db = TransactionClient | typeof prisma;

interface CompanySettingsRow {
    companyState: string;
    updatedBy: string | null;
    updatedAt: string;
}

/** GET / PUT /api/company-settings (`CompanySettings` in frontend-crm/src/types/companySettings.types.ts). */
export interface CompanySettingsDto {
    /** '' while not set. */
    companyState: string;
    updatedBy: string | null;
    updatedAt: string | null;
}

async function readRow(db: Db): Promise<CompanySettingsRow | null> {
    const row = await db.companySettings.findUnique({ where: { id: SETTINGS_ID } });
    return row ? { companyState: row.companyState, updatedBy: row.updatedBy, updatedAt: row.updatedAt.toISOString() } : null;
}

const cachedRow = () => cacheService.getOrSetGuarded(COMPANY_SETTINGS_CACHE_KEY, CACHE_TTL_SECONDS, () => readRow(prisma));

const toDto = (row: CompanySettingsRow | null): CompanySettingsDto => ({
    companyState: row?.companyState ?? '',
    updatedBy: row?.updatedBy ?? null,
    updatedAt: row?.updatedAt ?? null,
});

export const companySettingsService = {
    /** GET (any signed-in user). */
    async get(): Promise<CompanySettingsDto> {
        return toDto(await cachedRow());
    },

    /**
     * The company's state ('' when not set). Never throws: a read failure counts as not set (plain GST), so a save or a
     * PDF never fails on it.
     */
    async companyState(): Promise<string> {
        try {
            return (await cachedRow())?.companyState ?? '';
        } catch (err) {
            logger.warn({ err: (err as Error).message }, 'Company settings could not be read; GST is shown unsplit');
            return '';
        }
    },

    /**
     * PUT (admin). The state is stored by its name in the address master ('haryana' → 'Haryana'). Records saved without
     * a company state (plain GST) take the IGST / CGST + SGST split from it at once; records saved with one keep theirs
     * until they are next saved.
     */
    async save(body: unknown, user: AuthUser): Promise<CompanySettingsDto> {
        const input = saveCompanySettingsSchema.parse(body);
        let companyState = '';
        if (input.companyState) {
            const subdivision = await resolveSubdivision(input.companyState, 'IN');
            if (!subdivision) {
                const message = 'Pick an Indian state or union territory.';
                throw HttpError.badRequest(message, [{ path: ['companyState'], message }]);
            }
            companyState = subdivision.subdivisionName;
        }
        const { row, changed } = await runInTransaction(async (tx) => {
            await acquireLocks(tx, [LOCK_KEY]);
            const before = await readRow(tx);
            const previous = before?.companyState ?? '';
            if (before && previous === companyState) return { row: before, changed: false };
            await tx.companySettings.upsert({
                where: { id: SETTINGS_ID },
                create: { id: SETTINGS_ID, companyState, updatedBy: user.username },
                update: { companyState, updatedBy: user.username },
            });
            if (previous !== companyState) {
                await auditService.record(tx, {
                    entityType: 'CompanySettings',
                    entityId: 'company-settings',
                    action: before ? 'UPDATE' : 'CREATE',
                    changedBy: user.username,
                    changes: { companyState: { from: previous || null, to: companyState || null } },
                });
            }
            return { row: await readRow(tx), changed: !sameState(previous, companyState) };
        });
        await cacheService.invalidate(COMPANY_SETTINGS_CACHE_KEY);
        if (changed && companyState) {
            // Records saved while no state was set get their split now (in batches, after the setting is committed).
            const updated = await recalculateLineItemTotals({ companyState, onlyWithoutGstType: true });
            if (updated.opportunities + updated.quotations > 0) {
                logger.info(updated, 'GST split applied to records saved without a company state');
                await Promise.all([cacheService.invalidateEntityCaches('opportunities'), cacheService.invalidateEntityCaches('quotations')]);
            }
        }
        return toDto(row);
    },
};
