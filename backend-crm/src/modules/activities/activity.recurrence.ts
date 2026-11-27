import { z } from 'zod';
import { addDays, daysBetween, zonedStartOfDay, zonedWallClockToInstant } from '../../utils/zonedTime.js';

/**
 * Repeat rules of CRM-authored recurring activities (Calendar Phase 4, Phase 1 R12). Pure: no database, env or clock
 * access, shared by the series service (activity.series.ts), the views and the tests. The frontend mirrors the summary
 * (frontend-crm/src/utils/activityRepeat.ts).
 *
 * All arithmetic is on business-timezone calendar days (`YYYY-MM-DD`); a timed occurrence is the series' wall-clock
 * start on that day converted with `zonedWallClockToInstant` (DST-safe). The anchor day (the first activity's day) is
 * always occurrence 1, as Google does with DTSTART, even when it doesn't match the rule.
 */

export const REPEAT_FREQUENCIES = ['daily', 'weekly', 'monthly'] as const;
export type RepeatFrequency = (typeof REPEAT_FREQUENCIES)[number];
export const REPEAT_MONTHLY_MODES = ['day', 'weekday'] as const;
export type RepeatMonthlyMode = (typeof REPEAT_MONTHLY_MODES)[number];
export const REPEAT_ENDS = ['never', 'on', 'after'] as const;
export type RepeatEnds = (typeof REPEAT_ENDS)[number];

/** Most occurrences a counted series may have. */
export const MAX_SERIES_COUNT = 366;
/** Latest end date a series may have, in years after its first day. */
export const MAX_SERIES_YEARS = 5;
export const MAX_REPEAT_INTERVAL = 99;

/** A repeat rule as the API takes and returns it (`repeat` on activity writes, `ActivityView.series.rule`). */
export interface RepeatRule {
    frequency: RepeatFrequency;
    /** Every N days / weeks / months. */
    interval: number;
    /** Weekly: ISO weekdays (1 = Monday … 7 = Sunday), ascending. */
    weekdays?: number[];
    /** Monthly: on a day of the month, or on the nth weekday. */
    monthlyMode?: RepeatMonthlyMode;
    /** Monthly by day: 1–31 (months without that day are skipped). */
    monthDay?: number;
    /** Monthly by weekday: 1–4, or -1 for the last. */
    setPos?: number;
    /** Monthly by weekday: ISO weekday 1–7. */
    setWeekday?: number;
    ends: RepeatEnds;
    /** ends 'on': last day (inclusive), `YYYY-MM-DD` in the business time zone. */
    untilDay?: string;
    /** ends 'after': number of occurrences, the first included. */
    count?: number;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const isDay = (value: unknown): value is string => typeof value === 'string' && DAY.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);

const intIn = (field: string, min: number, max: number) =>
    z.coerce.number({ error: `${field} must be a number.` }).int({ message: `${field} must be a whole number.` }).min(min, { message: `${field} must be at least ${min}.` }).max(max, { message: `${field} must be at most ${max}.` });

/**
 * `repeat` as sent (unknown keys dropped). Fields the rule doesn't use are dropped by `normalizeRepeatRule`, which also
 * fills what the anchor day implies (weekly without weekdays = the anchor's weekday, monthly without a day = the
 * anchor's day).
 */
export const repeatRuleSchema = z
    .object({
        frequency: z.enum(REPEAT_FREQUENCIES, { error: `Repeat must be one of: ${REPEAT_FREQUENCIES.join(', ')}.` }),
        interval: intIn('Repeat every', 1, MAX_REPEAT_INTERVAL).default(1),
        weekdays: z.array(intIn('Weekday', 1, 7), { error: 'Weekdays must be a list.' }).max(7).optional(),
        monthlyMode: z.enum(REPEAT_MONTHLY_MODES, { error: 'Monthly repeat must be on a day or a weekday.' }).optional(),
        monthDay: intIn('Day of the month', 1, 31).optional(),
        setPos: z.coerce
            .number()
            .int()
            .refine((value) => value === -1 || (value >= 1 && value <= 4), { message: 'Week of the month must be 1–4 or last (-1).' })
            .optional(),
        setWeekday: intIn('Weekday', 1, 7).optional(),
        ends: z.enum(REPEAT_ENDS, { error: `Ends must be one of: ${REPEAT_ENDS.join(', ')}.` }).default('never'),
        untilDay: z
            .string()
            .trim()
            .refine((value) => isDay(value), { message: 'Ends on must be a date (YYYY-MM-DD).' })
            .optional()
            .or(z.literal('').transform(() => undefined))
            .or(z.null().transform(() => undefined)),
        count: intIn('Occurrences', 1, MAX_SERIES_COUNT).optional().or(z.null().transform(() => undefined)),
    })
    .superRefine((rule, ctx) => {
        if (rule.ends === 'on' && !rule.untilDay) ctx.addIssue({ code: 'custom', path: ['untilDay'], message: 'Pick the date the repeat ends on.' });
        if (rule.ends === 'after' && !rule.count) ctx.addIssue({ code: 'custom', path: ['count'], message: 'Enter how many times it repeats.' });
    });

