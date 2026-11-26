import { ENV, POLL_MINUTE_STEPS } from '../../config/env.js';
import { instantToZonedWallClock } from '../../utils/zonedTime.js';

/**
 * Office hours of calendar sync (Calendar Phase 2 spec D24, §10.1, §10.4; P2-5). Pure apart from reading ENV.
 *
 * `CALENDAR_SYNC_HOURS` (`HH:MM-HH:MM`, business timezone, default 07:00-22:00) bounds every background pull, the
 * outbox sweep, due connection checks and the Redis-down fallback tick, so Azure SQL serverless can pause overnight.
 * `CALENDAR_POLL_MINUTES` (default 5; a value that divides 60, so ticks are evenly spaced) is the poll interval inside
 * them. The cron pattern covers whole hours (`*\/5 7-21 * * *`); a tick that falls before a start minute or after an
 * end minute (e.g. 07:30-21:45) does nothing (`runCalendarPoll` / `runFallbackTick` check `isInsideSyncHours` first).
 */

export interface SyncHours {
    /** Minutes after midnight, inclusive. */
    startMinute: number;
    /** Minutes after midnight, exclusive (≤ 1440). */
    endMinute: number;
}

export const DEFAULT_SYNC_HOURS: SyncHours = { startMinute: 7 * 60, endMinute: 22 * 60 };
export const DEFAULT_POLL_MINUTES = 5;

/** `07:00-22:00` → minutes; null when unreadable or not a same-day window. */
export function parseSyncHours(text: string | null | undefined): SyncHours | null {
    const match = /^([01]\d|2[0-3]):([0-5]\d)-([01]\d|2[0-4]):([0-5]\d)$/.exec((text ?? '').trim());
    if (!match) return null;
    const startMinute = Number(match[1]) * 60 + Number(match[2]);
    const endMinute = Number(match[3]) * 60 + Number(match[4]);
    if (endMinute > 24 * 60 || startMinute >= endMinute) return null;
    return { startMinute, endMinute };
}

/** The configured hours (env is validated at start-up; the default if it somehow isn't readable). */
export function syncHours(): SyncHours {
    return parseSyncHours(ENV.INTEGRATIONS.SYNC_HOURS) ?? DEFAULT_SYNC_HOURS;
}

export function pollMinutes(): number {
    const value = ENV.INTEGRATIONS.POLL_MINUTES;
    return POLL_MINUTE_STEPS.includes(value) ? value : DEFAULT_POLL_MINUTES;
}

/** Inside the hours at `now` (business timezone). */
export function isInsideSyncHours(now: Date, hours: SyncHours = syncHours(), timeZone: string = ENV.BUSINESS_TIMEZONE): boolean {
    const [hh, mm] = instantToZonedWallClock(now, timeZone).slice(11, 16).split(':').map(Number);
    const minute = hh * 60 + mm;
    return minute >= hours.startMinute && minute < hours.endMinute;
}

/**
 * Cron pattern of the `calendar-poll` scheduler: every `minutes` from the start hour to the hour holding the last
 * minute before the end (`*\/5 7-21 * * *` for 07:00-22:00). 60 → once an hour at :00.
 */
export function pollCron(hours: SyncHours = syncHours(), minutes: number = pollMinutes()): string {
    const firstHour = Math.floor(hours.startMinute / 60);
    const lastHour = Math.floor((hours.endMinute - 1) / 60);
    const minuteField = minutes >= 60 ? '0' : minutes === 1 ? '*' : `*/${minutes}`;
    const hourField = firstHour === lastHour ? String(firstHour) : `${firstHour}-${lastHour}`;
    return `${minuteField} ${hourField} * * *`;
}

const pad = (n: number) => String(n).padStart(2, '0');
const clock = (minute: number) => `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`;

/** `{ start: '07:00', end: '22:00', everyMinutes: 5 }` for screens ("changes come back within 5 minutes, 07:00–22:00"). */
export function syncHoursLabel(hours: SyncHours = syncHours(), minutes: number = pollMinutes()): { start: string; end: string; everyMinutes: number } {
    return { start: clock(hours.startMinute), end: clock(hours.endMinute), everyMinutes: minutes };
}
