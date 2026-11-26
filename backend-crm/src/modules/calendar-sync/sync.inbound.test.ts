import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { pullRetryDelay } from '../../jobs/workers/calendarSync.worker.js';
import { emptyPullCounts } from './sync.classify.js';
import { FOLLOW_UP_TIME_KEPT_PREFIX } from './sync.constants.js';
import { classifyInbound, isTooLong, type ClassifyInput } from './sync.classify.js';
import { capAttendees, keepTimeOnDay, keptFollowUpNote, planInbound, slotLabel, type InboundPlanInput } from './sync.inbound.js';
import type { CrmShape, ProviderEvent, ProviderShape } from './sync.shapes.js';
import { isInsideSyncHours, parseSyncHours, pollCron, syncHoursLabel } from './syncHours.js';

/**
 * Pure parts of the pull (Calendar Phase 2 spec D24, §8.7, §8.8, D16, D19, D20, §11.5; P2-5): office hours, the
 * classification of one change, and the inbound planner on top of the three-way merge.
 */

const TZ = 'Asia/Kolkata';

describe('sync hours (CALENDAR_SYNC_HOURS / CALENDAR_POLL_MINUTES)', () => {
    it('parses HH:MM-HH:MM; refuses overnight, empty or unreadable windows', () => {
        assert.deepEqual(parseSyncHours('07:00-22:00'), { startMinute: 420, endMinute: 1320 });
        assert.deepEqual(parseSyncHours(' 07:30-21:45 '), { startMinute: 450, endMinute: 1305 });
        assert.deepEqual(parseSyncHours('00:00-24:00'), { startMinute: 0, endMinute: 1440 });
        for (const bad of ['22:00-07:00', '07:00-07:00', '7-22', '', null, '07:00-24:30', '25:00-26:00']) assert.equal(parseSyncHours(bad), null, String(bad));
    });

    it('inside / outside in the business zone (end exclusive)', () => {
        const hours = { startMinute: 420, endMinute: 1320 };
        // 07:00 IST = 01:30Z; 22:00 IST = 16:30Z.
        assert.equal(isInsideSyncHours(new Date('2026-12-01T01:29:00Z'), hours, TZ), false);
        assert.equal(isInsideSyncHours(new Date('2026-12-01T01:30:00Z'), hours, TZ), true);
        assert.equal(isInsideSyncHours(new Date('2026-12-01T16:29:00Z'), hours, TZ), true);
        assert.equal(isInsideSyncHours(new Date('2026-12-01T16:30:00Z'), hours, TZ), false);
    });

    it('cron pattern covers the hours; label for screens', () => {
        assert.equal(pollCron({ startMinute: 420, endMinute: 1320 }, 5), '*/5 7-21 * * *');
        assert.equal(pollCron({ startMinute: 450, endMinute: 1305 }, 10), '*/10 7-21 * * *');
        assert.equal(pollCron({ startMinute: 540, endMinute: 600 }, 60), '0 9 * * *');
        assert.equal(pollCron({ startMinute: 0, endMinute: 1440 }, 1), '* 0-23 * * *');
        assert.deepEqual(syncHoursLabel({ startMinute: 420, endMinute: 1320 }, 5), { start: '07:00', end: '22:00', everyMinutes: 5 });
    });
});

const shape = (over: Partial<ProviderShape> = {}): ProviderShape => ({
    subject: 'Demo',
    when: { allDay: false, start: '2026-12-01T04:30:00.000Z', end: '2026-12-01T05:30:00.000Z' },
    location: '',
    status: 'active',
    attendees: {},
    reminderMinutes: null,
    description: '',
    organizerEmail: 'palak@nandiniinfosys.com',
    ...over,
});

const event = (over: Partial<ProviderEvent> = {}): ProviderEvent => ({
    id: 'e1',
    iCalUid: 'e1@google.com',
    etag: '"2"',
    updated: '2026-11-26T06:00:00.000Z',
    status: 'active',
    isOrganizerCopy: true,
    organizerEmail: 'palak@nandiniinfosys.com',
    shape: shape(),
    recurring: false,
    eventType: 'default',
    isPrivate: true,
    ...over,
});

