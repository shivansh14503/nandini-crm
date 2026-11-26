import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { ENV } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { prisma } from '../../config/prisma.js';
import { calendarSyncQueue, tryEnqueue } from '../../jobs/queues.js';
import { secretBox } from '../../services/secretBox.js';
import { webhookUrlsFor } from '../integrations/integration.constants.js';
import { ConnectionUnavailableError, withCalendarAccess } from './calendarAccess.js';
import { isCalendarProvider, type CalendarProvider } from './connection.constants.js';
import { GOOGLE_WATCH_TTL_SECONDS } from './providers/googleWatch.js';
import { GRAPH_SUBSCRIPTION_MINUTES } from './providers/graphWatch.js';
import { ProviderError, ProviderRateLimitedError, ProviderTransientError } from './providers/http.js';
import { getAdapter, isFakeProviderEnabled, loadProviderAccess } from './providers/registry.js';
import type { CallCtx, WatchChannelRef } from './providers/types.js';
import { CALENDAR_SYNC_JOBS } from './sync.constants.js';
import { watchJobId } from './sync.keys.js';
import { enqueuePull } from './sync.wake.js';
import { tokenSource } from './tokenSource.js';

/**
 * Webhook channels (Calendar Phase 2 spec §3.4, §4.5, §10.1 nightly step 5; admin-managed model addendum §8.6; P2-7):
 * one Google push channel (`events.watch`, impersonated) or Microsoft Graph subscription (`users/{mailbox}/events`,
 * app-only) per synced person, so a change made in their calendar reaches the CRM within seconds.
 *
 * - **When**: only while webhooks are live (`PUBLIC_API_URL` https, `CALENDAR_WEBHOOKS_ENABLED`, `CALENDAR_SYNC_ENABLED`,
 *   encryption key set) and only for a live row in `ok`. `ensure` runs after the row's `enrolled` job, from the poll tick
 *   (≤ 20 people per tick, inside CALENDAR_SYNC_HOURS) and from the nightly run (everyone; plus the Graph existence check
 *   and clean-up). Lifecycle notifications queue `watch` jobs (webhook.service.ts).
 * - **Identity**: our channel id `w<8 hex>-<uuid>` (≤ 64 chars [V]); the 8 hex are sha256(PUBLIC_API_URL), so a channel
 *   made for another address is replaced like one signed with an old key. Google `token` = b64url HMAC-SHA256(webhook
 *   subkey of the ring key `tokenKeyId`, channel id); Graph `clientState` = the same HMAC over
 *   `connectionId:generation` (≤ 128 [V]). No secret column; every ring key verifies (key rotation, D25).
 * - **Renewal**: 3 days before expiry, for an old key id or another address. Google has no renew call [V]: a new channel
 *   is created first, then the old one stopped (both deliver meanwhile; pings are idempotent pulls). Graph: `PATCH`
 *   with a new expiry (404 → re-create with `generation + 1`); a new key / address re-creates too.
 * - **Failures** never touch sync itself: a refused watch call marks neither the person's row nor the provider
 *   (`withCalendarAccess` read-only mode) and leaves a `failed` row (retried after 6 hours by the poll tick, nightly
 *   always); the person keeps the normal poll interval. Transient errors are retried by the next tick.
 * - **Stop**: a stopped row (excluded, inactive, email / provider changed, provider switched off: enrolment.ts) stops its
 *   channels best effort (rows marked `stopped` first, so pings are ignored at once; then Google `channels.stop` / Graph
 *   `DELETE`, 5 s each). Webhooks switched off: the nightly run stops what is left. Stopped / failed rows are deleted
 *   30 days after they were created.
 * - No lease: two `ensure` runs racing for one person can leave two channels; the next run stops the older one.
 * Nothing here logs a token, a clientState or a provider body.
 */

// ── Constants ────────────────────────────────────────────────────────────────────────────────────────────────

/** `CalendarWatchChannel.status`. */
export const CHANNEL_STATUSES = ['active', 'stopped', 'failed'] as const;
export type ChannelStatus = (typeof CHANNEL_STATUSES)[number];

