import { addDays, zonedDayOf, zonedWallClockToInstant } from '../../utils/zonedTime.js';
import type { BusyKind } from './busy.constants.js';

/**
 * Pure interval helpers of busy times (spec §12.2). Times are epoch milliseconds; an interval is half-open
 * `[start, end)`; empty or inverted intervals are dropped everywhere.
 */

export interface Interval {
    start: number;
    end: number;
}

export interface KindInterval extends Interval {
    kind: BusyKind;
}

const valid = (i: Interval) => Number.isFinite(i.start) && Number.isFinite(i.end) && i.end > i.start;

/** Sorted, with overlapping or touching intervals joined. */
export function mergeIntervals(list: readonly Interval[]): Interval[] {
    const sorted = list.filter(valid).map((i) => ({ start: i.start, end: i.end })).sort((a, b) => a.start - b.start || a.end - b.end);
    const out: Interval[] = [];
    for (const i of sorted) {
        const last = out[out.length - 1];
        if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
        else out.push(i);
    }
    return out;
}

/** `list` without the time `cut` covers (an interval cut in the middle becomes two). */
export function subtractInterval(list: readonly Interval[], cut: Interval): Interval[] {
    if (!valid(cut)) return list.filter(valid).map((i) => ({ start: i.start, end: i.end }));
    const out: Interval[] = [];
    for (const i of list) {
        if (!valid(i)) continue;
        if (i.end <= cut.start || i.start >= cut.end) {
            out.push({ start: i.start, end: i.end });
            continue;
        }
        if (i.start < cut.start) out.push({ start: i.start, end: cut.start });
        if (i.end > cut.end) out.push({ start: cut.end, end: i.end });
    }
    return out;
}

/** `list` cut to `[from, to)`. */
export function clip(list: readonly Interval[], from: number, to: number): Interval[] {
    const out: Interval[] = [];
    for (const i of list) {
        const start = Math.max(i.start, from);
        const end = Math.min(i.end, to);
        if (end > start) out.push({ start, end });
    }
    return out;
}

/** Per kind: merged, clipped, then sorted by start (busy before tentative before away on ties). */
export function mergeByKind(list: readonly KindInterval[], from: number, to: number): KindInterval[] {
    const order: BusyKind[] = ['busy', 'tentative', 'away'];
    const out: KindInterval[] = [];
    for (const kind of order) {
        for (const i of clip(mergeIntervals(list.filter((x) => x.kind === kind)), from, to)) out.push({ ...i, kind });
    }
    return out.sort((a, b) => a.start - b.start || order.indexOf(a.kind) - order.indexOf(b.kind));
}

/**
 * `list` without the calendar copy of the activity being edited (spec §12.1 step 3): only a block with exactly the
 * excluded window's start and end goes, and only one (a second identical block is another event). A block that holds
 * the window, or only overlaps it, is a real meeting and stays whole: cutting the window out of it would show a busy
 * person as free (e.g. a 09:00–12:00 review around a 10:00–11:00 CRM meeting).
 */
export function withoutOwnCopy<T extends Interval>(list: readonly T[], own: Interval): T[] {
    if (!valid(own)) return [...list];
    const index = list.findIndex((i) => i.start === own.start && i.end === own.end);
    return index < 0 ? [...list] : [...list.slice(0, index), ...list.slice(index + 1)];
}

/** `[from, to)` cut into consecutive windows of at most `maxDays` days. */
export function splitWindows(from: number, to: number, maxDays: number): Interval[] {
    const step = maxDays * 24 * 60 * 60 * 1000;
    const out: Interval[] = [];
    for (let start = from; start < to; start += step) out.push({ start, end: Math.min(start + step, to) });
    return out;
}

/**
 * Microsoft Graph `scheduleItems[].status` → kind, lower-cased first (Microsoft's own examples show both `Busy` and
 * `busy`). `free`, `workingElsewhere` and `unknown` carry no busy time (null).
 */
export function graphStatusKind(status: unknown): BusyKind | null {
    const value = typeof status === 'string' ? status.trim().toLowerCase() : '';
    if (value === 'busy') return 'busy';
    if (value === 'tentative') return 'tentative';
    if (value === 'oof') return 'away';
    return null;
}

/** `'09:00-19:00'` → minutes after midnight; null when unreadable or empty. */
export function parseWorkingHours(value: string): { startMinutes: number; endMinutes: number } | null {
    const match = /^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/.exec(value.trim());
    if (!match) return null;
    const [h1, m1, h2, m2] = match.slice(1).map(Number);
    const startMinutes = h1 * 60 + m1;
    const endMinutes = h2 * 60 + m2;
    if (h1 > 23 || h2 > 24 || m1 > 59 || m2 > 59 || endMinutes <= startMinutes || endMinutes > 24 * 60) return null;
    return { startMinutes, endMinutes };
}

const pad = (n: number) => String(n).padStart(2, '0');
const wall = (day: string, minutes: number) => `${day}T${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

export interface FreeSlotOptions {
    /** Search from here (inclusive). */
    from: Date;
    /** Never past here (the window the busy times cover). */
    to: Date;
    durationMinutes: number;
    /** `'HH:mm-HH:mm'` in `tz`. */
    workingHours: string;
    tz: string;
    stepMinutes: number;
    /** Business days searched, counting `from`'s day. */
    days: number;
}

/**
 * The first slot of `durationMinutes` that is free for everyone (every interval of every person blocks it), inside
 * the working hours of each business day, starting on the `stepMinutes` grid counted from the day's opening time, at
 * or after `from` and ending by `to`. Null when none fits. Replaces Graph `findMeetingTimes` (no Google equivalent).
 */
export function firstCommonFreeSlot(busyByPerson: readonly (readonly Interval[])[], options: FreeSlotOptions): { start: Date; end: Date } | null {
    const hours = parseWorkingHours(options.workingHours);
    const durationMs = Math.round(options.durationMinutes) * 60_000;
    const stepMs = Math.max(1, Math.round(options.stepMinutes)) * 60_000;
    if (!hours || durationMs <= 0 || options.days < 1) return null;
    const from = options.from.getTime();
    const to = options.to.getTime();
    const blocked = mergeIntervals(busyByPerson.flat());

    let day = zonedDayOf(options.from, options.tz);
    for (let n = 0; n < options.days; n += 1, day = addDays(day, 1)) {
        const open = zonedWallClockToInstant(wall(day, hours.startMinutes), options.tz).getTime();
        const closing = hours.endMinutes === 24 * 60 ? wall(addDays(day, 1), 0) : wall(day, hours.endMinutes);
        const close = Math.min(zonedWallClockToInstant(closing, options.tz).getTime(), to);
        if (open >= to) break;
        const onGrid = (t: number) => (t <= open ? open : open + Math.ceil((t - open) / stepMs) * stepMs);
        let start = onGrid(from);
        while (start + durationMs <= close) {
            const end = start + durationMs;
            const clash = blocked.find((b) => b.start < end && b.end > start);
            if (!clash) return { start: new Date(start), end: new Date(end) };
            start = onGrid(clash.end);
        }
    }
    return null;
}
