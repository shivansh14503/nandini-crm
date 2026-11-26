import { ENV } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { prisma } from '../../config/prisma.js';
import { calendarSyncQueue, isQueueAvailable, tryEnqueue } from '../../jobs/queues.js';
import { runFollowUpBackfillNightly } from '../activities/activity.followUpBackfill.js';
import { expiresSoon } from '../integrations/integration.service.js';
import { notify } from '../notifications/notification.producer.js';
import { isCalendarProvider, isLiveStatus, type CalendarProvider } from './connection.constants.js';
import { runCalendarConnectionNightly } from './connection.service.js';
import { dueCheckIds, runDueChecks } from './enrolment.js';
import {
    BACKFILL_RECOVERY_GRACE_MS,
    BACKFILL_RECOVERY_LIMIT,
    CALENDAR_SYNC_JOBS,
    CHECK_SWEEP_LIMIT,
    ENROLLED_PUSH_BATCH,
    FALLBACK_PULL_LIMIT,
    FALLBACK_PUSH_LIMIT,
    GRAPH_REBASELINE_DAYS,
    OUTBOX_SWEEP_GRACE_MS,
    OUTBOX_SWEEP_LIMIT,
    PULL_PAST_DAYS,
} from './sync.constants.js';
import { sweepPushJobId } from './sync.keys.js';
import { healthyChannelConnectionIds, maintainChannels, ensureChannel, pollIntervalMinutes, pullIsDue, webhooksLive } from './sync.channels.js';
import { secretExpiringNotifications } from './sync.notifications.js';
import { markPushExhausted, pushLink } from './sync.push.js';
import { runBackfill } from './sync.backfill.js';
import { enqueueCheck, enqueueEnrolled, enqueuePull, type PushJobData } from './sync.wake.js';
import { isFakeProviderEnabled, loadProviderAccess } from './providers/registry.js';
import { isInsideSyncHours, pollMinutes } from './syncHours.js';
import { adminRecipients } from './syncIssue.notifications.js';

/**
 * The calendar worker's housekeeping (Calendar Phase 2 spec §8.12, §10.1, §10.2; admin-managed model: addendum §8):
 * the outbox sweep, the `enrolled` job, due connection checks, the Redis-down fallback and the nightly steps. Every
 * step logs and never throws to its scheduler, so one failing step doesn't stop the others.
 *
 * Database wake cadence (Azure SQL serverless): the poll tick (every CALENDAR_POLL_MINUTES, default 5, inside
 * CALENDAR_SYNC_HOURS, default 07:00–22:00 business time, when the 15-minute reminder sweep keeps the database awake
 * anyway) makes three small indexed reads (the outbox sweep, due checks, rows `ok` without a first-sync backfill, P2-3c)
 * plus one pull per synced person (P2-5: a lease claim / release and a "last pulled" write each; a provider call that
 * finds nothing changed touches nothing else); with webhooks live (P2-7) people whose channel is healthy are pulled
 * only every CALENDAR_POLL_MINUTES_WITH_WEBHOOKS (30) instead, one more small read finds them, and the tick creates /
 * renews at most 20 channels; the nightly run is at
 * 00:25, inside the existing 00:05–00:25 nightly wake; the fallback tick (Redis down only) reads once a minute inside
 * the sync hours. Webhook change pings inside the sync hours cause one pull each (the database is awake then); outside
 * them they are acknowledged without a read (webhook.service.ts), and only a rare Graph lifecycle notification may wake
 * the database at night. Nothing else runs outside those windows, so the database can pause overnight.
 */

/** Inside the background sync hours (CALENDAR_SYNC_HOURS, §10.4): polls and the fallback tick run only then. */
export function isInsideSyncWindow(now: Date, timeZone: string = ENV.BUSINESS_TIMEZONE): boolean {
    return isInsideSyncHours(now, undefined, timeZone);
}

// ── Pulls (P2-5) ──────────────────────────────────────────────────────────────────────────────────────────────

