import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { ENV } from '../../config/env.js';
import type { AuthUser } from '../../types/user.types.js';
import { toDateOnly } from '../../utils/mappers.js';
import { addDays, zonedDayOf, zonedWallClockToInstant } from '../../utils/zonedTime.js';
import { activitySeriesService } from '../activities/activity.series.js';
import { activityService } from '../activities/activity.service.js';
import { blankActivity, blankAttendee, blankLink, installActivityDouble, restoreActivityDouble, type ActivityDoubleState, type LeadRow } from '../activities/testing/activityDouble.js';
import { fakeAddEvent, fakeDeleteEvent, fakeEditEvent, fakeProviderState, resetFakeProvider } from './providers/fake.js';
import { resetProviderPauses } from './providers/http.js';
import { setFakeHealth, setFakeProviderEnabledForTests } from './providers/registry.js';
import { requestedIdFor, syncKeyOf } from './sync.keys.js';
import { localPullRequestLimit, requestPull, resetPullRequestsForTests } from './pull.requests.js';
import { pullDueInline, rebaselineGraphWindows, resetInlinePullsForTests, runCalendarPoll } from './sync.maintenance.js';
import { pullConnection, resetPullStateForTests, type PullResult } from './sync.pull.js';
import { parseBase, pushLink } from './sync.push.js';
import { setInlinePushForTests } from './sync.wake.js';
import { blankConnection, type ConnectionRowState } from './testing/connectionDouble.js';
import { setTokenSourceForTests } from './tokenSource.js';

/**
 * The pull end to end (Calendar Phase 2 spec §8.7–§8.11, §11.5; P2-5): CRM activities pushed to the in-memory fake
 * calendar, changed there (fakeEditEvent / fakeDeleteEvent / fakeAddEvent), then `pullConnection`.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const TZ = 'Asia/Kolkata';
const inDays = (days: number) => new Date(Math.floor((Date.now() + days * DAY) / 60_000) * 60_000);
const rfc = (date: Date) => date.toISOString().replace('.000Z', 'Z');

const PALAK: AuthUser = { id: 1, username: 'palak', role: 'user' };
const USERS = [
    { username: 'palak', fullName: 'Palak Shah', isActive: true, email: 'palak@nandiniinfosys.com' },
    { username: 'asha', fullName: 'Asha Rao', isActive: true, email: 'asha@nandiniinfosys.com' },
];

const conn = (over: Partial<ConnectionRowState> = {}) =>
    blankConnection({ id: 'c1', username: 'palak', provider: 'fake', accountEmail: 'palak@nandiniinfosys.com', status: 'ok', backfilledAt: new Date(0), ...over });

let state: ActivityDoubleState;
let woken: string[];

function install(connections: ConnectionRowState[] = [conn()], extra: Parameters<typeof installActivityDouble>[0] = {}) {
    state = installActivityDouble({ users: USERS, connections, ...extra });
    return state;
}

const meeting = (over: Record<string, unknown> = {}) => ({
    followupType: 'Meeting',
    subject: 'Demo with ACME',
    assignedTo: 'palak',
    startAt: inDays(2).toISOString(),
    endAt: new Date(inDays(2).getTime() + HOUR).toISOString(),
    ...over,
});

const linkOf = (activityId: string) => {
    const link = state.links.find((l) => l.activityId === activityId);
    assert.ok(link, 'a link exists');
    return link;
};
const activityOf = (id: string) => state.activities.find((a) => a.id === id)!;
const done = (result: PullResult) => {
    assert.equal(result.status, 'done', JSON.stringify(result));
    return result as Extract<PullResult, { status: 'done' }>;
};

/** A CRM meeting created by its owner and pushed to the fake calendar. Returns the activity id and the event id. */
async function pushedMeeting(over: Record<string, unknown> = {}) {
    const view = await activityService.create(meeting(over), PALAK);
    const pushed = await pushLink(linkOf(view.id).id);
    assert.equal(pushed.status, 'done');
    return { id: view.id, eventId: linkOf(view.id).externalEventId as string };
}

beforeEach(() => {
    resetFakeProvider();
    resetProviderPauses();
    resetPullStateForTests();
    resetPullRequestsForTests();
    resetInlinePullsForTests();
    setFakeHealth('unknown', null);
    setFakeProviderEnabledForTests(true);
    setTokenSourceForTests(null);
    woken = [];
    setInlinePushForTests((ids) => woken.push(...ids));
});

afterEach(() => {
    restoreActivityDouble();
    setFakeProviderEnabledForTests(null);
    setInlinePushForTests(null);
});

