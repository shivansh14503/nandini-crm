import { addDays, daysBetween, zonedDayOf, zonedWallClockToInstant } from '../../utils/zonedTime.js';
import { mergeIntervals, type Interval } from '../calendar-sync/busy.intervals.js';
import { BOOKING_BUSY_BLOCK_DAYS, BOOKING_WEEKDAYS, type BookingWeekday } from './bookingLink.constants.js';

/**
 * Free start times of a booking link (pure, tested in bookingLink.slots.test.ts). Times are epoch milliseconds or
 * Dates; days are `YYYY-MM-DD` in the business time zone; windows are `HH:mm` wall clocks in that zone (end may be
 * `24:00`).
 *
 * A start `s` of `d` minutes is offered when all hold:
 *   - its business day isn't a company holiday and the day's bookings are below `maxPerDay`;
 *   - `[s, s + d)` lies inside one window of that weekday, and `s` is on the `slotStepMinutes` grid counted from the
 *     window's start;
 *   - `s ≥ now + minNotice` and `s < now + horizonDays`;
 *   - `[s − bufferBefore, s + d + bufferAfter)` overlaps no busy block (CRM activities and company calendar).
 */

export interface TimeWindow {
    start: string;
    end: string;
}

export type WeeklyAvailability = Partial<Record<BookingWeekday, TimeWindow[]>>;

export interface SlotRules {
    slotStepMinutes: number;
    availability: WeeklyAvailability;
    bufferBeforeMinutes: number;
    bufferAfterMinutes: number;
    minNoticeMinutes: number;
    horizonDays: number;
    maxPerDay: number | null;
}