/** Providers a pull can use now (switched on with readable credentials; the fake only while its switch is on). */
async function pullableProviders(providers: readonly string[]): Promise<Set<CalendarProvider>> {
    const usable = new Set<CalendarProvider>();
    for (const provider of new Set(providers)) {
        if (!isCalendarProvider(provider)) continue;
        if (provider === 'fake' && !isFakeProviderEnabled()) continue;
        const access = await loadProviderAccess(provider);
        if (access.enabled && access.configured) usable.add(provider);
    }
    return usable;
}

/** Live rows in `ok` whose provider is usable (a pull of a pending / error row waits for its check). */
export async function pullableConnections(): Promise<{ id: string; provider: string; lastPulledAt: Date | null }[]> {
    const rows = await prisma.calendarConnection.findMany({ where: { status: 'ok' }, select: { id: true, provider: true, lastPulledAt: true } });
    if (rows.length === 0) return [];
    const usable = await pullableProviders(rows.map((r) => r.provider));
    return rows.filter((r) => usable.has(r.provider as CalendarProvider));
}

/**
 * Synced people due a background pull (§10.1 `calendar-poll` step 1). Without webhooks: everyone, every tick. With
 * webhooks live (P2-7): a person whose channel is healthy only once their last pull is CALENDAR_POLL_MINUTES_WITH_WEBHOOKS
 * old (the safety net); everyone else (no channel yet, failed, expiring) every tick as before.
 */
export async function duePullConnections(now: Date = new Date()): Promise<{ id: string; provider: string; lastPulledAt: Date | null }[]> {
    const rows = await pullableConnections();
    if (rows.length === 0 || !webhooksLive()) return rows;
    const healthy = await healthyChannelConnectionIds(now);
    return rows.filter((row) => !healthy.has(row.id) || pullIsDue(row.lastPulledAt, pollIntervalMinutes(true, pollMinutes()), now));
}

/** The poll fan-out (§10.1 `calendar-poll` step 1): one `pull` job per person due. Returns how many were queued. */
export async function enqueuePulls(now: Date = new Date()): Promise<number> {
    if (!ENV.INTEGRATIONS.SYNC_ENABLED || !isInsideSyncWindow(now)) return 0;
    let queued = 0;
    for (const row of await duePullConnections(now)) if ((await enqueuePull(row.id, 'poll', now)) !== null) queued += 1;
    return queued;
}

/**
 * When this process last tried each row in the fallback (whatever the result): `lastPulledAt` moves only when a pull
 * ends `done`, so without this a few rows that keep failing would take every slot of every tick.
 */
const inlineTriedAt = new Map<string, number>();

export function resetInlinePullsForTests(): void {
    inlineTriedAt.clear();
}

/** Redis down (§10.2): the longest-waiting synced people pulled in-process, one after another, ≤ 5 per tick. */
export async function pullDueInline(now: Date = new Date(), limit: number = FALLBACK_PULL_LIMIT): Promise<number> {
    if (!ENV.INTEGRATIONS.SYNC_ENABLED) return 0;
    const healthy = webhooksLive() ? await healthyChannelConnectionIds(now) : new Set<string>();
    const dueBefore = (id: string) => now.getTime() - pollIntervalMinutes(healthy.has(id), pollMinutes()) * 60_000;
    const lastTry = (row: { id: string; lastPulledAt: Date | null }) => Math.max(row.lastPulledAt?.getTime() ?? 0, inlineTriedAt.get(row.id) ?? 0);
    const due = (await pullableConnections())
        .filter((r) => lastTry(r) <= dueBefore(r.id))
        .sort((a, b) => lastTry(a) - lastTry(b))
        .slice(0, limit);
    let pulled = 0;
    const { pullConnection } = await import('./sync.pull.js');
    for (const row of due) {
        inlineTriedAt.set(row.id, now.getTime());
        try {
            if ((await pullConnection(row.id, 'poll')).status === 'done') pulled += 1;
        } catch (err) {
            logger.warn({ err: (err as Error).message, connectionId: row.id }, 'In-process calendar pull failed');
        }
    }
    return pulled;
}

/**
 * Nightly (§10.1 step 4): Outlook delta windows are fixed at the full sync (now − 7 days … + 400 days), so a window
 * whose full sync is 30 days old starts over: the cursor is dropped and a full pull queued (inside the nightly wake;
 * without Redis the first poll of the morning does it). The stored window starts 7 days before its full sync, hence
 * the 30 + 7 days.
 */
