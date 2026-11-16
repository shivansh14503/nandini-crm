import { createHash } from 'node:crypto';
import type { TransactionClient } from '../../config/prisma.js';
import { Prisma } from '../../generated/prisma/client.js';
import { HttpError } from '../../utils/httpError.js';
import { lockRecords, type LockedEntity } from '../shared/transactions.js';
import type { CrmModuleKey } from './formConfig.defaults.js';

/**
 * A custom field's API name (`fieldKey`, e.g. `cf_po_number` or `poNumber`) is the key its values are stored under in
 * each record's `customDataJson`, and the name saved table filters and PDF templates refer to it by. An admin may
 * rename it (built-in fields' keys are column names and stay fixed; see builtInApiNames.ts): `migrateFieldKey` then
 * moves everything stored under the old name in the same transaction. The old name is forgotten.
 *
 * TEMP-DEV-RENAME: while the app is being built any plain identifier is allowed (the `cf_` prefix is optional).
 */

/** Letters, digits and underscores, starting with a letter: safe as a JSON key, filter id, PDF path and SQL pattern. */
export const CUSTOM_FIELD_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;
export const CUSTOM_FIELD_KEY_MAX = 80;
export const CUSTOM_FIELD_KEY_MESSAGE = 'Use letters, digits and underscores, starting with a letter.';

/** Table holding each module's records (and its `customDataJson`) and the record lock it uses. */
export const MODULE_TABLES: Record<CrmModuleKey, { table: string; lock: LockedEntity }> = {
    leads: { table: 'Lead', lock: 'lead' },
    opportunities: { table: 'Opportunity', lock: 'opportunity' },
    quotations: { table: 'Quotation', lock: 'quotation' },
    organizations: { table: 'Organization', lock: 'organization' },
    contacts: { table: 'Contact', lock: 'contact' },
    products: { table: 'Product', lock: 'product' },
    tickets: { table: 'Ticket', lock: 'ticket' },
    'partner-companies': { table: 'PartnerCompany', lock: 'partnerCompany' },
};

/** Modules whose records PDF templates render (PDF_MODULES in modules/pdf/pdf.types.ts). */
const PDF_MODULE_OF: Partial<Record<CrmModuleKey, string>> = { quotations: 'QUOTATION' };

// ── Pure helpers (unit-tested) ───────────────────────────────────────────────

export function parsePreviousKeys(json: string | null | undefined): string[] {
    if (!json) return [];
    try {
        const parsed: unknown = JSON.parse(json);
        return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string') : [];
    } catch {
        return [];
    }
}

/** Problem with a requested API name, or null when its shape is valid (any field, built-in or custom). */
export function fieldKeyFormatError(key: string): string | null {
    if (!key) return 'Enter an API name.';
    if (key.length > CUSTOM_FIELD_KEY_MAX) return `The API name can't exceed ${CUSTOM_FIELD_KEY_MAX} characters.`;
    if (!CUSTOM_FIELD_KEY_PATTERN.test(key)) return CUSTOM_FIELD_KEY_MESSAGE;
    return null;
}

/**
 * A record's custom data with the value under `from` moved to `to` (null when the record has no `from` value,
 * i.e. nothing to change). A value already under `to` is replaced: the field's live value is the one under `from`.
 */
export function renameCustomDataKey(json: string | null, from: string, to: string): string | null {
    if (!json) return null;
    let data: unknown;
    try {
        data = JSON.parse(json);
    } catch {
        return null;
    }
    if (!data || typeof data !== 'object' || Array.isArray(data) || !Object.hasOwn(data, from)) return null;
    const next: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
        if (key === to) continue;
        next[key === from ? to : key] = value;
    }
    return JSON.stringify(next);
}

/** Whether a record's custom data holds a value under `key`. */
export function customDataHasKey(json: string | null, key: string): boolean {
    if (!json) return false;
    try {
        const data: unknown = JSON.parse(json);
        return Boolean(data && typeof data === 'object' && !Array.isArray(data) && Object.hasOwn(data, key));
    } catch {
        return false;
    }
}

