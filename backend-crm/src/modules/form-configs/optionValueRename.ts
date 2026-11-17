import type { TransactionClient } from '../../config/prisma.js';
import { Prisma } from '../../generated/prisma/client.js';
import { HttpError } from '../../utils/httpError.js';
import { lockRecords } from '../shared/transactions.js';
import { filterFingerprint, MODULE_TABLES } from './fieldKeyRename.js';
import type { CrmModuleKey } from './formConfig.defaults.js';

/**
 * When a dropdown option is renamed (its stored value is its name), records storing the old value follow it, so they keep
 * showing (and filtering by) that option. Every field linked to the option's dropdown is covered:
 *  - built-in select: the field's own column (`status`, `leadSource`, …) holds the value;
 *  - built-in multi-select: a JSON array column named `<fieldKey>Json` (`productCategoryJson`, …);
 *  - custom fields: the value (select) or array of values (multi-select) under the field's key in `customDataJson`;
 *  - saved / recent table filters on those fields.
 * Values match case-insensitively, like the option values themselves (unique per dropdown ignoring case).
 */

export interface LinkedChoiceField {
    module: string;
    fieldKey: string;
    fieldType: string;
    isSystem: boolean;
}

export interface OptionValueMigration {
    records: number;
    filters: number;
}

const same = (a: unknown, b: string) => typeof a === 'string' && a.toLowerCase() === b.toLowerCase();

// ── Pure helpers (unit-tested) ───────────────────────────────────────────────

/** A list of option values with `from` renamed to `to` (no duplicate left behind), or null when it has no `from`. */
export function renameInList(list: unknown, from: string, to: string): string[] | null {
    if (!Array.isArray(list) || !list.some((v) => same(v, from))) return null;
    const next: string[] = [];
    for (const v of list) {
        const value = same(v, from) ? to : v;
        if (typeof value !== 'string' || !next.some((n) => same(n, value))) next.push(value);
    }
    return next;
}

/** A JSON array column (e.g. `productCategoryJson`) with `from` renamed, or null when nothing changes. */
export function renameJsonList(json: string | null, from: string, to: string): string | null {
    if (!json) return null;
    try {
        const next = renameInList(JSON.parse(json), from, to);
        return next ? JSON.stringify(next) : null;
    } catch {
        return null;
    }
}

/** A record's custom data with the value of field `key` renamed from `from` to `to`, or null when nothing changes. */
export function renameCustomDataValue(json: string | null, key: string, fieldType: string, from: string, to: string): string | null {
    if (!json) return null;
    let data: unknown;
    try {
        data = JSON.parse(json);
    } catch {
        return null;
    }
    if (!data || typeof data !== 'object' || Array.isArray(data) || !Object.hasOwn(data, key)) return null;
    const record = data as Record<string, unknown>;
    const current = record[key];
    let next: unknown;
    if (fieldType === 'multiselect') {
        next = renameInList(current, from, to);
        if (!next) return null;
    } else {
        if (!same(current, from)) return null;
        next = to;
    }
    return JSON.stringify({ ...record, [key]: next });
}

interface FilterCondition {
    op?: string;
    values?: unknown;
    value?: unknown;
}

/** Filter criteria with option `from` renamed to `to` in the conditions on `ids`, or null when they don't use it. */
export function renameFilterValues(json: string, ids: ReadonlySet<string>, from: string, to: string): string | null {
    let criteria: { conditions?: Record<string, FilterCondition> };
    try {
        criteria = JSON.parse(json) as typeof criteria;
    } catch {
        return null;
    }
    if (!criteria || typeof criteria !== 'object' || !criteria.conditions || typeof criteria.conditions !== 'object') return null;
    let changed = false;
    const conditions: Record<string, FilterCondition> = {};
    for (const [id, condition] of Object.entries(criteria.conditions)) {
        let next = condition;
        if (ids.has(id) && condition && typeof condition === 'object') {
            const values = renameInList(condition.values, from, to);
            if (values) next = { ...next, values };
            if (same(condition.value, from)) next = { ...next, value: to };
        }
        if (next !== condition) changed = true;
        conditions[id] = next;
    }
    return changed ? JSON.stringify({ ...criteria, conditions }) : null;
}

/** `text` as a LIKE pattern matching it anywhere (SQL Server wildcards escaped). */
export const likeContaining = (text: string) => `%${text.replace(/[[%_]/g, (c) => `[${c}]`)}%`;

// ── Database work ────────────────────────────────────────────────────────────

const SAFE_COLUMN = /^[A-Za-z][A-Za-z0-9_]*$/;

/** The table's columns among `names`, with their max length (-1 = MAX). */
async function columnsOf(tx: TransactionClient, table: string, names: string[]): Promise<Map<string, number | null>> {
    const rows = await tx.$queryRaw<{ name: string; maxLength: number | null }[]>(
        Prisma.sql`SELECT [COLUMN_NAME] AS [name], [CHARACTER_MAXIMUM_LENGTH] AS [maxLength] FROM INFORMATION_SCHEMA.COLUMNS
                   WHERE [TABLE_SCHEMA] = 'dbo' AND [TABLE_NAME] = ${table} AND [COLUMN_NAME] IN (${Prisma.join(names)})`,
    );
    return new Map(rows.map((r) => [r.name, r.maxLength]));
}

