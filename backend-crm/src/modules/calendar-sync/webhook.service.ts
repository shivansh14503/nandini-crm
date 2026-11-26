import { ENV } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { prisma } from '../../config/prisma.js';
import { isRedisReady, redis } from '../../config/redis.js';
import { calendarSyncQueue, isQueueAvailable, tryEnqueue } from '../../jobs/queues.js';
import { secretBox } from '../../services/secretBox.js';
import { loadProviderAccess } from './providers/registry.js';
import { enqueueWatch, isChannelId, parseClientState, sameToken, webhookHmac, webhooksLive } from './sync.channels.js';
import { CALENDAR_SYNC_JOBS, type PullReason } from './sync.constants.js';
import { followUpPullJobId, freshWebhookPullJobId, webhookPullJobId } from './sync.keys.js';
import type { PullJobData } from './sync.wake.js';
import { isInsideSyncHours } from './syncHours.js';

/**
 * What the webhook routes do with a notification (Calendar Phase 2 spec §3.4, D25, D26; P2-7). The routes answer the
 * provider at once (Google 200, Graph 202) and hand the notification here.
 *
 * - **Verification**: Google `X-Goog-Channel-Token` = b64url HMAC(webhook subkey, channel id) is first checked against
 *   every ring key **before any database read** (a forged ping never wakes the database), then the channel row must
 *   be active, signed with that key, on Google, with the stored `X-Goog-Resource-ID`. Graph: `clientState` =
 *   `<connectionId>.<generation>.<HMAC(subkey, connectionId:generation)>` is checked against every ring key **before any
 *   database read** too (change and lifecycle notifications alike), then each `subscriptionId` → active Microsoft
 *   channel of that connection, generation and key. `tenantId` = the configured tenant when it is a GUID (a tenant
 *   configured by domain, e.g. contoso.onmicrosoft.com, can't be compared with the GUID Graph sends; the clientState HMAC
 *   is the proof then). Constant-time compares throughout.
 * - **Quiet hours**: outside CALENDAR_SYNC_HOURS change notifications are acknowledged and dropped before any read, so
 *   a ping at night never wakes Azure SQL. Nothing is lost: the first poll of the morning pulls every person (their
 *   last pull is older than the safety-net interval). Graph lifecycle notifications are processed at any hour (rare;
 *   dropping one would leave a dead channel marked active), but only once their clientState HMAC verified, so only a
 *   genuine one can read the database at night.
 * - **Then**: the connection must be live in `ok` and its user active and not a group login (D43). A Redis stamp
 *   `calsync:notified:<connectionId>` and a `pull` job `pull-<connectionId>-w<10 s bucket>` with a 2 s delay, so a burst
 *   of pings is one pull. Only a **pending** job absorbs a ping: when that id is active the stamp makes it pull once more
 *   when it ends (D26, follow-up id `pull-<connectionId>-n<stamp ms>`); when it already finished (BullMQ keeps it an hour
 *   and would silently ignore the same id) the ping queues `…-w<bucket>-<ms>`. Redis down: an in-process pull, one at a
 *   time per connection (a ping during it runs it once more).
 * - Replays and duplicates are harmless: a ping only causes an idempotent pull; a lifecycle event for a channel that
 *   is no longer active is ignored, and `watch` jobs are one per connection, operation and minute.
 * Never logs a header value, a token, a clientState or a body.
 */

export type WebhookOutcome =
    | 'off'
    | 'sync'
    | 'malformed'
    | 'quiet_hours'
    | 'bad_token'
    | 'unknown_channel'
    | 'resource_mismatch'
    | 'not_synced'
    | 'queued'
    | 'inline';

/** Redis key of the D26 stamp (ms of the newest verified ping). */
export const notifiedKey = (connectionId: string) => `calsync:notified:${connectionId}`;
const NOTIFIED_TTL_SECONDS = 10 * 60;
/** A webhook pull waits this long so a burst of pings (one per changed event) collapses into one pull. */
export const WEBHOOK_PULL_DELAY_MS = 2_000;
/** Notifications read from one Graph request (Graph batches; anything beyond is dropped, the poll covers it). */
export const MAX_GRAPH_ITEMS = 100;
/** Graph `validationToken` longest echo (spec §3.4). */
export const MAX_VALIDATION_TOKEN = 4096;
/** Google header limits: channel id ≤ 64 [V], token ≤ 256 [V]. */
const MAX_CHANNEL_ID = 64;
const MAX_TOKEN = 256;

