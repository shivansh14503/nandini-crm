import { addDays, zonedDayOf, zonedWallClockToInstant } from '../../utils/zonedTime.js';

/**
 * Time zones between the CRM (IANA names) and Microsoft Graph (Windows names) (Calendar Phase 2 spec §8.14, D30). Pure.
 * Graph's support for IANA names is unverified [U], so the engine only sends Windows names, from this small fixed map
 * (the business zone plus common ones); anything unknown is treated as UTC.
 */

const WINDOWS_BY_IANA: Readonly<Record<string, string>> = {
    'Asia/Kolkata': 'India Standard Time',
    'Asia/Calcutta': 'India Standard Time',
    UTC: 'UTC',
    'Etc/UTC': 'UTC',
    'Europe/London': 'GMT Standard Time',
    'Europe/Berlin': 'W. Europe Standard Time',
    'Europe/Paris': 'Romance Standard Time',
    'Asia/Dubai': 'Arabian Standard Time',
    'Asia/Singapore': 'Singapore Standard Time',
    'Asia/Tokyo': 'Tokyo Standard Time',
    'Asia/Shanghai': 'China Standard Time',
    'Asia/Kathmandu': 'Nepal Standard Time',
    'Asia/Dhaka': 'Bangladesh Standard Time',
    'Asia/Colombo': 'Sri Lanka Standard Time',
    'Australia/Sydney': 'AUS Eastern Standard Time',
    'America/New_York': 'Eastern Standard Time',
    'America/Chicago': 'Central Standard Time',
    'America/Denver': 'Mountain Standard Time',
    'America/Los_Angeles': 'Pacific Standard Time',
};

const IANA_BY_WINDOWS: Readonly<Record<string, string>> = Object.fromEntries(
    // The first IANA name of each Windows zone wins (Asia/Kolkata before its alias).
    Object.entries(WINDOWS_BY_IANA)
        .reverse()
        .map(([iana, windows]) => [windows.toLowerCase(), iana]),
);
// 'UTC' → 'UTC' (not Etc/UTC), and 'Coordinated Universal Time' as Graph sometimes spells it.
const EXTRA_WINDOWS: Readonly<Record<string, string>> = { utc: 'UTC', 'coordinated universal time': 'UTC', 'tzone://microsoft/utc': 'UTC' };

/** Windows zone name for an IANA zone; 'UTC' when unknown. */
export function windowsZone(iana: string): string {
    return WINDOWS_BY_IANA[iana] ?? 'UTC';
}

/** IANA zone for a Windows zone name Graph returned; an IANA name passes through when Intl knows it; else 'UTC'. */
export function ianaFromWindows(name: string | null | undefined): string {
    const key = (name ?? '').trim().toLowerCase();
    if (!key) return 'UTC';
    const known = EXTRA_WINDOWS[key] ?? IANA_BY_WINDOWS[key];
    if (known) return known;
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: (name ?? '').trim() });
        return (name ?? '').trim();
    } catch {
        return 'UTC';
    }
}

/** `2026-11-27T10:00:00.0000000` (Graph) → `2026-11-27T10:00` (a wall clock, seconds dropped). */
export function graphWallClock(dateTime: string): string {
    const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(dateTime.trim());
    if (!match) throw new RangeError('Invalid Graph dateTime');
    return `${match[1]}T${match[2]}:${match[3]}`;
}

/** The instant a Graph `{ dateTime, timeZone }` denotes. */
export function graphInstant(value: { dateTime: string; timeZone?: string | null }): Date {
    return zonedWallClockToInstant(graphWallClock(value.dateTime), ianaFromWindows(value.timeZone));
}

/** `{ dateTime: 'YYYY-MM-DDTHH:mm:ss', timeZone: 'UTC' }` of an instant (what the engine sends for timed events). */
export function graphUtcDateTime(instant: Date): { dateTime: string; timeZone: 'UTC' } {
    return { dateTime: instant.toISOString().slice(0, 19), timeZone: 'UTC' };
}

/**
 * The calendar day of a Graph all-day boundary (§8.14). A midnight in the zone it is expressed in → that date. Otherwise
 * (Graph converted the midnight to another zone [U]) the instant is read in the event's own zone
 * (`originalStartTimeZone`, Windows name) and the day taken there; when that isn't a midnight either, the nearest
 * midnight wins (rounding at noon).
 */
export function graphAllDayDay(value: { dateTime: string; timeZone?: string | null }, originalTimeZone?: string | null): string {
    const wall = graphWallClock(value.dateTime);
    if (wall.endsWith('T00:00')) return wall.slice(0, 10);
    const instant = graphInstant(value);
    if (originalTimeZone) {
        const zone = ianaFromWindows(originalTimeZone);
        const day = zonedDayOf(instant, zone);
        if (zonedWallClockToInstant(`${day}T00:00`, zone).getTime() === instant.getTime()) return day;
    }
    const hour = Number(wall.slice(11, 13));
    const day = wall.slice(0, 10);
    return hour >= 12 ? addDays(day, 1) : day;
}
