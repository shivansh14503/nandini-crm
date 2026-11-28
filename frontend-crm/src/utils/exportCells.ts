/**
 * Cell helpers for the list CSV exports (`exportConfig` on MasterHeaderActions, `CsvColumn.value`). Export cells keep
 * one fixed format whatever the company display formats, so a file read by another tool never changes shape: dates
 * as `28-Nov-2026`, instants as `28-Nov-2026, 01:07 PM` (business clock), numbers plain (`1234567.5`, no grouping,
 * no currency symbol), lists joined with `; `. Every helper returns '' for a missing value.
 */

import { findCrmUser } from '@/services/masterData.store';
import { businessWallClock, fmtExportDateTime, fmtExportDay } from './formats';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
/** A date-only value stored as UTC midnight (`2026-11-28T00:00:00.000Z`): its day is the leading `YYYY-MM-DD`. */
const UTC_MIDNIGHT_RE = /^(\d{4}-\d{2}-\d{2})T00:00(?::00(?:\.0+)?)?(?:Z|[+-]00:?00)?$/;

/** An instant (ISO timestamp, e.g. `createdAt`) as `28-Nov-2026, 01:07 PM` on the business clock. */
export function exportDateTime(value: string | Date | null | undefined): string {
    return value ? fmtExportDateTime(value) : '';
}

/**
 * A calendar day as `28-Nov-2026`: a `YYYY-MM-DD` day as it is, a UTC-midnight timestamp (a date-only field such as
 * a contract start date) by its leading `YYYY-MM-DD`, matching the list, and any other instant by its business-clock
 * day. Anything unreadable → ''.
 */
export function exportDate(value: string | Date | null | undefined): string {
    if (!value) return '';
    if (typeof value === 'string') {
        if (DAY_RE.test(value)) return fmtExportDay(value);
        const midnight = UTC_MIDNIGHT_RE.exec(value);
        if (midnight) return fmtExportDay(midnight[1]);
    }
    const wall = businessWallClock(value);
    return wall ? fmtExportDay(wall.slice(0, 10)) : '';
}

/** A CRM user (username or display name, e.g. `assignedTo` / `createdBy`) by their display name; unknown → as stored. */
export function exportUser(value: string | null | undefined): string {
    if (!value) return '';
    return findCrmUser(value)?.name || value;
}

/** Several CRM users (an array or a comma-separated string) by display name, joined with `; `. */
export function exportUsers(values: readonly (string | null | undefined)[] | string | null | undefined): string {
    const list = typeof values === 'string' ? values.split(',') : (values ?? []);
    return exportList(list.map((v) => exportUser(v?.trim())));
}

/**
 * A number as plain digits (`1234567.5`): no grouping, no currency symbol, so spreadsheets read it as a number.
 * Numeric strings are accepted; empty, non-numeric or non-finite → ''. `decimals` rounds to a fixed count.
 */
export function exportNumber(value: number | string | null | undefined, decimals?: number): string {
    if (value === null || value === undefined || value === '') return '';
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n)) return '';
    return decimals === undefined ? String(n) : n.toFixed(decimals);
}

/** An amount of money as plain digits with 2 decimals (`1234567.50`), no currency symbol. */
export function exportMoney(value: number | string | null | undefined): string {
    return exportNumber(value, 2);
}

/** A multi-value field (multi-select, tags, emails) joined with `separator`; blanks are dropped. */
export function exportList(values: readonly (string | number | null | undefined)[] | string | null | undefined, separator = '; '): string {
    if (values === null || values === undefined) return '';
    if (typeof values === 'string') return values;
    return values
        .map((v) => (v === null || v === undefined ? '' : String(v).trim()))
        .filter(Boolean)
        .join(separator);
}

/** A yes / no value as `Yes` / `No`; missing → ''. */
export function exportYesNo(value: boolean | null | undefined): string {
    if (value === null || value === undefined) return '';
    return value ? 'Yes' : 'No';
}

/**
 * The rows an Export button writes: the selected ones when any are selected, otherwise every row given (the filtered
 * list). Selected rows are picked from `allRows` (the whole loaded list) so a selection hidden by a later pill, search
 * or filter change is still exported, the same rows bulk delete acts on.
 */
export function selectedOrAll<T extends { id: string }>(
    rows: readonly T[],
    selectedIds: readonly string[] | ReadonlySet<string>,
    allRows: readonly T[] = rows
): readonly T[] {
    const selected = selectedIds instanceof Set ? selectedIds : new Set(selectedIds as readonly string[]);
    if (selected.size === 0) return rows;
    return allRows.filter((row) => selected.has(row.id));
}