const link = (over: Partial<NonNullable<ClassifyInput['link']>> = {}) => ({ role: 'organizer', state: 'synced', etag: '"1"', externalEventId: 'e1', ...over });
const live = { isDeleted: false, status: 'Planned' };

describe('classifyInbound', () => {
    it('linked organizer copies: skip the echo, merge, delete, unsupported', () => {
        assert.deepEqual(classifyInbound({ event: event(), link: link(), activity: live, match: null }), { kind: 'merge', tooLong: false });
        assert.deepEqual(classifyInbound({ event: event({ etag: '"1"' }), link: link(), activity: live, match: null }), { kind: 'skip' });
        assert.deepEqual(classifyInbound({ event: event({ status: 'cancelled' }), link: link(), activity: live, match: null }), { kind: 'remoteDelete' });
        assert.deepEqual(classifyInbound({ event: event({ recurring: true }), link: link(), activity: live, match: null }), { kind: 'unsupported' });
        const long = event({ shape: shape({ when: { allDay: true, start: '2026-12-01', end: '2027-01-05' } }) });
        assert.deepEqual(classifyInbound({ event: long, link: link(), activity: live, match: null }), { kind: 'merge', tooLong: true });
    });

    it('ignored: attendee copies, deleted activities, inactive links, a copy that is not the organizer', () => {
        const kind = (input: ClassifyInput) => {
            const action = classifyInbound(input);
            return action.kind === 'ignore' ? action.reason : action.kind;
        };
        assert.equal(kind({ event: event(), link: link({ role: 'attendee' }), activity: live, match: null }), 'attendee_copy');
        assert.equal(kind({ event: event(), link: link(), activity: { isDeleted: true, status: 'Planned' }, match: null }), 'activity_deleted');
        for (const state of ['detached', 'unsupported', 'removed_remote']) assert.equal(kind({ event: event(), link: link({ state }), activity: live, match: null }), 'link_inactive');
        assert.equal(kind({ event: event({ isOrganizerCopy: false }), link: link(), activity: live, match: null }), 'not_organizer');
    });

    it('a cancelled link comes back only when the organizer confirms the event again', () => {
        const cancelled = link({ state: 'cancelled' });
        const off = { isDeleted: false, status: 'Cancelled' };
        assert.deepEqual(classifyInbound({ event: event(), link: cancelled, activity: off, match: null }), { kind: 'reconfirm' });
        assert.equal(classifyInbound({ event: event({ etag: '"1"' }), link: cancelled, activity: off, match: null }).kind, 'ignore');
        assert.equal(classifyInbound({ event: event({ status: 'cancelled' }), link: cancelled, activity: off, match: null }).kind, 'ignore');
        assert.equal(classifyInbound({ event: event(), link: cancelled, activity: live, match: null }).kind, 'ignore', 'only a Cancelled activity');
    });

    it('unlinked: never stored; a marker / syncKey match relinks organizer copies only', () => {
        assert.deepEqual(classifyInbound({ event: event(), link: null, activity: null, match: null }), { kind: 'unlinked' });
        assert.deepEqual(classifyInbound({ event: event(), link: null, activity: null, match: { activityId: 'a1' } }), { kind: 'relink', activityId: 'a1', tooLong: false });
        assert.equal(classifyInbound({ event: event({ isOrganizerCopy: false }), link: null, activity: null, match: { activityId: 'a1' } }).kind, 'ignore');
        assert.equal(classifyInbound({ event: event({ recurring: true }), link: null, activity: null, match: { activityId: 'a1' } }).kind, 'ignore');
        assert.equal(classifyInbound({ event: event({ eventType: 'focusTime' }), link: null, activity: null, match: { activityId: 'a1' } }).kind, 'ignore');
        assert.deepEqual(classifyInbound({ event: event({ status: 'cancelled' }), link: null, activity: null, match: { activityId: 'a1' } }), { kind: 'unlinked' });
    });

    it('too long: more than 31 days (all-day ends are exclusive)', () => {
        assert.equal(isTooLong({ allDay: true, start: '2026-12-01', end: '2027-01-01' }), false);
        assert.equal(isTooLong({ allDay: true, start: '2026-12-01', end: '2027-01-02' }), true);
        assert.equal(isTooLong({ allDay: false, start: '2026-12-01T00:00:00Z', end: '2027-01-01T00:00:00Z' }), false);
        assert.equal(isTooLong({ allDay: false, start: '2026-12-01T00:00:00Z', end: '2027-01-01T00:01:00Z' }), true);
    });
});