describe('pullConnection: basics', () => {
    it('first pull is a full sync: a calendar edit comes back, the cursor and window are stored, the lease released', async () => {
        install();
        const { id, eventId } = await pushedMeeting({ location: 'Pune office' });
        woken = [];
        fakeEditEvent(eventId, { summary: 'Demo with ACME (moved room)', location: 'ACME HQ' }, new Date(Date.now() + 60_000));
        const result = done(await pullConnection('c1', 'poll'));
        assert.equal(result.full, true);
        assert.equal(result.counts.applied, 1);
        const row = activityOf(id);
        assert.equal(row.subject, 'Demo with ACME (moved room)');
        assert.equal(row.location, 'ACME HQ');
        assert.ok(row.externalUpdatedAt, '"Updated from the calendar" stamp');
        const connection = state.connections[0];
        assert.match(connection.syncCursor ?? '', /^fake-seq-\d+$/);
        assert.ok(connection.syncWindowStart && connection.syncWindowEnd && connection.fullSyncAt && connection.lastPulledAt);
        assert.equal(connection.leaseId, null);
        const link = linkOf(id);
        assert.equal(link.etag, fakeProviderState.events.get(eventId)?.etag, 'etag stored: the next pull skips the echo');
        assert.equal(parseBase(link.baseJson)?.crm.location, 'ACME HQ');
        assert.equal(link.dirtyAt, null, 'an inbound apply never marks the link dirty');
        assert.deepEqual(woken, []);
        const audit = state.audits.find((a) => a.entityType === 'Activity' && a.action === 'UPDATE');
        assert.equal(audit?.changedBy, 'palak', 'audited with the employee as actor');
    });

    it('our own write coming back (same etag) changes nothing; an incremental pull with nothing new is one call', async () => {
        install();
        const { id } = await pushedMeeting();
        const before = { ...activityOf(id) };
        const first = done(await pullConnection('c1', 'poll'));
        assert.equal(first.counts.skipped, 1);
        assert.equal(activityOf(id).updatedAt.getTime(), before.updatedAt.getTime());
        const calls = fakeProviderState.listCalls.length;
        const second = done(await pullConnection('c1', 'poll'));
        assert.equal(second.full, false);
        assert.equal(second.counts.seen, 0);
        assert.equal(fakeProviderState.listCalls.length, calls + 1);
        assert.match(fakeProviderState.listCalls.at(-1)?.cursor ?? '', /^fake-seq-/);
    });

    it('only an ok row pulls; a held lease answers busy; the kill switch is honoured by the gates', async () => {
        install([conn({ status: 'pending' })]);
        assert.deepEqual(await pullConnection('c1', 'poll'), { status: 'skipped', reason: 'status_pending' });
        install([conn({ leaseId: 'other', leaseUntil: new Date(Date.now() + 60_000) })]);
        assert.deepEqual(await pullConnection('c1', 'poll'), { status: 'busy' });
        install([conn()], { users: [{ ...USERS[0], isActive: false }] });
        assert.deepEqual(await pullConnection('c1', 'poll'), { status: 'skipped', reason: 'user_inactive' });
    });

    it('410 on the cursor → a full resync in the same run', async () => {
        install([conn({ syncCursor: 'fake-seq-0' })]);
        const { id, eventId } = await pushedMeeting();
        fakeEditEvent(eventId, { location: 'Online' }, new Date(Date.now() + 60_000));
        fakeProviderState.cursorExpired.add('palak@nandiniinfosys.com');
        const result = done(await pullConnection('c1', 'poll'));
        assert.equal(result.full, true);
        assert.equal(activityOf(id).location, 'Online');
        assert.equal(fakeProviderState.listCalls[0].cursor, 'fake-seq-0');
        assert.equal(fakeProviderState.listCalls[1].cursor, null);
    });

    it('pages: every page is applied, the cursor comes from the last one', async () => {
        install();
        const a = await pushedMeeting({ subject: 'One' });
        const b = await pushedMeeting({ subject: 'Two', startAt: inDays(3).toISOString(), endAt: new Date(inDays(3).getTime() + HOUR).toISOString() });
        fakeEditEvent(a.eventId, { location: 'A' }, new Date(Date.now() + 60_000));
        fakeEditEvent(b.eventId, { location: 'B' }, new Date(Date.now() + 60_000));
        fakeProviderState.listPageSize = 1;
        const result = done(await pullConnection('c1', 'poll'));
        assert.equal(result.counts.pages, 2);
        assert.equal(activityOf(a.id).location, 'A');
        assert.equal(activityOf(b.id).location, 'B');
        assert.ok(state.connections[0].syncCursor);
    });
});

