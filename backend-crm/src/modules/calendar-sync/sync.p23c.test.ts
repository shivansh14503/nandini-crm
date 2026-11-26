import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { ENV } from '../../config/env.js';
import type { Activity } from '../../generated/prisma/client.js';
import type { AuthUser } from '../../types/user.types.js';
import { HttpError } from '../../utils/httpError.js';
import { zonedDayOf, zonedWallClockToInstant } from '../../utils/zonedTime.js';
import { activityService } from '../activities/activity.service.js';
import type { ActivityRow } from '../activities/activity.mapper.js';
import { blankActivity, blankAttendee, blankLink, installActivityDouble, restoreActivityDouble, type ActivityDoubleState } from '../activities/testing/activityDouble.js';
import { fakeProviderState, resetFakeProvider } from './providers/fake.js';
import { resetProviderPauses } from './providers/http.js';
import { setFakeHealth, setFakeProviderEnabledForTests } from './providers/registry.js';
import { calendarSyncActions } from './sync.actions.js';
import { backfillWindow, planBackfill, runBackfill } from './sync.backfill.js';
import { requestedIdFor } from './sync.keys.js';
import { backfillDueInline, dueBackfillRows, enqueueDueBackfills, runEnrolled } from './sync.maintenance.js';
import { pushLink } from './sync.push.js';
import { setInlinePushForTests } from './sync.wake.js';
import { blankConnection, type ConnectionRowState } from './testing/connectionDouble.js';
import { setTokenSourceForTests } from './tokenSource.js';

