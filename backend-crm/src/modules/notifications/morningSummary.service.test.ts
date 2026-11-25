import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { activityRangeWhere } from '../activities/activity.calendar.js';
import { overdueActivitiesWhere } from './morningSummary.service.js';

type TimeRow = { startAt: Date; endAt: Date | null };
type Bounds = { lt?: Date; lte?: Date; gt?: Date; gte?: Date };

/** Reads the `startAt` / `endAt` conditions of a Prisma where (AND / OR, range operators, null); other fields pass. */
function matchesTimes(where: Record<string, unknown>, row: TimeRow): boolean {
    return Object.entries(where).every(([key, condition]) => {
        if (key === 'AND') return (condition as Record<string, unknown>[]).every((part) => matchesTimes(part, row));
        if (key === 'OR') return (condition as Record<string, unknown>[]).some((part) => matchesTimes(part, row));
        if (key !== 'startAt' && key !== 'endAt') return true;
        const value = row[key];
        if (condition === null) return value === null;
        if (value === null) return false;
        const { lt, lte, gt, gte } = condition as Bounds;
        const at = value.getTime();
        return (!lt || at < lt.getTime()) && (!lte || at <= lte.getTime()) && (!gt || at > gt.getTime()) && (!gte || at >= gte.getTime());
    });
}

// Wednesday 25 Nov 2026 in IST: midnight is 24 Nov 18:30 UTC; the run is at 09:00 IST.
const dayStart = new Date('2026-11-24T18:30:00.000Z');
const dayEnd = new Date('2026-11-25T18:30:00.000Z');
const ist = (wallClock: string) => new Date(`${wallClock}+05:30`);

describe('overdueActivitiesWhere', () => {
    const overdue = overdueActivitiesWhere('palak', dayStart) as Record<string, unknown>;
    const today = activityRangeWhere(dayStart, dayEnd) as Record<string, unknown>;
    const sections = (row: TimeRow) => ({ overdue: matchesTimes(overdue, row), today: matchesTimes(today, row) });

    it('leaves an activity running past midnight to today’s schedule (never listed twice)', () => {
        assert.deepEqual(sections({ startAt: ist('2026-11-24T23:00:00'), endAt: ist('2026-11-25T01:00:00') }), { overdue: false, today: true });
    });

    it('lists what was over by the start of today as overdue only', () => {
        assert.deepEqual(sections({ startAt: ist('2026-11-24T10:00:00'), endAt: ist('2026-11-24T11:00:00') }), { overdue: true, today: false });
        // An all-day activity of yesterday ends at today's midnight (exclusive end).
        assert.deepEqual(sections({ startAt: ist('2026-11-24T00:00:00'), endAt: dayStart }), { overdue: true, today: false });
        assert.deepEqual(sections({ startAt: ist('2026-11-23T15:00:00'), endAt: null }), { overdue: true, today: false });
    });

    it('keeps today’s activities, past or not, in today’s schedule', () => {
        assert.deepEqual(sections({ startAt: ist('2026-11-25T08:00:00'), endAt: ist('2026-11-25T08:30:00') }), { overdue: false, today: true });
        assert.deepEqual(sections({ startAt: ist('2026-11-25T00:00:00'), endAt: null }), { overdue: false, today: true });
    });

    it('never matches an activity that today’s schedule shows', () => {
        const instants = [-30, -12, -1, -0.5, 0, 0.5, 1, 9, 12, 30].map((hours) => new Date(dayStart.getTime() + hours * 60 * 60 * 1000));
        for (const startAt of instants) {
            for (const endAt of [null, ...instants.filter((end) => end > startAt)]) {
                const found = sections({ startAt, endAt });
                assert.ok(!(found.overdue && found.today), `${startAt.toISOString()} – ${endAt?.toISOString() ?? 'no end'}`);
            }
        }
    });
});
