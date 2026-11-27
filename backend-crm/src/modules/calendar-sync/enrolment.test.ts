import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { configureSecretBox } from '../../services/secretBox.js';
import { calendarConnectionUserLockKey } from './connection.constants.js';
import { planEnrolment, reconcileAll, reconcileUser, resolveTarget, runDueChecks, setCheckSchedulerForTests, type PlanRow, type TargetProvider } from './enrolment.js';
import { fakeProviderState, resetFakeProvider } from './providers/fake.js';
import { setFakeHealth, setFakeProviderEnabledForTests } from './providers/registry.js';
import {
    blankConnection,
    configsWithDomains,
    googleProviderRow,
    installConnectionDouble,
    restoreConnectionDouble,
    useTestSecretBox,
    type DoubleState,
    type UserRow,
} from './testing/connectionDouble.js';
import { setTokenSourceForTests } from './tokenSource.js';

/** Automatic enrolment (addendum AC5, AC6, AC10): the pure rules, then reconcile against the in-memory double. */

const COMPANY = ['nandiniinfosys.com', 'nandini.in'];
const active = (email: string | null) => ({ isActive: true, isGroupUser: false, email });
const google: TargetProvider = { key: 'google', enabled: true, configured: true, domains: ['nandiniinfosys.com'] };
const microsoft: TargetProvider = { key: 'microsoft', enabled: true, configured: true, domains: ['nandini.in'] };
const fake: TargetProvider = { key: 'fake', enabled: true, configured: true, domains: [] };

describe('resolveTarget', () => {
    const providers = [google, microsoft, fake];
    const cases: [string, Parameters<typeof resolveTarget>[0], Parameters<typeof resolveTarget>[1], readonly TargetProvider[], boolean, ReturnType<typeof resolveTarget>][] = [
        ['inactive user', { isActive: false, isGroupUser: false, email: 'a@nandiniinfosys.com' }, null, providers, false, { none: 'inactive' }],
        ['group login', { isActive: true, isGroupUser: true, email: 'desk@nandiniinfosys.com' }, null, providers, false, { none: 'group' }],
        ['no email', active(null), null, providers, false, { none: 'no_email' }],
        ['blank email', active('  '), null, providers, false, { none: 'no_email' }],
        ['excluded (beats an override)', active('a@nandiniinfosys.com'), { provider: 'microsoft', excluded: true }, providers, false, { none: 'excluded' }],
        ['personal email', active('a@gmail.com'), null, providers, false, { none: 'not_company' }],
        ['domain → Google (email lower-cased)', active('Asha@NandiniInfosys.com'), null, providers, false, { provider: 'google', email: 'asha@nandiniinfosys.com', source: 'domain' }],
        ['domain → Microsoft', active('a@nandini.in'), null, providers, false, { provider: 'microsoft', email: 'a@nandini.in', source: 'domain' }],
        ['override → Microsoft on a Google domain', active('a@nandiniinfosys.com'), { provider: 'microsoft', excluded: false }, providers, false, { provider: 'microsoft', email: 'a@nandiniinfosys.com', source: 'override' }],
        ['override to a switched-off provider', active('a@nandiniinfosys.com'), { provider: 'microsoft', excluded: false }, [google, { ...microsoft, enabled: false }], false, { none: 'provider_off' }],
        ['domain owner switched off', active('a@nandiniinfosys.com'), null, [{ ...google, enabled: false }, microsoft], false, { none: 'provider_off' }],
        ['domain owner without credentials', active('a@nandiniinfosys.com'), null, [{ ...google, configured: false }], false, { none: 'provider_off' }],
        ['no provider claims the domain', active('a@nandiniinfosys.com'), null, [microsoft], false, { none: 'no_provider' }],
        ['the fake takes unclaimed company domains when on', active('a@nandiniinfosys.com'), null, [microsoft, fake], true, { provider: 'fake', email: 'a@nandiniinfosys.com', source: 'domain' }],
        ['… never when off', active('a@nandiniinfosys.com'), null, [microsoft, fake], false, { none: 'no_provider' }],
        ['… and never over a real owner', active('a@nandini.in'), null, [microsoft, fake], true, { provider: 'microsoft', email: 'a@nandini.in', source: 'domain' }],
        ['override to the fake while it is off', active('a@nandiniinfosys.com'), { provider: 'fake', excluded: false }, providers, false, { none: 'provider_off' }],
        ['unknown override value reads as none', active('a@nandiniinfosys.com'), { provider: 'zoom', excluded: false }, providers, false, { provider: 'google', email: 'a@nandiniinfosys.com', source: 'domain' }],
    ];
    for (const [name, user, choice, list, fakeOn, expected] of cases) {
        it(name, () => assert.deepEqual(resolveTarget(user, choice, list, COMPANY, fakeOn), expected));
    }
});

