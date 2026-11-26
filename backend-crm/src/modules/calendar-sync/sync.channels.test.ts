import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { ENV } from '../../config/env.js';
import { configureSecretBox, parseKeyRing, secretBox } from '../../services/secretBox.js';
import { reconcileUser } from './enrolment.js';
import { resetFakeProvider } from './providers/fake.js';
import { fakeWatchState, resetFakeWatch } from './providers/fakeWatch.js';
import { ProviderBadRequestError, resetProviderPauses } from './providers/http.js';
import { setFakeHealth, setFakeProviderEnabledForTests } from './providers/registry.js';
import {
    addressTag,
    CHANNEL_FAILED_RETRY_MS,
    channelToken,
    ensureChannel,
    maintainChannels,
    newChannelId,
    planChannel,
    pollIntervalMinutes,
    pullIsDue,
    runWatchJob,
    setBackgroundStopForTests,
    setInlineWatchForTests,
    signedText,
    webhookHmac,
    type ChannelRow,
    type PlanContext,
} from './sync.channels.js';
import { duePullConnections } from './sync.maintenance.js';
import { blankConnection, installConnectionDouble, restoreConnectionDouble, type ConnectionRowState, type DoubleState, type UserRow } from './testing/connectionDouble.js';
import { setTokenSourceForTests } from './tokenSource.js';

/**
 * Webhook channels (Calendar Phase 2 spec §4.5, §10.1 step 5; addendum §8.6; P2-7) on the in-memory fake provider:
 * renewal planning (< 3 days, old key id, another address), create / renew / replace / failed backoff, stop on a stopped
 * row, the nightly upkeep (existence check → re-create, strays stopped, old rows deleted, everything stopped while
 * webhooks are off) and the poll's safety-net interval.
 */

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const BASE = 'https://crm.example.com';
const TAG = addressTag(BASE);

type Integrations = { WEBHOOKS_ACTIVE: boolean; PUBLIC_API_URL: string | null; SYNC_ENABLED: boolean; POLL_MINUTES_WITH_WEBHOOKS: number };
const integrations = ENV.INTEGRATIONS as unknown as Integrations;
const saved: Integrations = { ...integrations };

const user = (id: number, username: string, over: Partial<UserRow> = {}): UserRow => ({ id, username, fullName: username, email: `${username}@nandiniinfosys.com`, isActive: true, isGroupUser: false, ...over });
const conn = (id: string, username: string, over: Partial<ConnectionRowState> = {}) => blankConnection({ id, username, provider: 'fake', accountEmail: `${username}@nandiniinfosys.com`, status: 'ok', ...over });

let now: Date;
let state: DoubleState;
let stopped: string[];
let inlineWatches: string[];

const channel = (over: Partial<ChannelRow> = {}): ChannelRow => ({
    id: newChannelId(TAG),
    connectionId: 'c1',
    provider: 'fake',
    externalId: 'fake-res-old',
    tokenKeyId: 'k1',
    generation: 1,
    expiresAt: new Date(now.getTime() + 6 * DAY),
    status: 'active',
    createdAt: new Date(now.getTime() - DAY),
    ...over,
});

const ctx = (over: Partial<PlanContext> = {}): PlanContext => ({ now, activeKid: 'k1', addressTag: TAG, canRenew: false, failedRetryMs: CHANNEL_FAILED_RETRY_MS, ...over });

function install(seed: Parameters<typeof installConnectionDouble>[0] = {}) {
    state = installConnectionDouble({ users: [user(1, 'palak'), user(2, 'asha')], connections: [conn('c1', 'palak')], ...seed });
    return state;
}

const activeChannels = () => state.channels.filter((c) => c.status === 'active');

beforeEach(() => {
    now = new Date(Math.floor(Date.now() / MIN) * MIN);
    configureSecretBox(parseKeyRing(`k1:${Buffer.alloc(32, 7).toString('base64')}`));
    resetFakeProvider();
    resetFakeWatch();
    resetProviderPauses();
    setFakeHealth('unknown', null);
    setFakeProviderEnabledForTests(true);
    setTokenSourceForTests(null);
    Object.assign(integrations, { WEBHOOKS_ACTIVE: true, PUBLIC_API_URL: BASE, SYNC_ENABLED: true, POLL_MINUTES_WITH_WEBHOOKS: 30 });
    stopped = [];
    inlineWatches = [];
    setBackgroundStopForTests((_id, channels) => stopped.push(...channels.map((c) => c.id)));
    setInlineWatchForTests((id, op) => inlineWatches.push(`${op}:${id}`));
});

