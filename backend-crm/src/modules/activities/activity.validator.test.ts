import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    activityInputSchema,
    activityListQuerySchema,
    activityPastIssues,
    attendeeIdentity,
    calendarQuerySchema,
    linkTargetsQuerySchema,
    MAX_ATTENDEES,
    NOTE_REMARKS_MESSAGE,
    PAST_START_MESSAGE,
    RELATED_RECORD_MESSAGE,
    respondSchema,
} from './activity.validator.js';

const IST = 'Asia/Kolkata';
const base = { followupType: 'Meeting', subject: 'Kick-off', assignedTo: 'palak', startAt: '2026-11-26T10:00:00+05:30' };
const parse = (body: Record<string, unknown>) => activityInputSchema.safeParse({ ...base, ...body });
const issues = (body: Record<string, unknown>) => {
    const result = parse(body);
    return result.success ? [] : result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
};

describe('activityInputSchema: fields', () => {
    it('requires only the locked fields', () => {
        const result = activityInputSchema.safeParse({});
        assert.equal(result.success, false);
        const paths = result.error!.issues.map((issue) => issue.path.join('.')).sort();
        assert.deepEqual(paths, ['assignedTo', 'followupType', 'subject']);
    });

    it('defaults status, all-day and attendees, and normalizes the start to UTC', () => {
        const input = parse({}).data!;
        assert.equal(input.status, 'Planned');
        assert.equal(input.allDay, false);
        assert.deepEqual(input.attendees, []);
        assert.equal(input.startAt, '2026-11-26T04:30:00.000Z');
    });

    it('refuses a naive start and unknown status / reminder values', () => {
        assert.deepEqual(issues({ startAt: '2026-11-26T10:00' }), [
            { path: 'startAt', message: 'Start must include a timezone (e.g. 2026-11-25T10:30:00+05:30).' },
        ]);
        assert.equal(issues({ status: 'Done' })[0]?.path, 'status');
        assert.equal(issues({ reminder: '15' })[0]?.path, 'reminder');
        assert.equal(parse({ reminder: '1 day before' }).data?.reminder, '1 day before');
        assert.equal(parse({ reminder: '' }).data?.reminder, undefined);
    });

    it('reads Task and Note in any case', () => {
        assert.equal(parse({ followupType: 'task' }).data?.followupType, 'Task');
        assert.equal(parse({ followupType: 'NOTE', remarks: 'Called back' }).data?.followupType, 'Note');
        assert.equal(parse({ followupType: 'Site Visit' }).data?.followupType, 'Site Visit');
    });

    it('pairs the related module with a picked record', () => {
        assert.deepEqual(issues({ relatedModule: 'leads' }), [{ path: 'relatedTo', message: RELATED_RECORD_MESSAGE }]);
        assert.deepEqual(issues({ relatedId: 'abc' }), [{ path: 'relatedTo', message: RELATED_RECORD_MESSAGE }]);
        assert.deepEqual(issues({ relatedTo: 'Typed name' }), [{ path: 'relatedTo', message: RELATED_RECORD_MESSAGE }]);
        assert.deepEqual(issues({ relatedModule: 'leads', relatedId: 'abc', relatedTo: 'Asha' }), []);
        assert.equal(issues({ relatedModule: 'products', relatedId: 'abc' })[0]?.path, 'relatedModule');
    });
});

describe('activityInputSchema: types', () => {
    it('clears the schedule of a note, completes it and requires remarks', () => {
        assert.deepEqual(issues({ followupType: 'Note' }), [{ path: 'remarks', message: NOTE_REMARKS_MESSAGE }]);
        const note = parse({
            followupType: 'Note',
            remarks: 'Called back, wants a quote',
            status: 'Planned',
            allDay: true,
            startDay: '2026-11-26',
            endAt: '2026-11-26T11:00:00+05:30',
            reminder: '5 minutes before',
            location: 'Office',
            customerResponse: 'Interested',
            attendees: [{ kind: 'email', email: 'a@b.com' }],
        }).data!;
        assert.equal(note.status, 'Completed');
        assert.equal(note.allDay, false);
        for (const key of ['startAt', 'endAt', 'startDay', 'endDay', 'reminder', 'location', 'customerResponse'] as const) {
            assert.equal(note[key], undefined, key);
        }
        assert.deepEqual(note.attendees, []);
    });

    it('clears the invitees and place of a task', () => {
        const task = parse({ followupType: 'Task', location: 'Office', attendees: [{ kind: 'user', username: 'ravi' }] }).data!;
        assert.equal(task.location, undefined);
        assert.deepEqual(task.attendees, []);
        assert.equal(task.startAt, '2026-11-26T04:30:00.000Z');
    });
});

