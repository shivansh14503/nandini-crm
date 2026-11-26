import { addDays, daysBetween } from '../../utils/zonedTime.js';
import { OUT_OF_OFFICE_MAX_DAYS } from './preferences.constants.js';

/**
 * Out-of-office rules (My Profile › Notifications). Pure. Days are `YYYY-MM-DD` on the business-timezone calendar;
 * a range is inclusive at both ends.
 *
 * Mirrored by frontend-crm/src/utils/notificationPreferences.ts (same order and messages); contractSync.test.ts
 * checks the two agree, so change both together.
 */

export interface OutOfOfficeRange {
    from: string;
    to: string;
}

export interface OutOfOfficeIssue {
    path: 'from' | 'to';
    message: string;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A `YYYY-MM-DD` day that exists on the calendar (rejects 2026-02-30). */
function isDay(value: string): boolean {
    if (!DAY.test(value)) return false;
    const ms = Date.parse(`${value}T00:00:00.000Z`);
    return !Number.isNaN(ms) && new Date(ms).toISOString().slice(0, 10) === value;
}

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
    if (!isDay(next.from) || !isDay(next.to) || !isDay(today)) return [];
    const issues: OutOfOfficeIssue[] = [];
    const add = (issue: OutOfOfficeIssue) => {
        if (!issues.some((existing) => existing.path === issue.path)) issues.push(issue);
    };
    if (next.to < next.from) add({ path: 'to', message: 'End Date cannot be before the Start Date.' });
    else if (daysBetween(next.from, next.to) + 1 > OUT_OF_OFFICE_MAX_DAYS) {
        add({ path: 'to', message: `Out of office can be at most ${OUT_OF_OFFICE_MAX_DAYS} days.` });
    }
    const changed = !previous || previous.from !== next.from || previous.to !== next.to;
    if (changed) {
        if (next.to < today) add({ path: 'to', message: 'End Date cannot be in the past.' });
        if (next.from > addDays(today, OUT_OF_OFFICE_MAX_DAYS)) {
            add({ path: 'from', message: `Start Date must be within the next ${OUT_OF_OFFICE_MAX_DAYS} days.` });
        }
    }
    return issues;
}