afterEach(() => {
    restoreConnectionDouble();
    Object.assign(integrations, saved);
    setFakeProviderEnabledForTests(null);
    setTokenSourceForTests(null);
    setBackgroundStopForTests(null);
    setInlineWatchForTests(null);
    configureSecretBox(null);
});

describe('planChannel (pure)', () => {
    it('no channel → create; a refused try backs off 6 hours unless told otherwise', () => {
        assert.equal(planChannel([], ctx()).next.action, 'create');
        const failed = channel({ status: 'failed', externalId: null, createdAt: new Date(now.getTime() - HOUR) });
        assert.equal(planChannel([failed], ctx()).next.action, 'wait');
        assert.equal(planChannel([failed], ctx({ failedRetryMs: 0 })).next.action, 'create');
        assert.equal(planChannel([{ ...failed, createdAt: new Date(now.getTime() - 7 * HOUR) }], ctx()).next.action, 'create');
    });

    it('healthy with more than 3 days left → nothing; under 3 days → Google replace, Graph renew', () => {
        assert.equal(planChannel([channel()], ctx()).next.action, 'none');
        const expiring = channel({ expiresAt: new Date(now.getTime() + 2 * DAY) });
        assert.deepEqual(planChannel([expiring], ctx()).next, { action: 'replace', channel: expiring, why: 'expiring' });
        assert.deepEqual(planChannel([expiring], ctx({ canRenew: true })).next, { action: 'renew', channel: expiring });
        assert.equal(planChannel([channel()], ctx({ canRenew: true, forceRenew: true })).next.action, 'renew');
    });

    it('an old key id or another public address → replace', () => {
        const old = channel({ tokenKeyId: 'k0' });
        assert.deepEqual(planChannel([old], ctx()).next, { action: 'replace', channel: old, why: 'key' });
        const moved = channel({ id: newChannelId(addressTag('https://old.example.com')) });
        assert.deepEqual(planChannel([moved], ctx({ canRenew: true })).next, { action: 'replace', channel: moved, why: 'address' });
    });

    it('expired active rows are retired; older healthy duplicates are stopped', () => {
        const expired = channel({ expiresAt: new Date(now.getTime() - MIN) });
        const newer = channel({ expiresAt: new Date(now.getTime() + 6 * DAY) });
        const older = channel({ expiresAt: new Date(now.getTime() + 5 * DAY) });
        const plan = planChannel([expired, older, newer], ctx());
        assert.equal(plan.next.action, 'none');
        assert.deepEqual(plan.expired, [expired]);
        assert.deepEqual(plan.duplicates, [older]);
    });

    it('tokens: Google over the channel id, Graph over connectionId:generation; ids carry the address tag', () => {
        assert.equal(signedText('google', { id: 'w1', connectionId: 'c1', generation: 2 }), 'w1');
        assert.equal(signedText('microsoft', { id: 'w1', connectionId: 'c1', generation: 2 }), 'c1:2');
        const token = channelToken('microsoft', { id: 'w1', connectionId: 'c1', generation: 2 }, 'k1');
        assert.equal(token, webhookHmac(secretBox.webhookKey('k1'), 'c1:2'));
        assert.equal(token.length, 43, 'well inside Graph’s 128 characters');
        assert.match(newChannelId(TAG), new RegExp(`^w${TAG}-[0-9a-f-]{36}$`));
        assert.ok(newChannelId(TAG).length <= 64, 'Google channel ids are ≤ 64 characters');
    });
});