describe('activityInputSchema: attendees', () => {
    it('accepts the three kinds and drops blank keys', () => {
        const input = parse({
            attendees: [
                { kind: 'user', username: 'ravi', responseStatus: '' },
                { kind: 'contact', contactId: 'c1', email: '', name: '' },
                { kind: 'email', email: ' Asha@Acme.com ', name: 'Asha' },
            ],
        }).data!;
        assert.deepEqual(input.attendees, [
            { kind: 'user', username: 'ravi' },
            { kind: 'contact', contactId: 'c1' },
            { kind: 'email', email: 'asha@acme.com', name: 'Asha' },
        ]);
        for (const attendee of input.attendees) assert.ok(!Object.values(attendee).includes(''));
    });

    it('collapses duplicates by username, contact or email (first wins)', () => {
        const input = parse({
            attendees: [
                { kind: 'user', username: 'Ravi' },
                { kind: 'user', username: 'ravi' },
                { kind: 'contact', contactId: 'c1' },
                { kind: 'contact', contactId: 'c1', name: 'again' },
                { kind: 'email', email: 'a@b.com' },
                { kind: 'email', email: 'A@B.COM' },
            ],
        }).data!;
        assert.deepEqual(input.attendees.map(attendeeIdentity), ['user:ravi', 'contact:c1', 'email:a@b.com']);
    });

    it('refuses bad emails, unknown kinds, bad replies and more than 50', () => {
        assert.equal(issues({ attendees: [{ kind: 'email', email: 'not-an-email' }] })[0]?.message, 'Invalid email format.');
        assert.equal(issues({ attendees: [{ kind: 'email' }] })[0]?.message, 'Attendee email is required.');
        assert.equal(issues({ attendees: [{ kind: 'robot' }] })[0]?.path, 'attendees.0.kind');
        assert.equal(issues({ attendees: [{ kind: 'user', username: 'ravi', responseStatus: 'maybe' }] })[0]?.path, 'attendees.0.responseStatus');
        const many = Array.from({ length: MAX_ATTENDEES + 1 }, (_, i) => ({ kind: 'email', email: `p${i}@acme.com` }));
        assert.equal(issues({ attendees: many })[0]?.message, `An activity can have at most ${MAX_ATTENDEES} attendees.`);
    });
});

describe('activityPastIssues', () => {
    const now = new Date('2026-11-25T06:30:00.000Z'); // 12:00 IST
    const at = (iso: string) => new Date(iso);
    const planned = { followupType: 'Meeting', status: 'Planned', allDay: false };

    it('refuses a planned start in the past', () => {
        assert.deepEqual(activityPastIssues({ ...planned, startAt: at('2026-11-25T05:00:00.000Z') }, undefined, now, IST), [
            { path: ['startAt'], message: PAST_START_MESSAGE },
        ]);
    });

    it('allows completed, cancelled and note activities in the past', () => {
        const past = at('2026-11-20T05:00:00.000Z');
        assert.deepEqual(activityPastIssues({ ...planned, status: 'Completed', startAt: past }, undefined, now, IST), []);
        assert.deepEqual(activityPastIssues({ ...planned, status: 'Cancelled', startAt: past }, undefined, now, IST), []);
        assert.deepEqual(activityPastIssues({ ...planned, followupType: 'Note', startAt: null }, undefined, now, IST), []);
    });

    it('gives five minutes of grace', () => {
        assert.deepEqual(activityPastIssues({ ...planned, startAt: at('2026-11-25T06:26:00.000Z') }, undefined, now, IST), []);
        assert.equal(activityPastIssues({ ...planned, startAt: at('2026-11-25T06:24:00.000Z') }, undefined, now, IST).length, 1);
    });

    it('lets an unchanged stored start pass', () => {
        const stored = { allDay: false, startAt: '2026-11-20T05:00:00.000Z', startDay: '' };
        assert.deepEqual(activityPastIssues({ ...planned, startAt: at(stored.startAt) }, stored, now, IST), []);
    });

    it('accepts an all-day activity today and refuses one yesterday', () => {
        const today = at('2026-11-24T18:30:00.000Z'); // 25 Nov 00:00 IST
        const yesterday = at('2026-11-23T18:30:00.000Z');
        assert.deepEqual(activityPastIssues({ ...planned, allDay: true, startAt: today }, undefined, now, IST), []);
        assert.deepEqual(activityPastIssues({ ...planned, allDay: true, startAt: yesterday }, undefined, now, IST), [
            { path: ['startAt'], message: PAST_START_MESSAGE },
        ]);
        const stored = { allDay: true, startAt: yesterday.toISOString(), startDay: '2026-11-24' };
        assert.deepEqual(activityPastIssues({ ...planned, allDay: true, startAt: yesterday }, stored, now, IST), []);
    });
});