describe('planEnrolment', () => {
    const row = (over: Partial<PlanRow> = {}): PlanRow => ({ id: 'c1', provider: 'google', accountEmail: 'a@nandiniinfosys.com', status: 'ok', statusReason: null, source: 'domain', ...over });
    const target = { provider: 'google' as const, email: 'a@nandiniinfosys.com', source: 'domain' as const };

    it('no target: stop the live row with the matching reason, else nothing', () => {
        assert.deepEqual(planEnrolment(row(), [], { none: 'excluded' }), { action: 'stop', id: 'c1', reason: 'excluded' });
        assert.deepEqual(planEnrolment(row(), [], { none: 'inactive' }), { action: 'stop', id: 'c1', reason: 'user_inactive' });
        assert.deepEqual(planEnrolment(row(), [], { none: 'group' }), { action: 'stop', id: 'c1', reason: 'user_inactive' });
        assert.deepEqual(planEnrolment(row(), [], { none: 'no_email' }), { action: 'stop', id: 'c1', reason: 'no_email' });
        assert.deepEqual(planEnrolment(row(), [], { none: 'not_company' }), { action: 'stop', id: 'c1', reason: 'no_email' });
        assert.deepEqual(planEnrolment(row(), [], { none: 'provider_off' }), { action: 'stop', id: 'c1', reason: 'provider_removed' });
        assert.deepEqual(planEnrolment(null, [], { none: 'no_provider' }), { action: 'none' });
    });

    it('same provider and mailbox (any case, any status): nothing', () => {
        assert.deepEqual(planEnrolment(row({ accountEmail: 'A@NandiniInfosys.com', status: 'error' }), [], target), { action: 'none' });
    });

    it('no live row: reactivate the newest stopped row of the same identity, but never an oauth_retired one', () => {
        assert.deepEqual(planEnrolment(null, [], target), { action: 'create' });
        assert.deepEqual(planEnrolment(null, [row({ id: 'old', status: 'stopped', statusReason: 'excluded' })], target), { action: 'reactivate', id: 'old' });
        assert.deepEqual(planEnrolment(null, [row({ id: 'old', status: 'stopped', statusReason: 'oauth_retired' })], target), { action: 'create' });
    });

    it('a different identity replaces the live row: provider_changed / email_changed', () => {
        assert.deepEqual(planEnrolment(row({ provider: 'microsoft' }), [], target), { action: 'replace', stopId: 'c1', reason: 'provider_changed', then: 'create' });
        assert.deepEqual(planEnrolment(row({ accountEmail: 'old@nandiniinfosys.com' }), [row({ id: 'back', status: 'stopped', statusReason: 'email_changed' })], target), {
            action: 'replace',
            stopId: 'c1',
            reason: 'email_changed',
            then: { reactivate: 'back' },
        });
    });
});

const now = new Date('2026-11-26T06:00:00.000Z');
const user = (id: number, username: string, over: Partial<UserRow> = {}): UserRow => ({ id, username, fullName: username, email: `${username}@nandiniinfosys.com`, isActive: true, isGroupUser: false, ...over });