describe('pullConnection: merge rules', () => {
    it('three-way merge: a CRM change not pushed yet is kept (and stays dirty) while the calendar change of another field comes in', async () => {
        install();
        const { id, eventId } = await pushedMeeting({ location: 'Pune office' });
        await activityService.update(id, { subject: 'Demo (agenda attached)' }, PALAK);
        fakeEditEvent(eventId, { location: 'ACME HQ' }, new Date(Date.now() + 60_000));
        done(await pullConnection('c1', 'poll'));
        const row = activityOf(id);
        assert.equal(row.subject, 'Demo (agenda attached)');
        assert.equal(row.location, 'ACME HQ');
        const link = linkOf(id);
        assert.ok(link.dirtyAt, 'the CRM subject still goes out');
        assert.equal(parseBase(link.baseJson)?.crm.subject, 'Demo with ACME', 'the base keeps the old subject, so it pushes');
        await pushLink(link.id);
        assert.equal(fakeProviderState.events.get(eventId)?.summary, 'Demo (agenda attached)');
        assert.equal(fakeProviderState.events.get(eventId)?.location, 'ACME HQ');
    });

    it('both changed the same field: the later write wins (here the CRM, so the calendar is corrected and the conflict noted)', async () => {
        install();
        const { id, eventId } = await pushedMeeting({ location: 'Pune office' });
        await activityService.update(id, { location: 'CRM room' }, PALAK);
        fakeEditEvent(eventId, { location: 'Calendar room' }, new Date('2020-01-01T00:00:00Z'));
        done(await pullConnection('c1', 'poll'));
        assert.equal(activityOf(id).location, 'CRM room');
        assert.ok(linkOf(id).lastConflictAt);
        assert.ok(linkOf(id).dirtyAt);
    });

    it('guests: a reply in the calendar reaches the CRM; a guest added there joins the activity and the internal description is cleared (D15)', async () => {
        install();
        const { id, eventId } = await pushedMeeting({ attendees: [{ kind: 'email', email: 'guest@acme.com' }] });
        const event = fakeProviderState.events.get(eventId)!;
        fakeEditEvent(eventId, { attendees: (event.attendees ?? []).map((a) => ({ ...a, responseStatus: 'accepted' })) }, new Date(Date.now() + 60_000));
        done(await pullConnection('c1', 'poll'));
        assert.equal(state.attendees.find((a) => a.activityId === id && a.email === 'guest@acme.com')?.responseStatus, 'accepted');

        const internal = await pushedMeeting({ subject: 'Internal sync', startAt: inDays(4).toISOString(), endAt: new Date(inDays(4).getTime() + HOUR).toISOString() });
        assert.match(fakeProviderState.events.get(internal.eventId)?.description ?? '', /Open in Nandini CRM/);
        fakeEditEvent(internal.eventId, { attendees: [{ email: 'New.Person@acme.com', responseStatus: 'needsAction', displayName: 'New Person' }] }, new Date(Date.now() + 60_000));
        woken = [];
        done(await pullConnection('c1', 'poll'));
        const added = state.attendees.find((a) => a.activityId === internal.id && a.email === 'new.person@acme.com');
        assert.equal(added?.kind, 'email');
        const link = linkOf(internal.id);
        assert.ok(link.dirtyAt, 'dirty so the push clears the internal description');
        assert.deepEqual(woken, [link.id]);
        await pushLink(link.id);
        assert.equal(fakeProviderState.events.get(internal.eventId)?.description, '');
    });

    it('a guest who is a colleague becomes a colleague attendee; an address of one contact becomes that contact', async () => {
        install([conn()], {
            contacts: [{ id: 'ct1', name: 'Ravi Kumar', organizationId: null, isDeleted: false }],
            entityEmails: [{ id: 'ee1', email: 'ravi@acme.com', contactId: 'ct1', isPrimary: true, isInvalidBounce: false, sortOrder: 0 }],
        });
        const { id, eventId } = await pushedMeeting();
        fakeEditEvent(eventId, { attendees: [{ email: 'asha@nandiniinfosys.com' }, { email: 'ravi@acme.com' }] }, new Date(Date.now() + 60_000));
        done(await pullConnection('c1', 'poll'));
        const rows = state.attendees.filter((a) => a.activityId === id);
        assert.equal(rows.find((a) => a.kind === 'user')?.username, 'asha');
        assert.equal(rows.find((a) => a.kind === 'contact')?.contactId, 'ct1');
    });

    it('moved in the calendar: new times; longer than 31 days: the CRM keeps its times, other fields merge, the link says why', async () => {
        install();
        const { id, eventId } = await pushedMeeting();
        const start = new Date(inDays(5).getTime());
        fakeEditEvent(eventId, { start: { dateTime: rfc(start), timeZone: TZ }, end: { dateTime: rfc(new Date(start.getTime() + 2 * HOUR)), timeZone: TZ } }, new Date(Date.now() + 60_000));
        done(await pullConnection('c1', 'poll'));
        assert.equal(activityOf(id).startAt?.getTime(), start.getTime());
        assert.equal(activityOf(id).endAt?.getTime(), start.getTime() + 2 * HOUR);

        fakeEditEvent(eventId, { end: { dateTime: rfc(new Date(start.getTime() + 40 * DAY)), timeZone: TZ }, location: 'Expo hall' }, new Date(Date.now() + 120_000));
        done(await pullConnection('c1', 'poll'));
        const row = activityOf(id);
        assert.equal(row.endAt?.getTime(), start.getTime() + 2 * HOUR, 'times kept');
        assert.equal(row.location, 'Expo hall', 'other fields still merge');
        const link = linkOf(id);
        assert.equal(link.state, 'synced');
        assert.equal(link.lastErrorCode, 'too_long');
        assert.equal(link.dirtyAt, null, 'the CRM times are not pushed back over the long event');
    });

    it('turned into a repeating event: link unsupported, the activity stays as it is', async () => {
        install();
        const { id, eventId } = await pushedMeeting();
        fakeEditEvent(eventId, { recurrence: ['RRULE:FREQ=WEEKLY'], summary: 'Weekly demo' }, new Date(Date.now() + 60_000));
        const result = done(await pullConnection('c1', 'poll'));
        assert.equal(result.counts.unsupported, 1);
        assert.equal(linkOf(id).state, 'unsupported');
        assert.equal(activityOf(id).subject, 'Demo with ACME');
    });
});

