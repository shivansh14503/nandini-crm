import { ENV } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { prisma } from '../../config/prisma.js';
import { calendarSyncQueue, isQueueAvailable, tryEnqueue } from '../../jobs/queues.js';
import { instantToZonedWallClock } from '../../utils/zonedTime.js';
import { runFollowUpBackfillNightly } from '../activities/activity.followUpBackfill.js';
import { expiresSoon } from '../integrations/integration.service.js';
import { notify } from '../notifications/notification.producer.js';
import { isLiveStatus } from './connection.constants.js';
import { runCalendarConnectionNightly } from './connection.service.js';
import { dueCheckIds, runDueChecks } from './enrolment.js';
import { CALENDAR_SYNC_JOBS, CHECK_SWEEP_LIMIT, ENROLLED_PUSH_BATCH, FALLBACK_PUSH_LIMIT, OUTBOX_SWEEP_GRACE_MS, OUTBOX_SWEEP_LIMIT, SYNC_WINDOW } from './sync.constants.js';
import { sweepPushJobId } from './sync.keys.js';
import { secretExpiringNotifications } from './sync.notifications.js';
import { markPushExhausted, pushLink } from './sync.push.js';
import { enqueueCheck, type PushJobData } from './sync.wake.js';
import { adminRecipients } from './syncIssue.notifications.js';

/**
 * The calendar worker's housekeeping (Calendar Phase 2 spec §8.12, §10.1, §10.2; admin-managed model: addendum §8):
 * the outbox sweep, the `enrolled` job, due connection checks, the Redis-down fallback and the nightly steps. Every
 * step logs and never throws to its scheduler, so one failing step doesn't stop the others.
 *
 * Database wake cadence (Azure SQL serverless): the poll tick makes two small indexed reads every 5 minutes inside
 * 07:00–22:00 business time (when the 15-minute reminder sweep keeps the database awake anyway); the nightly run is at
 * 00:25, inside the existing 00:05–00:25 nightly wake; the fallback tick (Redis down only) reads once a minute inside
 * 07:00–22:00. Nothing runs outside those windows, so the database can pause overnight.
 */

/** Inside the background sync window (07:00–22:00 business time, §10.4): polls and the fallback tick run only then. */
export function isInsideSyncWindow(now: Date, timeZone: string = ENV.BUSINESS_TIMEZONE): boolean {
    const [hh, mm] = instantToZonedWallClock(now, timeZone).slice(11, 16).split(':').map(Number);
    const minute = hh * 60 + mm;
    return minute >= SYNC_WINDOW.startMinute && minute < SYNC_WINDOW.endMinute;
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
 * The `enrolled` job (§8.12, admin-managed: replaces P2-3's per-user `connect`): a row first reached `ok`, so its
 * dirty links (activities saved while it was pending or in error) are pushed now, in batches of 100, ignoring their
 * `nextAttemptAt`. Stops at the first gate (row in error again, provider off) or rate limit; the outbox sweep does the
 * rest. The first-sync backfill (copying upcoming activities that have no link yet) is P2-3c.
 */
export async function runEnrolled(connectionId: string): Promise<{ pushed: number; stopped: string | null } | null> {
    if (!ENV.INTEGRATIONS.SYNC_ENABLED) return null;
    const connection = await prisma.calendarConnection.findUnique({ where: { id: connectionId }, select: { id: true, status: true } });
    if (!connection || !isLiveStatus(connection.status) || connection.status === 'error') return null;
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
 * links retried, client secrets expiring, expired leases cleared.
 */
export async function runCalendarNightly(now: Date = new Date()) {
    const connections = await step('connections', () => runCalendarConnectionNightly(now), { changed: 0, checked: 0, problems: 0 });
    const followUps = await step('follow-up-backfill', () => runFollowUpBackfillNightly(), null);
    const retried = await step('retry-errors', () => retryErrorLinks(now), 0);
    const secrets = await step('secret-expiring', () => notifyExpiringSecrets(now), 0);
    const leases = await step('expired-leases', () => clearExpiredLeases(now), 0);
    const result = { connections, followUps, retried, secrets, leases };
    logger.info({ ...result, followUps: followUps ? 'done' : 'failed' }, 'Calendar nightly done');
    return result;
}

/** The `calendar-poll` tick of P2-3b: the outbox sweep and due connection checks (P2-5 adds the pulls). */
export async function runCalendarPoll(now: Date = new Date()) {
    const queued = await step('outbox-sweep', () => sweepOutbox(now), 0);
    const checks = await step('due-checks', () => enqueueDueChecks(now), 0);
    return { queued, checks };
}

/** The Redis-down fallback tick (§10.2): only inside the sync window; due checks and dirty links in-process. */
export async function runFallbackTick(now: Date = new Date()): Promise<{ checked: number; pushed: number }> {
    if (isQueueAvailable() || !isInsideSyncWindow(now)) return { checked: 0, pushed: 0 };
    const checked = await step('fallback-checks', async () => (await runDueChecks(now)).checked, 0);
    const pushed = await step('fallback-push', () => pushDueInline(now), 0);
    return { checked, pushed };
}
