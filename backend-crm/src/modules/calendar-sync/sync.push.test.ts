import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type { AuthUser } from '../../types/user.types.js';
import { activityService } from '../activities/activity.service.js';
import { blankActivity, blankLink, installActivityDouble, restoreActivityDouble, type ActivityDoubleState } from '../activities/testing/activityDouble.js';
import { fakeEditEvent, fakeProviderState, resetFakeProvider } from './providers/fake.js';
import { ProviderBadRequestError, ProviderPreconditionError, ProviderTransientError, resetProviderPauses } from './providers/http.js';
import { setFakeHealth, setFakeProviderEnabledForTests } from './providers/registry.js';
import { eventKeyOf, requestedIdFor, syncKeyOf } from './sync.keys.js';
import { markPushExhausted, parseBase, pushLink } from './sync.push.js';
import { retryErrorLinks } from './sync.maintenance.js';
import { setInlinePushForTests } from './sync.wake.js';
import { blankConnection, type ConnectionRowState } from './testing/connectionDouble.js';
import { setTokenSourceForTests } from './tokenSource.js';

/**
 * The push engine end to end (Calendar Phase 2 spec §8.3–§8.10; admin-managed model): CRM saves through
 * activityService (the real write hook → outbox), then `pushLink` against the in-memory fake calendar.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const inDays = (days: number) => new Date(Math.floor((Date.now() + days * DAY) / 60_000) * 60_000);

const PALAK: AuthUser = { id: 1, username: 'palak', role: 'user' };
const ASHA: AuthUser = { id: 2, username: 'asha', role: 'Admin' };
const MIRA: AuthUser = { id: 3, username: 'mira', role: 'Admin' };
const USERS = [
    { username: 'palak', fullName: 'Palak Shah', isActive: true, email: 'palak@nandiniinfosys.com' },
    { username: 'asha', fullName: 'Asha Rao', isActive: true, email: 'asha@nandiniinfosys.com' },
    { username: 'mira', fullName: 'Mira Iyer', isActive: true, email: 'mira@nandiniinfosys.com' },
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

beforeEach(() => {
    resetFakeProvider();
    resetProviderPauses();
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

describe('outbox (activity write hook)', () => {
    it('writes nothing when the owner has no live connection row (nobody enrolled: nothing changes)', async () => {
        install([]);
        const view = await activityService.create(meeting({ attendees: [{ kind: 'email', email: 'guest@acme.com' }] }), PALAK);
        assert.equal(state.links.length, 0);
        assert.deepEqual(woken, []);
        assert.equal(view.calendar, null);
        install([conn({ status: 'stopped' })]);
        await activityService.create(meeting(), PALAK);
        assert.equal(state.links.length, 0, 'a stopped row is not synced');
    });

    it('the owner saving: a dirty link that sends invitations, woken after commit, shown as pending', async () => {
        install();
        const view = await activityService.create(meeting({ attendees: [{ kind: 'email', email: 'guest@acme.com' }] }), PALAK);
        const link = linkOf(view.id);
        assert.equal(link.invites, 'send');
        assert.equal(link.state, 'pending');
        assert.equal(link.requestedId, requestedIdFor(view.id, 'c1', 0));
        assert.ok(link.dirtyAt);
        assert.deepEqual(woken, [link.id]);
        assert.equal(view.calendar?.state, 'pending');
        assert.equal(view.calendar?.pending, true);
    });

    it('someone else saving for the owner: a private copy (withhold) and "invitations held" to the owner (D41)', async () => {
        install();
        const view = await activityService.create(meeting({ attendees: [{ kind: 'email', email: 'guest@acme.com' }] }), ASHA);
        const link = linkOf(view.id);
        assert.equal(link.invites, 'withhold');
        const held = state.notifications.filter((n) => n.kind === 'calendar_invites_held');
        assert.equal(held.length, 1);
        assert.equal(held[0].username, 'palak');
        assert.match(held[0].title, /Asha Rao added a meeting with 1 guest/);
        assert.ok(held[0].dedupeKey.endsWith(':palak'));
    });

    it('a guest someone else adds to an event that already invites is held; removing it in the CRM releases it', async () => {
        install();
        const view = await activityService.create(meeting(), PALAK);
        assert.equal((await pushLink(linkOf(view.id).id)).status, 'done');
        await activityService.update(view.id, { attendees: [{ kind: 'email', email: 'guest@acme.com' }] }, ASHA);
        assert.equal(linkOf(view.id).heldAttendeesJson, JSON.stringify(['guest@acme.com']));
        assert.equal(state.notifications.filter((n) => n.kind === 'calendar_invites_held').length, 1);
        await pushLink(linkOf(view.id).id);
        const event = fakeProviderState.events.get(linkOf(view.id).externalEventId as string);
        assert.equal(event?.attendees, undefined, 'the held guest was not invited');
        await activityService.update(view.id, { attendees: [] }, ASHA);
        assert.equal(linkOf(view.id).heldAttendeesJson, null);
    });

    it('a remarks-only change marks nothing', async () => {
        install();
        const view = await activityService.create(meeting(), PALAK);
        await pushLink(linkOf(view.id).id);
        woken = [];
        await activityService.update(view.id, { remarks: 'Bring the brochure' }, PALAK);
        assert.equal(linkOf(view.id).dirtyAt, null);
        assert.deepEqual(woken, []);
    });

    it('Tasks and Notes never get a link', async () => {
        install();
        const task = await activityService.create(meeting({ followupType: 'Task' }), PALAK);
        assert.equal(state.links.some((l) => l.activityId === task.id), false);
    });
});

describe('pushLink', () => {
    it('creates the event: requested id, private, invitations sent, D15 description cleared for an outside guest, identity stored without touching updatedAt', async () => {
        install();
        const view = await activityService.create(meeting({ attendees: [{ kind: 'email', email: 'guest@acme.com', name: 'Guest' }], reminder: '15 minutes before' }), PALAK);
        const before = state.activities.find((a) => a.id === view.id)!.updatedAt.getTime();
        const result = await pushLink(linkOf(view.id).id);
        assert.deepEqual(result, { status: 'done', action: 'create', state: 'synced', stillDirty: false });

        const link = linkOf(view.id);
        const id = requestedIdFor(view.id, 'c1', 0);
        assert.equal(link.externalEventId, id);
        assert.equal(link.externalEventKey, eventKeyOf(id));
        assert.equal(link.dirtyAt, null);
        assert.ok(link.etag);
        assert.ok(parseBase(link.baseJson));
        const call = fakeProviderState.eventCalls.find((c) => c.op === 'create');
        assert.equal(call?.sendUpdates, true);
        assert.equal(call?.mailbox, 'palak@nandiniinfosys.com');
        const event = fakeProviderState.events.get(id)!;
        assert.equal(event.visibility, 'private');
        assert.equal(event.description, '', 'an outside guest: no CRM text');
        assert.deepEqual(event.attendees?.map((a) => a.email), ['guest@acme.com']);
        assert.deepEqual(event.reminders, { useDefault: false, overrides: [{ method: 'popup', minutes: 15 }] });

        const row = state.activities.find((a) => a.id === view.id)!;
        assert.equal(row.iCalUid, `${id}@fake.calendar`);
        assert.equal(row.syncKey, syncKeyOf(`${id}@fake.calendar`));
        assert.equal(row.updatedAt.getTime(), before, 'not a user edit');
        assert.ok(state.connections[0].lastPushedAt);
        assert.equal((await pushLink(link.id)).status, 'clean', 'a second job for the same version does nothing');
    });

    it('internal-only events carry the type, record code and CRM link (D15); a private copy invites nobody', async () => {
        install();
        const view = await activityService.create(meeting({ attendees: [{ kind: 'user', username: 'asha' }, { kind: 'email', email: 'guest@acme.com' }] }), ASHA);
        await pushLink(linkOf(view.id).id);
        const event = fakeProviderState.events.get(linkOf(view.id).externalEventId as string)!;
        assert.equal(event.attendees, undefined);
        assert.equal(fakeProviderState.eventCalls.find((c) => c.op === 'create')?.sendUpdates, false);
        assert.match(event.description ?? '', new RegExp(`^Meeting\\nOpen in Nandini CRM: .*/calendar\\?activity=${view.id}$`));
    });

    it('patches only what changed (If-Match), then cancels with a notice to guests', async () => {
        install();
        const view = await activityService.create(meeting({ attendees: [{ kind: 'email', email: 'guest@acme.com' }] }), PALAK);
        await pushLink(linkOf(view.id).id);
        const etag = linkOf(view.id).etag;
        await activityService.update(view.id, { subject: 'Demo with ACME (v2)' }, PALAK);
        const patched = await pushLink(linkOf(view.id).id);
        assert.equal(patched.status === 'done' && patched.action, 'patch');
        const patch = fakeProviderState.eventCalls.filter((c) => c.op === 'patch').at(-1);
        assert.deepEqual(patch?.body, { summary: 'Demo with ACME (v2)' });
        assert.equal(patch?.sendUpdates, true);
        assert.notEqual(linkOf(view.id).etag, etag);

        await activityService.update(view.id, { status: 'Cancelled' }, PALAK);
        const cancelled = await pushLink(linkOf(view.id).id);
        assert.equal(cancelled.status === 'done' && cancelled.state, 'cancelled');
        assert.equal(fakeProviderState.eventCalls.at(-1)?.op, 'cancel');
        assert.equal(fakeProviderState.eventCalls.at(-1)?.sendUpdates, true);
        assert.equal(fakeProviderState.events.get(linkOf(view.id).externalEventId as string)?.status, 'cancelled');
    });

    it('412: the calendar change is merged into the CRM, the CRM change is pushed with the new etag', async () => {
        install();
        const view = await activityService.create(meeting({ location: 'Pune office' }), PALAK);
        await pushLink(linkOf(view.id).id);
        const eventId = linkOf(view.id).externalEventId as string;
        fakeEditEvent(eventId, { location: 'ACME HQ' }, new Date(Date.now() + 60_000));
        await activityService.update(view.id, { subject: 'Demo (agenda attached)' }, PALAK);
        const result = await pushLink(linkOf(view.id).id);
        assert.equal(result.status === 'done' && result.state, 'synced');
        const row = state.activities.find((a) => a.id === view.id)!;
        assert.equal(row.location, 'ACME HQ', 'the calendar change reached the CRM');
        assert.ok(row.externalUpdatedAt);
        const event = fakeProviderState.events.get(eventId)!;
        assert.equal(event.summary, 'Demo (agenda attached)');
        assert.equal(event.location, 'ACME HQ');
        assert.equal(linkOf(view.id).dirtyAt, null);
    });

    it('a follow-up activity keeps its CRM slot after a 412 (the calendar move is pushed back)', async () => {
        const start = inDays(3);
        const activity = blankActivity({ id: 'a-fu', subject: 'Call follow-up', assignedTo: 'palak', createdBy: 'palak', followupType: 'Call', origin: 'followup', startAt: start, endAt: new Date(start.getTime() + HOUR) });
        install([conn()], { activities: [activity], links: [blankLink({ id: 'l-fu', activityId: 'a-fu', connectionId: 'c1', provider: 'fake', requestedId: requestedIdFor('a-fu', 'c1', 0), dirtyAt: new Date() })] });
        await pushLink('l-fu');
        const eventId = linkOf('a-fu').externalEventId as string;
        const moved = new Date(start.getTime() + DAY).toISOString().replace('.000Z', 'Z');
        fakeEditEvent(eventId, { start: { dateTime: moved, timeZone: 'Asia/Kolkata' }, end: { dateTime: moved, timeZone: 'Asia/Kolkata' }, summary: 'Call (renamed)' });
        state.links[0].dirtyAt = new Date();
        state.activities[0].subject = 'Call follow-up: LD-0012';
        await pushLink('l-fu');
        assert.equal(state.activities[0].startAt?.getTime(), start.getTime(), 'the CRM slot stays');
        const event = fakeProviderState.events.get(eventId)!;
        assert.equal(Date.parse(event.start?.dateTime ?? ''), start.getTime(), 'the CRM slot went back to the calendar');
    });

    it('an event deleted in the calendar cancels the activity; a follow-up activity only marks its link removed_remote', async () => {
        install();
        const view = await activityService.create(meeting(), PALAK);
        await pushLink(linkOf(view.id).id);
        fakeEditEvent(linkOf(view.id).externalEventId as string, { status: 'cancelled' });
        await activityService.update(view.id, { subject: 'Renamed' }, PALAK);
        const result = await pushLink(linkOf(view.id).id);
        assert.equal(result.status === 'done' && result.state, 'cancelled');
        assert.equal(state.activities.find((a) => a.id === view.id)?.status, 'Cancelled');

        const start = inDays(3);
        state.activities.push(blankActivity({ id: 'a-fu', subject: 'Call follow-up', assignedTo: 'palak', createdBy: 'palak', followupType: 'Call', origin: 'followup', startAt: start, endAt: start }));
        state.links.push(blankLink({ id: 'l-fu', activityId: 'a-fu', connectionId: 'c1', provider: 'fake', requestedId: requestedIdFor('a-fu', 'c1', 0), dirtyAt: new Date() }));
        await pushLink('l-fu');
        fakeEditEvent(linkOf('a-fu').externalEventId as string, { status: 'cancelled' });
        state.links.find((l) => l.id === 'l-fu')!.dirtyAt = new Date();
        state.activities.find((a) => a.id === 'a-fu')!.subject = 'Call follow-up (2)';
        const fu = await pushLink('l-fu');
        assert.equal(fu.status === 'done' && fu.state, 'removed_remote');
        assert.equal(state.activities.find((a) => a.id === 'a-fu')?.status, 'Planned');
    });

    it('a refused change: link error, the owner told once a day (dedupe per recipient), not retried by itself', async () => {
        install();
        const view = await activityService.create(meeting(), PALAK);
        fakeProviderState.failNext.create = new ProviderBadRequestError({ provider: 'fake', operation: 'create-event', status: 400, code: 'invalid', providerMessage: 'Bad attendee' });
        const result = await pushLink(linkOf(view.id).id);
        assert.equal(result.status === 'done' && result.state, 'error');
        const link = linkOf(view.id);
        assert.equal(link.dirtyAt, null);
        assert.equal(link.lastErrorCode, 'invalid');
        assert.equal(link.lastErrorMessage, 'Bad attendee');
        const notices = state.notifications.filter((n) => n.kind === 'calendar_sync_error');
        assert.equal(notices.length, 1);
        assert.equal(notices[0].username, 'palak');
        assert.ok(notices[0].dedupeKey.endsWith(':palak'));
        assert.equal(state.connections[0].status, 'ok', 'one refused event is not a connection problem');
    });

    it('gates: a row in error or an inactive user keeps the link dirty for 15 minutes; a stopped row detaches without a call', async () => {
        install([conn({ status: 'error' })]);
        const view = await activityService.create(meeting(), PALAK);
        const result = await pushLink(linkOf(view.id).id);
        assert.deepEqual(result, { status: 'skipped', reason: 'connection_error' });
        assert.ok(linkOf(view.id).dirtyAt);
        assert.ok((linkOf(view.id).nextAttemptAt?.getTime() ?? 0) > Date.now() + 14 * 60_000);
        assert.equal(fakeProviderState.eventCalls.length, 0);

        state.connections[0].status = 'ok';
        state.users[0].isActive = false;
        assert.deepEqual(await pushLink(linkOf(view.id).id), { status: 'skipped', reason: 'user_inactive' });

        state.users[0].isActive = true;
        state.connections[0].status = 'stopped';
        const detached = await pushLink(linkOf(view.id).id);
        assert.equal(detached.status === 'done' && detached.state, 'detached');
        assert.equal(fakeProviderState.eventCalls.length, 0);
    });

    it('a pending row pushes (and becomes ok); the provider switched off skips; a held lease answers busy', async () => {
        install([conn({ status: 'pending', backfilledAt: null })]);
        const view = await activityService.create(meeting(), PALAK);
        const linkId = linkOf(view.id).id;
        state.connections[0].leaseUntil = new Date(Date.now() + 60_000);
        assert.deepEqual(await pushLink(linkId), { status: 'busy' });
        state.connections[0].leaseUntil = null;

        setFakeProviderEnabledForTests(false);
        assert.deepEqual(await pushLink(linkId), { status: 'skipped', reason: 'provider_disabled' });
        setFakeProviderEnabledForTests(true);
        linkOf(view.id).nextAttemptAt = null;
        const done = await pushLink(linkId);
        assert.equal(done.status, 'done');
        assert.equal(state.connections[0].status, 'ok');
        assert.equal(state.connections[0].leaseUntil, null, 'the lease is released');
    });

    it('a deleted activity cancels its event (no guests: no notice)', async () => {
        install();
        const view = await activityService.create(meeting(), PALAK);
        await pushLink(linkOf(view.id).id);
        await activityService.remove(view.id, PALAK);
        const result = await pushLink(linkOf(view.id).id);
        assert.equal(result.status === 'done' && result.action, 'cancel');
        assert.equal(fakeProviderState.eventCalls.at(-1)?.op, 'cancel');
        assert.equal(fakeProviderState.eventCalls.at(-1)?.sendUpdates, false, 'no guests, no notice');
    });
});

describe('D41 holds (review fixes)', () => {
    const ashaConn = () => blankConnection({ id: 'c2', username: 'asha', provider: 'fake', accountEmail: 'asha@nandiniinfosys.com', status: 'ok', backfilledAt: new Date(0) });
    const linkOn = (activityId: string, connectionId: string) => {
        const link = state.links.find((l) => l.activityId === activityId && l.connectionId === connectionId);
        assert.ok(link, `a link on ${connectionId}`);
        return link;
    };
    const heldNotices = () => state.notifications.filter((n) => n.kind === 'calendar_invites_held');

    it('A → B → A by someone else: the restored copy on A is private; a guest added while B owned it is never invited from A', async () => {
        install([conn(), ashaConn()]);
        const view = await activityService.create(meeting({ attendees: [{ kind: 'email', email: 'g1@acme.com' }] }), PALAK);
        await pushLink(linkOn(view.id, 'c1').id);
        await activityService.update(view.id, { assignedTo: 'asha' }, MIRA);
        await pushLink(linkOn(view.id, 'c1').id);
        await pushLink(linkOn(view.id, 'c2').id);
        assert.equal(linkOn(view.id, 'c1').state, 'cancelled');
        await activityService.update(view.id, { attendees: [{ kind: 'email', email: 'g1@acme.com' }, { kind: 'email', email: 'g2@other.com' }] }, ASHA);
        const notices = heldNotices().length;
        await activityService.update(view.id, { assignedTo: 'palak' }, MIRA);
        const back = linkOn(view.id, 'c1');
        assert.equal(back.invites, 'withhold', 'a new copy for Palak made by Mira');
        assert.equal(heldNotices().length, notices + 1, 'Palak is told');
        const calls = fakeProviderState.eventCalls.length;
        const result = await pushLink(back.id);
        assert.equal(result.status === 'done' && result.action, 'create');
        const restore = fakeProviderState.eventCalls.slice(calls).filter((c) => c.op === 'undelete' || c.op === 'create');
        assert.ok(restore.length > 0);
        assert.ok(restore.every((c) => c.sendUpdates === false), 'nothing sent from Palak');
        assert.equal(fakeProviderState.events.get(back.externalEventId as string)?.attendees, undefined, 'no guests on the private copy');
    });

    it('guests added while the provider is off are held, and the push after it is back on does not invite them', async () => {
        install();
        const view = await activityService.create(meeting(), PALAK);
        await pushLink(linkOf(view.id).id);
        setFakeProviderEnabledForTests(false);
        await activityService.update(view.id, { attendees: [{ kind: 'email', email: 'x@customer.com' }] }, MIRA);
        assert.equal(linkOf(view.id).heldAttendeesJson, JSON.stringify(['x@customer.com']));
        setFakeProviderEnabledForTests(true);
        linkOf(view.id).nextAttemptAt = null;
        await pushLink(linkOf(view.id).id);
        assert.equal(fakeProviderState.events.get(linkOf(view.id).externalEventId as string)?.attendees, undefined);
    });

    it('a detached link records held guests without becoming dirty; after re-attach they stay held', async () => {
        install();
        const view = await activityService.create(meeting(), PALAK);
        await pushLink(linkOf(view.id).id);
        // The row was stopped (stopRow): links detached, not dirty.
        state.connections[0].status = 'stopped';
        Object.assign(linkOf(view.id), { state: 'detached', dirtyAt: null });
        await activityService.update(view.id, { attendees: [{ kind: 'email', email: 'x@customer.com' }] }, MIRA);
        assert.equal(linkOf(view.id).state, 'detached');
        assert.equal(linkOf(view.id).dirtyAt, null);
        assert.equal(linkOf(view.id).heldAttendeesJson, JSON.stringify(['x@customer.com']));
        // Re-activated (reattachLinks): pending and dirty again.
        state.connections[0].status = 'ok';
        Object.assign(linkOf(view.id), { state: 'pending', dirtyAt: new Date() });
        const result = await pushLink(linkOf(view.id).id);
        assert.equal(result.status, 'done');
        assert.equal(fakeProviderState.eventCalls.some((c) => c.sendUpdates === true && c.op !== 'create'), false, 'nothing sent');
        assert.equal(fakeProviderState.events.get(linkOf(view.id).externalEventId as string)?.attendees, undefined);
    });

    it("a non-owner changing a contact attendee's address holds the new address", async () => {
        install([conn()], { contacts: [{ id: 'k1', name: 'Kiran', organizationId: null, isDeleted: false }] });
        const view = await activityService.create(meeting({ attendees: [{ kind: 'contact', contactId: 'k1', email: 'k@cust.com' }] }), PALAK);
        await pushLink(linkOf(view.id).id);
        await activityService.update(view.id, { attendees: [{ kind: 'contact', contactId: 'k1', email: 'someone@anywhere.com' }] }, MIRA);
        assert.equal(linkOf(view.id).heldAttendeesJson, JSON.stringify(['someone@anywhere.com']));
        await pushLink(linkOf(view.id).id);
        const emails = fakeProviderState.events.get(linkOf(view.id).externalEventId as string)?.attendees?.map((a) => a.email) ?? [];
        assert.equal(emails.includes('someone@anywhere.com'), false);
    });
});

describe('push robustness (review fixes)', () => {
    const transient = () => new ProviderTransientError({ provider: 'fake', operation: 'create-event', status: 503, code: 'backendError' });

    it('a restore whose retries ran out stays cancelled: the next try restores (never a patch that would cancel the activity)', async () => {
        install();
        const view = await activityService.create(meeting(), PALAK);
        await pushLink(linkOf(view.id).id);
        await activityService.update(view.id, { status: 'Cancelled' }, PALAK);
        await pushLink(linkOf(view.id).id);
        assert.equal(linkOf(view.id).state, 'cancelled');
        await activityService.update(view.id, { status: 'Planned' }, PALAK);
        fakeProviderState.failNext.undelete = transient();
        await assert.rejects(pushLink(linkOf(view.id).id));
        assert.ok((linkOf(view.id).nextAttemptAt?.getTime() ?? 0) > Date.now() + 9 * 60_000, 'the sweep leaves it to BullMQ');
        await markPushExhausted(linkOf(view.id).id);
        assert.equal(linkOf(view.id).state, 'cancelled');
        assert.equal(linkOf(view.id).lastErrorCode, 'retries_exhausted');
        const result = await pushLink(linkOf(view.id).id);
        assert.equal(result.status === 'done' && result.action, 'create');
        assert.equal(state.activities.find((a) => a.id === view.id)?.status, 'Planned');
        assert.equal(linkOf(view.id).state, 'synced');
        assert.equal(linkOf(view.id).lastErrorCode, null);
    });

    it('a refused restore keeps the link cancelled and the nightly retries it as a restore', async () => {
        install();
        const view = await activityService.create(meeting(), PALAK);
        await pushLink(linkOf(view.id).id);
        await activityService.update(view.id, { status: 'Cancelled' }, PALAK);
        await pushLink(linkOf(view.id).id);
        await activityService.update(view.id, { status: 'Planned' }, PALAK);
        fakeProviderState.failNext.undelete = new ProviderBadRequestError({ provider: 'fake', operation: 'undelete-event', status: 400, code: 'invalid' });
        const failed = await pushLink(linkOf(view.id).id);
        assert.equal(failed.status === 'done' && failed.state, 'cancelled');
        assert.equal(linkOf(view.id).lastErrorCode, 'invalid');
        assert.equal(await retryErrorLinks(new Date()), 1);
        assert.equal(linkOf(view.id).state, 'cancelled');
        assert.ok(linkOf(view.id).dirtyAt);
        const result = await pushLink(linkOf(view.id).id);
        assert.equal(result.status === 'done' && result.action, 'create');
        assert.equal(state.activities.find((a) => a.id === view.id)?.status, 'Planned');
    });

    it('a row stopped during the call: the link stays detached (not pending), the provider answer kept', async () => {
        install();
        const view = await activityService.create(meeting(), PALAK);
        fakeProviderState.onCall = (op) => {
            if (op !== 'create') return;
            state.connections[0].status = 'stopped';
            Object.assign(linkOf(view.id), { state: 'detached', dirtyAt: null, nextAttemptAt: null });
        };
        const result = await pushLink(linkOf(view.id).id);
        assert.equal(result.status === 'done' && result.state, 'detached');
        const link = linkOf(view.id);
        assert.equal(link.state, 'detached');
        assert.equal(link.dirtyAt, null);
        assert.ok(link.externalEventId, 'the event id is kept for the re-attach');
    });

    it('a push that lost its lease mid-run stops with busy and stores nothing', async () => {
        install();
        const view = await activityService.create(meeting(), PALAK);
        await pushLink(linkOf(view.id).id);
        await activityService.update(view.id, { subject: 'Renamed' }, PALAK);
        let now = Date.now();
        fakeProviderState.failNext.patch = new ProviderPreconditionError({ provider: 'fake', operation: 'patch-event', status: 412, code: 'conditionNotMet' });
        fakeProviderState.onCall = (op) => {
            if (op !== 'patch') return;
            now += 125_000;
            Object.assign(state.connections[0], { leaseId: 'someone-else', leaseUntil: new Date(now + 60_000) });
        };
        const dirtyAt = linkOf(view.id).dirtyAt;
        const result = await pushLink(linkOf(view.id).id, { now: () => new Date(now) });
        assert.deepEqual(result, { status: 'busy' });
        assert.equal(linkOf(view.id).dirtyAt, dirtyAt, 'still dirty');
        assert.equal(fakeProviderState.eventCalls.filter((c) => c.op === 'get').length, 0, 'no provider call without the lease');
        assert.equal(state.connections[0].leaseId, 'someone-else', 'the new holder keeps its lease');
    });
});