describe('pullConnection: recurring activities (Calendar Phase 4)', () => {
    it('an occurrence moved in the calendar becomes an exception; a calendar delete does not; no occurrence is created or brought back', async () => {
        install();
        const day = addDays(zonedDayOf(new Date(), TZ), 1);
        const start = zonedWallClockToInstant(`${day}T10:00`, TZ);
        await activitySeriesService.create(
            { ...meeting({ subject: 'Daily stand-up', startAt: start.toISOString(), endAt: new Date(start.getTime() + HOUR).toISOString() }), repeat: { frequency: 'daily', ends: 'after', count: 4 } },
            PALAK,
        );
        const rows = state.activities.filter((a) => a.seriesId && !a.isDeleted).sort((a, b) => (a.startAt?.getTime() ?? 0) - (b.startAt?.getTime() ?? 0));
        assert.equal(rows.length, 4);
        for (const row of rows) assert.equal((await pushLink(linkOf(row.id).id)).status, 'done');
        const [first, moved, cancelled, removed] = rows;
        const eventOf = (id: string) => linkOf(id).externalEventId as string;
        // The fourth is deleted in the CRM ("This event"): its event is cancelled by the push.
        await activitySeriesService.remove(removed.id, PALAK, { scope: 'this' });
        await pushLink(linkOf(removed.id).id);
        const total = state.activities.length;

        const newStart = new Date((moved.startAt as Date).getTime() + 2 * HOUR);
        fakeEditEvent(eventOf(moved.id), { start: { dateTime: rfc(newStart), timeZone: TZ }, end: { dateTime: rfc(new Date(newStart.getTime() + HOUR)), timeZone: TZ } }, new Date(Date.now() + 60_000));
        fakeDeleteEvent(eventOf(cancelled.id), new Date(Date.now() + 60_000));
        fakeEditEvent(eventOf(removed.id), { status: 'confirmed', summary: 'Back again' }, new Date(Date.now() + 60_000));
        done(await pullConnection('c1', 'poll'));

        assert.equal(activityOf(moved.id).startAt?.getTime(), newStart.getTime());
        assert.equal(activityOf(moved.id).seriesException, true, 'moved alone in the calendar: an exception');
        assert.equal(activityOf(cancelled.id).status, 'Cancelled');
        assert.equal(activityOf(cancelled.id).seriesException, false, 'status is per occurrence');
        assert.equal(activityOf(first.id).seriesException, false);
        assert.equal(activityOf(removed.id).isDeleted, true, 'a CRM-deleted occurrence stays deleted');
        assert.equal(state.activities.length, total, 'the pull creates no occurrence');

        // A later "All events" edit leaves the exception alone.
        await activitySeriesService.update(first.id, { subject: 'Daily sync' }, PALAK, { scope: 'all' });
        assert.equal(activityOf(first.id).subject, 'Daily sync');
        assert.equal(activityOf(moved.id).subject, 'Daily stand-up');
        assert.equal(activityOf(moved.id).startAt?.getTime(), newStart.getTime());
    });
});

describe('pullConnection: deletions', () => {
    it('deleted in the calendar → Cancelled (audited), link cancelled; confirmed again there → Planned with its fields', async () => {
        install();
        const { id, eventId } = await pushedMeeting();
        fakeDeleteEvent(eventId, new Date(Date.now() + 60_000));
        const result = done(await pullConnection('c1', 'poll'));
        assert.equal(result.counts.deleted, 1);
        assert.equal(activityOf(id).status, 'Cancelled');
        assert.equal(linkOf(id).state, 'cancelled');
        assert.equal(linkOf(id).dirtyAt, null);

        fakeEditEvent(eventId, { status: 'confirmed', location: 'Back on' }, new Date(Date.now() + 120_000));
        done(await pullConnection('c1', 'poll'));
        assert.equal(activityOf(id).status, 'Planned');
        assert.equal(activityOf(id).location, 'Back on');
        assert.equal(linkOf(id).state, 'synced');
    });

    it('a Completed activity or a follow-up activity keeps its status; the link becomes removed_remote', async () => {
        install();
        const { id, eventId } = await pushedMeeting();
        activityOf(id).status = 'Completed';
        fakeDeleteEvent(eventId, new Date(Date.now() + 60_000));
        done(await pullConnection('c1', 'poll'));
        assert.equal(activityOf(id).status, 'Completed');
        assert.equal(linkOf(id).state, 'removed_remote');
    });

    it('full sync safety: a synced event the listing no longer shows is read back; gone → cancelled (absence alone never cancels)', async () => {
        install();
        const kept = await pushedMeeting({ subject: 'Kept' });
        const gone = await pushedMeeting({ subject: 'Gone', startAt: inDays(3).toISOString(), endAt: new Date(inDays(3).getTime() + HOUR).toISOString() });
        fakeDeleteEvent(gone.eventId, new Date(), true);
        // The kept event is outside the listing's page by being moved before the window: still read back, still there.
        fakeProviderState.events.get(kept.eventId)!.end = { dateTime: rfc(new Date(Date.now() - 30 * DAY)), timeZone: TZ };
        const result = done(await pullConnection('c1', 'poll'));
        assert.equal(result.full, true);
        assert.equal(activityOf(gone.id).status, 'Cancelled');
        assert.equal(activityOf(kept.id).status, 'Planned');
        assert.ok(result.counts.verified >= 2);
    });
});