/** `watch` job operations. */
export const WATCH_OPS = ['ensure', 'renew', 'recreate', 'stop'] as const;
export type WatchOp = (typeof WATCH_OPS)[number];

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** Renew (Graph) / replace (Google) a channel expiring within this (spec §10.1 step 5). */
export const CHANNEL_RENEW_BEFORE_MS = 3 * DAY;
/** A channel counts as healthy for the slow safety-net poll while it has at least this long left. */
export const CHANNEL_HEALTHY_MARGIN_MS = 60 * MINUTE;
/** A refused watch is tried again by the poll tick after this (the nightly run always tries). */
export const CHANNEL_FAILED_RETRY_MS = 6 * 60 * MINUTE;
/** Stopped / failed rows are deleted this long after they were created. */
export const CHANNEL_RETENTION_MS = 30 * DAY;
/** People whose channel the poll tick creates / renews per tick (bounded; the nightly run does everyone). */
export const POLL_CHANNEL_LIMIT = 20;
/** Upper bound of the nightly run (creates / renews, existence checks, stops). */
export const NIGHTLY_CHANNEL_LIMIT = 500;

/** Requested life of a new channel: Google 7 days (ttl, [V]); Graph 10,000 minutes (max 10,080 for Outlook events [V]). */
export function channelLifeMs(provider: CalendarProvider): number {
    return provider === 'microsoft' ? GRAPH_SUBSCRIPTION_MINUTES * MINUTE : GOOGLE_WATCH_TTL_SECONDS * 1000;
}

// ── Tokens and ids (pure) ───────────────────────────────────────────────────────────────────────────────────

/** b64url HMAC-SHA256 (43 characters). */
export function webhookHmac(key: Buffer, text: string): string {
    return createHmac('sha256', key).update(text, 'utf8').digest('base64url');
}

/** Constant-time comparison of two tokens (false when the lengths differ). */
export function sameToken(expected: string, actual: string): boolean {
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(actual, 'utf8');
    return a.length === b.length && timingSafeEqual(a, b);
}

/** What a provider's HMAC is computed over: Google / fake the channel id; Graph `connectionId:generation`. */
export function signedText(provider: string, channel: { id: string; connectionId: string; generation: number }): string {
    return provider === 'microsoft' ? `${channel.connectionId}:${channel.generation}` : channel.id;
}

/** The token / clientState of a channel under ring key `kid` (throws when the key isn't in the ring). */
export function channelToken(provider: string, channel: { id: string; connectionId: string; generation: number }, kid: string): string {
    return webhookHmac(secretBox.webhookKey(kid), signedText(provider, channel));
}

/** The first 8 hex of sha256(public API URL): part of every channel id. */
export function addressTag(publicApiUrl: string): string {
    return createHash('sha256').update(publicApiUrl.replace(/\/+$/, ''), 'utf8').digest('hex').slice(0, 8);
}

export function newChannelId(tag: string): string {
    return `w${tag}-${randomUUID()}`;
}

const CHANNEL_ID_PATTERN = /^w([0-9a-f]{8})-[0-9a-f-]{36}$/;
/** A well-formed channel id of ours (webhook route pre-check, before any read). */
export const isChannelId = (value: string): boolean => CHANNEL_ID_PATTERN.test(value);
const tagOf = (channelId: string): string | null => CHANNEL_ID_PATTERN.exec(channelId)?.[1] ?? null;

/** Webhooks are live in this process: https address, both switches on, encryption key set. */
export function webhooksLive(): boolean {
    const i = ENV.INTEGRATIONS;
    return Boolean(i.WEBHOOKS_ACTIVE && i.SYNC_ENABLED && i.PUBLIC_API_URL) && secretBox.ready();
}

/** The addresses a provider's channels call (the fake is Google-shaped). */
export function webhookAddresses(provider: CalendarProvider, publicApiUrl: string): { address: string; lifecycleAddress?: string } {
    const urls = webhookUrlsFor(provider === 'microsoft' ? 'microsoft' : 'google', publicApiUrl) ?? [];
    return provider === 'microsoft' ? { address: urls[0], lifecycleAddress: urls[1] } : { address: urls[0] };
}

// ── The plan for one person (pure) ─────────────────────────────────────────────────────────────────────────

export interface ChannelRow {
    id: string;
    connectionId: string;
    provider: string;
    externalId: string | null;
    tokenKeyId: string;
    generation: number;
    expiresAt: Date;
    status: string;
    createdAt: Date;
}

