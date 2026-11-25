import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AuthUser } from '../../types/user.types.js';
import {
    activityCalendarWhere,
    activityRangeWhere,
    activityToCalendarItem,
    capRows,
    contractRenewalToCalendarItem,
    contractRenewalWhere,
    followupDayRange,
    followUpSlotInstant,
    leadFollowupToCalendarItem,
    leadFollowupWhere,
    mergeCalendarItems,
    opportunityFollowupToCalendarItem,
    opportunityFollowupWhere,
    overlaps,
    renewalRange,
    type ActivityCalendarRow,
    type CalendarItem,
} from './activity.calendar.js';

const IST = 'Asia/Kolkata';
const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-11-25T06:30:00.000Z'); // 12:00 IST
const exec: AuthUser = { id: 1, username: 'palak', role: 'Sales Executive' };
const admin: AuthUser = { id: 2, username: 'root', role: 'Admin' };
const date = (day: string) => new Date(`${day}T00:00:00.000Z`);

describe('followUpSlotInstant', () => {
    it('reads the 12-hour time in the business timezone', () => {
        const slot = followUpSlotInstant(date('2026-11-25'), '11:00 AM', IST);
        assert.equal(slot.start.toISOString(), '2026-11-25T05:30:00.000Z');
        assert.equal(slot.allDay, false);
    });

    it('makes a follow-up without a readable time an all-day item', () => {
        for (const time of ['', null, '25:00', 'evening']) {
            const slot = followUpSlotInstant(date('2026-11-25'), time, IST);
            assert.equal(slot.allDay, true, String(time));
            assert.equal(slot.start.toISOString(), '2026-11-24T18:30:00.000Z');
            assert.equal(slot.day, '2026-11-25');
        }
    });
});

describe('ranges', () => {
    const from = new Date('2026-10-31T18:30:00.000Z'); // 1 Nov 00:00 IST
    const to = new Date('2026-11-30T18:30:00.000Z'); // 1 Dec 00:00 IST (exclusive)

    it('bounds activities from below by 31 days', () => {
        const where = activityRangeWhere(from, to) as { startAt: { gte: Date; lt: Date }; OR: unknown[] };
        assert.equal(where.startAt.gte.getTime(), from.getTime() - 31 * DAY);
        assert.equal(where.startAt.lt, to);
        assert.deepEqual(where.OR, [{ endAt: { gt: from } }, { startAt: { gte: from } }]);
    });

    it('overlaps: zero-length items at the edges, spans across from', () => {
        assert.equal(overlaps(from, from, from, to), true); // an Email exactly at `from`
        assert.equal(overlaps(to, to, from, to), false); // exactly at the exclusive `to`
        assert.equal(overlaps(new Date(from.getTime() - DAY), new Date(from.getTime() + 1), from, to), true);
        assert.equal(overlaps(new Date(from.getTime() - DAY), from, from, to), false); // ends as the window starts
        assert.equal(overlaps(new Date(from.getTime() - 60_000), null, from, to), false);
    });

    it('takes the follow-up days the window touches, excluding the day of `to`', () => {
        const days = followupDayRange(from, to, IST);
        assert.equal(days.gte.toISOString().slice(0, 10), '2026-11-01');
        assert.equal(days.lte.toISOString().slice(0, 10), '2026-11-30');
    });

    it('reads contract renewal wall clocks of the window', () => {
        const range = renewalRange(from, to, IST);
        assert.equal(range.gte.toISOString(), '2026-11-01T00:00:00.000Z');
        assert.equal(range.lt.toISOString(), '2026-12-01T00:00:00.000Z');
    });
});

