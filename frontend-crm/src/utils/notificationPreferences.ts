/**
 * My Profile › Notifications: the configurable bell kinds and the out-of-office rules. Pure and dependency-free.
 *
 * Mirrors backend-crm/src/modules/preferences/preferences.constants.ts and preferences.rules.ts, which the API enforces
 * (PATCH /api/me/preferences answers 400 VALIDATION_ERROR on `outOfOffice.from` / `outOfOffice.to` with the same
 * messages); backend-crm/src/validators/contractSync.test.ts checks the two agree, so change both together.
 *
 * Days are `YYYY-MM-DD` on the business-timezone calendar; out-of-office ranges are inclusive at both ends.
 */

/**
 * Bell kinds a user can turn off. Kinds not listed here (the calendar kinds `calendar_sync_issue`, `calendar_sync_error`,
 * `calendar_invites_held`, `integration_secret_expiring`, `booking_created`) are not configurable and always deliver.
 */
export const IN_APP_NOTIFICATION_KINDS = ['activity_reminder', 'activity_assigned', 'activity_invited', 'contract_renewal'] as const;
export type InAppNotificationKind = (typeof IN_APP_NOTIFICATION_KINDS)[number];

/** `defaultReminder` value for "No reminder" (null means "Company default"). */
export const DEFAULT_REMINDER_NONE = 'none';
/** Longest out-of-office range, in days, both ends included. */
export const OUT_OF_OFFICE_MAX_DAYS = 365;
/** Longest out-of-office message, in characters. */
export const OUT_OF_OFFICE_MESSAGE_MAX = 200;

/** An out-of-office range: inclusive `YYYY-MM-DD` business days. */
export interface OutOfOfficeRange {
    from: string;
    to: string;
}

export interface OutOfOfficeIssue {
    path: 'from' | 'to';
    message: string;
}

const DAY_MS = 86_400_000;
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Milliseconds of a valid `YYYY-MM-DD` day at UTC midnight, or null (rejects 2026-02-30). */
function dayMs(day: string): number | null {
    const match = DAY.exec(day);
    if (!match) return null;
    const ms = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return new Date(ms).toISOString().slice(0, 10) === day ? ms : null;
}

const addDays = (dayValueMs: number, days: number) => new Date(dayValueMs + days * DAY_MS).toISOString().slice(0, 10);

/** Whether `day` (`YYYY-MM-DD`) falls inside `range`, both ends included. */
export function isOutOfOfficeOn(range: OutOfOfficeRange | null | undefined, day: string): boolean {
    return !!range && range.from <= day && day <= range.to;
}

/**
 * Why `next` can't be saved as the out-of-office range, at most one issue per field, checked in this order:
 *  1. End before start;
 *  2. longer than OUT_OF_OFFICE_MAX_DAYS;
 *  3. only when `next` differs from `previous` (the stored range), so an untouched range never blocks a save:
 *     an end in the past (a start in the past is fine while the end is today or later), and a start more than
 *     OUT_OF_OFFICE_MAX_DAYS after `today`.
 * Days that aren't valid `YYYY-MM-DD` dates give no issue here (the field's own date check reports them).
 */
export function outOfOfficeIssues(next: OutOfOfficeRange, today: string, previous?: OutOfOfficeRange | null): OutOfOfficeIssue[] {
    const fromMs = dayMs(next.from);
    const toMs = dayMs(next.to);
    const todayMs = dayMs(today);
    if (fromMs === null || toMs === null || todayMs === null) return [];
    const issues: OutOfOfficeIssue[] = [];
    const add = (issue: OutOfOfficeIssue) => {
        if (!issues.some((existing) => existing.path === issue.path)) issues.push(issue);
    };
    if (next.to < next.from) add({ path: 'to', message: 'End Date cannot be before the Start Date.' });
    else if (Math.round((toMs - fromMs) / DAY_MS) + 1 > OUT_OF_OFFICE_MAX_DAYS) {
        add({ path: 'to', message: `Out of office can be at most ${OUT_OF_OFFICE_MAX_DAYS} days.` });
    }
    const changed = !previous || previous.from !== next.from || previous.to !== next.to;
    if (changed) {
        if (next.to < today) add({ path: 'to', message: 'End Date cannot be in the past.' });
        if (next.from > addDays(todayMs, OUT_OF_OFFICE_MAX_DAYS)) {
            add({ path: 'from', message: `Start Date must be within the next ${OUT_OF_OFFICE_MAX_DAYS} days.` });
        }
    }
    return issues;
}