export interface PlanContext {
    now: Date;
    activeKid: string;
    addressTag: string;
    /** The provider can extend a channel in place (Graph, the fake); Google can't. */
    canRenew: boolean;
    /** 0 = ignore the failed-row backoff (nightly, lifecycle re-create). */
    failedRetryMs: number;
    /** Renew now whatever the expiry (Graph `reauthorizationRequired`). */
    forceRenew?: boolean;
}

export type ChannelAction =
    | { action: 'none' }
    /** A refused watch is backing off. */
    | { action: 'wait' }
    | { action: 'create' }
    | { action: 'renew'; channel: ChannelRow }
    /** New channel first, then the old one stopped. */
    | { action: 'replace'; channel: ChannelRow; why: 'expiring' | 'key' | 'address' };

export interface ChannelPlan {
    next: ChannelAction;
    /** Active rows already past their expiry: marked stopped (nothing to tell the provider). */
    expired: ChannelRow[];
    /** Older healthy channels next to the current one: stopped at the provider too. */
    duplicates: ChannelRow[];
}

export function planChannel(rows: readonly ChannelRow[], ctx: PlanContext): ChannelPlan {
    const now = ctx.now.getTime();
    const active = rows.filter((r) => r.status === 'active');
    const expired = active.filter((r) => r.expiresAt.getTime() <= now);
    const healthy = active.filter((r) => r.expiresAt.getTime() > now).sort((a, b) => b.expiresAt.getTime() - a.expiresAt.getTime());
    const [current, ...duplicates] = healthy;
    if (!current) {
        const lastFailed = rows.filter((r) => r.status === 'failed').sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
        const waiting = lastFailed && ctx.failedRetryMs > 0 && now - lastFailed.createdAt.getTime() < ctx.failedRetryMs;
        return { next: waiting ? { action: 'wait' } : { action: 'create' }, expired, duplicates };
    }
    if (current.tokenKeyId !== ctx.activeKid) return { next: { action: 'replace', channel: current, why: 'key' }, expired, duplicates };
    if (tagOf(current.id) !== ctx.addressTag) return { next: { action: 'replace', channel: current, why: 'address' }, expired, duplicates };
    if (!current.externalId) return { next: { action: 'replace', channel: current, why: 'expiring' }, expired, duplicates };
    if (ctx.forceRenew || current.expiresAt.getTime() - now < CHANNEL_RENEW_BEFORE_MS) {
        return { next: ctx.canRenew ? { action: 'renew', channel: current } : { action: 'replace', channel: current, why: 'expiring' }, expired, duplicates };
    }
    return { next: { action: 'none' }, expired, duplicates };
}

/** Whether a plan has anything to do. Pure. */
export const planHasWork = (plan: ChannelPlan): boolean =>
    (plan.next.action !== 'none' && plan.next.action !== 'wait') || plan.expired.length > 0 || plan.duplicates.length > 0;

// ── Applying it ─────────────────────────────────────────────────────────────────────────────────────────────

export type EnsureOutcome = 'off' | 'skipped' | 'unsupported' | 'none' | 'wait' | 'created' | 'renewed' | 'replaced' | 'failed' | 'transient';

export interface EnsureOptions {
    now?: Date;
    forceRenew?: boolean;
    /** Ignore the 6-hour backoff after a refused watch. */
    ignoreBackoff?: boolean;
}

const CHANNEL_SELECT = { id: true, connectionId: true, provider: true, externalId: true, tokenKeyId: true, generation: true, expiresAt: true, status: true, createdAt: true } as const;

interface ConnectionFacts {
    id: string;
    provider: CalendarProvider;
    status: string;
    accountEmail: string;
    calendarId: string;
}

async function connectionFacts(connectionId: string): Promise<ConnectionFacts | null> {
    const row = await prisma.calendarConnection.findUnique({ where: { id: connectionId }, select: { id: true, provider: true, status: true, accountEmail: true, calendarId: true } });
    if (!row || !isCalendarProvider(row.provider)) return null;
    return { ...row, provider: row.provider };
}

const refOf = (channel: ChannelRow): WatchChannelRef => ({ channelId: channel.id, externalId: channel.externalId ?? '' });

