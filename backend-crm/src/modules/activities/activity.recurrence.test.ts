import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    isoWeekday,
    lastOccurrenceDay,
    normalizeRepeatRule,
    nthWeekdayOf,
    occurrenceDays,
    occurrenceTimes,
    repeatRuleSchema,
    ruleFromColumns,
    ruleToColumns,
    sameRule,
    setPosOf,
    shiftRuleToDay,
    summarizeRule,
    type RepeatRule,
} from './activity.recurrence.js';

const days = (rule: RepeatRule, anchor: string, through: string) => occurrenceDays(rule, anchor, through).map((o) => o.day);
const rule = (raw: unknown, anchor: string) => normalizeRepeatRule(repeatRuleSchema.parse(raw), anchor).rule;

describe('activity.recurrence: calendar helpers', () => {
    it('isoWeekday, nthWeekdayOf and setPosOf', () => {
        assert.equal(isoWeekday('2026-11-30'), 1); // Monday
        assert.equal(isoWeekday('2026-12-06'), 7); // Sunday
        assert.equal(nthWeekdayOf(2026, 12, 1, 1), '2026-12-07');
        assert.equal(nthWeekdayOf(2026, 12, -1, 5), '2026-12-25');
        assert.equal(nthWeekdayOf(2027, 2, -1, 7), '2027-02-28');
        assert.equal(setPosOf('2026-12-08'), 2);
        assert.equal(setPosOf('2026-12-29'), -1);
    });
});

describe('activity.recurrence: normalizeRepeatRule', () => {
    it('fills the weekday / day of month from the anchor and drops unused fields', () => {
        assert.deepEqual(rule({ frequency: 'weekly' }, '2026-12-02'), { frequency: 'weekly', interval: 1, ends: 'never', weekdays: [3] });
        assert.deepEqual(rule({ frequency: 'monthly', weekdays: [1] }, '2026-12-15'), { frequency: 'monthly', interval: 1, ends: 'never', monthlyMode: 'day', monthDay: 15 });
        assert.deepEqual(rule({ frequency: 'monthly', monthlyMode: 'weekday' }, '2026-12-29'), {
            frequency: 'monthly',
            interval: 1,
            ends: 'never',
            monthlyMode: 'weekday',
            setPos: -1,
            setWeekday: 2,
        });
        assert.deepEqual(rule({ frequency: 'daily', interval: 2, ends: 'after', count: 5, untilDay: '2027-01-01' }, '2026-12-01'), {
            frequency: 'daily',
            interval: 2,
            ends: 'after',
            count: 5,
        });
    });

    it('refuses an end before the first day, more than five years out, and missing end values', () => {
        assert.equal(normalizeRepeatRule(repeatRuleSchema.parse({ frequency: 'daily', ends: 'on', untilDay: '2026-11-30' }), '2026-12-01').issues.length, 1);
        assert.equal(normalizeRepeatRule(repeatRuleSchema.parse({ frequency: 'daily', ends: 'on', untilDay: '2032-12-31' }), '2026-12-01').issues.length, 1);
        assert.throws(() => repeatRuleSchema.parse({ frequency: 'daily', ends: 'on' }));
        assert.throws(() => repeatRuleSchema.parse({ frequency: 'daily', ends: 'after' }));
        assert.throws(() => repeatRuleSchema.parse({ frequency: 'yearly' }));
        assert.throws(() => repeatRuleSchema.parse({ frequency: 'daily', interval: 0 }));
        assert.throws(() => repeatRuleSchema.parse({ frequency: 'monthly', monthlyMode: 'weekday', setPos: 5 }));
    });
});