async function idsWhere(tx: TransactionClient, table: string, where: Prisma.Sql): Promise<string[]> {
    const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT [id] FROM [dbo].${Prisma.raw(`[${table}]`)} WHERE ${where}`);
    return rows.map((r) => r.id);
}

/** Moves records of one field from option value `from` to `to`; returns the ids of the records changed. */
async function migrateField(tx: TransactionClient, field: LinkedChoiceField, from: string, to: string): Promise<string[]> {
    const target = MODULE_TABLES[field.module as CrmModuleKey];
    if (!target || !SAFE_COLUMN.test(field.fieldKey)) return [];
    const { table, lock } = target;
    const changed: string[] = [];

    if (!field.isSystem) {
        // Custom field: rows whose custom data mentions the field and the value; the exact match is checked in JS.
        const where = Prisma.sql`[customDataJson] LIKE ${likeContaining(`"${field.fieldKey}"`)} AND [customDataJson] LIKE ${likeContaining(from)}`;
        const candidates = await idsWhere(tx, table, where);
        if (candidates.length === 0) return [];
        await lockRecords(tx, lock, candidates);
        // Re-read under the locks: a save that committed in between is included.
        const rows = await tx.$queryRaw<{ id: string; customDataJson: string | null }[]>(
            Prisma.sql`SELECT [id], [customDataJson] FROM [dbo].${Prisma.raw(`[${table}]`)} WHERE ${where}`,
        );
        for (const row of rows) {
            const next = renameCustomDataValue(row.customDataJson, field.fieldKey, field.fieldType, from, to);
            if (next === null) continue;
            await tx.$executeRaw(Prisma.sql`UPDATE [dbo].${Prisma.raw(`[${table}]`)} SET [customDataJson] = ${next} WHERE [id] = ${row.id}`);
            changed.push(row.id);
        }
        return changed;
    }

    // Built-in field: its own column (select) or JSON list column (multi-select); a field with neither stores nothing.
    const column = field.fieldType === 'multiselect' ? `${field.fieldKey}Json` : field.fieldKey;
    const maxLength = (await columnsOf(tx, table, [column])).get(column);
    if (maxLength === undefined) return [];
    const col = Prisma.raw(`[${column}]`);

    if (field.fieldType !== 'multiselect') {
        if (maxLength !== null && maxLength >= 0 && to.length > maxLength) {
            throw HttpError.badRequest(`'${to}' is too long for ${field.module} ${field.fieldKey}.`, [
                { message: `Records store this value in a column of at most ${maxLength} characters.`, path: ['value'] },
            ]);
        }
        const where = Prisma.sql`${col} = ${from}`;
        const candidates = await idsWhere(tx, table, where);
        if (candidates.length === 0) return [];
        await lockRecords(tx, lock, candidates);
        const ids = await idsWhere(tx, table, where);
        if (ids.length > 0) await tx.$executeRaw(Prisma.sql`UPDATE [dbo].${Prisma.raw(`[${table}]`)} SET ${col} = ${to} WHERE ${where}`);
        return ids;
    }

    const where = Prisma.sql`${col} LIKE ${likeContaining(JSON.stringify(from))}`;
    const candidates = await idsWhere(tx, table, where);
    if (candidates.length === 0) return [];
    await lockRecords(tx, lock, candidates);
    const rows = await tx.$queryRaw<{ id: string; list: string | null }[]>(
        Prisma.sql`SELECT [id], ${col} AS [list] FROM [dbo].${Prisma.raw(`[${table}]`)} WHERE ${where}`,
    );
    for (const row of rows) {
        const next = renameJsonList(row.list, from, to);
        if (next === null) continue;
        await tx.$executeRaw(Prisma.sql`UPDATE [dbo].${Prisma.raw(`[${table}]`)} SET ${col} = ${next} WHERE [id] = ${row.id}`);
        changed.push(row.id);
    }
    return changed;
}

/**
 * Renames option value `from` to `to` on every record and table filter of `fields` (the fields linked to the
 * option's dropdown), in the caller's transaction.
 */
export async function migrateOptionValue(tx: TransactionClient, fields: LinkedChoiceField[], from: string, to: string): Promise<OptionValueMigration> {
    if (from === to) return { records: 0, filters: 0 };
    const records = new Set<string>();
    for (const field of fields) {
        if (field.fieldType !== 'select' && field.fieldType !== 'multiselect') continue;
        for (const id of await migrateField(tx, field, from, to)) records.add(`${field.module}:${id}`);
    }

    // Table filters: a condition is keyed by the list column id (the field key, or `customFields.<key>` for a custom field).
    let filters = 0;
    const idsByModule = new Map<string, Set<string>>();
    for (const field of fields) {
        const ids = idsByModule.get(field.module) ?? new Set<string>();
        ids.add(field.fieldKey);
        if (!field.isSystem) ids.add(`customFields.${field.fieldKey}`);
        idsByModule.set(field.module, ids);
    }
    for (const [module, ids] of idsByModule) {
        const rows = await tx.tableFilter.findMany({ where: { module, criteriaJson: { contains: from } }, select: { id: true, criteriaJson: true } });
        for (const row of rows) {
            const next = renameFilterValues(row.criteriaJson, ids, from, to);
            if (next === null) continue;
            await tx.tableFilter.update({ where: { id: row.id }, data: { criteriaJson: next, fingerprint: filterFingerprint(next) } });
            filters++;
        }
    }
    return { records: records.size, filters };
}

export function describeOptionMigration(m: OptionValueMigration): string {
    const part = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
    return `Carried over to the renamed option: ${part(m.records, 'record')}${m.filters ? `, ${part(m.filters, 'table filter')}` : ''}.`;
}