/** How a failed watch call ends: a refusal (failed row), a transient problem (next tick), or the row can't be used. */
function watchFailure(err: unknown): 'failed' | 'transient' | 'skipped' {
    if (err instanceof ConnectionUnavailableError) return err.reason === 'call_refused' ? 'failed' : 'skipped';
    if (err instanceof ProviderRateLimitedError || err instanceof ProviderTransientError) return 'transient';
    if (err instanceof ProviderError) return 'failed';
    throw err;
}

const errorCode = (err: unknown): string =>
    err instanceof ConnectionUnavailableError ? (err.failure?.code ?? err.reason) : err instanceof ProviderError ? err.code : 'error';

/**
 * Creates, renews or replaces one person's channel as the plan says (see the file header). Never throws for provider
 * problems; returns what happened.
 */
export async function ensureChannel(connectionId: string, options: EnsureOptions = {}): Promise<EnsureOutcome> {
    if (!webhooksLive()) return 'off';
    const now = options.now ?? new Date();
    const connection = await connectionFacts(connectionId);
    if (!connection || connection.status !== 'ok') return 'skipped';
    if (connection.provider === 'fake' && !isFakeProviderEnabled()) return 'skipped';
    const adapter = getAdapter(connection.provider);
    if (!adapter.watch) return 'unsupported';
    const rows = (await prisma.calendarWatchChannel.findMany({ where: { connectionId, status: { in: ['active', 'failed'] } }, select: CHANNEL_SELECT })) as ChannelRow[];
    const plan = planChannel(rows, {
        now,
        activeKid: secretBox.activeKid() ?? '',
        addressTag: addressTag(ENV.INTEGRATIONS.PUBLIC_API_URL ?? ''),
        canRenew: connection.provider !== 'google' && Boolean(adapter.renewWatch),
        failedRetryMs: options.ignoreBackoff ? 0 : CHANNEL_FAILED_RETRY_MS,
        forceRenew: options.forceRenew,
    });
    if (plan.expired.length > 0) await markStopped(plan.expired.map((c) => c.id));
    if (plan.duplicates.length > 0) await stopChannelRows(connection, plan.duplicates);

    switch (plan.next.action) {
        case 'none':
        case 'wait':
            return plan.next.action;
        case 'create':
            return createChannel(connection, now);
        case 'renew':
            return renewChannel(connection, plan.next.channel, now);
        case 'replace': {
            const outcome = await createChannel(connection, now);
            // The old channel keeps delivering until the new one exists (Google overlap); then it is stopped.
            if (outcome !== 'created') return outcome;
            await stopChannelRows(connection, [plan.next.channel]);
            logger.info({ connectionId, why: plan.next.why }, 'Calendar webhook channel replaced');
            return 'replaced';
        }
    }
}

async function nextGeneration(connectionId: string): Promise<number> {
    const last = await prisma.calendarWatchChannel.findFirst({ where: { connectionId }, select: { generation: true }, orderBy: { generation: 'desc' } });
    return (last?.generation ?? 0) + 1;
}

async function createChannel(connection: ConnectionFacts, now: Date): Promise<EnsureOutcome> {
    const publicApiUrl = ENV.INTEGRATIONS.PUBLIC_API_URL ?? '';
    const kid = secretBox.activeKid() ?? '';
    const id = newChannelId(addressTag(publicApiUrl));
    const generation = await nextGeneration(connection.id);
    const token = channelToken(connection.provider, { id, connectionId: connection.id, generation }, kid);
    const expiresAt = new Date(now.getTime() + channelLifeMs(connection.provider));
    const adapter = getAdapter(connection.provider);
    let created: { externalId: string; expiresAt: Date };
    try {
        created = await withCalendarAccess(connection.id, (ctx) => adapter.watch!(ctx, { channelId: id, ...webhookAddresses(connection.provider, publicApiUrl), token, expiresAt }), {
            readOnly: true,
            clock: () => now,
        });
    } catch (err) {
        const outcome = watchFailure(err);
        if (outcome === 'failed') {
            // A row in `failed` backs the next try off (and shows on Admin › API Integrations); it never delivers.
            await prisma.calendarWatchChannel.create({
                data: { id: newChannelId(addressTag(publicApiUrl)), connectionId: connection.id, provider: connection.provider, externalId: null, tokenKeyId: kid, generation, expiresAt: now, status: 'failed', createdAt: now },
            });
        }
        logger.warn({ connectionId: connection.id, provider: connection.provider, outcome, code: errorCode(err) }, 'Calendar webhook channel not created; polling continues');
        return outcome;
    }
    try {
        await prisma.calendarWatchChannel.create({
            data: { id, connectionId: connection.id, provider: connection.provider, externalId: created.externalId, tokenKeyId: kid, generation, expiresAt: created.expiresAt, status: 'active', createdAt: now },
        });
    } catch (err) {
        // The provider has a channel we couldn't record: stop it (it would only send pings we ignore until it expires).
        await stopAtProvider(connection, { id, externalId: created.externalId } as ChannelRow);
        throw err;
    }
    logger.info({ connectionId: connection.id, provider: connection.provider, expiresAt: created.expiresAt.toISOString() }, 'Calendar webhook channel created');
    return 'created';
}