const insideHours = (now: Date) => isInsideSyncHours(now);

// ── The ping → pull path ────────────────────────────────────────────────────────────────────────────────────

type InlinePull = (connectionId: string) => void;
const inlineState = new Map<string, { again: boolean }>();
const INLINE_ROUNDS = 3;

const defaultInlinePull: InlinePull = (connectionId) => {
    const running = inlineState.get(connectionId);
    if (running) {
        running.again = true;
        return;
    }
    const state = { again: false };
    inlineState.set(connectionId, state);
    setImmediate(() => {
        void (async () => {
            // sync.pull imports the activity services: loaded on demand.
            const { pullConnection } = await import('./sync.pull.js');
            for (let round = 0; round < INLINE_ROUNDS; round += 1) {
                state.again = false;
                await pullConnection(connectionId, 'webhook');
                if (!state.again) break;
            }
        })()
            .catch((err: Error) => logger.warn({ connectionId, err: err.message }, 'In-process calendar webhook pull failed; the next poll covers it'))
            .finally(() => inlineState.delete(connectionId));
    });
};
let inlinePull: InlinePull = defaultInlinePull;

/** Tests: capture in-process webhook pulls (null = the real runner). */
export function setInlineWebhookPullForTests(runner: InlinePull | null): void {
    inlinePull = runner ?? defaultInlinePull;
    inlineState.clear();
}

/**
 * The Redis side of the ping → pull path (stamp, job state, add), replaceable in tests. `ready` false = no Redis: the
 * caller pulls in-process.
 */
export interface WebhookPullQueue {
    ready(): boolean;
    /** Writes the D26 stamp; false when it couldn't. */
    writeStamp(connectionId: string, ms: number): Promise<boolean>;
    readStamp(connectionId: string): Promise<number | null>;
    /** The state of a kept job (waiting, delayed, prioritized, active, completed, failed, …), or null when there is none. */
    stateOf(jobId: string): Promise<string | null>;
    /** Adds a `pull` job; the id, or null when Redis didn't take it. */
    add(jobId: string, data: PullJobData): Promise<string | null>;
}

const REDIS_STEP_TIMEOUT_MS = 3_000;
async function withTimeout<T>(work: Promise<T>): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
        return await Promise.race([work, new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new Error('Redis timed out')), REDIS_STEP_TIMEOUT_MS)))]);
    } finally {
        clearTimeout(timer);
    }
}

const redisPullQueue: WebhookPullQueue = {
    ready: () => isRedisReady() && isQueueAvailable(),
    async writeStamp(connectionId, ms) {
        try {
            await withTimeout(redis.set(notifiedKey(connectionId), String(ms), 'EX', NOTIFIED_TTL_SECONDS));
            return true;
        } catch {
            return false;
        }
    },
    async readStamp(connectionId) {
        try {
            const value = await withTimeout(redis.get(notifiedKey(connectionId)));
            return value === null || !Number.isFinite(Number(value)) ? null : Number(value);
        } catch {
            return null;
        }
    },
    async stateOf(jobId) {
        try {
            const job = await withTimeout(calendarSyncQueue().getJob(jobId));
            return job ? await withTimeout(job.getState()) : null;
        } catch {
            // Unknown: treat as finished, so the ping gets a fresh id rather than being absorbed.
            return 'unknown';
        }
    },
    add: (jobId, data) => tryEnqueue(calendarSyncQueue, CALENDAR_SYNC_JOBS.pull, data, { jobId, delay: WEBHOOK_PULL_DELAY_MS, attempts: 1 }),
};
let pullQueue: WebhookPullQueue = redisPullQueue;

/** Tests: replace the Redis side of the ping → pull path (null = Redis / BullMQ). */
export function setWebhookPullQueueForTests(queue: WebhookPullQueue | null): void {
    pullQueue = queue ?? redisPullQueue;
}