describe('where builders', () => {
    const from = new Date('2026-11-01T00:00:00.000Z');
    const to = new Date('2026-12-01T00:00:00.000Z');
    const days = followupDayRange(from, to, IST);

    it('scopes activities, hides notes and matches owners or invited colleagues', () => {
        const where = activityCalendarWhere(exec, { users: ['palak'], statuses: ['Planned', 'Completed'], types: ['Call'] }, from, to) as { AND: unknown[] };
        assert.deepEqual(where.AND.slice(0, 5), [
            { isDeleted: false },
            { OR: [{ assignedTo: 'palak' }, { createdBy: 'palak' }, { attendees: { some: { username: 'palak' } } }] },
            { followupType: { not: 'Note' } },
            { OR: [{ assignedTo: { in: ['palak'] } }, { attendees: { some: { username: { in: ['palak'] } } } }] },
            { status: { in: ['Planned', 'Completed'] } },
        ]);
        assert.deepEqual(where.AND.at(-1), { followupType: { in: ['Call'] } });
        assert.deepEqual((activityCalendarWhere(admin, { users: ['palak'], statuses: ['Planned'] }, from, to) as { AND: unknown[] }).AND[1], {});
    });

    it('leaves out leads in a closing status (Converted and "Closes the lead" statuses)', () => {
        const where = leadFollowupWhere(exec, { users: ['palak'] }, new Set(['Converted', 'Dead']), days) as { AND: unknown[] };
        assert.deepEqual(where.AND, [
            { isDeleted: false },
            { OR: [{ assignedTo: 'palak' }, { createdBy: 'palak' }] },
            { assignedTo: { in: ['palak'] } },
            { status: { notIn: ['Converted', 'Dead'] } },
            { nextFollowupDate: days },
        ]);
    });

    it('leaves out closed opportunities and expired contracts', () => {
        const opportunities = opportunityFollowupWhere(exec, { users: ['palak'], types: ['Meeting'] }, days) as { AND: unknown[] };
        assert.deepEqual(opportunities.AND[3], { salesStage: { notIn: ['Closed Won', 'Closed Lost'] } });
        assert.deepEqual(opportunities.AND.at(-1), { followupType: { in: ['Meeting'] } });
        const contracts = contractRenewalWhere(exec, { users: ['palak'] }, renewalRange(from, to, IST)) as { AND: unknown[] };
        assert.deepEqual(contracts.AND[3], { status: { not: 'Expired' } });
    });
});

