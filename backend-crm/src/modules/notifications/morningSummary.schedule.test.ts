import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cronFirstMinuteOfDay, cronRunsOnDay, parseCron, parseCronField, shouldCatchUpMorningSummary } from './morningSummary.schedule.js';

const IST = 'Asia/Kolkata';
const DEFAULT_PATTERN = '0 9 * * 1-6';

describe('parseCron', () => {
    it('reads numbers, names, ranges, lists and steps', () => {
        assert.deepEqual(parseCronField('*/20', { min: 0, max: 59 }), new Set([0, 20, 40]));
        assert.deepEqual(parseCronField('5,10-12', { min: 0, max: 59 }), new Set([5, 10, 11, 12]));
        assert.deepEqual(parseCronField('MON-fri', { min: 0, max: 7, names: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'], nameBase: 0 }), new Set([1, 2, 3, 4, 5]));
        assert.equal(parseCronField('*', { min: 0, max: 59 }), '*');
    });

    it('refuses what it cannot read', () => {
        for (const field of ['60', '5-1', '*/0', 'x', '1-']) assert.equal(parseCronField(field, { min: 0, max: 59 }), null, field);
        for (const pattern of ['0 9 * *', '0 9 * * 1-6 2026 x', 'every day', '']) assert.equal(parseCron(pattern), null, pattern);
    });

    it('ignores a leading seconds field', () => {
        const cron = parseCron('0 30 8 * * 1-6');
        assert.deepEqual(cron?.minute, new Set([30]));
        assert.deepEqual(cron?.hour, new Set([8]));
    });
});

describe('cronRunsOnDay', () => {
    it('runs the default pattern Monday to Saturday', () => {
        assert.equal(cronRunsOnDay(DEFAULT_PATTERN, '2026-11-29'), false, 'Sunday');
        assert.equal(cronRunsOnDay(DEFAULT_PATTERN, '2026-11-30'), true, 'Monday');
        assert.equal(cronRunsOnDay(DEFAULT_PATTERN, '2026-11-28'), true, 'Saturday');
    });

    it('reads Sunday as 0, 7 or sun, and checks the month', () => {
        for (const dow of ['0', '7', 'sun']) assert.equal(cronRunsOnDay(`0 9 * * ${dow}`, '2026-11-29'), true, dow);
        assert.equal(cronRunsOnDay('0 9 * jan *', '2026-11-25'), false);
        assert.equal(cronRunsOnDay('0 9 * 11 *', '2026-11-25'), true);
    });

    it('matches either restricted day field', () => {
        assert.equal(cronRunsOnDay('0 9 1 * 1', '2026-12-01'), true, 'the 1st (a Tuesday)');
        assert.equal(cronRunsOnDay('0 9 1 * 1', '2026-11-30'), true, 'a Monday');
        assert.equal(cronRunsOnDay('0 9 1 * 1', '2026-11-25'), false);
        assert.equal(cronRunsOnDay('0 9 25 * *', '2026-11-25'), true);
    });
});

describe('cronFirstMinuteOfDay', () => {
    it('is the earliest hour and minute', () => {
        assert.equal(cronFirstMinuteOfDay(DEFAULT_PATTERN), 540);
        assert.equal(cronFirstMinuteOfDay('30 17,8 * * *'), 510);
        assert.equal(cronFirstMinuteOfDay('*/15 7-21 * * *'), 420);
        assert.equal(cronFirstMinuteOfDay('* 9 * * *'), null);
        assert.equal(cronFirstMinuteOfDay('nope'), null);
    });
});

describe('shouldCatchUpMorningSummary', () => {
    // 2026-11-25 is a Wednesday; 09:00 IST is 03:30 UTC and noon is 06:30 UTC.
    const at = (iso: string, lastRunDay: string | null = null) => shouldCatchUpMorningSummary(new Date(iso), DEFAULT_PATTERN, IST, lastRunDay);

    it('makes up a missed run between the scheduled time and noon', () => {
        assert.equal(at('2026-11-25T03:29:00.000Z'), false, '08:59');
        assert.equal(at('2026-11-25T03:30:00.000Z'), true, '09:00');
        assert.equal(at('2026-11-25T06:29:00.000Z'), true, '11:59');
        assert.equal(at('2026-11-25T06:30:00.000Z'), false, '12:00');
    });

    it('uses the business-timezone day, not the UTC one', () => {
        // 03:30 IST on the 25th is still the evening of the 24th in UTC.
        assert.equal(at('2026-11-24T22:00:00.000Z'), false);
    });

    it('runs once a day and only on scheduled days', () => {
        assert.equal(at('2026-11-25T04:00:00.000Z', '2026-11-25'), false);
        assert.equal(at('2026-11-25T04:00:00.000Z', '2026-11-24'), true);
        assert.equal(at('2026-11-29T04:00:00.000Z'), false, 'Sunday');
        assert.equal(shouldCatchUpMorningSummary(new Date('2026-11-25T04:00:00.000Z'), 'bad cron', IST, null), false);
    });
});