/**
 * Calendar Phase 2 P2-3c: the first-sync backfill (D23, addendum §8.3), the drawer's Retry / Add again and Send
 * invitations (owner only, D41), and held guests kept by identity. End to end through the activity double and the fake
 * calendar, like sync.push.test.ts.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const inDays = (days: number) => new Date(Math.floor((Date.now() + days * DAY) / 60_000) * 60_000);

const PALAK: AuthUser = { id: 1, username: 'palak', role: 'user' };
const ASHA: AuthUser = { id: 2, username: 'asha', role: 'Admin' };
const RAVI: AuthUser = { id: 4, username: 'ravi', role: 'user' };
const USERS = [
    { username: 'palak', fullName: 'Palak Shah', isActive: true, email: 'palak@nandiniinfosys.com' },
    { username: 'asha', fullName: 'Asha Rao', isActive: true, email: 'asha@nandiniinfosys.com' },
    { username: 'ravi', fullName: 'Ravi Kumar', isActive: true, email: 'ravi@nandiniinfosys.com' },
];

const conn = (over: Partial<ConnectionRowState> = {}) =>
    blankConnection({ id: 'c1', username: 'palak', provider: 'fake', accountEmail: 'palak@nandiniinfosys.com', status: 'ok', backfilledAt: new Date(0), backfillCount: 0, ...over });

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

const stored = (id: string, over: Partial<Activity> = {}): Activity =>
    blankActivity({ id, subject: `Activity ${id}`, assignedTo: 'palak', createdBy: 'palak', startAt: inDays(3), endAt: new Date(inDays(3).getTime() + HOUR), ...over });

async function expectHttp(promise: Promise<unknown>, status: number, code?: string) {
    await assert.rejects(promise, (err: unknown) => {
        assert.ok(err instanceof HttpError, `an HttpError, got ${String(err)}`);
        assert.equal(err.statusCode, status);
        if (code) assert.equal(err.code, code);
        return true;
    });
}

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

describe('planBackfill (pure)', () => {
    const now = new Date('2026-12-01T06:00:00.000Z');
    const row = (id: string, over: Partial<ActivityRow> = {}): ActivityRow => ({
        ...blankActivity({ id, subject: id, assignedTo: 'palak', createdBy: 'palak', startAt: new Date(now.getTime() + DAY), endAt: new Date(now.getTime() + DAY + HOUR) }),
        attendees: [],
        ...over,
    });

    it('window: not over at now, starting before now + backfillDays', () => {
        const { from, to } = backfillWindow(now, 60);
        assert.equal(from.getTime(), now.getTime());
        assert.equal(to.getTime() - now.getTime(), 60 * DAY);
        const rows = [
            row('upcoming'),
            row('ongoing', { startAt: new Date(now.getTime() - HOUR), endAt: new Date(now.getTime() + HOUR) }),
            row('over', { startAt: new Date(now.getTime() - 2 * HOUR), endAt: new Date(now.getTime() - HOUR) }),
            row('too-far', { startAt: new Date(now.getTime() + 61 * DAY), endAt: new Date(now.getTime() + 61 * DAY + HOUR) }),
        ];
        assert.deepEqual(
            planBackfill(rows, new Set(), null, now, 60).map((i) => i.activityId),
            ['upcoming', 'ongoing'],
        );
    });

    it('create-eligible only (Planned, syncable type, schedule, not external), and not linked already', () => {
        const rows = [
            row('ok'),
            row('done', { status: 'Completed' }),
            row('task', { followupType: 'Task' }),
            row('note', { followupType: 'Note' }),
            row('external', { externalOrganizer: true }),
            row('linked'),
            row('unscheduled', { startAt: null, endAt: null }),
        ];
        assert.deepEqual(
            planBackfill(rows, new Set(['linked']), null, now, 30).map((i) => i.activityId),
            ['ok'],
        );
    });

    it('withhold only when there are guests (attendees other than the owner): no burst of invitations (D23)', () => {
        const guest = (kind: string, extra: Record<string, unknown>) => blankAttendee({ activityId: 'x', kind, name: 'G', ...extra });
        const rows = [
            row('alone'),
            row('only-owner', { attendees: [guest('user', { username: 'Palak' })] }),
            row('customer', { attendees: [guest('email', { email: 'c@acme.com' })] }),
            row('colleague', { attendees: [guest('user', { username: 'asha' })] }),
        ];
        assert.deepEqual(
            planBackfill(rows, new Set(), null, now, 30).map((i) => [i.activityId, i.invites]),
            [
                ['alone', 'send'],
                ['only-owner', 'send'],
                ['customer', 'withhold'],
                ['colleague', 'withhold'],
            ],
        );
    });
});

describe('first-sync backfill (enrolled job)', () => {
    const fresh = () => conn({ backfilledAt: null, backfillCount: null });

    it('copies upcoming activities as links (private copies with guests), stamps backfilledAt, and is idempotent', async () => {
        install([fresh()], {
            activities: [stored('a1'), stored('a2'), stored('past', { startAt: inDays(-3), endAt: new Date(inDays(-3).getTime() + HOUR) }), stored('other', { assignedTo: 'asha' }), stored('far', { startAt: inDays(80), endAt: new Date(inDays(80).getTime() + HOUR) })],
            attendees: [blankAttendee({ activityId: 'a2', kind: 'email', email: 'buyer@acme.com', name: 'Buyer' })],
        });
        const now = new Date();
        const result = await runBackfill('c1', { now });
        assert.deepEqual(result, { status: 'done', created: 2, withheld: 1, copied: 2 });
        assert.deepEqual(state.links.map((l) => l.activityId).sort(), ['a1', 'a2']);
        assert.equal(linkOf('a1').invites, 'send');
        assert.equal(linkOf('a2').invites, 'withhold');
        for (const link of state.links) {
            assert.equal(link.state, 'pending');
            assert.equal(link.requestedId, requestedIdFor(link.activityId, 'c1', 0));
            assert.equal(link.createdAt.getTime(), now.getTime(), 'createdAt = backfilledAt (the drawer tells backfilled copies apart)');
        }
        assert.equal(state.connections[0].backfilledAt?.getTime(), now.getTime());
        assert.equal(state.connections[0].backfillCount, 2);
        assert.equal(state.audits.length, 0, 'no activity row written');
        assert.deepEqual(await runBackfill('c1'), { status: 'skipped', reason: 'already_done' });
        assert.equal(state.links.length, 2);
    });

    it('waits for the first ok, skips inactive users, and leaves activities that already have a link', async () => {
        install([fresh(), conn({ id: 'c9', username: 'ravi', accountEmail: 'ravi@nandiniinfosys.com', status: 'pending', backfilledAt: null, backfillCount: null })], { activities: [stored('a1')] });
        assert.deepEqual(await runBackfill('c9'), { status: 'skipped', reason: 'status_pending' });
        state.users.find((u) => u.username === 'palak')!.isActive = false;
        assert.deepEqual(await runBackfill('c1'), { status: 'skipped', reason: 'user_inactive' });
        state.users.find((u) => u.username === 'palak')!.isActive = true;
        // Saved while the row was pending: the outbox already made a link (sending, actor = owner).
        await activityService.update('a1', { subject: 'Renamed' }, PALAK);
        assert.equal(state.links.length, 1);
        const result = await runBackfill('c1');
        assert.deepEqual(result, { status: 'done', created: 0, withheld: 0, copied: 0 });
        assert.equal(state.connections[0].backfillCount, 0);
    });

    it('a run started again keeps the first run stamp: earlier copies stay "connected" and are counted', async () => {
        const t1 = new Date(Date.now() - 10 * 60_000);
        // Run 1 claimed t1 and copied a2 (private copy), then crashed before writing its count.
        install([conn({ backfilledAt: t1, backfillCount: null })], {
            activities: [stored('a1'), stored('a2')],
            attendees: [blankAttendee({ activityId: 'a2', kind: 'email', email: 'buyer@acme.com', name: 'Buyer' })],
        });
        state.links.push(blankLink({ activityId: 'a2', connectionId: 'c1', provider: 'fake', requestedId: requestedIdFor('a2', 'c1', 0), invites: 'withhold', dirtyAt: t1, createdAt: t1, updatedAt: t1 }));
        const result = await runBackfill('c1');
        assert.deepEqual(result, { status: 'done', created: 1, withheld: 0, copied: 2 });
        assert.equal(linkOf('a1').createdAt.getTime(), t1.getTime(), 'the run stamp is kept');
        assert.equal(state.connections[0].backfilledAt?.getTime(), t1.getTime());
        assert.equal(state.connections[0].backfillCount, 2, "both runs' copies are counted");
        const view = await activityService.getById('a2', PALAK);
        assert.equal(view.calendar?.copyReason, 'connected');
        assert.deepEqual(await runBackfill('c1'), { status: 'skipped', reason: 'already_done' });
    });

    it('the enrolled job backfills then pushes: a private copy invites nobody and the view says "connected"', async () => {
        install([fresh()], {
            activities: [stored('a2')],
            attendees: [blankAttendee({ activityId: 'a2', kind: 'email', email: 'buyer@acme.com', name: 'Buyer' })],
        });
        const result = await runEnrolled('c1');
        assert.equal(result?.backfilled, 1);
        assert.equal(result?.pushed, 1);
        const link = linkOf('a2');
        assert.equal(link.state, 'synced');
        const event = fakeProviderState.events.get(link.externalEventId as string)!;
        assert.equal(event.attendees, undefined, 'no guests on the private copy');
        assert.ok(fakeProviderState.eventCalls.every((c) => c.sendUpdates !== true), 'nobody mailed');
        const view = await activityService.getById('a2', PALAK);
        assert.equal(view.calendar?.invites, 'withhold');
        assert.equal(view.calendar?.copyReason, 'connected');
        assert.equal(view.calendar?.canSendInvites, true);
        assert.equal(view.calendar?.invitesWaiting, true);
        const other = await activityService.getById('a2', ASHA);
        assert.equal(other.calendar?.canSendInvites, false, 'only the owner sends');
        assert.equal(other.calendar?.invitesWaiting, true, 'others see "Waiting for Palak"');
    });

    it('rows ok without a backfill for a while are due for recovery (a lost enrolled job)', async () => {
        const long = new Date(Date.now() - 20 * 60_000);
        install([fresh(), conn({ id: 'c2', username: 'asha', accountEmail: 'asha@nandiniinfosys.com', backfilledAt: null, backfillCount: null, lastSuccessAt: new Date() }), conn({ id: 'c3', username: 'ravi', backfilledAt: null, backfillCount: null, lastSuccessAt: long }), conn({ id: 'c4', username: 'asha', backfilledAt: new Date(), backfillCount: null, lastSuccessAt: long })]);
        const due = await dueBackfillRows(new Date());
        assert.deepEqual(due.map((r) => r.id).sort(), ['c1', 'c3', 'c4'], 'a run that started (stamp written) but never finished is due too');
    });

    it('the recovery runs only inside CALENDAR_SYNC_HOURS (P2-5): nothing is queued or backfilled at night', async () => {
        const long = new Date(Date.now() - 20 * 60_000);
        install([conn({ id: 'c3', username: 'ravi', backfilledAt: null, backfillCount: null, lastSuccessAt: long })]);
        const night = zonedWallClockToInstant(`${zonedDayOf(new Date(), ENV.BUSINESS_TIMEZONE)}T03:00`, ENV.BUSINESS_TIMEZONE);
        assert.equal(await enqueueDueBackfills(night), 0);
        assert.equal(await backfillDueInline(night), 0);
        assert.equal(state.connections.find((c) => c.id === 'c3')?.backfillCount, null, 'still due for the morning');
        assert.deepEqual(state.calls, []);
    });
});

describe('send invitations (owner only, D41)', () => {
    it('a private copy: only the owner may send; invites, held cleared, audited, then the push invites everyone and clears the description', async () => {
        install();
        const view = await activityService.create(meeting({ attendees: [{ kind: 'email', email: 'guest@acme.com' }] }), ASHA);
        await pushLink(linkOf(view.id).id);
        const before = fakeProviderState.events.get(linkOf(view.id).externalEventId as string)!;
        assert.match(before.description ?? '', /Open in Nandini CRM/, 'internal text while nobody outside is on it');
        await expectHttp(calendarSyncActions.sendInvites(view.id, ASHA), 403, 'FORBIDDEN');
        const sent = await calendarSyncActions.sendInvites(view.id, PALAK);
        const link = linkOf(view.id);
        assert.equal(link.invites, 'send');
        assert.equal(link.heldAttendeesJson, null);
        assert.ok(link.dirtyAt);
        assert.deepEqual(woken.slice(-1), [link.id]);
        assert.equal(sent.calendar?.canSendInvites, false);
        const audit = state.audits.find((a) => a.action === 'SEND_INVITES');
        assert.deepEqual(audit && { by: audit.changedBy, changes: audit.changes }, { by: 'palak', changes: { provider: 'fake', privateCopy: true, guests: 1 } });

        const result = await pushLink(link.id);
        assert.equal(result.status === 'done' && result.action, 'patch');
        const patch = fakeProviderState.eventCalls.filter((c) => c.op === 'patch').at(-1);
        assert.equal(patch?.sendUpdates, true);
        assert.equal((patch?.body as { description?: string }).description, '', 'the outside guest never sees the CRM text');
        assert.deepEqual(fakeProviderState.events.get(link.externalEventId as string)?.attendees?.map((a) => a.email), ['guest@acme.com']);
        // Nothing held any more: a second press changes nothing.
        const audits = state.audits.length;
        await calendarSyncActions.sendInvites(view.id, PALAK);
        assert.equal(state.audits.length, audits);
    });

    it('held guests on a sent event are released by the owner only', async () => {
        install();
        const view = await activityService.create(meeting(), PALAK);
        await pushLink(linkOf(view.id).id);
        await activityService.update(view.id, { attendees: [{ kind: 'email', email: 'x@customer.com' }] }, ASHA);
        await pushLink(linkOf(view.id).id);
        assert.equal(fakeProviderState.events.get(linkOf(view.id).externalEventId as string)?.attendees, undefined, 'held');
        assert.equal((await activityService.getById(view.id, PALAK)).calendar?.heldCount, 1);
        await calendarSyncActions.sendInvites(view.id, PALAK);
        await pushLink(linkOf(view.id).id);
        assert.deepEqual(fakeProviderState.events.get(linkOf(view.id).externalEventId as string)?.attendees?.map((a) => a.email), ['x@customer.com']);
        assert.equal(state.audits.find((a) => a.action === 'SEND_INVITES')?.changes && (state.audits.find((a) => a.action === 'SEND_INVITES')!.changes as { guests: number }).guests, 1);
    });

    it('a contact someone else added without an address stays held when the address arrives later (held by identity)', async () => {
        install([conn()], { contacts: [{ id: 'k1', name: 'Kiran', organizationId: null, isDeleted: false }] });
        const view = await activityService.create(meeting(), PALAK);
        await pushLink(linkOf(view.id).id);
        await activityService.update(view.id, { attendees: [{ kind: 'contact', contactId: 'k1' }] }, ASHA);
        assert.equal(linkOf(view.id).heldAttendeesJson, JSON.stringify(['contact:k1']));
        await pushLink(linkOf(view.id).id);
        // The contact gets an address on their own record (no activity write).
        state.entityEmails.push({ id: 'e1', email: 'kiran@cust.com', contactId: 'k1', isPrimary: true, isInvalidBounce: false, sortOrder: 0 });
        await activityService.update(view.id, { subject: 'Demo (moved room)' }, PALAK);
        assert.equal(linkOf(view.id).heldAttendeesJson, JSON.stringify(['contact:k1']), "the owner's other edit releases nothing");
        await pushLink(linkOf(view.id).id);
        assert.equal(fakeProviderState.events.get(linkOf(view.id).externalEventId as string)?.attendees, undefined, 'still not invited');
        await calendarSyncActions.sendInvites(view.id, PALAK);
        await pushLink(linkOf(view.id).id);
        assert.deepEqual(fakeProviderState.events.get(linkOf(view.id).externalEventId as string)?.attendees?.map((a) => a.email), ['kiran@cust.com']);
    });

    it('409 without a copy in the owner calendar; 404 for a missing activity', async () => {
        install([]);
        const view = await activityService.create(meeting(), PALAK);
        await expectHttp(calendarSyncActions.sendInvites(view.id, PALAK), 409, 'CALENDAR_NOT_SYNCED');
        await expectHttp(calendarSyncActions.retry(view.id, PALAK), 409, 'CALENDAR_NOT_SYNCED');
        await expectHttp(calendarSyncActions.sendInvites('missing', PALAK), 404);
    });
});

describe('retry / add again', () => {
    it('a refused push goes back to pending with attempts reset; only the owner or an editor may retry', async () => {
        install();
        const view = await activityService.create(meeting(), PALAK);
        Object.assign(linkOf(view.id), { state: 'error', dirtyAt: null, attempts: 3, lastErrorCode: 'invalid', nextAttemptAt: new Date(Date.now() + HOUR) });
        await expectHttp(calendarSyncActions.retry(view.id, RAVI), 403);
        const retried = await calendarSyncActions.retry(view.id, ASHA);
        const link = linkOf(view.id);
        assert.equal(link.state, 'pending');
        assert.equal(link.attempts, 0);
        assert.equal(link.nextAttemptAt, null);
        assert.ok(link.dirtyAt);
        assert.equal(retried.calendar?.state, 'pending');
        assert.deepEqual(woken.slice(-1), [link.id]);
        assert.equal((await pushLink(link.id)).status, 'done');
        assert.equal(linkOf(view.id).state, 'synced');
        assert.equal(linkOf(view.id).lastErrorCode, null);
    });

    it('add again: an event deleted in the calendar comes back as a new copy, even when the sweep pushes it', async () => {
        install();
        const view = await activityService.create(meeting(), PALAK);
        await pushLink(linkOf(view.id).id);
        const oldId = linkOf(view.id).externalEventId;
        Object.assign(linkOf(view.id), { state: 'removed_remote', dirtyAt: null });
        await calendarSyncActions.retry(view.id, PALAK);
        const link = linkOf(view.id);
        assert.equal(link.generation, 1);
        assert.equal(link.externalEventId, null);
        assert.equal(link.requestedId, requestedIdFor(view.id, 'c1', 1));
        const result = await pushLink(link.id);
        assert.equal(result.status === 'done' && result.action, 'create');
        assert.notEqual(linkOf(view.id).externalEventId, oldId);
        assert.equal(linkOf(view.id).state, 'synced');
    });

    it("add again by someone other than the owner makes a private copy: the guests aren't invited again from the owner's mailbox (D41)", async () => {
        install();
        const view = await activityService.create(meeting({ attendees: [{ kind: 'email', email: 'buyer@acme.com' }] }), PALAK);
        await pushLink(linkOf(view.id).id);
        assert.equal(linkOf(view.id).invites, 'send');
        Object.assign(linkOf(view.id), { state: 'removed_remote', dirtyAt: null });
        // While the event is gone there is nothing to send: no invitations box, and the endpoint refuses.
        const gone = await activityService.getById(view.id, PALAK);
        assert.equal(gone.calendar?.invitesWaiting, false);
        assert.equal(gone.calendar?.canSendInvites, false);
        await expectHttp(calendarSyncActions.sendInvites(view.id, PALAK), 409, 'CALENDAR_SYNC_NOT_RETRYABLE');
        assert.equal(state.audits.filter((a) => a.action === 'SEND_INVITES').length, 0);

        const calls = fakeProviderState.eventCalls.length;
        const again = await calendarSyncActions.retry(view.id, ASHA);
        const link = linkOf(view.id);
        assert.equal(link.invites, 'withhold');
        assert.equal(link.heldAttendeesJson, null);
        assert.equal(again.calendar?.invitesWaiting, true, 'waiting for the owner');
        const held = state.notifications.filter((n) => n.kind === 'calendar_invites_held');
        assert.equal(held.length, 1);
        assert.equal(held[0].username, 'palak');
        assert.match(held[0].title, /Asha Rao added a meeting with 1 guest/);
        const result = await pushLink(link.id);
        assert.equal(result.status === 'done' && result.action, 'create');
        const create = fakeProviderState.eventCalls.slice(calls).find((c) => c.op === 'create');
        assert.notEqual(create?.sendUpdates, true, 'nobody mailed');
        assert.equal(fakeProviderState.events.get(linkOf(view.id).externalEventId as string)?.attendees, undefined, 'no guests on the new copy');
    });

    it("the owner's own add again keeps the invitations", async () => {
        install();
        const view = await activityService.create(meeting({ attendees: [{ kind: 'email', email: 'buyer@acme.com' }] }), PALAK);
        await pushLink(linkOf(view.id).id);
        Object.assign(linkOf(view.id), { state: 'removed_remote', dirtyAt: null });
        await calendarSyncActions.retry(view.id, PALAK);
        assert.equal(linkOf(view.id).invites, 'send');
        assert.equal(state.notifications.filter((n) => n.kind === 'calendar_invites_held').length, 0);
    });

    it('add again refuses an activity that is no longer upcoming; a repeating series is never retried', async () => {
        install();
        const view = await activityService.create(meeting(), PALAK);
        await pushLink(linkOf(view.id).id);
        state.activities.find((a) => a.id === view.id)!.status = 'Completed';
        Object.assign(linkOf(view.id), { state: 'removed_remote', dirtyAt: null });
        await expectHttp(calendarSyncActions.retry(view.id, PALAK), 409, 'CALENDAR_SYNC_NOT_RETRYABLE');
        Object.assign(linkOf(view.id), { state: 'unsupported' });
        await expectHttp(calendarSyncActions.retry(view.id, PALAK), 409, 'CALENDAR_SYNC_NOT_RETRYABLE');
        await expectHttp(calendarSyncActions.sendInvites(view.id, PALAK), 409, 'CALENDAR_SYNC_NOT_RETRYABLE');
    });
});