interface FilterCriteria {
    conditions: Record<string, unknown>;
    sort?: { field: string; order: string };
}

/**
 * Table filter criteria with custom field `from` renamed to `to`, or null when they don't mention it. Filter field
 * keys of custom fields are `customFields.<key>` (the list column id) or the bare key; both forms are renamed.
 */
export function renameFilterCriteria(json: string, from: string, to: string): string | null {
    let criteria: FilterCriteria;
    try {
        criteria = JSON.parse(json) as FilterCriteria;
    } catch {
        return null;
    }
    if (!criteria || typeof criteria !== 'object' || !criteria.conditions || typeof criteria.conditions !== 'object') return null;
    const renameId = (id: string) => (id === from ? to : id === `customFields.${from}` ? `customFields.${to}` : id);
    let changed = false;
    const conditions: Record<string, unknown> = {};
    for (const [id, condition] of Object.entries(criteria.conditions)) {
        const next = renameId(id);
        if (next !== id) changed = true;
        conditions[next] = condition;
    }
    let sort = criteria.sort;
    if (sort && typeof sort.field === 'string' && renameId(sort.field) !== sort.field) {
        sort = { ...sort, field: renameId(sort.field) };
        changed = true;
    }
    return changed ? JSON.stringify({ ...criteria, conditions, ...(sort ? { sort } : {}) }) : null;
}

/** Same hash as tableFilter.service's fingerprintOf (sorted keys and multi-select values). */
export function filterFingerprint(json: string): string {
    const criteria = JSON.parse(json) as { conditions: Record<string, { op: string; values?: string[]; value?: string; value2?: string }>; sort?: unknown };
    const conditions = Object.keys(criteria.conditions)
        .sort()
        .map((key) => {
            const c = criteria.conditions[key];
            return [key, c.op, c.values ? [...c.values].sort() : null, c.value ?? null, c.value2 ?? null];
        });
    return createHash('sha256').update(JSON.stringify({ conditions, sort: criteria.sort ?? null })).digest('hex');
}

/** A PDF template / saved block document with field paths `custom.<from>` renamed (null when it has none). */
export function renamePdfFieldPaths(json: string, from: string, to: string): string | null {
    // Paths are JSON string values (`"path":"custom.cf_x"`); keys only hold [a-z0-9_], so the match is exact.
    const pattern = new RegExp(`"custom\\.${from}"`, 'g');
    return pattern.test(json) ? json.replace(pattern, `"custom.${to}"`) : null;
}

// ── Database work ────────────────────────────────────────────────────────────

/** `cf_x` → a LIKE pattern matching `"cf_x"` (underscores escaped; keys hold only [a-z0-9_]). */
const likeQuotedKey = (key: string) => `%"${key.replace(/_/g, '[_]')}"%`;

async function rowsMentioning(tx: TransactionClient, module: CrmModuleKey, key: string): Promise<{ id: string; customDataJson: string | null }[]> {
    const { table } = MODULE_TABLES[module];
    return tx.$queryRaw<{ id: string; customDataJson: string | null }[]>(
        Prisma.sql`SELECT [id], [customDataJson] FROM [dbo].${Prisma.raw(`[${table}]`)} WHERE [customDataJson] LIKE ${likeQuotedKey(key)}`,
    );
}

/** Number of the module's records (deleted ones included) holding a value under `key`. */
export async function countRecordsWithKey(tx: TransactionClient, module: CrmModuleKey, key: string): Promise<number> {
    return (await rowsMentioning(tx, module, key)).filter((row) => customDataHasKey(row.customDataJson, key)).length;
}

export interface FieldKeyMigration {
    records: number;
    filters: number;
    pdfTemplates: number;
    pdfSavedItems: number;
}

