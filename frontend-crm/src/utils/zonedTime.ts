/**
 * Conversions between true UTC instants and wall clocks of an IANA time zone (the business timezone), using `Intl`
 * only. Pure and dependency-free: a copy of backend-crm/src/utils/zonedTime.ts (checked by backend-crm
 * validators/contractSync.test.ts), so the activity form and calendar read and write times exactly as the API does,
 * whatever the device's own zone.
 *
 * Formats: a wall clock is `YYYY-MM-DDTHH:mm`, a day is `YYYY-MM-DD`.
 */

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const WALL_CLOCK = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
    let format = formatters.get(timeZone);
    if (!format) {
        format = new Intl.DateTimeFormat('en-CA', {
            timeZone,
            hourCycle: 'h23',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        });
        formatters.set(timeZone, format);
    }
    return format;
}

interface WallParts {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
}

function partsIn(instant: Date, timeZone: string): WallParts {
    const parts = Object.fromEntries(
        formatterFor(timeZone)
            .formatToParts(instant)
            .filter((part) => part.type !== 'literal')
            .map((part) => [part.type, Number(part.value)]),
    );
    return { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour % 24, minute: parts.minute, second: parts.second };
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/** Milliseconds `timeZone` is ahead of UTC at `instant` (19,800,000 = +05:30 for Asia/Kolkata). */
function offsetMs(instantMs: number, timeZone: string): number {
    const p = partsIn(new Date(instantMs), timeZone);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    return asUtc - Math.floor(instantMs / 1000) * 1000;
}

function parseWallClock(wall: string): number {
    const match = WALL_CLOCK.exec(wall);
    if (!match) throw new RangeError(`Invalid wall clock: ${wall}`);
    const [, y, m, d, hh, mm] = match.map(Number);
    const ms = Date.UTC(y, m - 1, d, hh, mm);
    // Rejects 2026-02-30 / 24:00 (Date.UTC would roll them over).
    if (new Date(ms).toISOString().slice(0, 16) !== wall) throw new RangeError(`Invalid wall clock: ${wall}`);
    return ms;
}

/** Whether `value` is a real `YYYY-MM-DDTHH:mm` wall clock. */
export function isWallClock(value: string | null | undefined): value is string {
    if (!value || !WALL_CLOCK.test(value)) return false;
    try {
        parseWallClock(value);
        return true;
    } catch {
        return false;
    }
}

/** Whether `value` is a real `YYYY-MM-DD` day. */
export function isDay(value: string | null | undefined): value is string {
    if (!value) return false;
    const match = DAY.exec(value);
    if (!match) return false;
    const [, y, m, d] = match.map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10) === value;
}

/** `instant` as a `YYYY-MM-DDTHH:mm` wall clock in `timeZone`. */
export function instantToZonedWallClock(instant: Date, timeZone: string): string {
    const p = partsIn(instant, timeZone);
    return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/**
 * The UTC instant a `YYYY-MM-DDTHH:mm` wall clock of `timeZone` denotes. DST-safe: a wall clock that doesn't exist
 * (spring-forward gap) resolves forward; one that exists twice (fall-back overlap) takes the earlier instant.
 */
export function zonedWallClockToInstant(wall: string, timeZone: string): Date {
    const wallMs = parseWallClock(wall);
    const before = offsetMs(wallMs - DAY_MS, timeZone);
    const after = offsetMs(wallMs + DAY_MS, timeZone);
    const candidates = [...new Set([wallMs - before, wallMs - after])].sort((a, b) => a - b);
    const matching = candidates.filter((ms) => instantToZonedWallClock(new Date(ms), timeZone) === wall);
    if (matching.length > 0) return new Date(matching[0]);
    return new Date(wallMs - before);
}

/** The UTC instant calendar day `day` (`YYYY-MM-DD`) starts at in `timeZone`. */
export function zonedStartOfDay(day: string, timeZone: string): Date {
    return zonedWallClockToInstant(`${day}T00:00`, timeZone);
}

/** `YYYY-MM-DD` of `instant` on the `timeZone` calendar. */
export function zonedDayOf(instant: Date, timeZone: string): string {
    return instantToZonedWallClock(instant, timeZone).slice(0, 10);
}

/** Calendar arithmetic on a `YYYY-MM-DD` day (no time zone involved). */
export function addDays(day: string, days: number): string {
    const match = DAY.exec(day);
    if (!match) throw new RangeError(`Invalid day: ${day}`);
    const [, y, m, d] = match.map(Number);
    return new Date(Date.UTC(y, m - 1, d) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `first` to `last` (`YYYY-MM-DD`; negative when `last` is earlier). */
export function daysBetween(first: string, last: string): number {
    return Math.round((Date.parse(`${last}T00:00:00.000Z`) - Date.parse(`${first}T00:00:00.000Z`)) / DAY_MS);
}

/** A wall clock moved by `minutes`, through the instant it denotes (so a DST change in between is honoured). */
export function addMinutesToWallClock(wall: string, minutes: number, timeZone: string): string {
    return instantToZonedWallClock(new Date(zonedWallClockToInstant(wall, timeZone).getTime() + minutes * MINUTE_MS), timeZone);
}

/** Minutes from one wall clock to another of the same zone (negative when `to` is earlier). */
export function wallClockMinutesBetween(from: string, to: string, timeZone: string): number {
    return Math.round((zonedWallClockToInstant(to, timeZone).getTime() - zonedWallClockToInstant(from, timeZone).getTime()) / MINUTE_MS);
}
