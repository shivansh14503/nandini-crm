import { ENV } from '../../config/env.js';
import { instantToZonedWallClock } from '../../utils/zonedTime.js';
import { DEFAULT_DISPLAY_FORMATS, formatWallClock, type DisplayFormats } from '../company-formats/core/displayFormats.js';

/** One stored audit row with its `changesJson` parsed. */
export interface AuditEntryDto {
    id: string;
    action: string;
    changedBy: string;
    createdAt: string;
    changes: unknown;
}

/** `AuditRevisionItem` from frontend-crm/src/components/common/Drawer/types.ts. */
export interface AuditRevisionItem {
    title: string;
    author: string;
    time: string;
    from?: string;
    to?: string;
    note?: string;
    tag?: string;
}

/**
 * When an entry was written, in the business timezone and the company display formats: `12-Oct-2026, 11:15 AM` (the
 * timeline's own style) while not customized. Exports pass the defaults so their "Time" column never changes.
 */
export function displayTime(date: Date, formats: DisplayFormats = DEFAULT_DISPLAY_FORMATS): string {
    return formatWallClock(instantToZonedWallClock(date, ENV.BUSINESS_TIMEZONE), formats, { legacyDate: 'DD-MMM-YYYY', legacyTime: 'hh:mm A' });
}

/** `salesStage` → `Sales Stage`. */
export const fieldLabel = (field: string) => field.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());

export function displayValue(value: unknown): string {
    if (value === null || value === undefined || value === '') return '—';
    if (Array.isArray(value)) {
        if (value.every((item) => typeof item !== 'object')) return value.join(', ') || '—';
        return `${value.length} item${value.length === 1 ? '' : 's'}`;
    }
    if (typeof value === 'object') return JSON.stringify(value).slice(0, 200);
    return String(value);
}

/**
 * A stored `{ from, to }` pair. JSON drops an `undefined` side, so a value that was added (or removed) is stored as
 * `{ to }` (or `{ from }`): any object holding only these keys is one, and the missing side reads as undefined.
 */
export function isDiff(value: unknown): value is { from: unknown; to: unknown } {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
    const keys = Object.keys(value);
    return keys.length > 0 && keys.length <= 2 && keys.every((key) => key === 'from' || key === 'to');
}

/**
 * Renamed field keys, old → new. AuditLog is append-only (a ledger table), so a field rename can't rewrite the
 * stored entries the way earlier migrations did: add the old key here and every reader shows the new one.
 */
export const FIELD_ALIASES: Readonly<Record<string, string>> = {};

/** Top-level keys of a stored diff / snapshot under their current names (FIELD_ALIASES). */
export function applyFieldAliases(changes: unknown): unknown {
    if (!changes || typeof changes !== 'object' || Array.isArray(changes)) return changes;
    const entries = Object.entries(changes as Record<string, unknown>);
    if (!entries.some(([key]) => key in FIELD_ALIASES)) return changes;
    return Object.fromEntries(entries.map(([key, value]) => [FIELD_ALIASES[key] ?? key, value]));
}

/** Parses a stored `changesJson` (falls back to the raw string when it isn't JSON), keys under their current names. */
export function parseChanges(json: string | null): unknown {
    if (!json) return null;
    try {
        return applyFieldAliases(JSON.parse(json));
    } catch {
        return json;
    }
}