describe('ensureChannel', () => {
    it('creates the person’s channel: provider called as them with the webhook address and the HMAC token; row active', async () => {
        install();
        assert.equal(await ensureChannel('c1', { now }), 'created');
        const [row] = activeChannels();
        assert.ok(row);
        const created = fakeWatchState.channels.get(String(row.externalId));
        assert.ok(created, 'the provider has it');
        assert.equal(created.mailbox, 'palak@nandiniinfosys.com');
        assert.equal(created.address, `${BASE}/api/webhooks/google/calendar`);
        assert.equal(created.token, channelToken('fake', { id: String(row.id), connectionId: 'c1', generation: 1 }, 'k1'));
        assert.equal(row.tokenKeyId, 'k1');
        assert.equal(await ensureChannel('c1', { now }), 'none', 'a second run has nothing to do');
    });

    it('does nothing while webhooks are off, for a row that isn’t ok, or for an inactive user', async () => {
        install({ connections: [conn('c1', 'palak'), conn('c2', 'asha', { status: 'pending' })] });
        integrations.WEBHOOKS_ACTIVE = false;
        assert.equal(await ensureChannel('c1', { now }), 'off');
        integrations.WEBHOOKS_ACTIVE = true;
        assert.equal(await ensureChannel('c2', { now }), 'skipped');
        state.users[0].isActive = false;
        assert.equal(await ensureChannel('c1', { now }), 'skipped', 'withCalendarAccess refuses (D43)');
        assert.equal(fakeWatchState.calls.length, 0);
        assert.equal(state.channels.length, 0);
    });

    it('renews in place when under 3 days are left (provider with a renew call)', async () => {
        install();
        await ensureChannel('c1', { now });
        const row = activeChannels()[0];
        row.expiresAt = new Date(now.getTime() + DAY);
        fakeWatchState.channels.get(String(row.externalId))!.expiresAt = row.expiresAt as Date;
        assert.equal(await ensureChannel('c1', { now }), 'renewed');
        assert.ok((row.expiresAt as Date).getTime() > now.getTime() + 6 * DAY);
        assert.equal(activeChannels().length, 1);
    });

    it('renew answered 404 → re-created with generation + 1, the old row stopped', async () => {
        install();
        await ensureChannel('c1', { now });
        const old = activeChannels()[0];
        old.expiresAt = new Date(now.getTime() + DAY);
        fakeWatchState.gone.add(String(old.externalId));
        assert.equal(await ensureChannel('c1', { now }), 'replaced');
        assert.equal(old.status, 'stopped');
        const [fresh] = activeChannels();
        assert.equal(fresh.generation, 2);
        assert.notEqual(fresh.id, old.id);
    });

    it('a channel signed with an old key: the new one is created first, then the old one stopped at the provider', async () => {
        configureSecretBox(parseKeyRing(`k2:${Buffer.alloc(32, 9).toString('base64')},k1:${Buffer.alloc(32, 7).toString('base64')}`));
        install();
        // A channel made while k1 was active.
        configureSecretBox(parseKeyRing(`k1:${Buffer.alloc(32, 7).toString('base64')}`));
        await ensureChannel('c1', { now });
        configureSecretBox(parseKeyRing(`k2:${Buffer.alloc(32, 9).toString('base64')},k1:${Buffer.alloc(32, 7).toString('base64')}`));
        const old = activeChannels()[0];
        assert.equal(await ensureChannel('c1', { now }), 'replaced');
        const ops = fakeWatchState.calls.map((c) => c.op);
        assert.deepEqual(ops, ['watch', 'watch', 'stop'], 'create new, then stop old');
        assert.equal(old.status, 'stopped');
        assert.equal(activeChannels()[0].tokenKeyId, 'k2');
        assert.equal(fakeWatchState.channels.get(String(old.externalId))?.stopped, true);
    });

    it('a refused watch leaves a failed row (polling continues), backs off, and marks nothing on the person', async () => {
        install();
        fakeWatchState.failNext.watch = new ProviderBadRequestError({ provider: 'fake', operation: 'watch', status: 400, code: 'push.webhookUrlNotHttps' });
        assert.equal(await ensureChannel('c1', { now }), 'failed');
        assert.equal(state.channels[0].status, 'failed');
        assert.equal(state.connections[0].status, 'ok', 'the person’s row is untouched');
        assert.equal(await ensureChannel('c1', { now }), 'wait');
        assert.equal(await ensureChannel('c1', { now, ignoreBackoff: true }), 'created');
    });

    it('watch jobs: renew forces a renewal, recreate ignores the backoff, stop stops', async () => {
        install();
        await ensureChannel('c1', { now });
        assert.equal(await runWatchJob('c1', 'renew', now), 'renewed');
        assert.equal(await runWatchJob('c1', 'stop', now), 1);
        assert.equal(activeChannels().length, 0);
    });
});

describe('stopping', () => {
    it('a row stopped by the reconcile (user deactivated) stops its channel: rows at once, provider calls in the background', async () => {
        install();
        await ensureChannel('c1', { now });
        const row = activeChannels()[0];
        state.users[0].isActive = false;
        const result = await reconcileUser('palak', 'test');
        assert.equal(result.action, 'stop');
        assert.equal(row.status, 'stopped', 'pings are ignored from now on');
        assert.deepEqual(stopped, [row.id]);
    });
});

