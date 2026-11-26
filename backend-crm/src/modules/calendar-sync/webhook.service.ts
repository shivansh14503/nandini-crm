import { ENV } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { prisma } from '../../config/prisma.js';
import { isRedisReady, redis } from '../../config/redis.js';
import { calendarSyncQueue, tryEnqueue } from '../../jobs/queues.js';
import { secretBox } from '../../services/secretBox.js';
import { loadProviderAccess } from './providers/registry.js';
import { channelToken, enqueueWatch, isChannelId, sameToken, webhookHmac, webhooksLive } from './sync.channels.js';
import { CALENDAR_SYNC_JOBS, type PullReason } from './sync.constants.js';
import { followUpPullJobId, pullJobId } from './sync.keys.js';
import type { PullJobData } from './sync.wake.js';
import { isInsideSyncHours } from './syncHours.js';

/**
 * What the webhook routes do with a notification (Calendar Phase 2 spec §3.4, D25, D26; P2-7). The routes answer the
 * provider at once (Google 200, Graph 202) and hand the notification here.
 *
 * - **Verification**: Google `X-Goog-Channel-Token` = b64url HMAC(webhook subkey, channel id) is first checked against
 *   every ring key **before any database read** (a forged ping never wakes the database), then the channel row must
 *   be active, signed with that key, on Google, with the stored `X-Goog-Resource-ID`. Graph: each `subscriptionId` →
 *   active channel; `clientState` = HMAC(subkey of the row's key, `connectionId:generation`); `tenantId` = the configured
 *   tenant. Constant-time compares throughout.
 * - **Quiet hours**: outside CALENDAR_SYNC_HOURS change notifications are acknowledged and dropped before any read, so
 *   a ping at night never wakes Azure SQL. Nothing is lost: the first poll of the morning pulls every person (their
 *   last pull is older than the safety-net interval). Graph lifecycle notifications are processed at any hour (rare;
 *   dropping one would leave a dead channel marked active).
 * - **Then**: the connection must be live in `ok` and its user active and not a group login (D43). A `pull` job
 *   (`pull-<connectionId>-<10 s bucket>`, 2 s delay, so a burst of pings is one pull, shared with polls and Sync now)
 *   and a Redis stamp `calsync:notified:<connectionId>` (D26: a pull already running when the ping came queues one more
 *   when it ends). Redis down: an in-process pull, one at a time per connection (a ping during it runs it once more).
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

async function stampNotified(connectionId: string, now: Date): Promise<void> {
    if (!isRedisReady()) return;
    try {
        await redis.set(notifiedKey(connectionId), String(now.getTime()), 'EX', NOTIFIED_TTL_SECONDS);
    } catch {
        // Best effort: without the stamp a ping during a running pull waits for the next poll.
    }
}

/** A verified change notification for one connection: stamp, then a `pull` job (or an in-process pull). */
export async function notePing(connectionId: string, reason: PullReason, now: Date = new Date()): Promise<'queued' | 'inline'> {
    await stampNotified(connectionId, now);
    const id = await tryEnqueue(calendarSyncQueue, CALENDAR_SYNC_JOBS.pull, { connectionId, reason } satisfies PullJobData, {
        jobId: pullJobId(connectionId, now),
        delay: WEBHOOK_PULL_DELAY_MS,
        attempts: 1,
    });
    if (id !== null) return 'queued';
    inlinePull(connectionId);
    return 'inline';
}

/**
 * D26: after a pull job that started at `startedAt` finished, one more pull when a webhook came while it ran (its own
 * job of the same 10 s bucket may have been dropped as a duplicate). Returns whether it queued one.
 */
export async function pullAgainIfNotified(connectionId: string, startedAt: Date, now: Date = new Date()): Promise<boolean> {
    if (!isRedisReady()) return false;
    let stamp: string | null = null;
    try {
        stamp = await redis.get(notifiedKey(connectionId));
    } catch {
        return false;
    }
    if (!stamp || Number(stamp) < startedAt.getTime()) return false;
    const id = await tryEnqueue(calendarSyncQueue, CALENDAR_SYNC_JOBS.pull, { connectionId, reason: 'webhook' } satisfies PullJobData, {
        jobId: followUpPullJobId(connectionId, now),
        delay: WEBHOOK_PULL_DELAY_MS,
        attempts: 1,
    });
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
    const usable = wanted.filter((item) => {
        const ok = str(item.subscriptionId).length > 0 && str(item.subscriptionId).length <= 200 && str(item.clientState).length > 0 && str(item.clientState).length <= 128;
        if (!ok) ignore('malformed');
        return ok;
    });
    if (usable.length === 0) return out;

    const access = await loadProviderAccess('microsoft');
    const tenantId = access.creds?.kind === 'microsoft' ? access.creds.tenantId.toLowerCase() : '';
    const ids = [...new Set(usable.map((item) => str(item.subscriptionId)))];
    const channels = await prisma.calendarWatchChannel.findMany({
        where: { externalId: { in: ids }, status: 'active', provider: 'microsoft' },
        select: { id: true, connectionId: true, provider: true, externalId: true, tokenKeyId: true, generation: true },
    });
    const channelOf = new Map(channels.map((c) => [c.externalId ?? '', c]));

    const toPull = new Set<string>();
    const lifecycle = new Map<string, { event: LifecycleEvent; channelId: string }>();
    for (const item of usable) {
        const channel = channelOf.get(str(item.subscriptionId));
        if (!channel) {
            ignore('unknown_channel');
            continue;
        }
        let expected: string;
        try {
            expected = channelToken('microsoft', channel, channel.tokenKeyId);
        } catch {
            ignore('bad_token');
            continue;
        }
        if (!sameToken(expected, str(item.clientState))) {
            ignore('bad_token');
            continue;
        }
        if (!tenantId || str(item.tenantId).toLowerCase() !== tenantId) {
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