/** Job states in which a queued pull hasn't started yet, so it will read the change a ping announced. */
const PENDING_STATES = new Set(['waiting', 'delayed', 'prioritized', 'waiting-children']);

/**
 * A verified change notification for one connection: stamp, then a pull that starts after this ping (see the file
 * header): the bucket's pending job, the bucket's active job plus the D26 stamp, or a new job.
 */
export async function notePing(connectionId: string, reason: PullReason, now: Date = new Date()): Promise<'queued' | 'inline'> {
    if (pullQueue.ready()) {
        const stamped = await pullQueue.writeStamp(connectionId, now.getTime());
        const bucketId = webhookPullJobId(connectionId, now);
        const state = await pullQueue.stateOf(bucketId);
        if (state !== null && PENDING_STATES.has(state)) return 'queued';
        // Running: it pulls once more when it ends (D26), as long as the stamp was written.
        if (state === 'active' && stamped) return 'queued';
        const id = await pullQueue.add(state === null ? bucketId : freshWebhookPullJobId(connectionId, now), { connectionId, reason });
        if (id !== null) return 'queued';
    }
    inlinePull(connectionId);
    return 'inline';
}

/**
 * D26: after a pull job that started at `startedAt` finished, one more pull when a webhook came while it ran (that
 * ping found the job running and relied on this). The id is keyed on the stamp, so a follow-up of a follow-up gets its
 * own id. Returns whether it queued one.
 */
export async function pullAgainIfNotified(connectionId: string, startedAt: Date): Promise<boolean> {
    if (!pullQueue.ready()) return false;
    const stamp = await pullQueue.readStamp(connectionId);
    if (stamp === null || stamp < startedAt.getTime()) return false;
    const id = await pullQueue.add(followUpPullJobId(connectionId, stamp), { connectionId, reason: 'webhook' });
    return id !== null;
}

/** The connection may be pulled: live in `ok`, user active and not a group login (D43). */
async function pullableConnection(connectionId: string): Promise<boolean> {
    const connection = await prisma.calendarConnection.findUnique({ where: { id: connectionId }, select: { status: true, username: true } });
    if (!connection || connection.status !== 'ok') return false;
    const user = await prisma.user.findUnique({ where: { username: connection.username }, select: { isActive: true, isGroupUser: true } });
    return Boolean(user?.isActive && !user.isGroupUser);
}

// ── Google ──────────────────────────────────────────────────────────────────────────────────────────────────

export interface GoogleNotification {
    channelId?: string;
    token?: string;
    resourceId?: string;
    /** sync | exists | not_exists */
    resourceState?: string;
}

/** The ring key whose HMAC of `text` equals `token`, without a database read; null when none does. */
export function matchingKeyId(text: string, token: string): string | null {
    for (const kid of secretBox.keyIds()) {
        if (sameToken(webhookHmac(secretBox.webhookKey(kid), text), token)) return kid;
    }
    return null;
}

export async function handleGoogleNotification(n: GoogleNotification, now: Date = new Date()): Promise<WebhookOutcome> {
    if (!webhooksLive()) return 'off';
    // The first message of every new channel (spec §3.4 [V]): nothing changed.
    if (n.resourceState === 'sync') return 'sync';
    const channelId = n.channelId ?? '';
    const token = n.token ?? '';
    if (!channelId || channelId.length > MAX_CHANNEL_ID || !isChannelId(channelId) || !token || token.length > MAX_TOKEN || !n.resourceId) return 'malformed';
    if (n.resourceState !== 'exists' && n.resourceState !== 'not_exists') return 'malformed';
    if (!insideHours(now)) return 'quiet_hours';
    const kid = matchingKeyId(channelId, token);
    if (!kid) return 'bad_token';
    const channel = await prisma.calendarWatchChannel.findUnique({
        where: { id: channelId },
        select: { connectionId: true, provider: true, externalId: true, tokenKeyId: true, status: true },
    });
    if (!channel || channel.status !== 'active' || channel.provider === 'microsoft' || channel.tokenKeyId !== kid) return 'unknown_channel';
    if (!channel.externalId || !sameToken(channel.externalId, n.resourceId)) return 'resource_mismatch';
    if (!(await pullableConnection(channel.connectionId))) return 'not_synced';
    return notePing(channel.connectionId, 'webhook', now);
}