export async function rebaselineGraphWindows(now: Date): Promise<number> {
    if (!ENV.INTEGRATIONS.SYNC_ENABLED) return 0;
    const before = new Date(now.getTime() - (GRAPH_REBASELINE_DAYS + PULL_PAST_DAYS) * 24 * 60 * 60_000);
    const rows = await prisma.calendarConnection.findMany({
        where: { provider: 'microsoft', status: 'ok', syncCursor: { not: null }, OR: [{ syncWindowStart: null }, { syncWindowStart: { lt: before } }] },
        select: { id: true },
    });
    for (const row of rows) {
        await prisma.calendarConnection.updateMany({ where: { id: row.id }, data: { syncCursor: null } });
        await enqueuePull(row.id, 'rebaseline', now);
    }
    return rows.length;
}

/** Dirty links due for a push: dirty for longer than the grace (the after-commit wake-up had its chance), not waiting. */
export async function dueDirtyLinks(now: Date, limit: number, graceMs: number = OUTBOX_SWEEP_GRACE_MS): Promise<{ id: string; dirtyAt: Date }[]> {
    const rows = await prisma.activityExternalLink.findMany({
        where: {
            dirtyAt: { not: null, lt: new Date(now.getTime() - graceMs) },
            OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
        },
        select: { id: true, dirtyAt: true },
        orderBy: { dirtyAt: 'asc' },
        take: limit,
    });
    return rows.filter((r): r is { id: string; dirtyAt: Date } => r.dirtyAt !== null);
}

/** Outbox sweep (§10.1 `calendar-poll`): one `push` job per due link. Returns how many were queued. */
export async function sweepOutbox(now: Date = new Date()): Promise<number> {
    if (!ENV.INTEGRATIONS.SYNC_ENABLED) return 0;
    const links = await dueDirtyLinks(now, OUTBOX_SWEEP_LIMIT);
    let queued = 0;
    for (const link of links) {
        const id = await tryEnqueue(calendarSyncQueue, CALENDAR_SYNC_JOBS.push, { linkId: link.id } satisfies PushJobData, { jobId: sweepPushJobId(link.id, link.dirtyAt, now) });
        if (id !== null) queued += 1;
    }
    if (links.length > 0) logger.info({ due: links.length, queued }, 'Calendar outbox sweep');
    return queued;
}

/** Due connection checks (pending rows, error rows past their backoff) as `check` jobs. Returns how many were queued. */
export async function enqueueDueChecks(now: Date = new Date()): Promise<number> {
    let queued = 0;
    for (const id of await dueCheckIds(now, CHECK_SWEEP_LIMIT)) if ((await enqueueCheck(id, now)) !== null) queued += 1;
    return queued;
}

/** Redis down (§10.2 fallback tick): due links pushed in-process, one after another, at most 20 per tick. */
export async function pushDueInline(now: Date = new Date(), limit: number = FALLBACK_PUSH_LIMIT): Promise<number> {
    if (!ENV.INTEGRATIONS.SYNC_ENABLED) return 0;
    let pushed = 0;
    for (const link of await dueDirtyLinks(now, limit, 0)) {
        try {
            const result = await pushLink(link.id);
            if (result.status === 'done') pushed += 1;
        } catch (err) {
            logger.warn({ err: (err as Error).message, linkId: link.id }, 'In-process calendar push failed');
            await markPushExhausted(link.id, now).catch(() => undefined);
        }
    }
    return pushed;
}

/**
 * The `enrolled` job (§8.12, admin-managed: replaces P2-3's per-user `connect`): a row reached `ok`. On its first `ok`
 * (`backfillCount` still null) the first-sync backfill copies the person's upcoming activities as links (P2-3c,
 * sync.backfill.ts: private copies when they have guests, D23); then its dirty links (backfilled ones, and activities
 * saved while it was pending or in error) are pushed, in batches of 100, ignoring their `nextAttemptAt`. Stops at the
 * first gate (row in error again, provider off) or rate limit; the outbox sweep does the rest. A failed backfill is
 * logged and left for the poll tick's recovery (the row keeps `backfillCount` null); the push part still runs.
 */