/**
 * Moves everything stored under custom field `from` to `to` within the module: record values (each record locked
 * like an edit, so a concurrent save can't write back the old data), saved / recent table filters, and the
 * `custom.<key>` paths of PDF templates (their version bumped, so an editor open on the old document gets a
 * conflict instead of saving it back) and saved builder blocks. Other fields' aliases equal to `to` are dropped.
 */
export async function migrateFieldKey(tx: TransactionClient, module: CrmModuleKey, from: string, to: string): Promise<FieldKeyMigration> {
    const { table, lock } = MODULE_TABLES[module];

    const candidates = (await rowsMentioning(tx, module, from)).filter((row) => customDataHasKey(row.customDataJson, from));
    let records = 0;
    if (candidates.length > 0) {
        await lockRecords(tx, lock, candidates.map((row) => row.id));
        // Re-read under the locks: a save that committed in between is included.
        const fresh = await rowsMentioning(tx, module, from);
        for (const row of fresh) {
            const next = renameCustomDataKey(row.customDataJson, from, to);
            if (next === null) continue;
            await tx.$executeRaw(Prisma.sql`UPDATE [dbo].${Prisma.raw(`[${table}]`)} SET [customDataJson] = ${next} WHERE [id] = ${row.id}`);
            records++;
        }
    }

    let filters = 0;
    const filterRows = await tx.tableFilter.findMany({ where: { module, criteriaJson: { contains: from } }, select: { id: true, criteriaJson: true } });
    for (const row of filterRows) {
        const next = renameFilterCriteria(row.criteriaJson, from, to);
        if (next === null) continue;
        await tx.tableFilter.update({ where: { id: row.id }, data: { criteriaJson: next, fingerprint: filterFingerprint(next) } });
        filters++;
    }

    let pdfTemplates = 0;
    let pdfSavedItems = 0;
    const pdfModule = PDF_MODULE_OF[module];
    if (pdfModule) {
        const needle = `"custom.${from}"`;
        const templates = await tx.pdfTemplate.findMany({ where: { module: pdfModule, documentJson: { contains: needle } }, select: { id: true, documentJson: true } });
        for (const row of templates) {
            const next = renamePdfFieldPaths(row.documentJson, from, to);
            if (next === null) continue;
            await tx.pdfTemplate.update({ where: { id: row.id }, data: { documentJson: next, version: { increment: 1 } } });
            pdfTemplates++;
        }
        const saved = await tx.pdfSavedItem.findMany({ where: { module: pdfModule, contentJson: { contains: needle } }, select: { id: true, contentJson: true } });
        for (const row of saved) {
            const next = renamePdfFieldPaths(row.contentJson, from, to);
            if (next === null) continue;
            await tx.pdfSavedItem.update({ where: { id: row.id }, data: { contentJson: next } });
            pdfSavedItems++;
        }
    }

    // `to` now belongs to this field: no other field may keep it as an alias (left from before renames became final).
    const aliased = await tx.formFieldDefinition.findMany({
        where: { module, previousFieldKeysJson: { contains: `"${to}"` } },
        select: { id: true, previousFieldKeysJson: true },
    });
    for (const row of aliased) {
        const keys = parsePreviousKeys(row.previousFieldKeysJson);
        if (!keys.includes(to)) continue;
        await tx.formFieldDefinition.update({ where: { id: row.id }, data: { previousFieldKeysJson: keys.length > 1 ? JSON.stringify(keys.filter((k) => k !== to)) : null } });
    }

    return { records, filters, pdfTemplates, pdfSavedItems };
}

export function describeMigration(m: FieldKeyMigration): string {
    const part = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
    const parts = [part(m.records, 'record')];
    if (m.filters) parts.push(part(m.filters, 'saved filter'));
    if (m.pdfTemplates) parts.push(part(m.pdfTemplates, 'PDF template'));
    if (m.pdfSavedItems) parts.push(part(m.pdfSavedItems, 'saved PDF block'));
    return `Values moved to the new API name on ${parts.join(', ')}.`;
}
