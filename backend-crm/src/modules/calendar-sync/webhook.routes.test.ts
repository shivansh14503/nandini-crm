import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import express from 'express';
import { ENV } from '../../config/env.js';
import { prisma } from '../../config/prisma.js';
import { errorHandler, notFoundHandler } from '../../middlewares/errorHandler.js';
import { configureSecretBox, parseKeyRing } from '../../services/secretBox.js';
import { zonedWallClockToInstant } from '../../utils/zonedTime.js';
import { resetFakeProvider } from './providers/fake.js';
import { fakeWatchState, resetFakeWatch } from './providers/fakeWatch.js';
import { resetProviderPauses } from './providers/http.js';
import { setFakeHealth, setFakeProviderEnabledForTests } from './providers/registry.js';
import { channelToken, ensureChannel, newChannelId, addressTag, setInlineWatchForTests, webhookHmac } from './sync.channels.js';
import { followUpPullJobId, freshWebhookPullJobId, pullJobId, webhookPullJobId } from './sync.keys.js';
import { blankConnection, installConnectionDouble, microsoftProviderRow, restoreConnectionDouble, type ConnectionRowState, type DoubleState, type UserRow } from './testing/connectionDouble.js';
import { setTokenSourceForTests } from './tokenSource.js';
import webhookRouter, { localWebhookHit, resetWebhookLimitsForTests, setWebhookAfterAnswerForTests, WEBHOOK_RATE_LIMIT } from './webhook.routes.js';
import {
    handleGoogleNotification,
    handleGraphNotifications,
    notePing,
    pullAgainIfNotified,
    setInlineWebhookPullForTests,
    setWebhookPullQueueForTests,
    type GoogleNotification,
    type WebhookPullQueue,
} from './webhook.service.js';

/**
 * The webhook routes over HTTP and their handlers (Calendar Phase 2 spec §3.4, D25, D26; P2-7), without Redis (pings
 * become in-process pulls, captured here): Google token HMAC good / bad / old key, unknown channel → 200 no-op, `sync`
 * ignored, resource id checked; Graph validation echo (text/plain, decoded), clientState / tenant mismatch → 202 with
 * nothing queued; quiet hours drop change notifications before any read but process lifecycle ones; an inactive user's
 * connection → nothing; job-id bucketing; size and rate limits; no caching.
 */

const BASE = 'https://crm.example.com';
const TENANT = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const K1 = `k1:${Buffer.alloc(32, 7).toString('base64')}`;
const K2 = `k2:${Buffer.alloc(32, 9).toString('base64')}`;

type Integrations = { WEBHOOKS_ACTIVE: boolean; PUBLIC_API_URL: string | null; SYNC_ENABLED: boolean; SYNC_HOURS: string };
const integrations = ENV.INTEGRATIONS as unknown as Integrations;
const saved: Integrations = { ...integrations };

const user = (id: number, username: string, over: Partial<UserRow> = {}): UserRow => ({ id, username, fullName: username, email: `${username}@nandiniinfosys.com`, isActive: true, isGroupUser: false, ...over });
const conn = (id: string, username: string, provider: string, over: Partial<ConnectionRowState> = {}) =>
    blankConnection({ id, username, provider, accountEmail: `${username}@nandiniinfosys.com`, status: 'ok', ...over });

let server: Server;
let base = '';
let state: DoubleState;
let pulls: string[];
let watches: string[];
let work: Promise<unknown>[];
let channelReads: number;

