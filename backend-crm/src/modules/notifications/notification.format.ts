import { addDays, daysBetween, instantToZonedWallClock, zonedDayOf } from '../../utils/zonedTime.js';
import {
    DEFAULT_DISPLAY_FORMATS,
    formatLongDay,
    formatShortDay,
    formatTime as formatTimeIn,
    type DisplayFormats,
} from '../company-formats/core/displayFormats.js';

/**
 * Pure date / time wording for notification texts and the morning summary email, always in the business timezone
 * (the CRM's users are in one zone; the server's own zone never matters), in the company display formats (Admin ›
 * Company formats; the default keeps this wording's own style). Day names come from the shared formatter core, which
 * spells them by hand so the wording doesn't change with the ICU version.
 */

const MINUTE_MS = 60_000;

/** `2026-11-26` → `Thu 26 Nov` (`Thu Nov 26` for a saved MM/DD/YYYY). */
export function formatDay(day: string, formats: DisplayFormats = DEFAULT_DISPLAY_FORMATS): string {
    return formatShortDay(day, formats, { weekday: true });
}

/** `2026-11-26` → `Thursday, 26 November 2026` (`Thursday, November 26, 2026` for a saved MM/DD/YYYY). */
export function formatDayLong(day: string, formats: DisplayFormats = DEFAULT_DISPLAY_FORMATS): string {
    return formatLongDay(day, formats);
}

/** `10:30 AM` (`10:30` for a saved 24-hour format) in `timeZone`. */
export function formatTime(instant: Date, timeZone: string, formats: DisplayFormats = DEFAULT_DISPLAY_FORMATS): string {
    return formatTimeIn(instantToZonedWallClock(instant, timeZone), formats);
}

/** `today` / `tomorrow` / `yesterday`, else `Thu 26 Nov`, for a business-timezone day seen from `today`. */
export function relativeDayWord(day: string, today: string, formats: DisplayFormats = DEFAULT_DISPLAY_FORMATS): string {
    if (day === today) return 'today';
    if (day === addDays(today, 1)) return 'tomorrow';
    if (day === addDays(today, -1)) return 'yesterday';
    return formatDay(day, formats);
}

/** `on Thu 26 Nov` / `today` / `tomorrow`: the word as it follows "Starts …". */
export function onDay(day: string, today: string, formats: DisplayFormats = DEFAULT_DISPLAY_FORMATS): string {
    const word = relativeDayWord(day, today, formats);
    return word === 'today' || word === 'tomorrow' || word === 'yesterday' ? word : `on ${word}`;
}

function plural(n: number, one: string, many = `${one}s`): string {
    return `${n} ${n === 1 ? one : many}`;
}

/** How far `start` is from `now`: `in 15 min`, `in 1 h 30 min`, `in 2 days`, `now`, `5 min ago`. */
export function relativeTime(start: Date, now: Date): string {
    const minutes = Math.round((start.getTime() - now.getTime()) / MINUTE_MS);
    const abs = Math.abs(minutes);
    if (abs < 1) return 'now';
    let span: string;
    if (abs < 60) span = `${abs} min`;
    else if (abs < 24 * 60) {
        const hours = Math.floor(abs / 60);
        const rest = abs % 60;
        span = rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
    } else span = plural(Math.round(abs / (24 * 60)), 'day');
    return minutes > 0 ? `in ${span}` : `${span} ago`;
}

/** Whole days a business-timezone day is overdue on `today` (0 when not overdue). */
export function daysOverdue(day: string, today: string): number {
    return Math.max(0, daysBetween(day, today));
}

/** `1 day` / `3 days`. */
export const dayCount = (n: number): string => plural(n, 'day');

/** The business-timezone day of `instant`. */
export const dayOf = (instant: Date, timeZone: string): string => zonedDayOf(instant, timeZone);

/** `text` cut to `max` characters with an ellipsis. */
export function truncate(text: string, max: number): string {
    return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/** Non-blank parts joined with ` · `. */
export function joinParts(parts: readonly (string | null | undefined | false)[]): string {
    return parts.filter((part): part is string => typeof part === 'string' && part.trim() !== '').join(' · ');
}

/** `LD-0012 Ramesh` from a record number and label (either may be missing). */
export function relatedLabel(row: { relatedCode?: string | null; relatedTo?: string | null }): string {
    const code = row.relatedCode?.trim() ?? '';
    const label = row.relatedTo?.trim() ?? '';
    if (code && label && code.toLowerCase() !== label.toLowerCase()) return `${code} ${label}`;
    return code || label;
}