export async function runEnrolled(connectionId: string): Promise<{ pushed: number; stopped: string | null; backfilled?: number } | null> {
    if (!ENV.INTEGRATIONS.SYNC_ENABLED) return null;
    const connection = await prisma.calendarConnection.findUnique({ where: { id: connectionId }, select: { id: true, status: true, backfillCount: true } });
    if (!connection || !isLiveStatus(connection.status) || connection.status === 'error') return null;
    let backfilled: number | undefined;
    if (connection.backfillCount === null && connection.status === 'ok') {
        try {
            const result = await runBackfill(connectionId);
            if (result.status === 'done') backfilled = result.created;
        } catch (err) {
            logger.warn({ err: (err as Error).message, connectionId }, 'Calendar first-sync backfill failed; the poll tick runs it again');
        }
    }
    const done = await pushConnectionLinks(connectionId);
    // P2-7 (spec §8.12 step 4): the person's webhook channel, once webhooks are live (never fails the job).
    if (webhooksLive()) {
        try {
            await ensureChannel(connectionId);
        } catch (err) {
            logger.warn({ err: (err as Error).message, connectionId }, 'Calendar webhook channel not created after enrolment; the poll tick tries again');
        }
    }
    return backfilled === undefined ? done : { ...done, backfilled };
}

/** Pushes every dirty link of one connection, 100 per round, until none is left or a gate / rate limit stops it. */
async function pushConnectionLinks(connectionId: string): Promise<{ pushed: number; stopped: string | null }> {
    let pushed = 0;
    const tried = new Set<string>();
    for (;;) {
        const batch = (
            await prisma.activityExternalLink.findMany({
                where: { connectionId, dirtyAt: { not: null } },
                select: { id: true },
                orderBy: { dirtyAt: 'asc' },
                take: ENROLLED_PUSH_BATCH + tried.size,
            })
        ).filter((l) => !tried.has(l.id));
        if (batch.length === 0) break;
        for (const link of batch.slice(0, ENROLLED_PUSH_BATCH)) {
            tried.add(link.id);
            try {
                const result = await pushLink(link.id);
                if (result.status === 'done') pushed += 1;
                if (result.status === 'skipped' || result.status === 'rate_limited') {
                    const stopped = result.status === 'skipped' ? result.reason : 'rate_limited';
                    logger.info({ connectionId, pushed, stopped }, 'Calendar enrolled job stopped early; the outbox sweep does the rest');
                    return { pushed, stopped };
                }
            } catch (err) {
                logger.warn({ err: (err as Error).message, linkId: link.id }, 'Calendar push during the enrolled job failed; the outbox sweep retries it');
            }
        }
    }
    logger.info({ connectionId, pushed }, 'Calendar enrolled job done');
    return { pushed, stopped: null };
}

// ── Nightly (§10.1 `calendar-nightly`) ──────────────────────────────────────────────────────────────────────

/**
 * One more try for refused links whose activity hasn't ended yet: dirty again, pushed by the 07:00 sweep. That is
 * every `error` link (→ `pending`), and every `cancelled` / `removed_remote` link whose restore was refused (it keeps
 * its state and error code, so the plan restores the event rather than patching one that is gone).
 */