// ── Microsoft Graph ─────────────────────────────────────────────────────────────────────────────────────────

export interface GraphNotificationItem {
    subscriptionId?: unknown;
    clientState?: unknown;
    tenantId?: unknown;
    changeType?: unknown;
    /** reauthorizationRequired | subscriptionRemoved | missed */
    lifecycleEvent?: unknown;
}

export interface GraphOutcome {
    /** Connections whose pull was queued (or started in-process). */
    pulled: string[];
    /** Lifecycle actions taken, `<op>:<connectionId>`. */
    lifecycle: string[];
    /** Items dropped, by reason. */
    ignored: Partial<Record<WebhookOutcome | 'tenant' | 'lifecycle_unknown', number>>;
}

export const LIFECYCLE_EVENTS = ['reauthorizationRequired', 'subscriptionRemoved', 'missed'] as const;
type LifecycleEvent = (typeof LIFECYCLE_EVENTS)[number];
const isLifecycleEvent = (value: unknown): value is LifecycleEvent => typeof value === 'string' && (LIFECYCLE_EVENTS as readonly string[]).includes(value);

const str = (value: unknown): string => (typeof value === 'string' ? value : '');
const TENANT_GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The items of a Graph notification body (`{ value: [...] }`), at most MAX_GRAPH_ITEMS. Pure. */
export function graphItemsOf(body: unknown): GraphNotificationItem[] {
    const value = body && typeof body === 'object' ? (body as { value?: unknown }).value : undefined;
    if (!Array.isArray(value)) return [];
    return value.filter((v): v is GraphNotificationItem => Boolean(v) && typeof v === 'object').slice(0, MAX_GRAPH_ITEMS);
}

/**
 * A Graph change / lifecycle notification body (both routes; an item carrying `lifecycleEvent` is a lifecycle one
 * whichever URL it came to). One pull per distinct connection.
 */
export async function handleGraphNotifications(body: unknown, now: Date = new Date()): Promise<GraphOutcome> {
    const out: GraphOutcome = { pulled: [], lifecycle: [], ignored: {} };
    const ignore = (why: keyof GraphOutcome['ignored'], n = 1) => {
        out.ignored[why] = (out.ignored[why] ?? 0) + n;
    };
    const items = graphItemsOf(body);
    if (items.length === 0) return out;
    if (!webhooksLive()) {
        ignore('off', items.length);
        return out;
    }
    const inside = insideHours(now);
    // Quiet hours: change notifications are dropped before any read; lifecycle ones go on.
    const wanted = items.filter((item) => {
        if (item.lifecycleEvent !== undefined) return true;
        if (!inside) ignore('quiet_hours');
        return inside;
    });
    // The clientState HMAC against every ring key, before any read (a forged post never wakes the database).
    const verified: { item: GraphNotificationItem; connectionId: string; generation: number; kid: string }[] = [];
    for (const item of wanted) {
        const subscriptionId = str(item.subscriptionId);
        const clientState = str(item.clientState);
        if (subscriptionId.length === 0 || subscriptionId.length > 200 || clientState.length === 0 || clientState.length > 128) {
            ignore('malformed');
            continue;
        }
        const parsed = parseClientState(clientState);
        const kid = parsed ? matchingKeyId(`${parsed.connectionId}:${parsed.generation}`, parsed.mac) : null;
        if (!parsed || !kid) {
            ignore('bad_token');
            continue;
        }
        verified.push({ item, connectionId: parsed.connectionId, generation: parsed.generation, kid });
    }
    if (verified.length === 0) return out;

    const access = await loadProviderAccess('microsoft');
    const tenantId = access.creds?.kind === 'microsoft' ? access.creds.tenantId.trim().toLowerCase() : '';
    // Graph sends the tenant GUID; a tenant configured by its domain can't be compared (the HMAC is the proof then).
    const tenantIsGuid = TENANT_GUID.test(tenantId);
    const ids = [...new Set(verified.map((v) => str(v.item.subscriptionId)))];
    const channels = await prisma.calendarWatchChannel.findMany({
        where: { externalId: { in: ids }, status: 'active', provider: 'microsoft' },
        select: { id: true, connectionId: true, provider: true, externalId: true, tokenKeyId: true, generation: true },
    });
    const channelOf = new Map(channels.map((c) => [c.externalId ?? '', c]));

    const toPull = new Set<string>();
    const lifecycle = new Map<string, { event: LifecycleEvent; channelId: string }>();
    for (const { item, connectionId, generation, kid } of verified) {
        const channel = channelOf.get(str(item.subscriptionId));
        if (!channel) {
            ignore('unknown_channel');
            continue;
        }
        // The signed connection, generation and key must be this subscription's (an old generation is refused).
        if (channel.connectionId !== connectionId || channel.generation !== generation || channel.tokenKeyId !== kid) {
            ignore('bad_token');
            continue;
        }
        if (!access.creds || (tenantIsGuid && str(item.tenantId).toLowerCase() !== tenantId)) {
            ignore('tenant');
            continue;
        }
        if (item.lifecycleEvent !== undefined) {
            if (!isLifecycleEvent(item.lifecycleEvent)) {
                ignore('lifecycle_unknown');
                continue;
            }
            lifecycle.set(`${channel.connectionId}:${item.lifecycleEvent}`, { event: item.lifecycleEvent, channelId: channel.id });
            continue;
        }
        toPull.add(channel.connectionId);
    }

    for (const connectionId of toPull) {
        if (!(await pullableConnection(connectionId))) {
            ignore('not_synced');
            continue;
        }
        await notePing(connectionId, 'webhook', now);
        out.pulled.push(connectionId);
    }
    for (const [key, { event, channelId }] of lifecycle) {
        const connectionId = key.slice(0, key.lastIndexOf(':'));
        out.lifecycle.push(...(await handleLifecycle(connectionId, channelId, event, now)));
    }
    return out;
}