async function renewChannel(connection: ConnectionFacts, channel: ChannelRow, now: Date): Promise<EnsureOutcome> {
    const adapter = getAdapter(connection.provider);
    const expiresAt = new Date(now.getTime() + channelLifeMs(connection.provider));
    let result: { expiresAt: Date } | 'recreate';
    try {
        result = await withCalendarAccess(connection.id, (ctx) => adapter.renewWatch!(ctx, refOf(channel), expiresAt), { readOnly: true, clock: () => now });
    } catch (err) {
        const outcome = watchFailure(err);
        logger.warn({ connectionId: connection.id, outcome, code: errorCode(err) }, 'Calendar webhook subscription not renewed; tried again later');
        // A refused renewal: re-create (a new subscription, generation + 1), then let the old one go.
        if (outcome !== 'failed') return outcome;
        result = 'recreate';
    }
    if (result === 'recreate') {
        await markStopped([channel.id]);
        const outcome = await createChannel(connection, now);
        if (outcome === 'created') await stopAtProvider(connection, channel);
        return outcome === 'created' ? 'replaced' : outcome;
    }
    await prisma.calendarWatchChannel.updateMany({ where: { id: channel.id, status: 'active' }, data: { expiresAt: result.expiresAt } });
    return 'renewed';
}

async function markStopped(ids: readonly string[]): Promise<number> {
    if (ids.length === 0) return 0;
    return (await prisma.calendarWatchChannel.updateMany({ where: { id: { in: [...ids] }, status: 'active' }, data: { status: 'stopped' } })).count;
}

/** Best effort, never throws: the provider is told to stop sending (the row is already `stopped`). */
async function stopAtProvider(connection: Pick<ConnectionFacts, 'id' | 'provider' | 'accountEmail' | 'calendarId'>, channel: Pick<ChannelRow, 'id' | 'externalId'>): Promise<boolean> {
    const adapter = getAdapter(connection.provider);
    if (!adapter.stopWatch || !channel.externalId) return false;
    const email = connection.accountEmail.toLowerCase();
    try {
        // Not through withCalendarAccess: the row may already be stopped. The token is minted for the same person
        // (Google: only the channel's own user and client may stop it [V]).
        const grant = await tokenSource.getAccessToken(connection.provider, email);
        const ctx: CallCtx = { accessToken: grant.accessToken, calendarId: connection.calendarId, accountEmail: email, mailbox: email };
        await adapter.stopWatch(ctx, { channelId: channel.id, externalId: channel.externalId });
        return true;
    } catch (err) {
        logger.info({ connectionId: connection.id, code: errorCode(err) }, 'Could not stop a calendar webhook channel at the provider (it expires on its own; its pings are ignored)');
        return false;
    }
}

async function stopChannelRows(connection: Pick<ConnectionFacts, 'id' | 'provider' | 'accountEmail' | 'calendarId'>, channels: readonly ChannelRow[]): Promise<number> {
    await markStopped(channels.map((c) => c.id));
    let stopped = 0;
    for (const channel of channels) if (await stopAtProvider(connection, channel)) stopped += 1;
    return stopped;
}