export async function retryErrorLinks(now: Date): Promise<number> {
    if (!ENV.INTEGRATIONS.SYNC_ENABLED) return 0;
    const links = await prisma.activityExternalLink.findMany({
        where: { OR: [{ state: 'error' }, { state: { in: ['cancelled', 'removed_remote'] }, lastErrorCode: { not: null }, dirtyAt: null }] },
        select: { id: true, activityId: true, state: true },
    });
    if (links.length === 0) return 0;
    const upcoming = await prisma.activity.findMany({
        where: { id: { in: links.map((l) => l.activityId) }, isDeleted: false, OR: [{ endAt: { gt: now } }, { endAt: null, startAt: { gt: now } }] },
        select: { id: true },
    });
    const ids = new Set(upcoming.map((a) => a.id));
    const due = links.filter((l) => ids.has(l.activityId));
    const errors = due.filter((l) => l.state === 'error').map((l) => l.id);
    const gone = due.filter((l) => l.state !== 'error').map((l) => l.id);
    let count = 0;
    if (errors.length > 0) {
        count += (
            await prisma.activityExternalLink.updateMany({
                where: { id: { in: errors }, state: 'error' },
                data: { state: 'pending', dirtyAt: now, nextAttemptAt: null, attempts: 0 },
            })
        ).count;
    }
    if (gone.length > 0) {
        count += (
            await prisma.activityExternalLink.updateMany({
                where: { id: { in: gone }, state: { in: ['cancelled', 'removed_remote'] }, dirtyAt: null },
                data: { dirtyAt: now, nextAttemptAt: null, attempts: 0 },
            })
        ).count;
    }
    return count;
}

interface SecretHintsShape {
    clientSecret?: { expiresOn?: string | null };
}

/** `integration_secret_expiring` to every active admin while a provider's client secret ends within 30 days. */
export async function notifyExpiringSecrets(now: Date): Promise<number> {
    const providers = await prisma.integrationProvider.findMany({ where: { secretsEnc: { not: null } }, select: { provider: true, secretHintsJson: true } });
    const expiring: { provider: string; expiresOn: string }[] = [];
    for (const row of providers) {
        let hints: SecretHintsShape = {};
        try {
            hints = row.secretHintsJson ? (JSON.parse(row.secretHintsJson) as SecretHintsShape) : {};
        } catch {
            hints = {};
        }
        const expiresOn = hints.clientSecret?.expiresOn;
        if (expiresOn && expiresSoon(expiresOn, now)) expiring.push({ provider: row.provider, expiresOn });
    }
    if (expiring.length === 0) return 0;
    const admins = await adminRecipients();
    return (await notify(expiring.flatMap((p) => secretExpiringNotifications(admins, { ...p, now })))).created;
}

/** Leases a crashed process left behind (`leaseUntil` passed): cleared, so the People screen never shows them. */
export async function clearExpiredLeases(now: Date): Promise<number> {
    const { count } = await prisma.calendarConnection.updateMany({ where: { leaseUntil: { lt: now } }, data: { leaseId: null, leaseUntil: null } });
    return count;
}

async function step<T>(name: string, fn: () => Promise<T>, fallback: T): Promise<T> {
    try {
        return await fn();
    } catch (err) {
        logger.warn({ err: (err as Error).message, step: name }, 'Calendar sync step failed');
        return fallback;
    }
}

/**
 * `calendar-nightly` (00:25): the connection steps P2-2b ran from the reminders worker (reconcile everyone, due health
 * checks, the admins' problem digest), the follow-up activity backfill P2-4 ran there too, then P2-3b's own: error
 * links retried, client secrets expiring, expired leases cleared; P2-5's Outlook delta re-baseline; and P2-7's webhook
 * channels (renewals, missing ones created, Graph subscriptions checked, stray ones stopped, old rows deleted).
 */
export async function runCalendarNightly(now: Date = new Date()) {
    const connections = await step('connections', () => runCalendarConnectionNightly(now), { changed: 0, checked: 0, problems: 0 });
    const followUps = await step('follow-up-backfill', () => runFollowUpBackfillNightly(), null);
    const retried = await step('retry-errors', () => retryErrorLinks(now), 0);
    const secrets = await step('secret-expiring', () => notifyExpiringSecrets(now), 0);
    const leases = await step('expired-leases', () => clearExpiredLeases(now), 0);
    const rebaselined = await step('graph-rebaseline', () => rebaselineGraphWindows(now), 0);
    const channels = await step('webhook-channels', () => maintainChannels('nightly', now), null);
    // P2-8 (§10.1 step 6): imported meetings nobody filed under a record stop counting as overdue.
    const autoCompleted = await step('auto-complete-imported', async () => (await import('./sync.import.js')).autoCompleteImported(now), 0);
    const result = { connections, followUps, retried, secrets, leases, rebaselined, channels, autoCompleted };
    logger.info({ ...result, followUps: followUps ? 'done' : 'failed' }, 'Calendar nightly done');
    return result;
}