describe('pullConnection: unlinked and relinks', () => {
    it('a personal event is never stored (counted only)', async () => {
        install();
        const start = inDays(1);
        fakeAddEvent({
            id: 'personal1',
            summary: 'Dentist',
            start: { dateTime: rfc(start), timeZone: TZ },
            end: { dateTime: rfc(new Date(start.getTime() + HOUR)), timeZone: TZ },
            organizer: { email: 'palak@nandiniinfosys.com', self: true },
        });
        const result = done(await pullConnection('c1', 'poll'));
        assert.equal(result.counts.skippedUnlinked, 1);
        assert.equal(state.activities.length, 0);
        assert.equal(state.links.length, 0);
    });

    it('a lost link is found again by the private marker (Google) and by iCalUID (syncKey), only for activities this person owns', async () => {
        install();
        const a = await pushedMeeting({ subject: 'Marker' });
        const b = await pushedMeeting({ subject: 'Key', startAt: inDays(3).toISOString(), endAt: new Date(inDays(3).getTime() + HOUR).toISOString() });
        assert.equal(activityOf(b.id).syncKey, syncKeyOf(fakeProviderState.events.get(b.eventId)?.iCalUID ?? ''));
        state.links = [];
        fakeEditEvent(b.eventId, { extendedProperties: null }, new Date(Date.now() + 60_000));
        const result = done(await pullConnection('c1', 'poll'));
        assert.equal(result.counts.relinked, 2);
        assert.equal(linkOf(a.id).externalEventId, a.eventId);
        assert.equal(linkOf(a.id).state, 'synced');
        assert.equal(linkOf(b.id).externalEventId, b.eventId);
        assert.equal(linkOf(b.id).requestedId, requestedIdFor(b.id, 'c1', 0));

        // Someone else's activity holding the marker is never linked.
        install();
        const other = blankActivity({ id: 'a-asha', subject: 'Not mine', assignedTo: 'asha', createdBy: 'asha', startAt: inDays(2), endAt: new Date(inDays(2).getTime() + HOUR) });
        state.activities.push(other);
        fakeAddEvent({
            id: 'crmforeign',
            summary: 'Not mine',
            start: { dateTime: rfc(inDays(2)), timeZone: TZ },
            end: { dateTime: rfc(new Date(inDays(2).getTime() + HOUR)), timeZone: TZ },
            organizer: { email: 'palak@nandiniinfosys.com', self: true },
            extendedProperties: { private: { crmActivityId: 'a-asha' } },
        });
        const second = done(await pullConnection('c1', 'poll'));
        assert.equal(second.counts.relinked, 0);
        assert.equal(state.links.length, 0);
    });
});

