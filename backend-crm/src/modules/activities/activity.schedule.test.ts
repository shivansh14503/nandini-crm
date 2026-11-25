import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { allDayRange } from './activity.mapper.js';
import {
    ACTIVITY_FALLBACK_DURATION_MINUTES,
    ACTIVITY_REMINDER_MINUTES,
    ACTIVITY_REMINDERS,
    activityDurationMinutes,
    computeRemindAt,
    END_BEFORE_START_MESSAGE,
    nextReminderSentAt,
    normalizeSchedule,
    notApplicableFor,
    START_REQUIRED_MESSAGE,
    TOO_LONG_MESSAGE,
    type ScheduleInput,
} from './activity.schedule.js';

const IST = 'Asia/Kolkata';
const iso = (date: Date | null) => date?.toISOString() ?? null;
const timed = (input: Partial<ScheduleInput>): ScheduleInput => ({ followupType: 'Meeting', allDay: false, ...input });

describe('normalizeSchedule: timed', () => {
    it('requires a start on everything but notes', () => {
        assert.deepEqual(normalizeSchedule(timed({}), IST, 60).issues, [{ path: ['startAt'], message: START_REQUIRED_MESSAGE }]);
        assert.deepEqual(normalizeSchedule(timed({ followupType: 'Task' }), IST, 0).issues, [{ path: ['startAt'], message: START_REQUIRED_MESSAGE }]);
    });

    it('gives notes no schedule at all', () => {
        const schedule = normalizeSchedule(timed({ followupType: 'Note', startAt: '2026-11-25T05:00:00.000Z', allDay: true }), IST, 30);
        assert.deepEqual(schedule, { startAt: null, endAt: null, allDay: false, issues: [] });
    });

    it('defaults the end from the type duration', () => {
        const schedule = normalizeSchedule(timed({ startAt: '2026-11-25T05:00:00.000Z' }), IST, 60);
        assert.equal(iso(schedule.endAt), '2026-11-25T06:00:00.000Z');
        assert.deepEqual(schedule.issues, []);
    });

    it('ends a task when it starts, whatever end is sent', () => {
        const schedule = normalizeSchedule(timed({ followupType: 'Task', startAt: '2026-11-25T05:00:00.000Z', endAt: '2026-11-25T09:00:00.000Z' }), IST, 0);
        assert.equal(iso(schedule.endAt), '2026-11-25T05:00:00.000Z');
    });

    it('refuses an end before the start and more than 31 days', () => {
        const before = normalizeSchedule(timed({ startAt: '2026-11-25T05:00:00.000Z', endAt: '2026-11-25T04:59:00.000Z' }), IST, 30);
        assert.deepEqual(before.issues, [{ path: ['endAt'], message: END_BEFORE_START_MESSAGE }]);
        const long = normalizeSchedule(timed({ startAt: '2026-11-01T00:00:00.000Z', endAt: '2026-12-02T00:00:01.000Z' }), IST, 30);
        assert.deepEqual(long.issues, [{ path: ['endAt'], message: TOO_LONG_MESSAGE }]);
        const exactly = normalizeSchedule(timed({ startAt: '2026-11-01T00:00:00.000Z', endAt: '2026-12-02T00:00:00.000Z' }), IST, 30);
        assert.deepEqual(exactly.issues, []);
    });
});

describe('normalizeSchedule: all-day', () => {
    it('stores a single day as midnight to the next midnight (IST)', () => {
        const schedule = normalizeSchedule(timed({ allDay: true, startDay: '2026-11-25' }), IST, 60);
        assert.equal(iso(schedule.startAt), '2026-11-24T18:30:00.000Z');
        assert.equal(iso(schedule.endAt), '2026-11-25T18:30:00.000Z');
        assert.equal(schedule.allDay, true);
        assert.deepEqual(allDayRange(schedule.startAt!, schedule.endAt, IST), { startDay: '2026-11-25', endDay: '2026-11-25' });
    });

    it('round-trips a multi-day span (25–26 Nov)', () => {
        const schedule = normalizeSchedule(timed({ allDay: true, startDay: '2026-11-25', endDay: '2026-11-26' }), IST, 60);
        assert.equal(iso(schedule.startAt), '2026-11-24T18:30:00.000Z');
        assert.equal(iso(schedule.endAt), '2026-11-26T18:30:00.000Z');
        assert.deepEqual(allDayRange(schedule.startAt!, schedule.endAt, IST), { startDay: '2026-11-25', endDay: '2026-11-26' });
    });

    it('ignores the instants and falls back to the day of startAt', () => {
        // 23:30 IST on 25 Nov is 18:00Z: the day is the 25th in the business timezone.
        const schedule = normalizeSchedule(timed({ allDay: true, startAt: '2026-11-25T18:00:00.000Z', endAt: '2026-11-30T00:00:00.000Z' }), IST, 60);
        assert.deepEqual(allDayRange(schedule.startAt!, schedule.endAt, IST), { startDay: '2026-11-25', endDay: '2026-11-25' });
        assert.deepEqual(normalizeSchedule(timed({ allDay: true }), IST, 60).issues, [{ path: ['startAt'], message: START_REQUIRED_MESSAGE }]);
    });

    it('keeps an all-day task to one day', () => {
        const schedule = normalizeSchedule(timed({ followupType: 'Task', allDay: true, startDay: '2026-11-25', endDay: '2026-11-28' }), IST, 0);
        assert.deepEqual(allDayRange(schedule.startAt!, schedule.endAt, IST), { startDay: '2026-11-25', endDay: '2026-11-25' });
    });

    it('refuses an end day before the start day and spans over 31 days', () => {
        assert.deepEqual(normalizeSchedule(timed({ allDay: true, startDay: '2026-11-25', endDay: '2026-11-24' }), IST, 60).issues, [
            { path: ['endAt'], message: END_BEFORE_START_MESSAGE },
        ]);
        assert.deepEqual(normalizeSchedule(timed({ allDay: true, startDay: '2026-11-01', endDay: '2026-12-01' }), IST, 60).issues, []);
        assert.deepEqual(normalizeSchedule(timed({ allDay: true, startDay: '2026-11-01', endDay: '2026-12-02' }), IST, 60).issues, [
            { path: ['endAt'], message: TOO_LONG_MESSAGE },
        ]);
    });
});