/**
/**
 * Rows `ok` for a while without a first-sync backfill (P2-3c): their `enrolled` job was lost (Redis restarted, the
 * worker was down when the row first reached `ok`). One small indexed read (`[status, nextCheckAt]` prefix).
 */
export async function dueBackfillRows(now: Date, limit: number = BACKFILL_RECOVERY_LIMIT): Promise<{ id: string; enrolledAt: Date }[]> {
    if (!ENV.INTEGRATIONS.SYNC_ENABLED) return [];
    return prisma.calendarConnection.findMany({
        where: { status: 'ok', backfillCount: null, OR: [{ lastSuccessAt: null }, { lastSuccessAt: { lt: new Date(now.getTime() - BACKFILL_RECOVERY_GRACE_MS) } }] },
        select: { id: true, enrolledAt: true },
        orderBy: { enrolledAt: 'asc' },
        take: limit,
    });
}

/**
 * Poll tick: an `enrolled` job again for each such row (one job id per row and hour, so a slow job isn't doubled).
 * Only inside the sync hours (CALENDAR_SYNC_HOURS, P2-5), like the rest of the poll.
 */
export async function enqueueDueBackfills(now: Date = new Date()): Promise<number> {
    if (!isInsideSyncWindow(now)) return 0;
    let queued = 0;
    const hour = new Date(Math.floor(now.getTime() / 3_600_000) * 3_600_000);
    for (const row of await dueBackfillRows(now)) if ((await enqueueEnrolled(row.id, row.enrolledAt, hour)) !== null) queued += 1;
    if (queued > 0) logger.info({ queued }, 'Calendar first-sync backfills re-queued');
    return queued;
}

/** Redis down (fallback tick): one due backfill (and its pushes) in-process per tick, inside the sync hours only. */
export async function backfillDueInline(now: Date = new Date()): Promise<number> {
    if (!isInsideSyncWindow(now)) return 0;
    const [row] = await dueBackfillRows(now, 1);
    if (!row) return 0;
    return (await runEnrolled(row.id))?.backfilled ?? 0;
}

/**
 * The `calendar-poll` tick: pulls of every synced person (P2-5), the outbox sweep, due connection checks and lost
 * first-sync backfills (P2-3c), and webhook channels to create or renew (P2-7). The cron covers whole hours, so a tick before a start minute or after an end minute
 * (e.g. 08:30-18:00) does nothing at all.
 */
export async function runCalendarPoll(now: Date = new Date()) {
    if (!isInsideSyncWindow(now)) return { pulls: 0, queued: 0, checks: 0, backfills: 0, channels: 0 };
    const pulls = await step('pulls', () => enqueuePulls(now), 0);
    const queued = await step('outbox-sweep', () => sweepOutbox(now), 0);
    const checks = await step('due-checks', () => enqueueDueChecks(now), 0);
    const backfills = await step('backfill-recovery', () => enqueueDueBackfills(now), 0);
    // P2-7: missing / expiring webhook channels, ≤ 20 people per tick (nothing while webhooks are off).
    const channels = await step('webhook-channels', async () => (webhooksLive() ? (await maintainChannels('poll', now)).ensured : 0), 0);
    return { pulls, queued, checks, backfills, channels };
}

/**
 * The Redis-down fallback tick (§10.2): only inside the sync hours; due checks, a lost backfill, dirty links and due
 * pulls in-process.
 */
export async function runFallbackTick(now: Date = new Date()): Promise<{ checked: number; pushed: number; backfilled: number; pulled: number }> {
    if (isQueueAvailable() || !isInsideSyncWindow(now)) return { checked: 0, pushed: 0, backfilled: 0, pulled: 0 };
    const checked = await step('fallback-checks', async () => (await runDueChecks(now)).checked, 0);
    const backfilled = await step('fallback-backfill', () => backfillDueInline(now), 0);
    const pushed = await step('fallback-push', () => pushDueInline(now), 0);
    const pulled = await step('fallback-pull', () => pullDueInline(now), 0);
    return { checked, pushed, backfilled, pulled };
}