describe('activity.recurrence: occurrenceDays', () => {
    it('daily every N days, numbered from the anchor', () => {
        const r = rule({ frequency: 'daily', interval: 3 }, '2026-12-01');
        assert.deepEqual(occurrenceDays(r, '2026-12-01', '2026-12-10'), [
            { day: '2026-12-01', index: 1 },
            { day: '2026-12-04', index: 2 },
            { day: '2026-12-07', index: 3 },
            { day: '2026-12-10', index: 4 },
        ]);
    });

    it('weekly on chosen weekdays, every 2 weeks, from the anchor week', () => {
        const r = rule({ frequency: 'weekly', interval: 2, weekdays: [1, 3] }, '2026-12-02'); // Wed
        assert.deepEqual(days(r, '2026-12-02', '2026-12-31'), ['2026-12-02', '2026-12-14', '2026-12-16', '2026-12-28', '2026-12-30']);
    });

    it('keeps the anchor as occurrence 1 even when it does not match the rule', () => {
        const r = rule({ frequency: 'weekly', weekdays: [1] }, '2026-12-03'); // Thursday anchor, Mondays
        assert.deepEqual(days(r, '2026-12-03', '2026-12-15'), ['2026-12-03', '2026-12-07', '2026-12-14']);
    });

    it('monthly on day 31 skips months without it (no move to the 30th)', () => {
        const r = rule({ frequency: 'monthly', monthDay: 31 }, '2027-01-31');
        assert.deepEqual(days(r, '2027-01-31', '2027-08-31'), ['2027-01-31', '2027-03-31', '2027-05-31', '2027-07-31', '2027-08-31']);
    });

    it('monthly on the 29th in a non-leap February is skipped, in a leap year kept', () => {
        assert.deepEqual(days(rule({ frequency: 'monthly' }, '2027-01-29'), '2027-01-29', '2027-03-31'), ['2027-01-29', '2027-03-29']);
        assert.deepEqual(days(rule({ frequency: 'monthly' }, '2028-01-29'), '2028-01-29', '2028-03-31'), ['2028-01-29', '2028-02-29', '2028-03-29']);
    });

    it('monthly on the nth and the last weekday, every 2 months', () => {
        const second = rule({ frequency: 'monthly', monthlyMode: 'weekday', setPos: 2, setWeekday: 2 }, '2026-12-08');
        assert.deepEqual(days(second, '2026-12-08', '2027-03-31'), ['2026-12-08', '2027-01-12', '2027-02-09', '2027-03-09']);
        const last = rule({ frequency: 'monthly', interval: 2, monthlyMode: 'weekday', setPos: -1, setWeekday: 5 }, '2026-12-25');
        assert.deepEqual(days(last, '2026-12-25', '2027-06-30'), ['2026-12-25', '2027-02-26', '2027-04-30', '2027-06-25']);
    });

    it('stops at the until day (inclusive) and after count occurrences', () => {
        const until = rule({ frequency: 'daily', ends: 'on', untilDay: '2026-12-03' }, '2026-12-01');
        assert.deepEqual(days(until, '2026-12-01', '2027-12-31'), ['2026-12-01', '2026-12-02', '2026-12-03']);
        const count = rule({ frequency: 'weekly', weekdays: [1, 5], ends: 'after', count: 3 }, '2026-11-30');
        assert.deepEqual(days(count, '2026-11-30', '2027-12-31'), ['2026-11-30', '2026-12-04', '2026-12-07']);
        assert.equal(lastOccurrenceDay(count, '2026-11-30'), '2026-12-07');
        assert.equal(lastOccurrenceDay(until, '2026-12-01'), '2026-12-03');
        assert.equal(lastOccurrenceDay(rule({ frequency: 'daily' }, '2026-12-01'), '2026-12-01'), null);
    });

    it('a window later in the series keeps the positions counted from the anchor', () => {
        const r = rule({ frequency: 'weekly', weekdays: [1] }, '2026-11-30');
        const all = occurrenceDays(r, '2026-11-30', '2027-03-01');
        assert.equal(all.at(-1)?.index, 14);
    });
});