describe('activityDurationMinutes', () => {
    const category = {
        options: [
            { value: 'Call', meta: { durationMinutes: 15, icon: 'call' } },
            { value: 'Email', meta: { durationMinutes: 0 } },
            { value: 'Client Visit', meta: { durationMinutes: 120 } }, // a renamed "Site Visit" keeps its meta
            { value: 'Lunch', meta: null },
            { value: 'Bad', meta: { durationMinutes: 2000 } },
            { value: 'Half', meta: { durationMinutes: 7.5 } },
        ],
    };

    it('reads the option meta', () => {
        assert.equal(activityDurationMinutes('Call', category), 15);
        assert.equal(activityDurationMinutes('Email', category), 0);
        assert.equal(activityDurationMinutes('Client Visit', category), 120);
    });

    it('gives tasks no length and the rest 30 minutes', () => {
        assert.equal(activityDurationMinutes('Task', category), 0);
        for (const type of ['Lunch', 'Bad', 'Half', 'Unknown']) assert.equal(activityDurationMinutes(type, category), ACTIVITY_FALLBACK_DURATION_MINUTES, type);
        assert.equal(activityDurationMinutes('Call', null), ACTIVITY_FALLBACK_DURATION_MINUTES);
    });
});

describe('computeRemindAt', () => {
    const base = { followupType: 'Meeting', status: 'Planned', reminder: '15 minutes before', startAt: new Date('2026-11-25T05:00:00.000Z'), allDay: false };

    it('counts back from the start of a timed activity', () => {
        assert.equal(iso(computeRemindAt(base, IST)), '2026-11-25T04:45:00.000Z');
        assert.equal(iso(computeRemindAt({ ...base, reminder: 'At start time' }, IST)), '2026-11-25T05:00:00.000Z');
    });

    it('counts back from 09:00 business time on the first day of an all-day activity', () => {
        const allDay = { ...base, allDay: true, startAt: new Date('2026-11-24T18:30:00.000Z') };
        assert.equal(iso(computeRemindAt({ ...allDay, reminder: 'At start time' }, IST)), '2026-11-25T03:30:00.000Z');
        assert.equal(iso(computeRemindAt({ ...allDay, reminder: '1 day before' }, IST)), '2026-11-24T03:30:00.000Z');
    });

    it('has none for notes, closed or deleted activities, no reminder or no start', () => {
        assert.equal(computeRemindAt({ ...base, followupType: 'Note' }, IST), null);
        assert.equal(computeRemindAt({ ...base, status: 'Cancelled' }, IST), null);
        assert.equal(computeRemindAt({ ...base, status: 'Completed' }, IST), null);
        assert.equal(computeRemindAt({ ...base, reminder: null }, IST), null);
        assert.equal(computeRemindAt({ ...base, reminder: '3 minutes before' }, IST), null);
        assert.equal(computeRemindAt({ ...base, startAt: null }, IST), null);
        assert.equal(computeRemindAt({ ...base, isDeleted: true }, IST), null);
    });

    it('maps every reminder option to minutes', () => {
        assert.deepEqual(
            ACTIVITY_REMINDERS.map((reminder) => ACTIVITY_REMINDER_MINUTES[reminder]),
            [0, 5, 10, 15, 30, 60, 120, 1440],
        );
        for (const reminder of ACTIVITY_REMINDERS) {
            const due = computeRemindAt({ ...base, reminder }, IST);
            assert.equal(due!.getTime(), base.startAt.getTime() - ACTIVITY_REMINDER_MINUTES[reminder] * 60_000, reminder);
        }
    });
});

describe('nextReminderSentAt', () => {
    const sent = new Date('2026-11-25T04:45:05.000Z');

    it('keeps the claim while the reminder time is unchanged', () => {
        const before = { remindAt: new Date('2026-11-25T04:45:00.000Z'), reminderSentAt: sent };
        assert.equal(nextReminderSentAt(before, new Date('2026-11-25T04:45:00.000Z')), sent);
    });

    it('re-arms a rescheduled reminder', () => {
        const before = { remindAt: new Date('2026-11-25T04:45:00.000Z'), reminderSentAt: sent };
        assert.equal(nextReminderSentAt(before, new Date('2026-11-26T04:45:00.000Z')), null);
        assert.equal(nextReminderSentAt(before, null), null);
    });
});

describe('notApplicableFor', () => {
    it('hides the schedule of notes and the invitees of tasks only', () => {
        assert.ok(notApplicableFor('Note').has('startAt'));
        assert.ok(notApplicableFor('Note').has('status'));
        assert.ok(notApplicableFor('Task').has('attendees'));
        assert.ok(!notApplicableFor('Task').has('startAt'));
        assert.equal(notApplicableFor('Meeting').size, 0);
        assert.equal(notApplicableFor(undefined).size, 0);
    });
});