const MINUTE = 60_000;
const DAY_MS = 24 * 60 * MINUTE;
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** `'09:30'` → 570; `'24:00'` → 1440 (as an end only); null when unreadable. */
export function minutesOf(value: string, asEnd = false): number | null {
    if (asEnd && value === '24:00') return 24 * 60;
    const match = HHMM.exec(value);
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** ISO weekday (1 = Monday … 7 = Sunday) of a `YYYY-MM-DD` day. */
export function weekdayOf(day: string): BookingWeekday {
    const [y, m, d] = day.split('-').map(Number);
    const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    return BOOKING_WEEKDAYS[(js + 6) % 7];
}

/** A window's instants on `day` (null when unreadable or empty). */
export function windowOn(day: string, window: TimeWindow, tz: string): Interval | null {
    const startMin = minutesOf(window.start);
    const endMin = minutesOf(window.end, true);
    if (startMin === null || endMin === null || endMin <= startMin) return null;
    const pad = (n: number) => String(n).padStart(2, '0');
    const wall = (d: string, minutes: number) => `${d}T${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
    const start = zonedWallClockToInstant(wall(day, startMin), tz).getTime();
    const end = endMin === 24 * 60 ? zonedWallClockToInstant(wall(addDays(day, 1), 0), tz).getTime() : zonedWallClockToInstant(wall(day, endMin), tz).getTime();
    return end > start ? { start, end } : null;
}

/** The first and last business day a visitor may book (`now + minNotice` … `now + horizonDays`). */
export function bookableDays(rules: Pick<SlotRules, 'minNoticeMinutes' | 'horizonDays'>, now: Date, tz: string): { first: string; last: string } {
    return {
        first: zonedDayOf(new Date(now.getTime() + rules.minNoticeMinutes * MINUTE), tz),
        last: zonedDayOf(new Date(now.getTime() + rules.horizonDays * DAY_MS - 1), tz),
    };
}

/** Whether `[start − before, end + after)` touches a busy block. `busy` must be merged (sorted, non-overlapping). */
export function clashes(start: number, end: number, rules: Pick<SlotRules, 'bufferBeforeMinutes' | 'bufferAfterMinutes'>, busy: readonly Interval[]): boolean {
    const from = start - rules.bufferBeforeMinutes * MINUTE;
    const to = end + rules.bufferAfterMinutes * MINUTE;
    return busy.some((b) => b.start < to && b.end > from);
}

export type SlotRuleProblem = 'notice' | 'horizon' | 'holiday' | 'outside_hours' | 'off_grid';

/**
 * Why a start of `durationMinutes` breaks the link's hours (ignoring busy times and the daily cap), or null when it
 * keeps them. The booking re-checks the token's start with it: a link edited after the times were shown is caught by
 * the token version; this catches the clock (notice, horizon) and holidays added meanwhile.
 */
export function slotRuleProblem(rules: SlotRules, start: Date, durationMinutes: number, now: Date, tz: string, holidays: ReadonlySet<string>): SlotRuleProblem | null {
    const s = start.getTime();
    const e = s + durationMinutes * MINUTE;
    if (s < now.getTime() + rules.minNoticeMinutes * MINUTE) return 'notice';
    if (s >= now.getTime() + rules.horizonDays * DAY_MS) return 'horizon';
    const day = zonedDayOf(start, tz);
    if (holidays.has(day)) return 'holiday';
    const step = rules.slotStepMinutes * MINUTE;
    for (const window of rules.availability[weekdayOf(day)] ?? []) {
        const w = windowOn(day, window, tz);
        if (!w || s < w.start || e > w.end) continue;
        return (s - w.start) % step === 0 ? null : 'off_grid';
    }
    return 'outside_hours';
}

export interface SlotDay {
    day: string;
    starts: Date[];
}

export interface SlotQuery {
    rules: SlotRules;
    durationMinutes: number;
    /** First business day asked for (clamped to the first bookable day). */
    fromDay: string;
    days: number;
    now: Date;
    tz: string;
    /** Busy blocks of the owner (any kind blocks). */
    busy: readonly Interval[];
    holidays: ReadonlySet<string>;
    /** Bookings of this link already on each business day (for `maxPerDay`). */
    bookedPerDay: ReadonlyMap<string, number>;
}

/** Every bookable day in the asked range with its free starts (days without any are still listed, empty). */
export function computeSlots(q: SlotQuery): SlotDay[] {
    const { rules, tz } = q;
    const bounds = bookableDays(rules, q.now, tz);
    const busy = mergeIntervals(q.busy);
    const durationMs = q.durationMinutes * MINUTE;
    const step = rules.slotStepMinutes * MINUTE;
    const earliest = q.now.getTime() + rules.minNoticeMinutes * MINUTE;
    const latest = q.now.getTime() + rules.horizonDays * DAY_MS;
    const out: SlotDay[] = [];
    let day = q.fromDay < bounds.first ? bounds.first : q.fromDay;
    for (let n = 0; n < q.days && day <= bounds.last; n += 1, day = addDays(day, 1)) {
        const starts: Date[] = [];
        const full = rules.maxPerDay !== null && (q.bookedPerDay.get(day) ?? 0) >= rules.maxPerDay;
        if (!full && !q.holidays.has(day)) {
            const windows = (rules.availability[weekdayOf(day)] ?? [])
                .map((w) => windowOn(day, w, tz))
                .filter((w): w is Interval => w !== null)
                .sort((a, b) => a.start - b.start);
            const seen = new Set<number>();
            for (const w of windows) {
                for (let s = w.start; s + durationMs <= w.end; s += step) {
                    if (s < earliest || s >= latest || seen.has(s)) continue;
                    if (clashes(s, s + durationMs, rules, busy)) continue;
                    seen.add(s);
                    starts.push(new Date(s));
                }
            }
            starts.sort((a, b) => a.getTime() - b.getTime());
        }
        out.push({ day, starts });
    }
    return out;
}

/** `[from, to)` instants covering the business days `first … last` (inclusive). */
export function daysRange(first: string, last: string, tz: string): Interval {
    return { start: zonedWallClockToInstant(`${first}T00:00`, tz).getTime(), end: zonedWallClockToInstant(`${addDays(last, 1)}T00:00`, tz).getTime() };
}

/** The Monday the busy-time blocks count from (BOOKING_BUSY_BLOCK_DAYS). */
const BLOCK_EPOCH = '1970-01-05';

/**
 * The fixed busy-time blocks (`{ first, last }` days, BOOKING_BUSY_BLOCK_DAYS long, aligned to BLOCK_EPOCH) that cover
 * `[fromDay, lastDay]`. Whatever window a visitor asks for, the reads (and their cache keys) are always these blocks.
 */
export function busyBlocks(fromDay: string, lastDay: string, blockDays: number = BOOKING_BUSY_BLOCK_DAYS): { first: string; last: string }[] {
    const out: { first: string; last: string }[] = [];
    let index = Math.floor(daysBetween(BLOCK_EPOCH, fromDay) / blockDays);
    for (;;) {
        const first = addDays(BLOCK_EPOCH, index * blockDays);
        if (first > lastDay) break;
        out.push({ first, last: addDays(first, blockDays - 1) });
        index += 1;
    }
    return out;
}