before(async () => {
    const app = express();
    app.use('/api/webhooks', webhookRouter);
    app.use(notFoundHandler);
    app.use(errorHandler);
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/webhooks`;
});

after(() => new Promise<void>((resolve) => server.close(() => resolve())));

/** A night instant in the business timezone (02:00), and a daytime one (11:00). */
const at = (hhmm: string) => zonedWallClockToInstant(`2026-11-26T${hhmm}`, ENV.BUSINESS_TIMEZONE);

function install() {
    state = installConnectionDouble({
        users: [user(1, 'palak'), user(2, 'asha')],
        connections: [conn('c1', 'palak', 'fake'), conn('c2', 'asha', 'microsoft')],
        providers: [microsoftProviderRow({ tenantId: TENANT })],
    });
    // Count channel reads (a forged or night-time ping must not read the database).
    const delegate = (prisma as unknown as { calendarWatchChannel: Record<string, (...a: unknown[]) => unknown> }).calendarWatchChannel;
    for (const name of ['findUnique', 'findMany']) {
        const original = delegate[name];
        delegate[name] = (...args: unknown[]) => {
            channelReads += 1;
            return original(...args);
        };
    }
    return state;
}

/** c1's Google-style channel, created through the fake provider; returns the headers Google would send. */
async function googleChannel(): Promise<GoogleNotification> {
    assert.equal(await ensureChannel('c1'), 'created');
    const row = state.channels.find((c) => c.status === 'active' && c.connectionId === 'c1')!;
    const provider = fakeWatchState.channels.get(String(row.externalId))!;
    return { channelId: String(row.id), token: provider.token, resourceId: String(row.externalId), resourceState: 'exists' };
}

/** c2's Graph subscription row (seeded: the Graph adapter isn't called here). */
function graphChannel(over: Record<string, unknown> = {}) {
    const id = newChannelId(addressTag(BASE));
    const row = { id, connectionId: 'c2', provider: 'microsoft', externalId: 'sub-1', tokenKeyId: 'k1', generation: 3, expiresAt: new Date(Date.now() + 5 * 86_400_000), status: 'active', createdAt: new Date(), ...over };
    state.channels.push(row);
    return { row, clientState: channelToken('microsoft', { id, connectionId: 'c2', generation: Number(row.generation) }, String(row.tokenKeyId)) };
}

/** An in-memory stand-in for Redis + BullMQ: kept job states, stamps, added ids (an add with a kept id is ignored, as BullMQ does). */
function fakePullQueue() {
    const q = {
        states: new Map<string, string>(),
        stamps: new Map<string, number>(),
        added: [] as string[],
        stampWorks: true,
        addWorks: true,
    };
    const port: WebhookPullQueue = {
        ready: () => true,
        writeStamp: async (connectionId, ms) => {
            if (!q.stampWorks) return false;
            q.stamps.set(connectionId, ms);
            return true;
        },
        readStamp: async (connectionId) => q.stamps.get(connectionId) ?? null,
        stateOf: async (jobId) => q.states.get(jobId) ?? null,
        add: async (jobId) => {
            if (!q.addWorks) return null;
            if (!q.states.has(jobId)) {
                q.states.set(jobId, 'delayed');
                q.added.push(jobId);
            }
            return jobId;
        },
    };
    setWebhookPullQueueForTests(port);
    return q;
}

const graphItem = (clientState: string, over: Record<string, unknown> = {}) => ({ subscriptionId: 'sub-1', clientState, tenantId: TENANT, changeType: 'updated', resource: 'Users/x/Events/y', ...over });

async function postGoogle(n: GoogleNotification, extra: Record<string, string> = {}) {
    const headers: Record<string, string> = { ...extra };
    if (n.channelId) headers['x-goog-channel-id'] = n.channelId;
    if (n.token) headers['x-goog-channel-token'] = n.token;
    if (n.resourceId) headers['x-goog-resource-id'] = n.resourceId;
    if (n.resourceState) headers['x-goog-resource-state'] = n.resourceState;
    const res = await fetch(`${base}/google/calendar`, { method: 'POST', headers });
    await Promise.all(work);
    return res;
}

async function postGraph(path: 'calendar' | 'lifecycle', body: unknown) {
    const res = await fetch(`${base}/microsoft/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    await Promise.all(work);
    return res;
}

beforeEach(() => {
    configureSecretBox(parseKeyRing(K1));
    resetFakeProvider();
    resetFakeWatch();
    resetProviderPauses();
    resetWebhookLimitsForTests();
    setFakeHealth('unknown', null);
    setFakeProviderEnabledForTests(true);
    setTokenSourceForTests(null);
    Object.assign(integrations, { WEBHOOKS_ACTIVE: true, PUBLIC_API_URL: BASE, SYNC_ENABLED: true, SYNC_HOURS: '00:00-24:00' });
    pulls = [];
    watches = [];
    work = [];
    channelReads = 0;
    setInlineWebhookPullForTests((id) => pulls.push(id));
    setInlineWatchForTests((id, op) => watches.push(`${op}:${id}`));
    setWebhookAfterAnswerForTests((p) => work.push(p));
});

afterEach(() => {
    restoreConnectionDouble();
    Object.assign(integrations, saved);
    setFakeProviderEnabledForTests(null);
    setTokenSourceForTests(null);
    setInlineWebhookPullForTests(null);
    setInlineWatchForTests(null);
    setWebhookAfterAnswerForTests(null);
    setWebhookPullQueueForTests(null);
    configureSecretBox(null);
});

describe('Google push notifications', () => {
    it('a verified change ping → 200, no caching, one pull of that person', async () => {
        install();
        const headers = await googleChannel();
        const res = await postGoogle(headers);
        assert.equal(res.status, 200);
        assert.equal(res.headers.get('cache-control'), 'no-store');
        assert.deepEqual(pulls, ['c1']);
    });

    it('the first `sync` message does nothing; a bad token, an unknown channel or another resource id → 200 and nothing', async () => {
        install();
        const headers = await googleChannel();
        channelReads = 0;
        assert.equal(await handleGoogleNotification({ ...headers, resourceState: 'sync' }), 'sync');
        assert.equal(await handleGoogleNotification({ ...headers, token: webhookHmac(Buffer.alloc(32, 1), headers.channelId!) }), 'bad_token');
        assert.equal(channelReads, 0, 'a forged token is refused before any read');
        const stranger = newChannelId(addressTag(BASE));
        assert.equal(await handleGoogleNotification({ ...headers, channelId: stranger, token: channelToken('fake', { id: stranger, connectionId: 'c1', generation: 1 }, 'k1') }), 'unknown_channel');
        assert.equal(await handleGoogleNotification({ ...headers, resourceId: 'someone-else' }), 'resource_mismatch');
        assert.equal(await handleGoogleNotification({ ...headers, channelId: 'not-ours' }), 'malformed');
        const res = await postGoogle({ ...headers, token: 'x'.repeat(43) });
        assert.equal(res.status, 200, 'always 200, also when refused');
        assert.deepEqual(pulls, []);
    });

    it('a channel signed with an older ring key still verifies after rotation (every ring key is tried)', async () => {
        install();
        const headers = await googleChannel();
        configureSecretBox(parseKeyRing(`${K2},${K1}`));
        assert.equal(await handleGoogleNotification(headers), 'inline');
        configureSecretBox(parseKeyRing(K2));
        assert.equal(await handleGoogleNotification(headers), 'bad_token', 'a key no longer in the ring verifies nothing');
    });

    it('a stopped channel, a stopped connection or an inactive user → nothing', async () => {
        install();
        const headers = await googleChannel();
        state.users[0].isActive = false;
        assert.equal(await handleGoogleNotification(headers), 'not_synced', 'D43');
        state.users[0].isActive = true;
        state.connections[0].status = 'stopped';
        assert.equal(await handleGoogleNotification(headers), 'not_synced');
        state.channels[0].status = 'stopped';
        assert.equal(await handleGoogleNotification(headers), 'unknown_channel');
        assert.deepEqual(pulls, []);
    });

    it('quiet hours: acknowledged and dropped before any read; webhooks off: nothing at all', async () => {
        install();
        const headers = await googleChannel();
        integrations.SYNC_HOURS = '07:00-22:00';
        channelReads = 0;
        assert.equal(await handleGoogleNotification(headers, at('02:00')), 'quiet_hours');
        assert.equal(channelReads, 0);
        assert.equal(await handleGoogleNotification(headers, at('11:00')), 'inline');
        integrations.WEBHOOKS_ACTIVE = false;
        assert.equal(await handleGoogleNotification(headers, at('11:00')), 'off');
    });

    it('a body over 16 KB is refused by its length', async () => {
        install();
        const res = await fetch(`${base}/google/calendar`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'x'.repeat(20_000) });
        assert.equal(res.status, 413);
    });
});

