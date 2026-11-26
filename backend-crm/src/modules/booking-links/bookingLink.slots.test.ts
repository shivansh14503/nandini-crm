import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { bookableDays, clashes, computeSlots, daysRange, minutesOf, slotRuleProblem, weekdayOf, windowOn, type SlotRules } from './bookingLink.slots.js';

const TZ = 'Asia/Kolkata';
/** Monday 30 Nov 2026, 09:00 IST. */
const NOW = new Date('2026-11-30T03:30:00.000Z');
const ist = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00+05:30`);
const hhmmOf = (d: Date) => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);

const RULES: SlotRules = {
    slotStepMinutes: 30,
    availability: { '1': [{ start: '10:00', end: '13:00' }], '3': [{ start: '15:00', end: '16:00' }] },
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 10,
    minNoticeMinutes: 60,
    horizonDays: 14,
    maxPerDay: null,
};

const base = { rules: RULES, durationMinutes: 30, fromDay: '2026-11-30', days: 3, now: NOW, tz: TZ, busy: [], holidays: new Set<string>(), bookedPerDay: new Map<string, number>() };

describe('booking slots: helpers', () => {
    it('reads HH:mm (24:00 only as an end) and ISO weekdays', () => {
        assert.equal(minutesOf('09:30'), 570);
        assert.equal(minutesOf('24:00'), null);
        assert.equal(minutesOf('24:00', true), 1440);
        assert.equal(minutesOf('9:30'), null);
        assert.equal(weekdayOf('2026-11-30'), '1');
        assert.equal(weekdayOf('2026-12-06'), '7');
    });

    it('places a window on a business day (24:00 = the next midnight)', () => {
        const w = windowOn('2026-11-30', { start: '22:00', end: '24:00' }, TZ)!;
        assert.equal(new Date(w.start).toISOString(), '2026-11-30T16:30:00.000Z');
        assert.equal(new Date(w.end).toISOString(), '2026-11-30T18:30:00.000Z');
        assert.equal(windowOn('2026-11-30', { start: '12:00', end: '11:00' }, TZ), null);
    });

    it('buffers widen the clash test', () => {
        const busy = [{ start: ist('2026-11-30', '11:00').getTime(), end: ist('2026-11-30', '11:30').getTime() }];
        assert.equal(clashes(ist('2026-11-30', '10:30').getTime(), ist('2026-11-30', '11:00').getTime(), RULES, busy), true, 'buffer after reaches 11:10');
        assert.equal(clashes(ist('2026-11-30', '11:30').getTime(), ist('2026-11-30', '12:00').getTime(), RULES, busy), false, 'touching is free');
        assert.equal(clashes(ist('2026-11-30', '11:30').getTime(), ist('2026-11-30', '12:00').getTime(), { ...RULES, bufferBeforeMinutes: 5 }, busy), true);
    });

    it('bookable days follow notice and horizon', () => {
        assert.deepEqual(bookableDays({ minNoticeMinutes: 60, horizonDays: 14 }, NOW, TZ), { first: '2026-11-30', last: '2026-12-14' });
        assert.deepEqual(bookableDays({ minNoticeMinutes: 24 * 60, horizonDays: 1 }, NOW, TZ), { first: '2026-12-01', last: '2026-12-01' });
        const range = daysRange('2026-11-30', '2026-11-30', TZ);
        assert.equal(new Date(range.start).toISOString(), '2026-11-29T18:30:00.000Z');
        assert.equal(range.end - range.start, 24 * 3_600_000);
    });
});

describe('booking slots: computeSlots', () => {
    it('offers starts on the step grid inside the windows, after the notice', () => {
        const days = computeSlots(base);
        assert.deepEqual(days.map((d) => d.day), ['2026-11-30', '2026-12-01', '2026-12-02']);
        assert.deepEqual(days[0].starts.map(hhmmOf), ['10:00', '10:30', '11:00', '11:30', '12:00', '12:30']);
        assert.deepEqual(days[1].starts, [], 'Tuesday has no hours');
        assert.deepEqual(days[2].starts.map(hhmmOf), ['15:00', '15:30']);
    });

    it('drops starts that clash with busy blocks (buffers included)', () => {
        const busy = [{ start: ist('2026-11-30', '11:00').getTime(), end: ist('2026-11-30', '11:30').getTime() }];
        const [monday] = computeSlots({ ...base, busy });
        assert.deepEqual(monday.starts.map(hhmmOf), ['10:00', '11:30', '12:00', '12:30']);
    });

    it('never offers a start before now + notice', () => {
        const [monday] = computeSlots({ ...base, now: new Date('2026-11-30T05:00:00.000Z') }); // 10:30 IST + 60 min
        assert.deepEqual(monday.starts.map(hhmmOf), ['11:30', '12:00', '12:30']);
    });

    it('skips holidays and days that reached the cap', () => {
        const days = computeSlots({ ...base, holidays: new Set(['2026-11-30']) });
        assert.deepEqual(days[0].starts, []);
        const capped = computeSlots({ ...base, rules: { ...RULES, maxPerDay: 2 }, bookedPerDay: new Map([['2026-12-02', 2]]) });
        assert.equal(capped[0].starts.length, 6);
        assert.deepEqual(capped[2].starts, []);
    });

    it('a longer duration fits fewer starts; the horizon ends the list', () => {
        const [monday] = computeSlots({ ...base, durationMinutes: 60 });
        assert.deepEqual(monday.starts.map(hhmmOf), ['10:00', '10:30', '11:00', '11:30', '12:00']);
        // A 1-day horizon ends tomorrow at this time: two days listed, nothing at or after now + 24 h.
        const short = computeSlots({ ...base, rules: { ...RULES, horizonDays: 1, availability: { ...RULES.availability, '2': [{ start: '08:00', end: '10:00' }] } }, days: 7 });
        assert.deepEqual(short.map((d) => d.day), ['2026-11-30', '2026-12-01']);
        assert.deepEqual(short[1].starts.map(hhmmOf), ['08:00', '08:30'], 'the 09:00 start is exactly 24 h away');
    });

    it('starts from the first bookable day when asked for an earlier one', () => {
        const days = computeSlots({ ...base, fromDay: '2026-11-01', days: 1 });
        assert.equal(days[0].day, '2026-11-30');
    });
});

describe('booking slots: slotRuleProblem', () => {
    const none = new Set<string>();
    it('accepts an offered start', () => {
        assert.equal(slotRuleProblem(RULES, ist('2026-11-30', '12:30'), 30, NOW, TZ, none), null);
    });
    it('names what is wrong', () => {
        assert.equal(slotRuleProblem(RULES, ist('2026-11-30', '09:30'), 30, NOW, TZ, none), 'notice');
        assert.equal(slotRuleProblem(RULES, ist('2026-12-28', '10:00'), 30, NOW, TZ, none), 'horizon');
        assert.equal(slotRuleProblem(RULES, ist('2026-12-07', '10:00'), 30, NOW, TZ, new Set(['2026-12-07'])), 'holiday');
        assert.equal(slotRuleProblem(RULES, ist('2026-12-01', '10:00'), 30, NOW, TZ, none), 'outside_hours');
        assert.equal(slotRuleProblem(RULES, ist('2026-11-30', '12:45'), 30, NOW, TZ, none), 'outside_hours', 'runs past the window');
        assert.equal(slotRuleProblem(RULES, ist('2026-11-30', '10:15'), 30, NOW, TZ, none), 'off_grid');
    });
});