describe('pullConnection: lead / opportunity follow-up activities (§11.5)', () => {
    const day = zonedDayOf(inDays(3), TZ);
    const at = (d: string, time: string) => zonedWallClockToInstant(`${d}T${time}`, TZ);
    const lead = (): LeadRow => ({
        id: 'L1',
        leadCode: 'LD-0012',
        name: 'ACME',
        organizationName: 'ACME',
        assignedTo: 'palak',
        createdBy: 'palak',
        isDeleted: false,
        nextFollowupDate: new Date(`${day}T00:00:00.000Z`),
        nextFollowupTime: '11:00 AM',
    });
    const followUp = () =>
        blankActivity({
            id: 'a-fu',
            subject: 'Call: ACME (LD-0012)',
            assignedTo: 'palak',
            createdBy: 'palak',
            followupType: 'Call',
            origin: 'followup',
            relatedModule: 'leads',
            relatedId: 'L1',
            relatedCode: 'LD-0012',
            relatedTo: 'ACME',
            startAt: at(day, '11:00'),
            endAt: at(day, '11:30'),
        });
    async function pushedFollowUp() {
        install([conn()], {
            activities: [followUp()],
            leads: [lead()],
            links: [blankLink({ id: 'l-fu', activityId: 'a-fu', connectionId: 'c1', provider: 'fake', requestedId: requestedIdFor('a-fu', 'c1', 0), dirtyAt: new Date() })],
        });
        await pushLink('l-fu');
        return linkOf('a-fu').externalEventId as string;
    }

    it('moved in the calendar: applied to the activity and written back to the lead (date + time, audited, no rating change)', async () => {
        const eventId = await pushedFollowUp();
        const next = addDays(day, 1);
        fakeEditEvent(eventId, { start: { dateTime: rfc(at(next, '15:30')), timeZone: TZ }, end: { dateTime: rfc(at(next, '16:00')), timeZone: TZ } }, new Date(Date.now() + 60_000));
        done(await pullConnection('c1', 'poll'));
        assert.equal(activityOf('a-fu').startAt?.getTime(), at(next, '15:30').getTime());
        const record = state.leads[0];
        assert.equal(toDateOnly(record.nextFollowupDate ?? null), next);
        assert.equal(record.nextFollowupTime, '03:30 PM');
        const audit = state.audits.find((a) => a.entityType === 'Lead');
        assert.equal(audit?.action, 'UPDATE');
        assert.equal(audit?.changedBy, 'palak');
        assert.ok(state.invalidated.includes('leads'));
    });

    it('timed → all-day in the calendar: only the date is written back, the activity keeps its time, the event is re-timed', async () => {
        const eventId = await pushedFollowUp();
        const next = addDays(day, 2);
        fakeEditEvent(eventId, { start: { date: next }, end: { date: addDays(next, 1) } }, new Date(Date.now() + 60_000));
        woken = [];
        done(await pullConnection('c1', 'poll'));
        const record = state.leads[0];
        assert.equal(toDateOnly(record.nextFollowupDate ?? null), next);
        assert.equal(record.nextFollowupTime, '11:00 AM', 'the time stays');
        const row = activityOf('a-fu');
        assert.equal(row.allDay, false);
        assert.equal(row.startAt?.getTime(), at(next, '11:00').getTime());
        const link = linkOf('a-fu');
        assert.match(link.lastWarning ?? '', /^Follow-ups keep a time: moved to/);
        assert.ok(link.dirtyAt);
        assert.deepEqual(woken, [link.id]);
        await pushLink(link.id);
        const event = fakeProviderState.events.get(eventId)!;
        assert.equal(Date.parse(event.start?.dateTime ?? ''), at(next, '11:00').getTime(), 'the timed slot went back to the calendar');
        assert.match(linkOf('a-fu').lastWarning ?? '', /^Follow-ups keep a time/, 'the note survives that push');
    });

    it('both moved it: the CRM slot wins (locked in the CRM) and goes back to the calendar; the lead is untouched', async () => {
        const eventId = await pushedFollowUp();
        const crmSlot = at(addDays(day, 1), '10:00');
        Object.assign(activityOf('a-fu'), { startAt: crmSlot, endAt: new Date(crmSlot.getTime() + 30 * 60_000), updatedAt: new Date(Date.now() + 3_600_000) });
        state.links[0].dirtyAt = new Date();
        const later = addDays(day, 4);
        fakeEditEvent(eventId, { start: { dateTime: rfc(at(later, '09:00')), timeZone: TZ }, end: { dateTime: rfc(at(later, '09:30')), timeZone: TZ } }, new Date(Date.now() + 7_200_000));
        done(await pullConnection('c1', 'poll'));
        assert.equal(activityOf('a-fu').startAt?.getTime(), crmSlot.getTime());
        assert.equal(state.leads[0].nextFollowupTime, '11:00 AM');
        assert.ok(linkOf('a-fu').dirtyAt);
    });

    it('an older follow-up (Completed when a response was recorded) moved in the calendar: neither it nor the lead moves', async () => {
        const eventId = await pushedFollowUp();
        Object.assign(activityOf('a-fu'), { status: 'Completed' });
        const slot = activityOf('a-fu').startAt?.getTime();
        const next = addDays(day, 2);
        fakeEditEvent(eventId, { start: { dateTime: rfc(at(next, '15:00')), timeZone: TZ }, end: { dateTime: rfc(at(next, '15:30')), timeZone: TZ } }, new Date(Date.now() + 60_000));
        done(await pullConnection('c1', 'poll'));
        assert.equal(activityOf('a-fu').startAt?.getTime(), slot);
        assert.equal(toDateOnly(state.leads[0].nextFollowupDate ?? null), day);
        assert.equal(state.leads[0].nextFollowupTime, '11:00 AM');
        assert.equal(state.audits.find((a) => a.entityType === 'Lead'), undefined);
        assert.equal(linkOf('a-fu').dirtyAt, null, 'completion never moves the event, so nothing goes back either');
    });

    it('a Converted lead keeps its follow-up date when its activity is moved in the calendar', async () => {
        const eventId = await pushedFollowUp();
        state.leads[0].status = 'Converted';
        const next = addDays(day, 1);
        fakeEditEvent(eventId, { start: { dateTime: rfc(at(next, '15:30')), timeZone: TZ }, end: { dateTime: rfc(at(next, '16:00')), timeZone: TZ } }, new Date(Date.now() + 60_000));
        done(await pullConnection('c1', 'poll'));
        assert.equal(toDateOnly(state.leads[0].nextFollowupDate ?? null), day);
        assert.equal(state.audits.find((a) => a.entityType === 'Lead'), undefined);
    });

    it('deleted in the calendar: the follow-up stays Planned, the link removed_remote', async () => {
        const eventId = await pushedFollowUp();
        fakeDeleteEvent(eventId, new Date(Date.now() + 60_000));
        done(await pullConnection('c1', 'poll'));
        assert.equal(activityOf('a-fu').status, 'Planned');
        assert.equal(linkOf('a-fu').state, 'removed_remote');
    });
});

