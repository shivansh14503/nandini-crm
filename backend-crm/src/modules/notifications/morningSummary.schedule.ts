import { instantToZonedWallClock } from '../../utils/zonedTime.js';

/**
 * When the morning summary runs (MORNING_SUMMARY_CRON, default `0 9 * * 1-6` in the business timezone) and whether a
 * missed run should be made up. BullMQ's job scheduler doesn't backfill an occurrence missed while no worker (or no
 * Redis) was up, so a worker starting, Redis coming back, or the no-Redis fallback tick makes it up once, between the
 * scheduled time and noon on a scheduled day. Pure: only the subset of cron this needs (numbers, names, `*`, ranges,
 * lists, steps; an optional leading seconds field).
 */

/** A missed run is made up only before this business-timezone hour. */
export const CATCH_UP_UNTIL_HOUR = 12;

const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

interface FieldSpec {
    min: number;
    max: number;
    names?: readonly string[];
    /** Value the names start at (days 0 = sun, months 1 = jan). */
    nameBase?: number;
}

const FIELDS = {
    minute: { min: 0, max: 59 },
    hour: { min: 0, max: 23 },
    dayOfMonth: { min: 1, max: 31 },
    month: { min: 1, max: 12, names: MONTH_NAMES, nameBase: 1 },
    // 7 is Sunday too.
    dayOfWeek: { min: 0, max: 7, names: DAY_NAMES, nameBase: 0 },
} satisfies Record<string, FieldSpec>;

function parseValue(text: string, spec: FieldSpec): number | null {
    const lower = text.toLowerCase();
    const named = spec.names?.indexOf(lower) ?? -1;
    if (named >= 0) return named + (spec.nameBase ?? 0);
    if (!/^\d+$/.test(text)) return null;
    const value = Number(text);
    return value >= spec.min && value <= spec.max ? value : null;
}

/** The values a cron field allows, `'*'` for any, or null when it can't be read. */
export function parseCronField(field: string, spec: FieldSpec): Set<number> | '*' | null {
    if (field === '*' || field === '?') return '*';
    const values = new Set<number>();
    for (const part of field.split(',')) {
        const [range, stepText] = part.split('/');
        const step = stepText === undefined ? 1 : /^\d+$/.test(stepText) && Number(stepText) > 0 ? Number(stepText) : null;
        if (step === null || range === undefined) return null;
        let from: number | null;
        let to: number | null;
        if (range === '*') {
            from = spec.min;
            to = spec.max;
        } else if (range.includes('-')) {
            const [a, b] = range.split('-');
            from = parseValue(a, spec);
            to = parseValue(b, spec);
        } else {
            from = parseValue(range, spec);
            to = stepText === undefined ? from : spec.max;
        }
        if (from === null || to === null || from > to) return null;
        for (let value = from; value <= to; value += step) values.add(value);
    }
    return values;
}

export interface CronParts {
    minute: Set<number> | '*';
    hour: Set<number> | '*';
    dayOfMonth: Set<number> | '*';
    month: Set<number> | '*';
    dayOfWeek: Set<number> | '*';
}

/** The five fields of a cron pattern (a 6-field pattern's leading seconds are ignored), or null. */
export function parseCron(pattern: string): CronParts | null {
    const fields = pattern.trim().split(/\s+/);
    if (fields.length === 6) fields.shift();
    if (fields.length !== 5) return null;
    const [minute, hour, dayOfMonth, month, dayOfWeek] = [
        parseCronField(fields[0], FIELDS.minute),
        parseCronField(fields[1], FIELDS.hour),
        parseCronField(fields[2], FIELDS.dayOfMonth),
        parseCronField(fields[3], FIELDS.month),
        parseCronField(fields[4], FIELDS.dayOfWeek),
    ];
    if (!minute || !hour || !dayOfMonth || !month || !dayOfWeek) return null;
    return { minute, hour, dayOfMonth, month, dayOfWeek };
}

const allows = (field: Set<number> | '*', value: number) => field === '*' || field.has(value);

/**
 * True when the pattern runs on `day` (`YYYY-MM-DD`). Standard cron rule: when both day-of-month and day-of-week are
 * restricted, either may match.
 */
export function cronRunsOnDay(pattern: string, day: string): boolean {
    const cron = parseCron(pattern);
    if (!cron) return false;
    const [year, month, date] = day.split('-').map(Number);
    const weekday = new Date(Date.UTC(year, month - 1, date)).getUTCDay();
    if (!allows(cron.month, month)) return false;
    const dowMatch = allows(cron.dayOfWeek, weekday) || (weekday === 0 && allows(cron.dayOfWeek, 7));
    const domMatch = allows(cron.dayOfMonth, date);
    if (cron.dayOfMonth === '*' && cron.dayOfWeek === '*') return true;
    if (cron.dayOfMonth === '*') return dowMatch;
    if (cron.dayOfWeek === '*') return domMatch;
    return domMatch || dowMatch;
}

/** The pattern's first run time of a day in minutes after midnight (`0 9 * * *` → 540), or null when not one time. */
export function cronFirstMinuteOfDay(pattern: string): number | null {
    const cron = parseCron(pattern);
    if (!cron || cron.minute === '*' || cron.hour === '*') return null;
    return Math.min(...cron.hour) * 60 + Math.min(...cron.minute);
}

/**
 * True when a missed morning summary should be sent now: today (business timezone) is a scheduled day, the time is
 * between the scheduled time and noon, and this process hasn't run it today (`lastRunDay`). Sends are deduplicated
 * per day and user, so a run another process already did is harmless.
 */
export function shouldCatchUpMorningSummary(now: Date, pattern: string, timeZone: string, lastRunDay: string | null): boolean {
    const wall = instantToZonedWallClock(now, timeZone);
    const day = wall.slice(0, 10);
    if (lastRunDay === day) return false;
    const start = cronFirstMinuteOfDay(pattern);
    if (start === null || !cronRunsOnDay(pattern, day)) return false;
    const minutes = Number(wall.slice(11, 13)) * 60 + Number(wall.slice(14, 16));
    return minutes >= start && minutes < CATCH_UP_UNTIL_HOUR * 60;
}
