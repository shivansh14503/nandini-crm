import type { TransactionClient } from '../../config/prisma.js';
import { HttpError } from '../../utils/httpError.js';
import { CONVERTED_STATUS } from '../leads/lead.validator.js';
import { shownNumberModules } from '../document-series/documentSeries.service.js';
import { acquireLocks } from './transactions.js';

/**
 * GSTIN / PAN uniqueness. One GSTIN or PAN identifies one business, so within each kind of record it may be used
 * once: two organizations can't share one, nor two partner companies, nor two open leads. Across kinds it may
 * repeat (a lead for an existing customer carries that organization's GSTIN; quotations copy their customer's).
 */
export type TaxIdOwner = 'organization' | 'partnerCompany' | 'lead';
export type TaxIdField = 'gstNo' | 'panNumber';

export interface TaxIds {
    gstNo?: string | null;
    panNumber?: string | null;
}

const LABEL: Record<TaxIdField, string> = { gstNo: 'GSTIN', panNumber: 'PAN' };

/** The live record of `owner` (other than `excludeId`) already holding `value` in `field`, as a display name. */
async function findHolder(tx: TransactionClient, owner: TaxIdOwner, field: TaxIdField, value: string, excludeId?: string): Promise<string | null> {
    const notSelf = excludeId ? { NOT: { id: excludeId } } : {};
    switch (owner) {
        case 'organization': {
            const row = await tx.organization.findFirst({ where: { [field]: value, isDeleted: false, ...notSelf }, select: { organizationName: true } });
            return row ? `organization "${row.organizationName}"` : null;
        }
        case 'partnerCompany': {
            const row = await tx.partnerCompany.findFirst({ where: { [field]: value, isDeleted: false, ...notSelf }, select: { companyName: true } });
            return row ? `partner company "${row.companyName}"` : null;
        }
        case 'lead': {
            // Leads have no PAN; converted leads live on as their organization, which holds the GSTIN from then on.
            if (field !== 'gstNo') return null;
            const row = await tx.lead.findFirst({
                where: { gstNo: value, isDeleted: false, status: { not: CONVERTED_STATUS }, ...notSelf },
                select: { leadCode: true, name: true, organizationName: true },
            });
            if (!row) return null;
            return (await shownNumberModules(tx)).has('lead') ? `lead ${row.leadCode} (${row.organizationName || row.name})` : `lead "${row.organizationName || row.name}"`;
        }
    }
}

/**
 * Rejects a save whose GSTIN / PAN another record of the same kind already uses (409, the error names the field so
 * the form marks it). Locks each value first, so two concurrent saves of the same GSTIN can't both pass. Pass
 * `previous` on updates: a value that didn't change isn't re-checked, so records saved before this rule (that may
 * share a value) stay editable.
 */
export async function assertTaxIdsUnique(
    tx: TransactionClient,
    owner: TaxIdOwner,
    ids: TaxIds,
    { excludeId, previous }: { excludeId?: string; previous?: TaxIds } = {},
): Promise<void> {
    const toCheck = (['gstNo', 'panNumber'] as const)
        .map((field) => ({ field, value: ids[field]?.trim().toUpperCase() || '' }))
        .filter(({ field, value }) => value && value !== (previous?.[field]?.trim().toUpperCase() || ''));
    if (toCheck.length === 0) return;
    await acquireLocks(tx, toCheck.map(({ field, value }) => `${owner}:${field}:${value}`));
    const errors: { message: string; path: string[] }[] = [];
    for (const { field, value } of toCheck) {
        const holder = await findHolder(tx, owner, field, value, excludeId);
        if (holder) errors.push({ message: `${LABEL[field]} ${value} is already registered to ${holder}.`, path: [field] });
    }
    if (errors.length > 0) throw HttpError.conflict(errors.map((e) => e.message).join(' '), errors);
}

export interface TaxIdHolder {
    field: TaxIdField;
    value: string;
    /** e.g. `organization "Acme Pvt Ltd"`. */
    holder: string;
    message: string;
}

/**
 * Read-only version of `assertTaxIdsUnique` for the forms' live check: which of these GSTIN / PAN values another
 * record of `owner` already holds. No locks; the save still runs the authoritative check.
 */
export async function findTaxIdHolders(tx: TransactionClient, owner: TaxIdOwner, ids: TaxIds, excludeId?: string): Promise<TaxIdHolder[]> {
    const holders: TaxIdHolder[] = [];
    for (const field of ['gstNo', 'panNumber'] as const) {
        const value = ids[field]?.trim().toUpperCase() || '';
        if (!value) continue;
        const holder = await findHolder(tx, owner, field, value, excludeId);
        if (holder) holders.push({ field, value, holder, message: `${LABEL[field]} ${value} is already registered to ${holder}.` });
    }
    return holders;
}
