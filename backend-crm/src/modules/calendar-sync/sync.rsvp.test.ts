import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type { FormConfigsPayload } from '../form-configs/formConfig.service.js';
import type { AuthUser } from '../../types/user.types.js';
import { activityService } from '../activities/activity.service.js';
import { EMPTY_CONFIGS, installActivityDouble, restoreActivityDouble, type ActivityDoubleState } from '../activities/testing/activityDouble.js';
import { fakeProviderState, resetFakeProvider } from './providers/fake.js';
import { ProviderAuthError, resetProviderPauses } from './providers/http.js';
import { setFakeHealth, setFakeProviderEnabledForTests } from './providers/registry.js';
import { rsvpJobId } from './sync.keys.js';
import { pullConnection, resetPullStateForTests } from './sync.pull.js';
import { pushLink } from './sync.push.js';
import { runRsvp, runRsvpInline, setInlineRsvpForTests, type RsvpJobData, type RsvpResult } from './sync.rsvp.js';
import { setInlinePushForTests } from './sync.wake.js';
import { blankConnection, type ConnectionRowState } from './testing/connectionDouble.js';
import { setTokenSourceForTests } from './tokenSource.js';

/**
 * Replies CRM → calendar (Calendar Phase 2 spec §13.3, P2-8): a colleague invited to a CRM meeting answers in the CRM;
 * the `rsvp` job finds their copy by iCalUID (lazy attendee link), sends the reply, and the next pull reads it back as
 * an echo. Switches off → CRM only. A refusal (first-run check F3) is recorded on the link and marks nothing unhealthy.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const inDays = (days: number) => new Date(Math.floor((Date.now() + days * DAY) / 60_000) * 60_000);

const PALAK: AuthUser = { id: 1, username: 'palak', role: 'user' };
const ASHA: AuthUser = { id: 2, username: 'asha', role: 'user' };
const USERS = [
    { username: 'palak', fullName: 'Palak Shah', isActive: true, email: 'palak@nandiniinfosys.com' },
    { username: 'asha', fullName: 'Asha Rao', isActive: true, email: 'asha@nandiniinfosys.com' },
];

const configs = (allowMeetingImport: boolean) =>
    ({ ...EMPTY_CONFIGS, moduleSettings: { activities: { calendarSync: { companyDomains: ['nandiniinfosys.com'], allowMeetingImport } } } }) as unknown as FormConfigsPayload;
const conn = (over: Partial<ConnectionRowState> = {}) =>
    blankConnection({ id: 'c1', username: 'palak', provider: 'fake', accountEmail: 'palak@nandiniinfosys.com', status: 'ok', backfilledAt: new Date(0), backfillCount: 0, ...over });

let state: ActivityDoubleState;
let queued: RsvpJobData[];

function install(opts: { allow?: boolean; importing?: string[] } = {}) {
    state = installActivityDouble({
        users: USERS,
        connections: [conn(), conn({ id: 'c2', username: 'asha', accountEmail: 'asha@nandiniinfosys.com' })],
        calendarSyncUsers: (opts.importing ?? ['asha']).map((username) => ({ username, importMeetings: true })),
        configs: configs(opts.allow ?? true),
    });
}

/** Palak's CRM meeting with Asha invited, pushed to the fake calendar (Asha's copy is the same stored event). */
async function invitedMeeting() {
    const view = await activityService.create(
        {
            followupType: 'Meeting',
            subject: 'Pricing review',
            assignedTo: 'palak',
            startAt: inDays(2).toISOString(),
            endAt: new Date(inDays(2).getTime() + HOUR).toISOString(),
            attendees: [{ kind: 'user', username: 'asha' }],
        },
        PALAK,
    );
    const link = state.links.find((l) => l.activityId === view.id) as { id: string };
    assert.equal((await pushLink(link.id)).status, 'done');
    const eventId = state.links.find((l) => l.activityId === view.id)?.externalEventId as string;
    return { id: view.id, eventId };
}

const ashaReplyInCalendar = (eventId: string) => fakeProviderState.events.get(eventId)?.attendees?.find((a) => a.email === 'asha@nandiniinfosys.com')?.responseStatus;

