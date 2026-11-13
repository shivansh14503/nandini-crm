import type { ConfigValidationIssue } from './formConfig';

/**
 * Dates and times can't be set in the past anywhere in the CRM. Pickers grey out past days (`min`), and forms
 * reject a past value before submit. Values a record already holds pass unchanged, so an old record can still be
 * edited. The API enforces the same rule (backend-crm/src/validators/notInPast.ts).
 */

const pad = (n: number) => String(n).padStart(2, '0');

/** Now on this device as `YYYY-MM-DDTHH:mm` (the `datetime-local` format). */
export function localNow(date = new Date()): string {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Today on this device as `YYYY-MM-DD` (the `date` input format). */
export const localToday = (date = new Date()): string => localNow(date).slice(0, 10);

/** `11:30 AM`, `11:30am`, `9 PM` or `14:30` → minutes since midnight; null when it isn't a time. */
export function parseTimeOfDay(text: string | null | undefined): number | null {
    const match = /^\s*(\d{1,2})(?::(\d{2}))?\s*([AaPp][Mm])?\s*$/.exec(text ?? '');
    if (!match) return null;
    let hours = Number(match[1]);
    const minutes = match[2] ? Number(match[2]) : 0;
    const meridiem = match[3]?.toUpperCase();
    if (minutes > 59) return null;
    if (meridiem) {
        if (hours < 1 || hours > 12) return null;
        hours = (hours % 12) + (meridiem === 'PM' ? 12 : 0);
    } else if (hours > 23 || !match[2]) {
        return null;
    }
    return hours * 60 + minutes;
}

/** Whether a time-of-day option (`02:30 PM`) has already passed on `date` (only today's times can have). */
export function isTimeOptionPast(date: string | null | undefined, time: string, now = localNow()): boolean {
    if ((date ?? '').slice(0, 10) !== now.slice(0, 10)) return false;
    const minutes = parseTimeOfDay(time);
    return minutes !== null && minutes < Number(now.slice(11, 13)) * 60 + Number(now.slice(14, 16));
}

export interface PastDateField {
    /** RHF path of the date (`YYYY-MM-DD`) or date-time (`YYYY-MM-DDTHH:mm`) value. */
    name: string;
    label: string;
    kind: 'date' | 'dateTime';
    /** Path of a separate time-of-day text (`11:30 AM`) that goes with a `date`. */
    timeName?: string;
}

/** The date fields each form guards (mirrors the API's checks in the module services). */
export const NO_PAST_DATES = {
    followup: [{ name: 'nextFollowupDate', timeName: 'nextFollowupTime', label: 'Next Followup Date', kind: 'date' }],
    opportunity: [
        { name: 'nextFollowupDate', timeName: 'nextFollowupTime', label: 'Next Followup Date', kind: 'date' },
        { name: 'invoiceDate', label: 'Invoice Date', kind: 'date' },
    ],
    ticket: [{ name: 'dueDate', label: 'Due Date', kind: 'dateTime' }],
    quotation: [
        { name: 'quotationDate', label: 'Quotation Date', kind: 'date' },
        { name: 'validUntil', label: 'Valid Until', kind: 'date' },
    ],
} satisfies Record<string, PastDateField[]>;

const getPath =(values: unknown, path: string): unknown =>
    path.split('.').reduce<unknown>((node, key) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[key] : undefined), values);

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/**
 * Past values among `fields`. `initial` holds the record's loaded values: a value equal to it (date and time
 * both, for a date + time pair) is the record's own and is not flagged.
 */
export function pastDateIssues(fields: PastDateField[], values: unknown, initial: unknown, now = localNow()): ConfigValidationIssue[] {
    const today = now.slice(0, 10);
    const issues: ConfigValidationIssue[] = [];
    for (const field of fields) {
        const value = text(getPath(values, field.name));
        if (!value) continue;
        const time = field.timeName ? text(getPath(values, field.timeName)) : '';
        const unchanged = value === text(getPath(initial, field.name)) && (!field.timeName || time === text(getPath(initial, field.timeName)));
        if (unchanged) continue;

        if (field.kind === 'dateTime') {
            if (value.slice(0, 16) < now) issues.push({ path: field.name, message: `${field.label} cannot be in the past.` });
        } else if (value.slice(0, 10) < today) {
            issues.push({ path: field.name, message: `${field.label} cannot be in the past.` });
        } else if (field.timeName && isTimeOptionPast(value, time, now)) {
            issues.push({ path: field.timeName, message: `${field.label} time has already passed. Pick a later time.` });
        }
    }
    return issues;
}