describe('Microsoft Graph notifications', () => {
    it('validation: the decoded token echoed as text/plain (both URLs), too long → 400', async () => {
        install();
        for (const path of ['calendar', 'lifecycle']) {
            const res = await fetch(`${base}/microsoft/${path}?validationToken=${encodeURIComponent('Validation: Testing client application reachability <1>')}`, { method: 'POST', headers: { 'content-type': 'text/plain' } });
            assert.equal(res.status, 200);
            assert.match(res.headers.get('content-type') ?? '', /^text\/plain/);
            assert.equal(await res.text(), 'Validation: Testing client application reachability <1>');
        }
        const long = await fetch(`${base}/microsoft/calendar?validationToken=${'a'.repeat(5000)}`, { method: 'POST' });
        assert.equal(long.status, 400);
    });

    it('verified change notifications → 202 and one pull per distinct connection (duplicates collapse)', async () => {
        install();
        const { clientState } = graphChannel();
        const res = await postGraph('calendar', { value: [graphItem(clientState), graphItem(clientState, { changeType: 'created' })] });
        assert.equal(res.status, 202);
        assert.deepEqual(pulls, ['c2']);
    });

    it('a wrong clientState, another tenant or an unknown subscription → 202 and nothing queued', async () => {
        install();
        const { clientState } = graphChannel();
        const outcome = await handleGraphNotifications({
            value: [graphItem('x'.repeat(43)), graphItem(clientState, { tenantId: 'ffffffff-0000-0000-0000-000000000000' }), graphItem(clientState, { subscriptionId: 'sub-other' })],
        });
        assert.deepEqual(outcome.pulled, []);
        assert.deepEqual(outcome.ignored, { bad_token: 1, tenant: 1, unknown_channel: 1 });
        const res = await postGraph('calendar', { value: [graphItem('nope')] });
        assert.equal(res.status, 202);
        assert.deepEqual(pulls, []);
    });

    it('a tenant configured by its domain: Graph’s tenant GUID can’t be compared, the clientState HMAC decides', async () => {
        state = installConnectionDouble({
            users: [user(1, 'palak'), user(2, 'asha')],
            connections: [conn('c1', 'palak', 'fake'), conn('c2', 'asha', 'microsoft')],
            providers: [microsoftProviderRow({ tenantId: 'contoso.onmicrosoft.com' })],
        });
        const { clientState } = graphChannel();
        const outcome = await handleGraphNotifications({ value: [graphItem(clientState)] });
        assert.deepEqual(outcome.ignored, {});
        assert.deepEqual(outcome.pulled, ['c2']);
        const forged = await handleGraphNotifications({ value: [graphItem(`c2.3.${'x'.repeat(43)}`)] });
        assert.deepEqual(forged.ignored, { bad_token: 1 });
    });

    it('a forged lifecycle post at night is refused before any database read', async () => {
        install();
        graphChannel();
        integrations.SYNC_HOURS = '07:00-22:00';
        channelReads = 0;
        const forged = await handleGraphNotifications(
            { value: [graphItem('y', { lifecycleEvent: 'missed' }), graphItem(`c2.3.${'z'.repeat(43)}`, { lifecycleEvent: 'subscriptionRemoved' })] },
            at('02:00'),
        );
        assert.deepEqual(forged.ignored, { bad_token: 2 });
        assert.equal(channelReads, 0);
        assert.deepEqual(watches, []);
        assert.deepEqual(pulls, []);
    });

    it('the clientState generation matters: an old generation’s notifications are refused', async () => {
        install();
        const { row } = graphChannel({ generation: 4 });
        const oldState = channelToken('microsoft', { id: String(row.id), connectionId: 'c2', generation: 3 }, 'k1');
        assert.deepEqual((await handleGraphNotifications({ value: [graphItem(oldState)] })).ignored, { bad_token: 1 });
    });

    it('quiet hours drop change notifications before any read but process lifecycle ones (subscriptionRemoved → re-create + pull)', async () => {
        install();
        const { row, clientState } = graphChannel();
        integrations.SYNC_HOURS = '07:00-22:00';
        channelReads = 0;
        const night = await handleGraphNotifications({ value: [graphItem(clientState)] }, at('02:00'));
        assert.deepEqual(night.ignored, { quiet_hours: 1 });
        assert.equal(channelReads, 0);
        const lifecycle = await handleGraphNotifications({ value: [graphItem(clientState, { lifecycleEvent: 'subscriptionRemoved', changeType: undefined })] }, at('02:00'));
        assert.deepEqual(lifecycle.lifecycle, ['recreate:c2', 'pull:c2']);
        assert.equal(row.status, 'stopped');
        assert.deepEqual(watches, ['recreate:c2']);
        assert.deepEqual(pulls, ['c2']);
        // A replay of the same lifecycle event: the channel is no longer active, so nothing more happens.
        const replay = await handleGraphNotifications({ value: [graphItem(clientState, { lifecycleEvent: 'subscriptionRemoved' })] }, at('02:05'));
        assert.deepEqual(replay.ignored, { unknown_channel: 1 });
    });

    it('reauthorizationRequired → a renew job; missed → a pull (lifecycle URL, 202)', async () => {
        install();
        const { clientState } = graphChannel();
        const res = await postGraph('lifecycle', { value: [graphItem(clientState, { lifecycleEvent: 'reauthorizationRequired' })] });
        assert.equal(res.status, 202);
        assert.deepEqual(watches, ['renew:c2']);
        await postGraph('lifecycle', { value: [graphItem(clientState, { lifecycleEvent: 'missed' })] });
        assert.deepEqual(pulls, ['c2']);
    });

    it('an inactive user’s connection gets no pull (D43)', async () => {
        install();
        const { clientState } = graphChannel();
        state.users[1].isActive = false;
        const outcome = await handleGraphNotifications({ value: [graphItem(clientState)] });
        assert.deepEqual(outcome.ignored, { not_synced: 1 });
        assert.deepEqual(pulls, []);
    });

    it('unreadable JSON → 400; an empty body → 202', async () => {
        install();
        const bad = await fetch(`${base}/microsoft/calendar`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{nope' });
        assert.equal(bad.status, 400);
        const empty = await postGraph('calendar', {});
        assert.equal(empty.status, 202);
    });
});

describe('debounce, limits', () => {
    it('pulls within one 10 s bucket share a job id; webhook and follow-up ids never equal a poll’s or each other’s', () => {
        const t = new Date(Math.floor(Date.now() / 10_000) * 10_000);
        assert.equal(pullJobId('c1', t), pullJobId('c1', new Date(t.getTime() + 9_999)));
        assert.notEqual(pullJobId('c1', t), pullJobId('c1', new Date(t.getTime() + 10_000)));
        assert.equal(webhookPullJobId('c1', t), webhookPullJobId('c1', new Date(t.getTime() + 9_999)));
        assert.notEqual(webhookPullJobId('c1', t), pullJobId('c1', t));
        assert.notEqual(freshWebhookPullJobId('c1', t), freshWebhookPullJobId('c1', new Date(t.getTime() + 1)));
        assert.notEqual(followUpPullJobId('c1', t.getTime()), followUpPullJobId('c1', t.getTime() + 2_500));
        for (const id of [webhookPullJobId('c1', t), freshWebhookPullJobId('c1', t), followUpPullJobId('c1', t.getTime())]) {
            assert.doesNotMatch(id, /:/, 'BullMQ ids never contain ":"');
        }
    });

    it('without Redis there is no stamp to read, so no follow-up pull is queued', async () => {
        assert.equal(await pullAgainIfNotified('c1', new Date()), false);
    });

    it('a ping after the bucket’s pull already finished queues a fresh job (BullMQ would ignore the kept id)', async () => {
        const q = fakePullQueue();
        const t0 = new Date(Math.floor(Date.now() / 10_000) * 10_000);
        // The first ping queues the bucket's job.
        assert.equal(await notePing('c1', 'webhook', t0), 'queued');
        assert.deepEqual(q.added, [webhookPullJobId('c1', t0)]);
        // A second ping while it is still delayed: absorbed.
        assert.equal(await notePing('c1', 'webhook', new Date(t0.getTime() + 1_000)), 'queued');
        assert.equal(q.added.length, 1);
        // It ran and completed; a ping 5 s later in the same bucket gets its own job.
        q.states.set(webhookPullJobId('c1', t0), 'completed');
        const t5 = new Date(t0.getTime() + 5_000);
        assert.equal(await notePing('c1', 'webhook', t5), 'queued');
        assert.deepEqual(q.added, [webhookPullJobId('c1', t0), freshWebhookPullJobId('c1', t5)]);
        assert.deepEqual(pulls, [], 'nothing in-process while Redis works');
    });

    it('a ping during a running pull relies on the D26 stamp; a follow-up of a follow-up gets its own id', async () => {
        const q = fakePullQueue();
        const t0 = new Date(Math.floor(Date.now() / 10_000) * 10_000);
        q.states.set(webhookPullJobId('c1', t0), 'active');
        const ping1 = new Date(t0.getTime() + 3_000);
        assert.equal(await notePing('c1', 'webhook', ping1), 'queued');
        assert.deepEqual(q.added, [], 'the running pull pulls again when it ends');
        assert.equal(q.stamps.get('c1'), ping1.getTime());
        // Pull A (started at t0) ends: one follow-up F.
        assert.equal(await pullAgainIfNotified('c1', t0), true);
        assert.deepEqual(q.added, [followUpPullJobId('c1', ping1.getTime())]);
        // F runs from ping1 + 2 s; ping 2 arrives while it runs; F ends 1 s later: another follow-up, another id.
        const fStart = new Date(ping1.getTime() + 2_000);
        q.states.set(webhookPullJobId('c1', fStart), 'active');
        const ping2 = new Date(fStart.getTime() + 500);
        await notePing('c1', 'webhook', ping2);
        assert.equal(await pullAgainIfNotified('c1', fStart), true);
        assert.equal(q.added.length, 2);
        assert.notEqual(q.added[1], q.added[0]);
        assert.equal(q.added[1], followUpPullJobId('c1', ping2.getTime()));
        // A pull that started after the newest ping queues nothing.
        assert.equal(await pullAgainIfNotified('c1', new Date(ping2.getTime() + 1)), false);
    });

    it('a running pull without a stamp written: the ping queues its own job; Redis refusing the add → in-process', async () => {
        const q = fakePullQueue();
        q.stampWorks = false;
        const t0 = new Date(Math.floor(Date.now() / 10_000) * 10_000);
        q.states.set(webhookPullJobId('c1', t0), 'active');
        assert.equal(await notePing('c1', 'webhook', t0), 'queued');
        assert.deepEqual(q.added, [freshWebhookPullJobId('c1', t0)]);
        q.addWorks = false;
        assert.equal(await notePing('c1', 'webhook', new Date(t0.getTime() + 10_000)), 'inline');
        assert.deepEqual(pulls, ['c1']);
    });

    it('the in-process rate limit allows 600 requests a minute per IP', () => {
        const t = Date.now();
        for (let i = 0; i < WEBHOOK_RATE_LIMIT.max; i += 1) assert.equal(localWebhookHit('ip:1.2.3.4', t), true);
        assert.equal(localWebhookHit('ip:1.2.3.4', t), false);
        assert.equal(localWebhookHit('ip:5.6.7.8', t), true);
        assert.equal(localWebhookHit('ip:1.2.3.4', t + 61_000), true, 'a new window');
    });
});