beforeEach(() => {
    resetFakeProvider();
    resetProviderPauses();
    resetPullStateForTests();
    setFakeHealth('unknown', null);
    setFakeProviderEnabledForTests(true);
    setTokenSourceForTests(null);
    setInlinePushForTests(() => undefined);
    queued = [];
    setInlineRsvpForTests((data) => queued.push(data));
});

afterEach(() => {
    restoreActivityDouble();
    setFakeProviderEnabledForTests(null);
    setInlinePushForTests(null);
    setInlineRsvpForTests(null);
});

describe('rsvp: CRM → calendar', () => {
    it('a reply in the CRM goes to the colleague’s copy (lazy link by iCalUID); the next pull reads it as an echo', async () => {
        install();
        const { id, eventId } = await invitedMeeting();
        assert.equal(ashaReplyInCalendar(eventId), 'needsAction');

        await activityService.respond(id, { responseStatus: 'accepted' }, ASHA);
        assert.deepEqual(queued, [{ activityId: id, username: 'asha' }], 'the rsvp job was queued (run in-process without Redis)');

        const result = await runRsvp(id, 'asha');
        assert.deepEqual(result, { status: 'done', reply: 'accepted' });
        assert.equal(ashaReplyInCalendar(eventId), 'accepted', 'her copy carries the reply');
        const calls = fakeProviderState.eventCalls.filter((c) => c.mailbox === 'asha@nandiniinfosys.com').map((c) => c.op);
        assert.deepEqual(calls, ['find', 'respond']);
        const link = state.links.find((l) => l.activityId === id && l.connectionId === 'c2');
        assert.equal(link?.role, 'attendee');
        assert.equal(link?.externalEventId, eventId);
        assert.equal(link?.baseJson, JSON.stringify({ self: 'accepted' }));
        assert.equal(state.connections.find((c) => c.id === 'c2')?.leaseId, null, 'lease released');

        // A second reply uses the link (no lookup).
        await activityService.respond(id, { responseStatus: 'declined' }, ASHA);
        assert.equal((await runRsvp(id, 'asha')).status, 'done');
        assert.equal(ashaReplyInCalendar(eventId), 'declined');
        assert.equal(fakeProviderState.eventCalls.filter((c) => c.op === 'find').length, 1);

        // Asha's pull: her own reply coming back changes nothing.
        const audits = state.audits.length;
        const pulled = await pullConnection('c2', 'poll');
        assert.equal(pulled.status, 'done');
        const attendee = state.attendees.find((a) => a.activityId === id && a.username === 'asha');
        assert.equal(attendee?.responseStatus, 'declined');
        assert.equal(state.audits.length, audits, 'nothing written');
    });

    it('switches off (company or person): the reply stays in the CRM, nothing is queued', async () => {
        install({ allow: false });
        const { id, eventId } = await invitedMeeting();
        await activityService.respond(id, { responseStatus: 'accepted' }, ASHA);
        assert.deepEqual(queued, []);
        assert.deepEqual(await runRsvp(id, 'asha'), { status: 'skipped', reason: 'not_replying' });
        assert.equal(ashaReplyInCalendar(eventId), 'needsAction');
        restoreActivityDouble();

        install({ importing: [] });
        const second = await invitedMeeting();
        await activityService.respond(second.id, { responseStatus: 'accepted' }, ASHA);
        assert.deepEqual(queued, []);
    });

    it('a refusal (F3: the narrow Google scope may not write an invitation copy) is recorded on the link; nothing marked unhealthy', async () => {
        install();
        const { id, eventId } = await invitedMeeting();
        await activityService.respond(id, { responseStatus: 'tentative' }, ASHA);
        fakeProviderState.failNext.respond = new ProviderAuthError({ provider: 'fake', operation: 'rsvp', status: 403, code: 'insufficientPermissions' });
        const result = await runRsvp(id, 'asha');
        assert.deepEqual(result, { status: 'refused', code: 'scopes_not_authorised' });
        const link = state.links.find((l) => l.activityId === id && l.connectionId === 'c2');
        assert.equal(link?.lastErrorCode, 'rsvp_refused');
        const row = state.connections.find((c) => c.id === 'c2');
        assert.equal(row?.status, 'ok');
        assert.equal(row?.consecutiveFailures, 0);
        assert.equal(ashaReplyInCalendar(eventId), 'needsAction');
        assert.equal(state.attendees.find((a) => a.activityId === id && a.username === 'asha')?.responseStatus, 'tentative', 'the CRM keeps the reply');

        // The next reply goes through and clears the error.
        assert.equal((await runRsvp(id, 'asha')).status, 'done');
        assert.equal(state.links.find((l) => l.activityId === id && l.connectionId === 'c2')?.lastErrorCode, null);
    });

    it('nothing to send: the owner, someone not invited, no reply, a meeting not in their calendar', async () => {
        install({ importing: ['palak', 'asha'] });
        const { id } = await invitedMeeting();
        assert.deepEqual(await runRsvp(id, 'palak'), { status: 'skipped', reason: 'owner' });
        assert.deepEqual(await runRsvp(id, 'asha'), { status: 'skipped', reason: 'no_reply' });
        fakeProviderState.events.clear();
        await activityService.respond(id, { responseStatus: 'accepted' }, ASHA);
        assert.deepEqual(await runRsvp(id, 'asha'), { status: 'skipped', reason: 'not_in_calendar' });
    });

    it('handing the meeting to the invitee: their attendee link becomes their organizer link (one link per calendar)', async () => {
        install();
        const { id } = await invitedMeeting();
        await activityService.respond(id, { responseStatus: 'accepted' }, ASHA);
        assert.equal((await runRsvp(id, 'asha')).status, 'done');
        const view = await activityService.getById(id, PALAK);
        await activityService.update(id, { ...view, assignedTo: 'asha', attendees: [{ kind: 'user', username: 'palak' }] }, PALAK);
        const links = state.links.filter((l) => l.activityId === id && l.connectionId === 'c2');
        assert.equal(links.length, 1);
        assert.equal(links[0].role, 'organizer');
        assert.equal(links[0].state, 'pending');
        assert.equal(links[0].externalEventId, null, 'starts afresh: her copy was Palak’s event');
        assert.ok(links[0].dirtyAt);
    });

    it('without Redis: a busy lease, a rate limit or a transient failure is tried again in-process, a few times at most', async () => {
        const waits: number[] = [];
        const wait = async (ms: number) => void waits.push(ms);
        const script = (...steps: (RsvpResult | Error)[]) => {
            let i = 0;
            return async () => {
                const step = steps[Math.min(i++, steps.length - 1)];
                if (step instanceof Error) throw step;
                return step;
            };
        };
        const data = { activityId: 'a1', username: 'asha' };
        const done: RsvpResult = { status: 'done', reply: 'accepted' };
        assert.deepEqual(await runRsvpInline(data, { run: script({ status: 'busy' }, { status: 'rate_limited', retryAfterMs: 2_000 }, new Error('503'), done), wait }), done);
        assert.equal(waits.length, 3);
        assert.ok(waits[0] >= 5_000 && waits[1] >= 2_000 && waits[2] === 45_000, JSON.stringify(waits));

        waits.length = 0;
        assert.equal(await runRsvpInline(data, { run: script({ status: 'busy' }), wait, attempts: 3 }), null, 'gives up; the reply stays in the CRM');
        assert.equal(waits.length, 2);
        waits.length = 0;
        assert.deepEqual(await runRsvpInline(data, { run: script({ status: 'skipped', reason: 'owner' }), wait }), { status: 'skipped', reason: 'owner' });
        assert.equal(waits.length, 0, 'finished results are not retried');
    });

    it('job id: rsvp-<activityId>-<username>-<respondedAtMs>, no colon', () => {
        const id = rsvpJobId('a1', 'Asha', new Date(1_764_000_000_000));
        assert.equal(id, 'rsvp-a1-asha-1764000000000');
        assert.ok(!id.includes(':'));
    });
});