const crm = (over: Partial<CrmShape> = {}): CrmShape => ({
    subject: 'Demo',
    when: { allDay: false, start: '2026-12-01T04:30:00.000Z', end: '2026-12-01T05:30:00.000Z' },
    location: '',
    status: 'active',
    attendees: {},
    reminderMinutes: null,
    description: '',
    ...over,
});

const plan = (over: Partial<InboundPlanInput> = {}) =>
    planInbound({
        base: { crm: crm(), provider: shape() },
        crmNow: crm(),
        event: event(),
        crmChangedAt: new Date('2026-11-26T05:00:00Z'),
        invitesSent: true,
        followUp: false,
        tooLong: false,
        activity: { startAt: new Date('2026-12-01T04:30:00Z'), endAt: new Date('2026-12-01T05:30:00Z'), allDay: false, timeZone: TZ },
        companyDomains: ['nandiniinfosys.com'],
        ...over,
    });

describe('planInbound', () => {
    it('a calendar edit applies; nothing pending → not dirty', () => {
        const result = plan({ event: event({ shape: shape({ subject: 'Demo (new room)', location: 'HQ' }) }) });
        assert.deepEqual(result.merge.apply.sort(), ['location', 'subject']);
        assert.equal(result.patch.subject, 'Demo (new room)');
        assert.equal(result.markDirty, false);
        assert.equal(result.followUp, null);
    });

    it('follow-up: a calendar-only move is written back; both moved → the CRM slot stays and goes out', () => {
        const moved = shape({ when: { allDay: false, start: '2026-12-02T04:30:00.000Z', end: '2026-12-02T05:30:00.000Z' } });
        const only = plan({ followUp: true, event: event({ shape: moved }) });
        assert.deepEqual(only.followUp, { when: { allDay: false, startAt: new Date('2026-12-02T04:30:00.000Z') }, keptTime: false });

        const crmMoved = crm({ when: { allDay: false, start: '2026-12-03T04:30:00.000Z', end: '2026-12-03T05:30:00.000Z' } });
        const both = plan({ followUp: true, crmNow: crmMoved, event: event({ shape: moved, updated: '2026-11-26T07:00:00Z' }) });
        assert.equal(both.merge.apply.includes('when'), false);
        assert.equal(both.followUp, null);
        assert.equal(both.markDirty, true);
    });

    it('follow-up timed → all-day: the date moves, the time stays, the note says so, the push re-times the event', () => {
        const allDay = shape({ when: { allDay: true, start: '2026-12-04', end: '2026-12-05' } });
        const result = plan({ followUp: true, event: event({ shape: allDay }) });
        assert.equal(result.followUp?.keptTime, true);
        assert.equal(result.followUp?.when.allDay, true);
        assert.equal(result.merge.merged.when.start, '2026-12-04T04:30:00.000Z');
        assert.equal(result.markDirty, true);
        assert.equal(result.note, `${FOLLOW_UP_TIME_KEPT_PREFIX}: moved to 4 Dec, 10:00 AM.`);
    });

    it('too long: other groups merge, the CRM keeps its times (a CRM move still goes out)', () => {
        const long = shape({ location: 'Expo', when: { allDay: true, start: '2026-12-01', end: '2027-01-10' } });
        const result = plan({ tooLong: true, event: event({ shape: long }) });
        assert.deepEqual(result.merge.apply, ['location']);
        assert.equal(result.patch.startAt, undefined);
        assert.equal(result.markDirty, false);

        const crmMoved = crm({ when: { allDay: false, start: '2026-12-03T04:30:00.000Z', end: '2026-12-03T05:30:00.000Z' } });
        const moved = plan({ tooLong: true, crmNow: crmMoved, event: event({ shape: long }) });
        assert.ok(moved.merge.crmPending.includes('when'));
        assert.equal(moved.markDirty, true);
    });

    it('D15: a guest added in the calendar while our internal description shows → dirty', () => {
        const base = { crm: crm({ description: 'Internal' }), provider: shape({ description: 'Internal' }) };
        const guest = shape({ description: 'Internal', attendees: { 'guest@acme.com': { response: 'needsAction', optional: false, resource: false } } });
        const result = plan({ base, crmNow: crm({ description: 'Internal' }), event: event({ shape: guest }) });
        assert.equal(result.applyAttendees, true);
        assert.equal(result.markDirty, true);
    });
});