describe('activity.recurrence: occurrenceTimes', () => {
    it('timed slots keep the wall-clock time across a DST change (America/New_York)', () => {
        const shape = { allDay: false, startTime: '09:00', durationMinutes: 45, spanDays: 1, timeZone: 'America/New_York' };
        const before = occurrenceTimes(shape, '2027-03-12');
        const after = occurrenceTimes(shape, '2027-03-15');
        assert.equal(before.startAt, '2027-03-12T14:00:00.000Z');
        assert.equal(after.startAt, '2027-03-15T13:00:00.000Z');
        assert.equal(after.endAt, '2027-03-15T13:45:00.000Z');
    });

    it('business time zone (Asia/Kolkata) and all-day spans', () => {
        const timed = occurrenceTimes({ allDay: false, startTime: '10:30', durationMinutes: 30, spanDays: 1, timeZone: 'Asia/Kolkata' }, '2026-12-01');
        assert.equal(timed.startAt, '2026-12-01T05:00:00.000Z');
        assert.equal(timed.originalStartAt.toISOString(), '2026-12-01T05:00:00.000Z');
        const allDay = occurrenceTimes({ allDay: true, startTime: null, durationMinutes: 0, spanDays: 2, timeZone: 'Asia/Kolkata' }, '2026-12-31');
        assert.deepEqual({ startDay: allDay.startDay, endDay: allDay.endDay }, { startDay: '2026-12-31', endDay: '2027-01-01' });
        assert.equal(allDay.originalStartAt.toISOString(), '2026-12-30T18:30:00.000Z');
    });
});

describe('activity.recurrence: summary and columns', () => {
    it('reads like a sentence', () => {
        assert.equal(summarizeRule(rule({ frequency: 'weekly', weekdays: [1, 3], ends: 'on', untilDay: '2027-03-31' }, '2026-11-30')), 'Every week on Mon, Wed until 31 Mar 2027');
        assert.equal(summarizeRule(rule({ frequency: 'weekly', weekdays: [1, 2, 3, 4, 5] }, '2026-11-30')), 'Every week on weekdays');
        assert.equal(summarizeRule(rule({ frequency: 'daily', interval: 2 }, '2026-11-30')), 'Every 2 days');
        assert.equal(summarizeRule(rule({ frequency: 'monthly', monthlyMode: 'weekday', setPos: -1, setWeekday: 5, ends: 'after', count: 10 }, '2026-12-25')), 'Every month on the last Friday, 10 times');
        assert.equal(summarizeRule(rule({ frequency: 'monthly', interval: 3 }, '2026-12-15')), 'Every 3 months on day 15');
    });

    it('round-trips through the stored columns', () => {
        for (const r of [
            rule({ frequency: 'weekly', interval: 2, weekdays: [2, 4], ends: 'after', count: 6 }, '2026-12-01'),
            rule({ frequency: 'monthly', monthlyMode: 'weekday', setPos: 3, setWeekday: 1, ends: 'on', untilDay: '2027-06-30' }, '2026-12-21'),
            rule({ frequency: 'daily' }, '2026-12-01'),
        ]) {
            assert.ok(sameRule(ruleFromColumns(ruleToColumns(r)), r), JSON.stringify(r));
        }
        assert.equal(sameRule(rule({ frequency: 'daily' }, '2026-12-01'), rule({ frequency: 'daily', interval: 2 }, '2026-12-01')), false);
        assert.equal(sameRule(null, null), true);
    });
});

describe('activity.recurrence: shiftRuleToDay', () => {
    it('a rule tied to the old day follows the move; others stay', () => {
        // 2026-12-02 is a Wednesday, 2026-12-03 a Thursday.
        assert.deepEqual(shiftRuleToDay(rule({ frequency: 'weekly' }, '2026-12-02'), '2026-12-02', '2026-12-03').weekdays, [4]);
        assert.deepEqual(shiftRuleToDay(rule({ frequency: 'weekly', weekdays: [1, 3] }, '2026-12-02'), '2026-12-02', '2026-12-03').weekdays, [1, 3]);
        assert.equal(shiftRuleToDay(rule({ frequency: 'monthly' }, '2026-12-02'), '2026-12-02', '2026-12-03').monthDay, 3);
        const nth = shiftRuleToDay(rule({ frequency: 'monthly', monthlyMode: 'weekday' }, '2026-12-02'), '2026-12-02', '2026-12-10');
        assert.deepEqual([nth.setPos, nth.setWeekday], [2, 4]);
        const daily = rule({ frequency: 'daily' }, '2026-12-02');
        assert.equal(shiftRuleToDay(daily, '2026-12-02', '2026-12-03'), daily);
    });
});