describe('items', () => {
    const activity: ActivityCalendarRow = {
        id: 'a1',
        subject: 'Demo',
        followupType: 'Meeting',
        status: 'Planned',
        startAt: new Date('2026-11-25T04:30:00.000Z'),
        endAt: new Date('2026-11-25T05:30:00.000Z'),
        allDay: false,
        timeZone: IST,
        assignedTo: 'ravi',
        createdBy: 'ravi',
        relatedModule: 'leads',
        relatedId: 'l1',
        relatedTo: 'Asha',
        location: null,
        attendees: [
            { kind: 'user', username: 'palak', responseStatus: 'accepted' },
            { kind: 'email', username: null, responseStatus: 'needsAction' },
        ],
    };

    it('maps an activity, with the reply and edit right of the caller', () => {
        const item = activityToCalendarItem(activity, exec, NOW);
        assert.equal(item.key, 'activity:a1');
        assert.equal(item.end, '2026-11-25T05:30:00.000Z');
        assert.equal(item.attendeeCount, 2);
        assert.equal(item.myResponse, 'accepted');
        assert.equal(item.editable, false);
        assert.equal(item.overdue, true);
        assert.equal(item.startDay, null);
        assert.equal(activityToCalendarItem({ ...activity, status: 'Completed' }, exec, NOW).overdue, false);
        assert.equal(activityToCalendarItem(activity, admin, NOW).editable, true);
    });

    it('gives all-day items their inclusive days', () => {
        const item = activityToCalendarItem(
            { ...activity, allDay: true, startAt: new Date('2026-11-24T18:30:00.000Z'), endAt: new Date('2026-11-26T18:30:00.000Z') },
            exec,
            NOW,
        );
        assert.equal(item.startDay, '2026-11-25');
        assert.equal(item.endDay, '2026-11-26');
        assert.equal(item.overdue, false);
    });

    it('maps lead and opportunity follow-ups (read only)', () => {
        const lead = leadFollowupToCalendarItem(
            {
                id: 'l1',
                leadCode: 'LD-0001',
                name: 'Asha',
                organizationName: 'ACME',
                followupType: 'Call',
                status: 'New',
                assignedTo: 'palak',
                nextFollowupDate: date('2026-11-25'),
                nextFollowupTime: '11:00 AM',
            },
            IST,
            NOW,
        );
        assert.equal(lead.title, 'Asha · ACME');
        assert.equal(lead.start, '2026-11-25T05:30:00.000Z');
        assert.equal(lead.editable, false);
        assert.equal(lead.overdue, true);
        assert.equal(lead.relatedTo, 'LD-0001');

        const allDay = leadFollowupToCalendarItem(
            { id: 'l2', leadCode: 'LD-0002', name: 'Ravi', organizationName: null, followupType: null, status: 'New', assignedTo: 'palak', nextFollowupDate: date('2026-11-25'), nextFollowupTime: null },
            IST,
            NOW,
        );
        assert.equal(allDay.title, 'Ravi');
        assert.equal(allDay.allDay, true);
        assert.deepEqual([allDay.startDay, allDay.endDay], ['2026-11-25', '2026-11-25']);
        assert.equal(allDay.overdue, false); // today is not over yet

        const opportunity = opportunityFollowupToCalendarItem(
            {
                id: 'o1',
                opportunityCode: 'OPP-0001',
                opportunityName: null,
                organizationName: 'ACME',
                followupType: 'Meeting',
                salesStage: 'Proposal',
                assignedTo: 'palak',
                nextFollowupDate: date('2026-11-26'),
                nextFollowupTime: '3 PM',
            },
            IST,
            NOW,
        );
        assert.equal(opportunity.title, 'ACME');
        assert.equal(opportunity.status, 'Proposal');
        assert.equal(opportunity.start, '2026-11-26T09:30:00.000Z');
        assert.equal(opportunity.overdue, false);
    });

    it('reads a contract renewal wall clock as an instant', () => {
        const renewal = contractRenewalToCalendarItem(
            {
                id: 'k1',
                contractNumber: 'CTR-0001',
                contractTitle: 'AMC',
                organizationName: 'ACME',
                status: 'Active',
                assignedTo: 'palak',
                renewalReminderDate: new Date('2026-12-01T09:00:00.000Z'),
            },
            IST,
            NOW,
        );
        assert.equal(renewal.start, '2026-12-01T03:30:00.000Z');
        assert.equal(renewal.title, 'Renewal: AMC · ACME');
        assert.equal(renewal.followupType, null);
    });
});

describe('mergeCalendarItems / capRows', () => {
    const item = (key: string, start: string) => ({ key, start }) as CalendarItem;

    it('sorts by start, then key, and reports truncation', () => {
        const merged = mergeCalendarItems([
            { items: [item('activity:b', '2026-11-25T05:00:00.000Z'), item('activity:a', '2026-11-25T06:00:00.000Z')], truncated: false },
            { items: [item('leadFollowup:z', '2026-11-25T05:00:00.000Z')], truncated: true },
        ]);
        assert.deepEqual(
            merged.items.map((i) => i.key),
            ['activity:b', 'leadFollowup:z', 'activity:a'],
        );
        assert.equal(merged.truncated, true);
        assert.equal(mergeCalendarItems([{ items: [], truncated: false }]).truncated, false);
    });

    it('cuts a source at its cap', () => {
        assert.deepEqual(capRows([1, 2, 3], 2), { rows: [1, 2], truncated: true });
        assert.deepEqual(capRows([1, 2], 2), { rows: [1, 2], truncated: false });
    });
});