describe('activityListQuerySchema', () => {
    it('reads csv lists and booleans', () => {
        const query = activityListQuerySchema.parse({ status: 'Planned,Completed', followupType: ['Call', 'Meeting'], mine: 'true', rollup: '1', overdue: 'false' });
        assert.deepEqual(query.status, ['Planned', 'Completed']);
        assert.deepEqual(query.followupType, ['Call', 'Meeting']);
        assert.equal(query.mine, true);
        assert.equal(query.rollup, true);
        assert.equal(query.overdue, false);
    });

    it('needs from and to together, in order', () => {
        assert.equal(activityListQuerySchema.safeParse({ from: '2026-11-01T00:00:00Z' }).error?.issues[0]?.path[0], 'to');
        assert.equal(activityListQuerySchema.safeParse({ from: '2026-11-02T00:00:00Z', to: '2026-11-01T00:00:00Z' }).success, false);
        const ok = activityListQuerySchema.parse({ from: '2026-11-01T00:00:00+05:30', to: '2026-12-01T00:00:00+05:30' });
        assert.equal(ok.from, '2026-10-31T18:30:00.000Z');
        assert.equal(activityListQuerySchema.safeParse({ relatedModule: 'products' }).success, false);
    });
});

describe('calendarQuerySchema', () => {
    const window = { from: '2026-11-01T00:00:00+05:30', to: '2026-12-01T00:00:00+05:30' };

    it('needs an ordered window of at most 62 days', () => {
        assert.equal(calendarQuerySchema.safeParse({}).success, false);
        assert.equal(calendarQuerySchema.safeParse({ from: window.to, to: window.from }).error?.issues[0]?.message, 'to must be after from.');
        assert.equal(calendarQuerySchema.safeParse({ from: window.from, to: window.from }).success, false);
        const long = calendarQuerySchema.safeParse({ from: '2026-11-01T00:00:00Z', to: '2027-01-02T00:00:01Z' });
        assert.deepEqual(long.error?.issues.map((issue) => [issue.path.join('.'), issue.message]), [['to', 'Pick a range of at most 62 days.']]);
        assert.equal(calendarQuerySchema.safeParse({ from: '2026-11-01T00:00:00Z', to: '2027-01-02T00:00:00Z' }).success, true);
    });

    it('reads users (at most 50), types, sources and statuses', () => {
        const users = Array.from({ length: 60 }, (_, i) => `u${i}`).join(',');
        const query = calendarQuerySchema.parse({ ...window, users, types: 'Call,Meeting', sources: 'activity,leadFollowup', status: 'Planned' });
        assert.equal(query.users?.length, 50);
        assert.deepEqual(query.types, ['Call', 'Meeting']);
        assert.deepEqual(query.sources, ['activity', 'leadFollowup']);
        assert.deepEqual(query.status, ['Planned']);
        assert.equal(calendarQuerySchema.safeParse({ ...window, sources: 'activity,tasks' }).success, false);
        assert.equal(calendarQuerySchema.safeParse({ ...window, status: 'Done' }).success, false);
    });
});

describe('linkTargetsQuerySchema and respondSchema', () => {
    it('bounds the picker query', () => {
        assert.equal(linkTargetsQuerySchema.parse({ module: 'leads' }).limit, 20);
        assert.equal(linkTargetsQuerySchema.parse({ module: 'leads', limit: '500' }).limit, 20);
        assert.equal(linkTargetsQuerySchema.parse({ module: 'leads', limit: '5' }).limit, 5);
        assert.equal(linkTargetsQuerySchema.safeParse({ module: 'products' }).success, false);
        assert.equal(linkTargetsQuerySchema.safeParse({ module: 'leads', search: 'x'.repeat(101) }).success, false);
    });

    it('accepts only a reply a colleague can give', () => {
        assert.equal(respondSchema.safeParse({ responseStatus: 'accepted' }).success, true);
        assert.equal(respondSchema.safeParse({ responseStatus: 'needsAction' }).success, false);
    });
});