describe('inbound helpers', () => {
    it('slot label, kept time on a new day, the 7-day note', () => {
        assert.equal(slotLabel(new Date('2026-12-03T05:30:00Z'), TZ), '3 Dec, 11:00 AM');
        assert.equal(slotLabel(new Date('2026-12-03T18:45:00Z'), TZ), '4 Dec, 12:15 AM');
        assert.deepEqual(keepTimeOnDay({ startAt: new Date('2026-12-01T04:30:00Z'), endAt: new Date('2026-12-01T05:15:00Z'), timeZone: TZ }, '2026-12-09'), {
            allDay: false,
            start: '2026-12-09T04:30:00.000Z',
            end: '2026-12-09T05:15:00.000Z',
        });
        assert.equal(keepTimeOnDay({ startAt: null, endAt: null, timeZone: TZ }, '2026-12-09'), null);
        const note = `${FOLLOW_UP_TIME_KEPT_PREFIX}: moved to 3 Dec, 11:00 AM.`;
        const changed = new Date('2026-11-20T00:00:00Z');
        assert.equal(keptFollowUpNote(note, changed, new Date('2026-11-26T00:00:00Z')), note);
        assert.equal(keptFollowUpNote(note, changed, new Date('2026-11-28T00:00:00Z')), null);
        assert.equal(keptFollowUpNote('Something else', changed, new Date('2026-11-21T00:00:00Z')), null);
        assert.equal(keptFollowUpNote(note, null, new Date()), null);
    });

    it('caps attendees at 50: colleagues, then contacts, then outside emails, order kept', () => {
        const inputs = [
            ...Array.from({ length: 30 }, (_, i) => ({ kind: 'email' as const, email: `g${i}@x.com` })),
            ...Array.from({ length: 25 }, (_, i) => ({ kind: 'contact' as const, contactId: `c${i}` })),
            { kind: 'user' as const, username: 'asha' },
        ];
        const capped = capAttendees(inputs, 50);
        assert.equal(capped.length, 50);
        assert.equal(capped.filter((a) => a.kind === 'contact').length, 25);
        assert.equal(capped.filter((a) => a.kind === 'user').length, 1);
        assert.equal(capped.filter((a) => a.kind === 'email').length, 24);
        assert.equal(capped.at(-1)?.kind, 'user', 'original order kept');
        assert.deepEqual(capAttendees(inputs.slice(0, 3)), inputs.slice(0, 3));
    });
});

describe('pull jobs', () => {
    it('a busy lease or a rate limit moves the pull job back without an attempt; anything else ends it', () => {
        assert.equal(pullRetryDelay({ status: 'busy' }, () => 0), 5_000);
        assert.equal(pullRetryDelay({ status: 'rate_limited', retryAfterMs: 30_000 }, () => 0), 30_000);
        assert.equal(pullRetryDelay({ status: 'done', full: false, counts: emptyPullCounts() }), null);
        assert.equal(pullRetryDelay({ status: 'skipped', reason: 'status_pending' }), null);
    });
});