/** Stops every active channel of a connection (row stopped, provider switched off, webhooks off). Never throws. */
export async function stopConnectionChannels(connectionId: string): Promise<number> {
    try {
        const channels = (await prisma.calendarWatchChannel.findMany({ where: { connectionId, status: 'active' }, select: CHANNEL_SELECT })) as ChannelRow[];
        if (channels.length === 0) return 0;
        const connection = await connectionFacts(connectionId);
        if (!connection) return markStopped(channels.map((c) => c.id));
        await stopChannelRows(connection, channels);
        return channels.length;
    } catch (err) {
        logger.warn({ connectionId, err: (err as Error).message }, 'Could not stop calendar webhook channels (the nightly run retries)');
        return 0;
    }
}

// ── Jobs ────────────────────────────────────────────────────────────────────────────────────────────────────

export interface WatchJobData {
    connectionId: string;
    op: WatchOp;
}

export const isWatchOp = (value: unknown): value is WatchOp => typeof value === 'string' && (WATCH_OPS as readonly string[]).includes(value);

/** The `watch` job (and its in-process twin while Redis is down). */
export async function runWatchJob(connectionId: string, op: WatchOp, now: Date = new Date()): Promise<EnsureOutcome | number> {
    switch (op) {
        case 'ensure':
            return ensureChannel(connectionId, { now });
        case 'renew':
            return ensureChannel(connectionId, { now, forceRenew: true, ignoreBackoff: true });
        case 'recreate':
            return ensureChannel(connectionId, { now, ignoreBackoff: true });
        case 'stop':
            return stopConnectionChannels(connectionId);
    }
}

type InlineWatch = (connectionId: string, op: WatchOp) => void;
const defaultInlineWatch: InlineWatch = (connectionId, op) => {
    setImmediate(() => {
        void runWatchJob(connectionId, op).catch((err: Error) => logger.warn({ connectionId, op, err: err.message }, 'In-process calendar webhook job failed'));
    });
};
let inlineWatch: InlineWatch = defaultInlineWatch;
/** Tests: capture in-process watch jobs (null = the real runner). */
export function setInlineWatchForTests(runner: InlineWatch | null): void {
    inlineWatch = runner ?? defaultInlineWatch;
}

/** Queues a `watch` job (one per connection, op and minute); without Redis it runs in this process after the response. */
export async function enqueueWatch(connectionId: string, op: WatchOp, now: Date = new Date()): Promise<'queued' | 'inline'> {
    const id = await tryEnqueue(calendarSyncQueue, CALENDAR_SYNC_JOBS.watch, { connectionId, op } satisfies WatchJobData, { jobId: watchJobId(connectionId, op, now), attempts: 3 });
    if (id !== null) return 'queued';
    inlineWatch(connectionId, op);
    return 'inline';
}

/**
 * After the enrolment commit stopped a connection row: its active channels are marked `stopped` at once (pings ignored
 * from now on), then the provider is told in the background (not awaited: a provider switched off for many people
 * must not hold the admin's request). Never throws; the nightly run stops anything left.
 */
export async function stopChannelsQuietly(connectionId: string): Promise<void> {
    try {
        const channels = (await prisma.calendarWatchChannel.findMany({ where: { connectionId, status: 'active' }, select: CHANNEL_SELECT })) as ChannelRow[];
        if (channels.length === 0) return;
        await markStopped(channels.map((c) => c.id));
        backgroundStop(connectionId, channels);
    } catch (err) {
        logger.warn({ connectionId, err: (err as Error).message }, 'Could not stop calendar webhook channels (the nightly run retries)');
    }
}

type BackgroundStop = (connectionId: string, channels: readonly ChannelRow[]) => void;
const defaultBackgroundStop: BackgroundStop = (connectionId, channels) => {
    setImmediate(() => {
        void (async () => {
            const connection = await connectionFacts(connectionId);
            if (!connection) return;
            for (const channel of channels) await stopAtProvider(connection, channel);
        })().catch((err: Error) => logger.info({ connectionId, err: err.message }, 'Calendar webhook stop calls failed (channels expire on their own)'));
    });
};
let backgroundStop: BackgroundStop = defaultBackgroundStop;
/** Tests: capture (or await) the background provider stop calls (null = the real runner). */
export function setBackgroundStopForTests(runner: BackgroundStop | null): void {
    backgroundStop = runner ?? defaultBackgroundStop;
}

/** Tests: the real background stop, awaited. */
export async function stopAtProviderForTests(connectionId: string, channels: readonly ChannelRow[]): Promise<void> {
    const connection = await connectionFacts(connectionId);
    if (connection) for (const channel of channels) await stopAtProvider(connection, channel);
}

