import type { RepeatRule } from '@/types/activity.types';

/**
 * Repeat rules of recurring activities (Calendar Phase 4), as the form shows them. Mirrors the backend's
 * activity.recurrence.ts summary and anchor defaults, so the line under the Repeat field reads exactly like the drawer's
 * "Repeats …" (which comes from the API). Pure.
 */

export const WEEKDAY_SHORT = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export const WEEKDAY_LONG = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const POSITION = ['', 'first', 'second', 'third', 'fourth'];

const isDay = (day: string) => /^\d{4}-\d{2}-\d{2}$/.test(day);

/** ISO weekday (1 = Monday … 7 = Sunday) of a `YYYY-MM-DD` day. */
export function isoWeekday(day: string): number {
    if (!isDay(day)) return 1;
    const weekday = new Date(`${day}T00:00:00.000Z`).getUTCDay();
    return weekday === 0 ? 7 : weekday;
}

/** Week of the month for "the nth weekday": 1–4, or -1 (a fifth one is the last). */
export function setPosOf(day: string): number {
    if (!isDay(day)) return 1;
    const pos = Math.ceil(Number(day.slice(8, 10)) / 7);
    return pos >= 5 ? -1 : pos;
}

export const positionLabel = (setPos: number) => (setPos === -1 ? 'last' : POSITION[setPos] ?? 'first');

/** `2027-03-31` → `31 Mar 2027`. */
export function formatRuleDay(day: string): string {
    if (!isDay(day)) return day;
    return `${Number(day.slice(8, 10))} ${MONTH_SHORT[Number(day.slice(5, 7)) - 1]} ${day.slice(0, 4)}`;
}

const every = (interval: number, unit: string) => (interval === 1 ? `Every ${unit}` : `Every ${interval} ${unit}s`);

/** "Every 2 weeks on Mon, Wed until 31 Mar 2027" (the backend's `summarizeRule`). */
export function summarizeRepeat(rule: RepeatRule): string {
    let text: string;
    if (rule.frequency === 'daily') text = every(rule.interval, 'day');
    else if (rule.frequency === 'weekly') {
        const days = rule.weekdays ?? [];
        const weekdaysOnly = days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d));
        text = `${every(rule.interval, 'week')} on ${weekdaysOnly ? 'weekdays' : days.map((d) => WEEKDAY_SHORT[d]).join(', ')}`;
    } else if (rule.monthlyMode === 'weekday') {
        text = `${every(rule.interval, 'month')} on the ${positionLabel(rule.setPos ?? 1)} ${WEEKDAY_LONG[rule.setWeekday ?? 1]}`;
    } else text = `${every(rule.interval, 'month')} on day ${rule.monthDay ?? 1}`;
    if (rule.ends === 'on' && rule.untilDay) text += ` until ${formatRuleDay(rule.untilDay)}`;
    else if (rule.ends === 'after' && rule.count) text += rule.count === 1 ? ', once' : `, ${rule.count} times`;
    return text;
}

/** The rule with only the fields its frequency uses, defaults from the first day (the backend's `normalizeRepeatRule`). */
export function normalizeRepeat(rule: RepeatRule, startDay: string): RepeatRule {
    const out: RepeatRule = { frequency: rule.frequency, interval: Math.min(99, Math.max(1, Math.round(rule.interval || 1))), ends: rule.ends ?? 'never' };
    if (rule.frequency === 'weekly') {
        out.weekdays = [...new Set(rule.weekdays?.length ? rule.weekdays : [isoWeekday(startDay)])].sort((a, b) => a - b);
    } else if (rule.frequency === 'monthly') {
        out.monthlyMode = rule.monthlyMode ?? 'day';
        if (out.monthlyMode === 'day') out.monthDay = rule.monthDay ?? Number(startDay.slice(8, 10) || 1);
        else {
            out.setPos = rule.setPos ?? setPosOf(startDay);
            out.setWeekday = rule.setWeekday ?? isoWeekday(startDay);
        }
    }
    if (out.ends === 'on') out.untilDay = rule.untilDay;
    if (out.ends === 'after') out.count = rule.count;
    return out;
}

export function sameRepeat(a: RepeatRule | null | undefined, b: RepeatRule | null | undefined): boolean {
    if (!a || !b) return !a && !b;
    const key = (r: RepeatRule) =>
        JSON.stringify([r.frequency, r.interval, r.weekdays ?? [], r.monthlyMode ?? '', r.monthDay ?? 0, r.setPos ?? 0, r.setWeekday ?? 0, r.ends, r.untilDay ?? '', r.count ?? 0]);
    return key(a) === key(b);
}

/** The quick choices of the Repeat select for a first day. */
export type RepeatPreset = 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthlyDay' | 'monthlyWeekday' | 'custom';

export function presetRule(preset: Exclude<RepeatPreset, 'none' | 'custom'>, startDay: string): RepeatRule {
    switch (preset) {
        case 'daily':
            return { frequency: 'daily', interval: 1, ends: 'never' };
        case 'weekdays':
            return { frequency: 'weekly', interval: 1, weekdays: [1, 2, 3, 4, 5], ends: 'never' };
        case 'weekly':
            return { frequency: 'weekly', interval: 1, weekdays: [isoWeekday(startDay)], ends: 'never' };
        case 'monthlyDay':
            return { frequency: 'monthly', interval: 1, monthlyMode: 'day', monthDay: Number(startDay.slice(8, 10) || 1), ends: 'never' };
        case 'monthlyWeekday':
            return { frequency: 'monthly', interval: 1, monthlyMode: 'weekday', setPos: setPosOf(startDay), setWeekday: isoWeekday(startDay), ends: 'never' };
    }
}

/** Which quick choice a rule is (`custom` when none matches, `none` for no rule). */
export function presetOf(rule: RepeatRule | null, startDay: string): RepeatPreset {
    if (!rule) return 'none';
    for (const preset of ['daily', 'weekdays', 'weekly', 'monthlyDay', 'monthlyWeekday'] as const) {
        if (sameRepeat(normalizeRepeat(rule, startDay), presetRule(preset, startDay))) return preset;
    }
    return 'custom';
}

/** Labels of the quick choices for a first day ("Every week on Wednesday"). */
export function presetLabels(startDay: string): Record<RepeatPreset, string> {
    const weekday = WEEKDAY_LONG[isoWeekday(startDay)];
    return {
        none: 'Does not repeat',
        daily: 'Every day',
        weekdays: 'Every weekday (Mon to Fri)',
        weekly: `Every week on ${weekday}`,
        monthlyDay: `Every month on day ${Number(startDay.slice(8, 10) || 1)}`,
        monthlyWeekday: `Every month on the ${positionLabel(setPosOf(startDay))} ${weekday}`,
        custom: 'Custom...',
    };
}