describe('reconcileUser / reconcileAll', () => {
    let state: DoubleState;
    let scheduled: string[];

    beforeEach(() => {
        resetFakeProvider();
        setFakeHealth('unknown', null);
        setFakeProviderEnabledForTests(true);
        setTokenSourceForTests(null);
        scheduled = [];
        setCheckSchedulerForTests((id) => scheduled.push(id));
    });

    afterEach(() => {
        restoreConnectionDouble();
        setFakeProviderEnabledForTests(null);
        setCheckSchedulerForTests(null);
        configureSecretBox(null);
    });

    it('enrols a person as pending under their lock, audits ENROL and schedules the first check; a second run does nothing', async () => {
        state = installConnectionDouble({ users: [user(1, 'asha')] });
        const result = await reconcileUser('asha', 'user_created', { actor: 'admin', now });
        assert.equal(result.action, 'create');
        const row = state.connections[0];
        assert.equal(row.status, 'pending');
        assert.equal(row.provider, 'fake');
        assert.equal(row.accountEmail, 'asha@nandiniinfosys.com');
        assert.equal(row.source, 'domain');
        assert.deepEqual(scheduled, [row.id]);
        assert.deepEqual(state.locks, [calendarConnectionUserLockKey('asha')]);
        assert.equal(state.audits[0].action, 'ENROL');
        assert.equal(state.audits[0].changedBy, 'admin');
        assert.deepEqual((await reconcileUser('asha', 'nightly', { now })).action, 'none');
        assert.equal(state.connections.length, 1);
    });

    it('exclusion stops the row (kept for history); removing it reactivates the same row', async () => {
        state = installConnectionDouble({ users: [user(1, 'asha')], connections: [blankConnection({ id: 'c1', username: 'asha', provider: 'fake', accountEmail: 'asha@nandiniinfosys.com', status: 'ok' }, now)] });
        state.syncUsers.push({ username: 'asha', provider: null, excluded: true, note: 'On leave', importMeetings: false, updatedBy: 'admin', createdAt: now, updatedAt: now });
        assert.deepEqual(await reconcileUser('asha', 'person_saved', { actor: 'admin', now }), { action: 'stop', stopReason: 'excluded' });
        assert.equal(state.connections[0].status, 'stopped');
        assert.equal(state.connections[0].statusReason, 'excluded');
        assert.equal(state.connections[0].stoppedBy, 'admin');
        assert.equal(state.audits.at(-1)?.action, 'STOP');

        state.syncUsers = [];
        const back = await reconcileUser('asha', 'person_saved', { now });
        assert.deepEqual(back, { action: 'reactivate', connectionId: 'c1' });
        assert.equal(state.connections.length, 1);
        assert.equal(state.connections[0].status, 'pending');
        assert.equal(state.connections[0].stoppedAt, null);
    });

    it('stopping detaches the row’s links (events stay, nothing pushed); re-activating re-attaches the current ones as dirty', async () => {
        const DAY = 24 * 60 * 60_000;
        state = installConnectionDouble({
            users: [user(1, 'asha')],
            connections: [blankConnection({ id: 'c1', username: 'asha', provider: 'fake', accountEmail: 'asha@nandiniinfosys.com', status: 'ok' }, now)],
            links: [
                { id: 'l-up', connectionId: 'c1', activityId: 'a-up', state: 'synced', dirtyAt: null },
                { id: 'l-dirty', connectionId: 'c1', activityId: 'a-dirty', state: 'pending', dirtyAt: now },
                { id: 'l-old', connectionId: 'c1', activityId: 'a-old', state: 'synced', dirtyAt: null },
                { id: 'l-moved', connectionId: 'c1', activityId: 'a-moved', state: 'synced', dirtyAt: null },
                // P2-8: invitation copies (attendee links): a colleague's live meeting, and one in the bin.
                { id: 'l-guest', connectionId: 'c1', activityId: 'a-guest', role: 'attendee', state: 'synced', etag: '"e1"', dirtyAt: null },
                { id: 'l-binned', connectionId: 'c1', activityId: 'a-binned', role: 'attendee', state: 'synced', etag: '"e2"', dirtyAt: null },
            ],
            activities: [
                { id: 'a-up', assignedTo: 'asha', isDeleted: false, endAt: new Date(now.getTime() + DAY) },
                { id: 'a-dirty', assignedTo: 'asha', isDeleted: false, endAt: new Date(now.getTime() + 2 * DAY) },
                { id: 'a-old', assignedTo: 'asha', isDeleted: false, endAt: new Date(now.getTime() - 3 * DAY) },
                { id: 'a-moved', assignedTo: 'ravi', isDeleted: false, endAt: new Date(now.getTime() + DAY) },
                { id: 'a-guest', assignedTo: 'ravi', isDeleted: false, endAt: new Date(now.getTime() + DAY) },
                { id: 'a-binned', assignedTo: 'ravi', isDeleted: true, endAt: new Date(now.getTime() + DAY) },
            ],
        });
        state.syncUsers.push({ username: 'asha', provider: null, excluded: true, note: null, importMeetings: false, updatedBy: 'admin', createdAt: now, updatedAt: now });
        await reconcileUser('asha', 'person_saved', { actor: 'admin', now });
        assert.ok(state.links.every((l) => l.state === 'detached' && l.dirtyAt === null));

        state.syncUsers = [];
        const later = new Date(now.getTime() + 60_000);
        await reconcileUser('asha', 'person_saved', { now: later });
        const byId = Object.fromEntries(state.links.map((l) => [l.id, l]));
        assert.equal(byId['l-up'].state, 'pending');
        assert.equal((byId['l-up'].dirtyAt as Date).getTime(), later.getTime());
        assert.equal(byId['l-dirty'].state, 'pending');
        assert.equal(byId['l-old'].state, 'detached', 'ended long ago: left alone');
        assert.equal(byId['l-moved'].state, 'detached', 'someone else owns it now');
        // P2-8: the live invitation copy comes back live with no etag (the first pull reads it back); not dirty.
        assert.equal(byId['l-guest'].state, 'synced');
        assert.equal(byId['l-guest'].etag, null);
        assert.equal(byId['l-guest'].dirtyAt, null);
        assert.equal(byId['l-binned'].state, 'detached', 'its meeting is in the bin');
    });

    it('a changed email replaces the row (email_changed); an override records source=override on the same row', async () => {
        state = installConnectionDouble({
            users: [user(1, 'asha', { email: 'asha.rao@nandiniinfosys.com' })],
            connections: [blankConnection({ id: 'c1', username: 'asha', provider: 'fake', accountEmail: 'asha@nandiniinfosys.com', status: 'ok' }, now)],
        });
        const result = await reconcileUser('asha', 'email_changed', { now });
        assert.equal(result.action, 'replace');
        assert.equal(result.stopReason, 'email_changed');
        assert.equal(state.connections.find((c) => c.id === 'c1')?.status, 'stopped');
        const live = state.connections.find((c) => c.status === 'pending')!;
        assert.equal(live.accountEmail, 'asha.rao@nandiniinfosys.com');

        state.syncUsers.push({ username: 'asha', provider: 'fake', excluded: false, note: null, importMeetings: false, updatedBy: 'admin', createdAt: now, updatedAt: now });
        assert.equal((await reconcileUser('asha', 'person_saved', { now })).action, 'none');
        assert.equal(live.source, 'override');
    });

    it('deactivation, a personal email, or no provider stop the row with their reasons', async () => {
        state = installConnectionDouble({
            users: [user(1, 'asha', { isActive: false }), user(2, 'ravi', { email: 'ravi@gmail.com' }), user(3, 'meera')],
            connections: [
                blankConnection({ id: 'a', username: 'asha', provider: 'fake', accountEmail: 'asha@nandiniinfosys.com', status: 'ok' }, now),
                blankConnection({ id: 'r', username: 'ravi', provider: 'fake', accountEmail: 'ravi@nandiniinfosys.com', status: 'ok' }, now),
                blankConnection({ id: 'm', username: 'meera', provider: 'fake', accountEmail: 'meera@nandiniinfosys.com', status: 'error' }, now),
            ],
        });
        assert.equal((await reconcileUser('asha', 'user_deactivated', { now })).stopReason, 'user_inactive');
        assert.equal((await reconcileUser('ravi', 'email_changed', { now })).stopReason, 'no_email');
        setFakeProviderEnabledForTests(false);
        assert.equal((await reconcileUser('meera', 'provider_saved', { now })).stopReason, 'provider_removed');
        assert.ok(state.connections.every((c) => c.status === 'stopped'));
    });

    it('a mailbox still held by someone else: that holder is reconciled first (outside the transaction), then this person', async () => {
        // Ravi's email moved on; his live row still holds shared@, now Asha's email.
        state = installConnectionDouble({
            users: [user(1, 'asha', { email: 'shared@nandiniinfosys.com' }), user(2, 'ravi')],
            connections: [blankConnection({ id: 'r', username: 'ravi', provider: 'fake', accountEmail: 'shared@nandiniinfosys.com', status: 'ok' }, now)],
        });
        const result = await reconcileUser('asha', 'email_changed', { now });
        assert.equal(result.action, 'create');
        const live = state.connections.filter((c) => c.status === 'pending');
        assert.deepEqual(live.map((c) => [c.username, c.accountEmail]).sort(), [
            ['asha', 'shared@nandiniinfosys.com'],
            ['ravi', 'ravi@nandiniinfosys.com'],
        ]);
        assert.equal(state.connections.find((c) => c.id === 'r')?.statusReason, 'email_changed');
    });

    it('a holder that still owns the mailbox wins; the other person is skipped without an error', async () => {
        state = installConnectionDouble({
            users: [user(1, 'asha', { email: 'shared@nandiniinfosys.com' }), user(2, 'ravi', { email: 'shared@nandiniinfosys.com' })],
            connections: [blankConnection({ id: 'r', username: 'ravi', provider: 'fake', accountEmail: 'shared@nandiniinfosys.com', status: 'ok' }, now)],
        });
        assert.deepEqual(await reconcileUser('asha', 'email_changed', { now }), { action: 'none' });
        assert.equal(state.connections.length, 1);
    });

    it('domains route people to Google; a stopped oauth_retired row is never reused', async () => {
        useTestSecretBox();
        state = installConnectionDouble({
            users: [user(1, 'asha'), user(2, 'ravi', { email: 'ravi@nandini.in' })],
            providers: [googleProviderRow({ domains: ['nandiniinfosys.com'] })],
            connections: [blankConnection({ id: 'old', username: 'asha', provider: 'google', accountEmail: 'asha@nandiniinfosys.com', status: 'stopped', statusReason: 'oauth_retired' }, now)],
            configs: configsWithDomains(['nandiniinfosys.com', 'nandini.in']),
        });
        setFakeProviderEnabledForTests(false);
        const result = await reconcileUser('asha', 'nightly', { now });
        assert.equal(result.action, 'create');
        assert.notEqual(result.connectionId, 'old');
        assert.equal(state.connections.find((c) => c.id === result.connectionId)?.provider, 'google');
        assert.equal((await reconcileUser('ravi', 'nightly', { now })).action, 'none', 'nandini.in has no provider');
    });

    it('reconcileAll: enrols everyone due, stops rows of people who left or were deleted, counts the changes', async () => {
        state = installConnectionDouble({
            users: [user(1, 'asha'), user(2, 'ravi'), user(3, 'gone', { isActive: false }), user(4, 'desk', { isGroupUser: true }), user(5, 'meera', { email: null })],
            connections: [
                blankConnection({ id: 'r', username: 'ravi', provider: 'fake', accountEmail: 'ravi@nandiniinfosys.com', status: 'ok' }, now),
                blankConnection({ id: 'g', username: 'gone', provider: 'fake', accountEmail: 'gone@nandiniinfosys.com', status: 'ok' }, now),
                blankConnection({ id: 'x', username: 'deleted', provider: 'fake', accountEmail: 'deleted@nandiniinfosys.com', status: 'error' }, now),
            ],
        });
        const result = await reconcileAll('nightly');
        assert.equal(result.changed, 3);
        assert.equal(result.failed, 0);
        const byUser = Object.fromEntries(state.connections.map((c) => [c.username, `${c.status}:${c.statusReason ?? ''}`]));
        assert.deepEqual(byUser, { asha: 'pending:', ravi: 'ok:', gone: 'stopped:user_inactive', deleted: 'stopped:user_inactive' });
        assert.equal((await reconcileAll('nightly')).changed, 0);
    });

    it('runDueChecks: pending rows and error rows past their backoff are checked; the fake answers ok', async () => {
        state = installConnectionDouble({
            users: [user(1, 'asha'), user(2, 'ravi'), user(3, 'meera')],
            connections: [
                blankConnection({ id: 'a', username: 'asha', provider: 'fake', accountEmail: 'asha@nandiniinfosys.com', status: 'pending' }, now),
                blankConnection({ id: 'r', username: 'ravi', provider: 'fake', accountEmail: 'ravi@nandiniinfosys.com', status: 'error', nextCheckAt: new Date(now.getTime() - 1) }, now),
                blankConnection({ id: 'm', username: 'meera', provider: 'fake', accountEmail: 'meera@nandiniinfosys.com', status: 'error', nextCheckAt: new Date(now.getTime() + 60_000) }, now),
            ],
        });
        assert.deepEqual(await runDueChecks(now), { checked: 2, ok: 2 });
        assert.deepEqual(fakeProviderState.probes.sort(), ['asha@nandiniinfosys.com', 'ravi@nandiniinfosys.com']);
        assert.equal(state.connections.find((c) => c.id === 'm')?.status, 'error');
    });
});
