import { ENV } from '../../config/env.js';

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

const timeFormat = new Intl.DateTimeFormat('en-GB', {
    timeZone: ENV.BUSINESS_TIMEZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
});

/** e.g. `12-Oct-2026, 11:15 AM` in the business timezone (the timeline's existing format). */
export function displayTime(date: Date): string {
    const parts = Object.fromEntries(timeFormat.formatToParts(date).map((part) => [part.type, part.value]));
    return `${parts.day}-${parts.month}-${parts.year}, ${parts.hour}:${parts.minute} ${String(parts.dayPeriod).toUpperCase()}`;
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

export const isDiff = (value: unknown): value is { from: unknown; to: unknown } =>
    typeof value === 'object' && value !== null && 'from' in value && 'to' in value;

/** Parses a stored `changesJson` (falls back to the raw string when it isn't JSON). */
export function parseChanges(json: string | null): unknown {
    if (!json) return null;
    try {
        return JSON.parse(json);
    } catch {
        return json;
    }
}
