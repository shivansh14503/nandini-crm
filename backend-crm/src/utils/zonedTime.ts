/**
 * Conversions between true UTC instants and wall clocks of an IANA time zone (the business timezone), using `Intl`
 * only. Pure and dependency-free.
 *
 * Two conventions live side by side in the CRM:
 *  • true UTC instants (`Activity.startAt` / `endAt`), shown in the business timezone;
 *  • wall clocks stored as if UTC ("fake UTC": `Ticket.dueDate`, `Contract.renewalReminderDate`, see
 *    `fromWallClock` in mappers.ts), which read the same whatever the server's zone.
 * Every conversion between the two goes through this file (`fakeUtcToInstant`).
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

/** `instant` as a `YYYY-MM-DDTHH:mm` wall clock in `timeZone`. */
export function instantToZonedWallClock(instant: Date, timeZone: string): string {
    const p = partsIn(instant, timeZone);
    return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/**
 * The UTC instant a `YYYY-MM-DDTHH:mm` wall clock of `timeZone` denotes. DST-safe: a wall clock that doesn't exist
 * (spring-forward gap) resolves forward, by the offset in force before the gap (02:30 → 03:30); one that exists twice
 * (fall-back overlap) takes the earlier instant. Same as Temporal's `disambiguation: 'compatible'`.
 */
export function zonedWallClockToInstant(wall: string, timeZone: string): Date {
    const wallMs = parseWallClock(wall);
    // The offsets in force a day before and after: any transition near the wall clock lies between them.
    const before = offsetMs(wallMs - DAY_MS, timeZone);
    const after = offsetMs(wallMs + DAY_MS, timeZone);
    const candidates = [...new Set([wallMs - before, wallMs - after])].sort((a, b) => a - b);
    const matching = candidates.filter((ms) => instantToZonedWallClock(new Date(ms), timeZone) === wall);
    if (matching.length > 0) return new Date(matching[0]);
    // In a gap: shift by the offset before it, which lands after the gap.
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

/**
 * A fake-UTC wall clock (`Ticket.dueDate`, `Contract.renewalReminderDate`: the business-timezone time stored as if
 * it were UTC) as the true instant it means in `timeZone`.
 */
export function fakeUtcToInstant(value: Date, timeZone: string): Date {
    return zonedWallClockToInstant(value.toISOString().slice(0, 16), timeZone);
}