// ── Healthy channels (the poll's safety-net interval) ────────────────────────────────────────────────────────

/** Connections with an active channel that has at least an hour left (one indexed read on `[status, expiresAt]`). */
export async function healthyChannelConnectionIds(now: Date = new Date()): Promise<Set<string>> {
    if (!webhooksLive()) return new Set();
    const rows = await prisma.calendarWatchChannel.findMany({
        where: { status: 'active', expiresAt: { gt: new Date(now.getTime() + CHANNEL_HEALTHY_MARGIN_MS) } },
        select: { connectionId: true },
    });
    return new Set(rows.map((r) => r.connectionId));
}

/**
 * Minutes between background pulls of one person: CALENDAR_POLL_MINUTES, or CALENDAR_POLL_MINUTES_WITH_WEBHOOKS while
 * their channel is healthy (never shorter than the normal interval). Pure apart from ENV.
 */
export function pollIntervalMinutes(hasHealthyChannel: boolean, pollMinutes: number): number {
    return hasHealthyChannel ? Math.max(pollMinutes, ENV.INTEGRATIONS.POLL_MINUTES_WITH_WEBHOOKS) : pollMinutes;
}

/** A pull is due when the last one is at least the interval old (a minute of slack, so a tick a few seconds early counts). */
export function pullIsDue(lastPulledAt: Date | null, intervalMinutes: number, now: Date): boolean {
    return !lastPulledAt || lastPulledAt.getTime() <= now.getTime() - intervalMinutes * MINUTE + MINUTE;
}

// ── Maintenance (poll tick, nightly) ────────────────────────────────────────────────────────────────────────

export interface ChannelMaintenance {
    ensured: number;
    created: number;
    renewed: number;
    failed: number;
    stopped: number;
    missing: number;
    deleted: number;
}

const emptyMaintenance = (): ChannelMaintenance => ({ ensured: 0, created: 0, renewed: 0, failed: 0, stopped: 0, missing: 0, deleted: 0 });

async function usableProviders(providers: readonly string[]): Promise<Set<CalendarProvider>> {
    const usable = new Set<CalendarProvider>();
    for (const provider of new Set(providers)) {
        if (!isCalendarProvider(provider)) continue;
        if (provider === 'fake' && !isFakeProviderEnabled()) continue;
        const access = await loadProviderAccess(provider);
        if (access.enabled && access.configured) usable.add(provider);
    }
    return usable;
}

const count = (into: ChannelMaintenance, outcome: EnsureOutcome) => {
    into.ensured += 1;
    if (outcome === 'created') into.created += 1;
    if (outcome === 'renewed' || outcome === 'replaced') into.renewed += 1;
    if (outcome === 'failed') into.failed += 1;
};

/**
 * Channel upkeep. `poll` (inside CALENDAR_SYNC_HOURS, the database is awake anyway): creates / renews at most 20
 * people's channels, respecting the failed-row backoff. `nightly` (00:25, inside the nightly wake): everyone (≤ 500),
 * failed ones tried again, stray channels stopped, Graph subscriptions checked (`GET /subscriptions/{id}`; 404 →
 * re-create + a `missed` pull), old rows deleted; with webhooks off, every channel still active is stopped.
 */