/** ISO weekday (1 = Monday … 7 = Sunday) of a calendar day. */
export function isoWeekday(day: string): number {
    const weekday = new Date(`${day}T00:00:00.000Z`).getUTCDay();
    return weekday === 0 ? 7 : weekday;
}

const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();
const dayOf = (year: number, month: number, day: number) => `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

/** The nth (1–4) or last (-1) ISO weekday of a month, as a day. */
export function nthWeekdayOf(year: number, month: number, setPos: number, weekday: number): string {
    if (setPos === -1) {
        const last = daysInMonth(year, month);
        const lastWeekday = isoWeekday(dayOf(year, month, last));
        return dayOf(year, month, last - ((lastWeekday - weekday + 7) % 7));
    }
    const firstWeekday = isoWeekday(dayOf(year, month, 1));
    return dayOf(year, month, 1 + ((weekday - firstWeekday + 7) % 7) + (setPos - 1) * 7);
}

/** Which week of its month a day falls in for "the nth weekday": 1–4, or -1 for a fifth (= the last). */
export function setPosOf(day: string): number {
    const date = Number(day.slice(8, 10));
    const pos = Math.ceil(date / 7);
    return pos >= 5 ? -1 : pos;
}

/**
 * The rule with only the fields its frequency uses, defaults taken from the anchor day, and the end checked against
 * it: an end date before the first day or more than MAX_SERIES_YEARS after it is a 400 issue (returned, not thrown).
 */
export function normalizeRepeatRule(rule: z.infer<typeof repeatRuleSchema>, anchorDay: string): { rule: RepeatRule; issues: { path: string[]; message: string }[] } {
    const issues: { path: string[]; message: string }[] = [];
    const out: RepeatRule = { frequency: rule.frequency, interval: rule.interval ?? 1, ends: rule.ends ?? 'never' };
    if (rule.frequency === 'weekly') {
        const weekdays = [...new Set(rule.weekdays?.length ? rule.weekdays : [isoWeekday(anchorDay)])].sort((a, b) => a - b);
        out.weekdays = weekdays;
    } else if (rule.frequency === 'monthly') {
        const mode = rule.monthlyMode ?? 'day';
        out.monthlyMode = mode;
        if (mode === 'day') out.monthDay = rule.monthDay ?? Number(anchorDay.slice(8, 10));
        else {
            out.setPos = rule.setPos ?? setPosOf(anchorDay);
            out.setWeekday = rule.setWeekday ?? isoWeekday(anchorDay);
        }
    }
    if (out.ends === 'on') {
        out.untilDay = rule.untilDay;
        if (rule.untilDay && rule.untilDay < anchorDay) issues.push({ path: ['repeat', 'untilDay'], message: 'The repeat must end on or after the first day.' });
        else if (rule.untilDay && daysBetween(anchorDay, rule.untilDay) > MAX_SERIES_YEARS * 366) {
            issues.push({ path: ['repeat', 'untilDay'], message: `A repeat can end at most ${MAX_SERIES_YEARS} years after the first day.` });
        }
    } else if (out.ends === 'after') out.count = rule.count;
    return { rule: out, issues };
}

/** Same rule (after normalisation). */
export function sameRule(a: RepeatRule | null | undefined, b: RepeatRule | null | undefined): boolean {
    if (!a || !b) return !a && !b;
    const key = (r: RepeatRule) =>
        JSON.stringify([r.frequency, r.interval, r.weekdays ?? [], r.monthlyMode ?? '', r.monthDay ?? 0, r.setPos ?? 0, r.setWeekday ?? 0, r.ends, r.untilDay ?? '', r.count ?? 0]);
    return key(a) === key(b);
}

/**
 * The rule an occurrence moved from `fromDay` to `toDay` takes for "This and following events" when no new rule was
 * sent: a rule tied to the old day (weekly on that one weekday, monthly on that day of the month, monthly on that
 * nth weekday) follows the move; any other rule (daily, several weekdays, another day) stays as it is. Pure.
 */
export function shiftRuleToDay(rule: RepeatRule, fromDay: string, toDay: string): RepeatRule {
    if (fromDay === toDay || !isDay(fromDay) || !isDay(toDay)) return rule;
    if (rule.frequency === 'weekly' && rule.weekdays?.length === 1 && rule.weekdays[0] === isoWeekday(fromDay)) return { ...rule, weekdays: [isoWeekday(toDay)] };
    if (rule.frequency === 'monthly' && rule.monthlyMode !== 'weekday' && rule.monthDay === Number(fromDay.slice(8, 10))) return { ...rule, monthDay: Number(toDay.slice(8, 10)) };
    if (rule.frequency === 'monthly' && rule.monthlyMode === 'weekday' && rule.setPos === setPosOf(fromDay) && rule.setWeekday === isoWeekday(fromDay)) {
        return { ...rule, setPos: setPosOf(toDay), setWeekday: isoWeekday(toDay) };
    }
    return rule;
}

/** One occurrence day of a series: its business-timezone day and 1-based position from the anchor. */
export interface OccurrenceDay {
    day: string;
    index: number;
}

/** Safety stop for one expansion (well above 5 years of daily occurrences). */
const MAX_STEPS = 4000;

/**
 * Occurrence days of `rule` anchored at `anchorDay`, in order, from the anchor to `throughDay` (inclusive), within the
 * rule's end (until / count). Each carries its position counted from the anchor, so a window later in the series
 * still numbers its occurrences correctly. Pure and bounded.
 */
export function occurrenceDays(rule: RepeatRule, anchorDay: string, throughDay: string): OccurrenceDay[] {
    const last = rule.ends === 'on' && rule.untilDay && rule.untilDay < throughDay ? rule.untilDay : throughDay;
    const limit = rule.ends === 'after' && rule.count ? rule.count : Number.POSITIVE_INFINITY;
    const out: OccurrenceDay[] = [];
    if (anchorDay > last || limit < 1) return out;
    const push = (day: string): boolean => {
        if (day > last || out.length >= limit) return false;
        if (day <= (out.at(-1)?.day ?? '')) return true;
        out.push({ day, index: out.length + 1 });
        return true;
    };
    push(anchorDay);
    const interval = Math.max(1, rule.interval);
    if (rule.frequency === 'daily') {
        for (let step = 1; step < MAX_STEPS; step++) if (!push(addDays(anchorDay, step * interval))) break;
        return out;
    }
    if (rule.frequency === 'weekly') {
        const weekdays = rule.weekdays?.length ? rule.weekdays : [isoWeekday(anchorDay)];
        const weekStart = addDays(anchorDay, 1 - isoWeekday(anchorDay));
        for (let week = 0; week < MAX_STEPS; week += interval) {
            const start = addDays(weekStart, week * 7);
            if (start > last || out.length >= limit) break;
            for (const weekday of weekdays) {
                const day = addDays(start, weekday - 1);
                if (day <= anchorDay) continue;
                if (!push(day)) return out;
            }
        }
        return out;
    }
    const year0 = Number(anchorDay.slice(0, 4));
    const month0 = Number(anchorDay.slice(5, 7));
    for (let step = 0; step < MAX_STEPS; step += interval) {
        const months = month0 - 1 + step;
        const year = year0 + Math.floor(months / 12);
        const month = (months % 12) + 1;
        if (dayOf(year, month, 1) > last || out.length >= limit) break;
        let day: string | null;
        if (rule.monthlyMode === 'weekday') {
            day = nthWeekdayOf(year, month, rule.setPos ?? 1, rule.setWeekday ?? isoWeekday(anchorDay));
        } else {
            const date = rule.monthDay ?? Number(anchorDay.slice(8, 10));
            day = date <= daysInMonth(year, month) ? dayOf(year, month, date) : null;
        }
        if (!day || day <= anchorDay) continue;
        if (!push(day)) break;
    }
    return out;
}

/** When a series stops creating occurrences: the last day (until or the count's last), or null when it never ends. */
export function lastOccurrenceDay(rule: RepeatRule, anchorDay: string): string | null {
    if (rule.ends === 'on') return rule.untilDay ?? null;
    if (rule.ends === 'after') return occurrenceDays(rule, anchorDay, addDays(anchorDay, MAX_SERIES_YEARS * 366 + 31)).at(-1)?.day ?? anchorDay;
    return null;
}

/** Start / end of one occurrence on `day`, as the activity write path takes them. */
export interface OccurrenceTimes {
    /** The rule slot (Activity.originalStartAt). */
    originalStartAt: Date;
    allDay: boolean;
    /** Timed: instants. */
    startAt?: string;
    endAt?: string;
    /** All-day: inclusive days. */
    startDay?: string;
    endDay?: string;
}

export interface SeriesShape {
    allDay: boolean;
    /** HH:mm (timed). */
    startTime: string | null;
    durationMinutes: number;
    spanDays: number;
    timeZone: string;
}

export function occurrenceTimes(shape: SeriesShape, day: string): OccurrenceTimes {
    if (shape.allDay) {
        return { originalStartAt: zonedStartOfDay(day, shape.timeZone), allDay: true, startDay: day, endDay: addDays(day, Math.max(1, shape.spanDays) - 1) };
    }
    const start = zonedWallClockToInstant(`${day}T${shape.startTime ?? '09:00'}`, shape.timeZone);
    const end = new Date(start.getTime() + Math.max(0, shape.durationMinutes) * 60_000);
    return { originalStartAt: start, allDay: false, startAt: start.toISOString(), endAt: end.toISOString() };
}

// ── Summary ("Every week on Mon, Wed until 31 Mar 2027") ─────────────────────

const WEEKDAY_SHORT = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEKDAY_LONG = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const POSITION = ['', 'first', 'second', 'third', 'fourth'];

/** `2027-03-31` → `31 Mar 2027`. */
export function formatRuleDay(day: string): string {
    return `${Number(day.slice(8, 10))} ${MONTH_SHORT[Number(day.slice(5, 7)) - 1]} ${day.slice(0, 4)}`;
}

const every = (interval: number, unit: string) => (interval === 1 ? `Every ${unit}` : `Every ${interval} ${unit}s`);

/** One line a person reads: "Every 2 weeks on Mon, Wed until 31 Mar 2027", "Every month on the last Friday, 10 times". */
export function summarizeRule(rule: RepeatRule): string {
    let text: string;
    if (rule.frequency === 'daily') text = every(rule.interval, 'day');
    else if (rule.frequency === 'weekly') {
        const days = rule.weekdays ?? [];
        const weekdaysOnly = days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d));
        text = `${every(rule.interval, 'week')} on ${weekdaysOnly ? 'weekdays' : days.map((d) => WEEKDAY_SHORT[d]).join(', ')}`;
    } else if (rule.monthlyMode === 'weekday') {
        const pos = rule.setPos === -1 ? 'last' : POSITION[rule.setPos ?? 1];
        text = `${every(rule.interval, 'month')} on the ${pos} ${WEEKDAY_LONG[rule.setWeekday ?? 1]}`;
    } else text = `${every(rule.interval, 'month')} on day ${rule.monthDay ?? 1}`;
    if (rule.ends === 'on' && rule.untilDay) text += ` until ${formatRuleDay(rule.untilDay)}`;
    else if (rule.ends === 'after' && rule.count) text += rule.count === 1 ? ', once' : `, ${rule.count} times`;
    return text;
}

// ── Stored columns ⇄ rule ────────────────────────────────────────────────────

/** The rule columns of ActivitySeries. */
export interface RuleColumns {
    frequency: string;
    interval: number;
    weekdays: string | null;
    monthlyMode: string | null;
    monthDay: number | null;
    setPos: number | null;
    setWeekday: number | null;
    untilDay: string | null;
    count: number | null;
}

export function ruleToColumns(rule: RepeatRule): RuleColumns {
    return {
        frequency: rule.frequency,
        interval: rule.interval,
        weekdays: rule.frequency === 'weekly' && rule.weekdays?.length ? rule.weekdays.join(',') : null,
        monthlyMode: rule.frequency === 'monthly' ? (rule.monthlyMode ?? 'day') : null,
        monthDay: rule.frequency === 'monthly' && rule.monthlyMode !== 'weekday' ? (rule.monthDay ?? null) : null,
        setPos: rule.frequency === 'monthly' && rule.monthlyMode === 'weekday' ? (rule.setPos ?? null) : null,
        setWeekday: rule.frequency === 'monthly' && rule.monthlyMode === 'weekday' ? (rule.setWeekday ?? null) : null,
        untilDay: rule.ends === 'on' ? (rule.untilDay ?? null) : null,
        count: rule.ends === 'after' ? (rule.count ?? null) : null,
    };
}

export function ruleFromColumns(row: RuleColumns): RepeatRule {
    const frequency = (REPEAT_FREQUENCIES as readonly string[]).includes(row.frequency) ? (row.frequency as RepeatFrequency) : 'weekly';
    const rule: RepeatRule = { frequency, interval: row.interval || 1, ends: row.untilDay ? 'on' : row.count ? 'after' : 'never' };
    if (frequency === 'weekly') rule.weekdays = (row.weekdays ?? '').split(',').map(Number).filter((d) => d >= 1 && d <= 7);
    if (frequency === 'monthly') {
        rule.monthlyMode = row.monthlyMode === 'weekday' ? 'weekday' : 'day';
        if (rule.monthlyMode === 'day') rule.monthDay = row.monthDay ?? 1;
        else {
            rule.setPos = row.setPos ?? 1;
            rule.setWeekday = row.setWeekday ?? 1;
        }
    }
    if (row.untilDay) rule.untilDay = row.untilDay;
    if (row.count) rule.count = row.count;
    return rule;
}