describe('pullConnection: attendee rows', () => {
    it('stored rows without an address stay when the calendar changes guests', async () => {
        const start = inDays(2);
        install([conn()], {
            contacts: [{ id: 'ct-none', name: 'No email', organizationId: null, isDeleted: false }],
            activities: [blankActivity({ id: 'a1', subject: 'Visit', assignedTo: 'palak', createdBy: 'palak', startAt: start, endAt: new Date(start.getTime() + HOUR) })],
            attendees: [blankAttendee({ activityId: 'a1', kind: 'contact', contactId: 'ct-none', name: 'No email', sortOrder: 0 })],
            links: [blankLink({ id: 'l1', activityId: 'a1', connectionId: 'c1', provider: 'fake', requestedId: requestedIdFor('a1', 'c1', 0), dirtyAt: new Date() })],
        });
        await pushLink('l1');
        const eventId = linkOf('a1').externalEventId as string;
        fakeEditEvent(eventId, { attendees: [{ email: 'guest@acme.com' }] }, new Date(Date.now() + 60_000));
        done(await pullConnection('c1', 'poll'));
        const rows = state.attendees.filter((a) => a.activityId === 'a1');
        assert.equal(rows.length, 2);
        assert.ok(rows.some((a) => a.contactId === 'ct-none'));
        assert.ok(rows.some((a) => a.email === 'guest@acme.com'));
    });

    it('more than 50 guests: the CRM keeps 50, the others stay on the event through later pulls and pushes (§8.10)', async () => {
        install();
        const own = [0, 1, 2].map((i) => ({ kind: 'email' as const, email: `crm${i}@acme.com` }));
        const { id, eventId } = await pushedMeeting({ attendees: own });
        const extra = Array.from({ length: 52 }, (_, i) => ({ email: `g${String(i).padStart(2, '0')}@acme.com`, responseStatus: 'needsAction' }));
        fakeEditEvent(eventId, { attendees: [...(fakeProviderState.events.get(eventId)?.attendees ?? []), ...extra] }, new Date(Date.now() + 60_000));
        const onEvent = () => (fakeProviderState.events.get(eventId)?.attendees ?? []).map((a) => a.email ?? '').sort();
        const before = onEvent();
        assert.equal(before.filter((email) => email.endsWith('@acme.com')).length, 55);

        done(await pullConnection('c1', 'poll'));
        assert.equal(state.attendees.filter((a) => a.activityId === id).length, 50);
        const base = parseBase(linkOf(id).baseJson);
        assert.equal(Object.keys(base?.crm.attendees ?? {}).length, 50, 'the agreed CRM side lists only what the CRM holds');
        assert.equal(linkOf(id).dirtyAt, null);

        // A guest left out of the CRM replies: nothing is read as removed in the CRM.
        const event = fakeProviderState.events.get(eventId)!;
        fakeEditEvent(eventId, { attendees: (event.attendees ?? []).map((a) => (a.email === 'g51@acme.com' ? { ...a, responseStatus: 'accepted' } : a)) }, new Date(Date.now() + 120_000));
        done(await pullConnection('c1', 'poll'));
        assert.equal(linkOf(id).dirtyAt, null, 'nothing to send back');
        assert.equal(state.attendees.filter((a) => a.activityId === id).length, 50);

        // A CRM edit pushes: every guest stays on the event.
        await activityService.update(id, { subject: 'Demo with ACME (all hands)' }, PALAK);
        await pushLink(linkOf(id).id);
        assert.equal(fakeProviderState.events.get(eventId)?.summary, 'Demo with ACME (all hands)');
        assert.deepEqual(onEvent(), before);
    });
});