export async function maintainChannels(mode: 'poll' | 'nightly', now: Date = new Date()): Promise<ChannelMaintenance> {
    const result = emptyMaintenance();
    const nightly = mode === 'nightly';
    if (!webhooksLive()) {
        if (!nightly) return result;
        const active = await prisma.calendarWatchChannel.findMany({ where: { status: 'active' }, select: { connectionId: true }, take: NIGHTLY_CHANNEL_LIMIT });
        for (const connectionId of new Set(active.map((c) => c.connectionId))) result.stopped += await stopConnectionChannels(connectionId);
        result.deleted = await deleteOldChannels(now);
        return result;
    }

    const okRows = await prisma.calendarConnection.findMany({ where: { status: 'ok' }, select: { id: true, provider: true } });
    const usable = await usableProviders(okRows.map((r) => r.provider));
    const eligible = okRows.filter((r) => usable.has(r.provider as CalendarProvider) && getAdapter(r.provider as CalendarProvider).watch);
    const channels = (await prisma.calendarWatchChannel.findMany({ where: { status: { in: ['active', 'failed'] } }, select: CHANNEL_SELECT })) as ChannelRow[];
    const byConnection = new Map<string, ChannelRow[]>();
    for (const channel of channels) byConnection.set(channel.connectionId, [...(byConnection.get(channel.connectionId) ?? []), channel]);

    const ctxBase = { now, activeKid: secretBox.activeKid() ?? '', addressTag: addressTag(ENV.INTEGRATIONS.PUBLIC_API_URL ?? ''), failedRetryMs: nightly ? 0 : CHANNEL_FAILED_RETRY_MS };
    const limit = nightly ? NIGHTLY_CHANNEL_LIMIT : POLL_CHANNEL_LIMIT;
    const touched = new Set<string>();
    for (const row of eligible) {
        const provider = row.provider as CalendarProvider;
        const plan = planChannel(byConnection.get(row.id) ?? [], { ...ctxBase, canRenew: provider !== 'google' && Boolean(getAdapter(provider).renewWatch) });
        if (plan.next.action === 'create' || plan.next.action === 'wait') result.missing += 1;
        if (!planHasWork(plan)) continue;
        if (touched.size >= limit) continue;
        touched.add(row.id);
        count(result, await ensureChannel(row.id, { now, ignoreBackoff: nightly }));
    }
    if (!nightly) {
        if (result.ensured > 0) logger.info({ ...result }, 'Calendar webhook channels maintained');
        return result;
    }

    // Stray channels: their connection is stopped, gone, or its provider can't be used any more.
    const eligibleIds = new Set(eligible.map((r) => r.id));
    const strayIds = [...new Set(channels.filter((c) => c.status === 'active' && !eligibleIds.has(c.connectionId)).map((c) => c.connectionId))];
    if (strayIds.length > 0) {
        const owners = await prisma.calendarConnection.findMany({ where: { id: { in: strayIds } }, select: { id: true, status: true, provider: true } });
        const ownerOf = new Map(owners.map((o) => [o.id, o]));
        for (const connectionId of strayIds.slice(0, NIGHTLY_CHANNEL_LIMIT)) {
            const owner = ownerOf.get(connectionId);
            // An `error` / `pending` row keeps its channel until it expires (pings for it are ignored meanwhile).
            const keep = owner && (owner.status === 'error' || owner.status === 'pending') && usable.has(owner.provider as CalendarProvider);
            if (!keep) result.stopped += await stopConnectionChannels(connectionId);
        }
    }

    // Backstop for a lost `subscriptionRemoved`: does the provider still know each healthy subscription?
    let checks = 0;
    for (const channel of channels) {
        if (checks >= NIGHTLY_CHANNEL_LIMIT) break;
        if (channel.status !== 'active' || touched.has(channel.connectionId) || !eligibleIds.has(channel.connectionId) || channel.expiresAt <= now || !channel.externalId) continue;
        const provider = channel.provider as CalendarProvider;
        const adapter = getAdapter(provider);
        if (provider === 'google' || !adapter.watchExists) continue;
        checks += 1;
        let exists = true;
        try {
            exists = await withCalendarAccess(channel.connectionId, (ctx) => adapter.watchExists!(ctx, refOf(channel)), { readOnly: true, clock: () => now });
        } catch (err) {
            logger.info({ connectionId: channel.connectionId, code: errorCode(err) }, 'Calendar webhook subscription check failed; tried again tomorrow');
            continue;
        }
        if (exists) continue;
        logger.info({ connectionId: channel.connectionId }, 'Calendar webhook subscription gone at the provider; re-creating it');
        await markStopped([channel.id]);
        count(result, await ensureChannel(channel.connectionId, { now, ignoreBackoff: true }));
        await enqueuePull(channel.connectionId, 'missed', now);
    }

    result.deleted = await deleteOldChannels(now);
    logger.info({ ...result }, 'Calendar webhook channels nightly done');
    return result;
}

async function deleteOldChannels(now: Date): Promise<number> {
    const { count: deleted } = await prisma.calendarWatchChannel.deleteMany({
        where: { status: { in: ['stopped', 'failed'] }, createdAt: { lt: new Date(now.getTime() - CHANNEL_RETENTION_MS) } },
    });
    return deleted;
}