describe('maintainChannels', () => {
    it('poll: creates missing channels (bounded) and respects the failed backoff', async () => {
        install({ connections: [conn('c1', 'palak'), conn('c2', 'asha')] });
        state.channels.push({ ...channel({ connectionId: 'c2', status: 'failed', externalId: null, createdAt: new Date(now.getTime() - HOUR) }) });
        const result = await maintainChannels('poll', now);
        assert.equal(result.created, 1);
        assert.equal(result.missing, 2);
        assert.deepEqual(activeChannels().map((c) => c.connectionId), ['c1']);
    });

    it('nightly: retries failed ones, re-creates a subscription the provider lost (+ a missed pull), stops strays, deletes old rows', async () => {
        install({ connections: [conn('c1', 'palak'), conn('c2', 'asha', { status: 'stopped' })] });
        await ensureChannel('c1', { now });
        const lost = activeChannels()[0];
        fakeWatchState.gone.add(String(lost.externalId));
        state.channels.push({ ...channel({ connectionId: 'c2', externalId: 'fake-res-stray' }) });
        state.channels.push({ ...channel({ connectionId: 'c1', status: 'stopped', createdAt: new Date(now.getTime() - 31 * DAY) }) });
        const result = await maintainChannels('nightly', now);
        assert.equal(lost.status, 'stopped');
        assert.equal(result.created, 1, 'a new subscription for c1');
        assert.equal(result.stopped, 1, 'the stopped row’s channel');
        assert.equal(result.deleted, 1);
        assert.equal(activeChannels().length, 1);
        assert.equal(activeChannels()[0].connectionId, 'c1');
        assert.ok(fakeWatchState.calls.some((c) => c.op === 'exists'));
    });

    it('nightly with webhooks off: every active channel is stopped', async () => {
        install();
        await ensureChannel('c1', { now });
        integrations.WEBHOOKS_ACTIVE = false;
        const result = await maintainChannels('nightly', now);
        assert.equal(result.stopped, 1);
        assert.equal(activeChannels().length, 0);
        assert.equal(await maintainChannels('poll', now).then((r) => r.ensured), 0);
    });
});

describe('the safety-net poll', () => {
    it('people with a healthy channel are pulled every CALENDAR_POLL_MINUTES_WITH_WEBHOOKS, others every tick', async () => {
        install({
            connections: [conn('c1', 'palak', { lastPulledAt: new Date(now.getTime() - 10 * MIN) }), conn('c2', 'asha', { lastPulledAt: new Date(now.getTime() - 10 * MIN) })],
        });
        await ensureChannel('c1', { now });
        assert.deepEqual((await duePullConnections(now)).map((r) => r.id), ['c2']);
        state.connections[0].lastPulledAt = new Date(now.getTime() - 30 * MIN);
        assert.deepEqual((await duePullConnections(now)).map((r) => r.id).sort(), ['c1', 'c2']);
        // A channel expiring within the hour no longer counts: back to the normal interval.
        activeChannels()[0].expiresAt = new Date(now.getTime() + 30 * MIN);
        state.connections[0].lastPulledAt = new Date(now.getTime() - 10 * MIN);
        assert.deepEqual((await duePullConnections(now)).map((r) => r.id).sort(), ['c1', 'c2']);
        integrations.WEBHOOKS_ACTIVE = false;
        assert.equal((await duePullConnections(now)).length, 2, 'webhooks off: everyone, every tick');
    });

    it('interval helpers (pure)', () => {
        assert.equal(pollIntervalMinutes(false, 5), 5);
        assert.equal(pollIntervalMinutes(true, 5), 30);
        assert.equal(pollIntervalMinutes(true, 60), 60, 'never shorter than the normal poll');
        assert.equal(pullIsDue(null, 30, now), true);
        assert.equal(pullIsDue(new Date(now.getTime() - 29 * MIN - 30_000), 30, now), true, 'a minute of slack for an early tick');
        assert.equal(pullIsDue(new Date(now.getTime() - 20 * MIN), 30, now), false);
    });

    it('inline watch jobs run when Redis is down (lifecycle without a queue)', async () => {
        install();
        const { enqueueWatch } = await import('./sync.channels.js');
        assert.equal(await enqueueWatch('c1', 'renew', now), 'inline');
        assert.deepEqual(inlineWatches, ['renew:c1']);
    });
});
