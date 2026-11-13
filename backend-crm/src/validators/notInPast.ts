import { StatusCodes } from 'http-status-codes';
import { ENV } from '../config/env.js';
import { HttpError, type ApiFieldError } from '../utils/httpError.js';
import { wallClockNow } from '../utils/mappers.js';

/**
 * Dates and times users enter can't be in the past (on the business timezone's clock). Only values a write sets or
 * changes are checked: a record whose follow-up date has since passed can still be edited without touching it.
 * Imports and the seed load historical data and don't use this.
 */

/** Now as a wall-clock `YYYY-MM-DDTHH:mm` in the business timezone. */
export const businessNow = (): string => wallClockNow(ENV.BUSINESS_TIMEZONE).toISOString().slice(0, 16);

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

const dateOnly = (value: string | null | undefined): string => (value ?? '').trim().slice(0, 10);
const wallClock = (value: string | null | undefined): string => (value ?? '').trim().slice(0, 16);

export type PastCheck =
    /** A `YYYY-MM-DD` date: today or later. */
    | { kind: 'date'; path: string; label: string; value: string | null | undefined; previous?: string | null }
    /** A `YYYY-MM-DDTHH:mm` date-time: now or later. */
    | { kind: 'dateTime'; path: string; label: string; value: string | null | undefined; previous?: string | null }
    /** A date plus a separate time-of-day text (`11:30 AM`): the date today or later, and on today a time not yet passed. */
    | {
          kind: 'dateAndTime';
          path: string;
          timePath: string;
          label: string;
          date: string | null | undefined;
          time: string | null | undefined;
          previousDate?: string | null;
          previousTime?: string | null;
      };

/** Problems with the checked values (`now` = business-timezone wall clock, `YYYY-MM-DDTHH:mm`). */
export function pastValueIssues(checks: PastCheck[], now: string = businessNow()): ApiFieldError[] {
    const today = now.slice(0, 10);
    const nowMinutes = Number(now.slice(11, 13)) * 60 + Number(now.slice(14, 16));
    const issues: ApiFieldError[] = [];

    for (const check of checks) {
        if (check.kind === 'date') {
            const value = dateOnly(check.value);
            if (!value || value === dateOnly(check.previous)) continue;
            if (value < today) issues.push({ path: [check.path], message: `${check.label} cannot be in the past.` });
        } else if (check.kind === 'dateTime') {
            const value = wallClock(check.value);
            if (!value || value === wallClock(check.previous)) continue;
            if (value < now) issues.push({ path: [check.path], message: `${check.label} cannot be in the past.` });
        } else {
            const date = dateOnly(check.date);
            const time = (check.time ?? '').trim();
            if (!date) continue;
            if (date === dateOnly(check.previousDate) && time === (check.previousTime ?? '').trim()) continue;
            if (date < today) {
                issues.push({ path: [check.path], message: `${check.label} cannot be in the past.` });
            } else if (date === today) {
                const minutes = parseTimeOfDay(time);
                if (minutes !== null && minutes < nowMinutes) {
                    issues.push({ path: [check.timePath], message: `${check.label} time has already passed. Pick a later time.` });
                }
            }
        }
    }
    return issues;
}

/** Next follow-up (date + time-of-day) of leads and opportunities; `before` is the stored record on updates. */
export const nextFollowupCheck = (
    input: { nextFollowupDate?: string | null; nextFollowupTime?: string | null },
    before?: { nextFollowupDate: string; nextFollowupTime: string },
): PastCheck => ({
    kind: 'dateAndTime',
    path: 'nextFollowupDate',
    timePath: 'nextFollowupTime',
    label: 'Next Followup Date',
    date: input.nextFollowupDate,
    time: input.nextFollowupTime,
    previousDate: before?.nextFollowupDate,
    previousTime: before?.nextFollowupTime,
});

/** Throws 400 `VALIDATION_ERROR` listing every past value (same shape as other field errors). */
export function assertNotInPast(checks: PastCheck[], now?: string): void {
    const issues = pastValueIssues(checks, now);
    if (issues.length > 0) {
        throw new HttpError(issues[0].message, StatusCodes.BAD_REQUEST, { code: 'VALIDATION_ERROR', errors: issues });
    }
}