/**
 * Graph lifecycle notifications (spec §3.4 [V]), at any hour:
 *   reauthorizationRequired → renew (`PATCH`, a `watch` job with op `renew`);
 *   subscriptionRemoved     → the channel is stopped here, then re-created (`recreate`) and a `missed` pull queued
 *                             (the delta cursor covers the gap);
 *   missed                  → a `missed` pull.
 * Pulls of a connection that can't be pulled (not `ok`, inactive user) are skipped; a re-create needs an `ok` row too.
 */
export async function handleLifecycle(connectionId: string, channelId: string, event: LifecycleEvent, now: Date = new Date()): Promise<string[]> {
    const done: string[] = [];
    if (event === 'reauthorizationRequired') {
        await enqueueWatch(connectionId, 'renew', now);
        done.push(`renew:${connectionId}`);
        return done;
    }
    if (event === 'subscriptionRemoved') {
        await prisma.calendarWatchChannel.updateMany({ where: { id: channelId, status: 'active' }, data: { status: 'stopped' } });
        await enqueueWatch(connectionId, 'recreate', now);
        done.push(`recreate:${connectionId}`);
    }
    if (await pullableConnection(connectionId)) {
        await notePing(connectionId, 'missed', now);
        done.push(`pull:${connectionId}`);
    }
    return done;
}

/** Logging helper: the outcome of a request, never its content. */
export function logWebhook(provider: 'google' | 'microsoft', outcome: WebhookOutcome | GraphOutcome): void {
    if (typeof outcome === 'string') {
        if (outcome === 'bad_token' || outcome === 'resource_mismatch') logger.warn({ provider, outcome }, 'Calendar webhook refused');
        else logger.debug({ provider, outcome }, 'Calendar webhook');
        return;
    }
    if ((outcome.ignored.bad_token ?? 0) > 0 || (outcome.ignored.tenant ?? 0) > 0) logger.warn({ provider, ignored: outcome.ignored }, 'Calendar webhook items refused');
    else logger.debug({ provider, pulled: outcome.pulled.length, lifecycle: outcome.lifecycle.length, ignored: outcome.ignored }, 'Calendar webhook');
}

/** Whether webhooks are wanted at all on this server (ENV only, no reads): the route's cheapest gate. */
export const webhooksConfigured = (): boolean => ENV.INTEGRATIONS.WEBHOOKS_ACTIVE;