describe('on-demand pulls (Sync now, page open, admin)', () => {
    it('statuses: not synced, not ready, done in-process while Redis is down, then recent; the page waits longer', async () => {
        install([]);
        assert.deepEqual(await requestPull('palak', 'manual'), { status: 'not_synced', lastSyncedAt: null });
        install([conn({ status: 'pending' })]);
        assert.equal((await requestPull('palak', 'manual')).status, 'not_ready');

        install();
        const { id, eventId } = await pushedMeeting();
        fakeEditEvent(eventId, { location: 'Room 4' }, new Date(Date.now() + 60_000));
        const now = new Date();
        const first = await requestPull('palak', 'manual', now);
        assert.equal(first.status, 'done');
        assert.equal(first.changed, 1);
        assert.ok(first.lastSyncedAt);
        assert.equal(activityOf(id).location, 'Room 4');
        assert.equal((await requestPull('palak', 'manual', new Date(now.getTime() + 10_000))).status, 'recent');
        assert.equal((await requestPull('palak', 'page', new Date(now.getTime() + 60_000))).status, 'recent');
        assert.equal((await requestPull('palak', 'manual', new Date(now.getTime() + 60_000))).status, 'done');
    });

    it('route limit: 6 a minute per user (in-process counter while Redis cannot count)', () => {
        const at = 1_000_000;
        for (let i = 0; i < 6; i += 1) assert.equal(localPullRequestLimit('user:9', at).allowed, true);
        const blocked = localPullRequestLimit('user:9', at + 1_000);
        assert.equal(blocked.allowed, false);
        assert.equal(blocked.retryAfterSeconds, 59);
        assert.equal(localPullRequestLimit('user:9', at + 61_000).allowed, true);
        assert.equal(localPullRequestLimit('user:10', at).allowed, true);
    });
});

describe('scheduled pulls (poll fallback, nightly re-baseline)', () => {
    it('Redis down: rows not pulled for a poll interval are pulled in-process, longest-waiting first, within the limit', async () => {
        const now = new Date();
        install([
            conn({ id: 'c1', lastPulledAt: new Date(now.getTime() - 60_000) }),
            conn({ id: 'c2', username: 'asha', accountEmail: 'asha@nandiniinfosys.com', lastPulledAt: null }),
        ]);
        assert.equal(await pullDueInline(now, 5), 1, 'c1 pulled a minute ago is not due');
        assert.ok(state.connections.find((c) => c.id === 'c2')?.lastPulledAt);
        assert.equal(state.connections.find((c) => c.id === 'c1')?.lastPulledAt?.getTime(), now.getTime() - 60_000);
    });

    it('Redis down: a row that keeps failing does not take every slot (the next tick moves on to the others)', async () => {
        const now = new Date();
        install([
            conn({ id: 'c1', lastPulledAt: null, leaseId: 'other', leaseUntil: new Date(now.getTime() + 3_600_000) }),
            conn({ id: 'c2', username: 'asha', accountEmail: 'asha@nandiniinfosys.com', lastPulledAt: new Date(now.getTime() - 3_600_000) }),
        ]);
        assert.equal(await pullDueInline(now, 1), 0, 'c1 waited longest but its lease is held (busy)');
        assert.equal(await pullDueInline(new Date(now.getTime() + 60_000), 1), 1, 'the next tick pulls c2');
        assert.ok((state.connections.find((c) => c.id === 'c2')?.lastPulledAt?.getTime() ?? 0) > now.getTime() - 3_600_000);
    });

    it('the poll tick does nothing outside the sync hours (a cron tick before a start minute that falls mid-hour)', async () => {
        install([conn()]);
        const night = zonedWallClockToInstant(`${zonedDayOf(new Date(), ENV.BUSINESS_TIMEZONE)}T03:00`, ENV.BUSINESS_TIMEZONE);
        assert.deepEqual(await runCalendarPoll(night), { pulls: 0, queued: 0, checks: 0, backfills: 0, channels: 0, emailRuns: 0 });
        assert.deepEqual(state.calls, []);
    });

    it('nightly: an Outlook window older than 30 days drops its cursor (the next pull is a full sync)', async () => {
        const now = new Date();
        install([
            conn({ id: 'm-old', provider: 'microsoft', syncCursor: 'https://graph.microsoft.com/v1.0/x?$deltatoken=a', syncWindowStart: new Date(now.getTime() - 40 * DAY) }),
            conn({ id: 'm-new', username: 'asha', provider: 'microsoft', syncCursor: 'https://graph.microsoft.com/v1.0/x?$deltatoken=b', syncWindowStart: new Date(now.getTime() - 3 * DAY) }),
            conn({ id: 'g-old', username: 'ravi', provider: 'google', syncCursor: 'tok', syncWindowStart: new Date(now.getTime() - 40 * DAY) }),
            // Full sync 26 days ago: its window starts 7 days before that (33 days ago), still kept.
            conn({ id: 'm-26', username: 'meena', provider: 'microsoft', syncCursor: 'https://graph.microsoft.com/v1.0/x?$deltatoken=c', syncWindowStart: new Date(now.getTime() - 33 * DAY) }),
        ]);
        assert.equal(await rebaselineGraphWindows(now), 1);
        assert.ok(state.connections.find((c) => c.id === 'm-26')?.syncCursor, 'a full sync 26 days old is not re-baselined yet');
        assert.equal(state.connections.find((c) => c.id === 'm-old')?.syncCursor, null);
        assert.ok(state.connections.find((c) => c.id === 'm-new')?.syncCursor);
        assert.equal(state.connections.find((c) => c.id === 'g-old')?.syncCursor, 'tok');
    });
});
