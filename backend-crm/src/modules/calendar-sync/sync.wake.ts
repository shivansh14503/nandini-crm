import { ENV } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { prisma } from '../../config/prisma.js';
import { calendarSyncQueue, isQueueAvailable, tryEnqueue } from '../../jobs/queues.js';
import { notify } from '../notifications/notification.producer.js';
import { CALENDAR_SYNC_JOBS, IMPORT_LOOKUP_CHUNK, PUSH_JOB_DELAY_MS, type PullReason } from './sync.constants.js';
import { checkJobId, enrolledJobId, freshPullJobId, pendingOnlyPullJobId, pullJobId, pushJobId } from './sync.keys.js';
import { invitesHeldNotification } from './sync.notifications.js';
import { takeOutboxResult, type DirtyLink, type HeldNotice } from './sync.outbox.js';

/**
 * The after-commit wake-up of the push engine (Calendar Phase 2 spec §8.3 step 5, §10.3), called by
 * `runActivityPostCommit` for every committed activity write. It is only an optimisation: the outbox marked the links
 * dirty inside the write's transaction, and the worker's sweep pushes anything this misses.
 * - Redis up: one `push` job per dirty link (`push-<linkId>-<dirtyAtMs>`, 2 s delay so quick edits collapse).
 * - Redis down: the links are pushed in-process after the response (`setImmediate`, one after another, not awaited;
 *   `pushLink` applies the same gates and the lease).
 * - "Invitations held" notices (D41) go to the owners.
 * Also the producers of the other calendar jobs (`enrolled`, `check`). Imports no activity service code
 * (activity.service.ts imports this module dynamically; the push module is imported only on demand).
 */

export interface PushJobData {
    linkId: string;
}

/** `enrolled` and `check` jobs. */
export interface ConnectionJobData {
    connectionId: string;
}

type InlineRunner = (linkIds: string[]) => void;

const defaultInline: InlineRunner = (linkIds) => {
    setImmediate(() => {
        void (async () => {
            const { pushLink } = await import('./sync.push.js');
            for (const linkId of linkIds) {
                try {
                    await pushLink(linkId);
                } catch (err) {
                    logger.warn({ err: (err as Error).message, linkId }, 'In-process calendar push failed; the outbox sweep retries it');
                    const { markPushExhausted } = await import('./sync.push.js');
                    await markPushExhausted(linkId).catch(() => undefined);
                }
            }
        })();
    });
};

let inlineRunner: InlineRunner = defaultInline;

/** Tests: capture in-process pushes instead of running them (null = the real runner). */
export function setInlinePushForTests(runner: InlineRunner | null): void {
    inlineRunner = runner ?? defaultInline;
}

/** Queues a push of each link (or runs them in-process when Redis is down). */
export async function wakePushes(links: readonly DirtyLink[]): Promise<void> {
    if (links.length === 0 || !ENV.INTEGRATIONS.SYNC_ENABLED) return;
    const inline: string[] = [];
    for (const link of links) {
        const id = await tryEnqueue(calendarSyncQueue, CALENDAR_SYNC_JOBS.push, { linkId: link.id } satisfies PushJobData, {
            jobId: pushJobId(link.id, link.dirtyAt),
            delay: PUSH_JOB_DELAY_MS,
        });
        if (id === null) inline.push(link.id);
    }
    if (inline.length > 0) inlineRunner(inline);
}

/**
 * `enrolled` job of a row that reached `ok` (first time, or recovered from `error`): pushes the row's dirty links (the
 * first-sync backfill joins it in P2-3c). Each time gets its own job id (`readyAt`). Null without Redis (the
 * fallback tick and the outbox sweep cover it).
 */
export function enqueueEnrolled(connectionId: string, enrolledAt: Date, readyAt: Date = new Date()): Promise<string | null> {
    if (!ENV.INTEGRATIONS.SYNC_ENABLED) return Promise.resolve(null);
    return tryEnqueue(calendarSyncQueue, CALENDAR_SYNC_JOBS.enrolled, { connectionId } satisfies ConnectionJobData, { jobId: enrolledJobId(connectionId, enrolledAt, readyAt) });
}

/** `check` job of one connection row (enrolment, the poll tick's due checks). Null without Redis. */
export function enqueueCheck(connectionId: string, now: Date = new Date()): Promise<string | null> {
    return tryEnqueue(calendarSyncQueue, CALENDAR_SYNC_JOBS.check, { connectionId } satisfies ConnectionJobData, { jobId: checkJobId(connectionId, now) });
}

/** `pull` job data (P2-5). */
export interface PullJobData {
    connectionId: string;
    reason: PullReason;
}

/** Pulls a person asked for (Sync now, the calendar page opening, an admin's Sync now): never absorbed by a finished job. */
export const ON_DEMAND_PULL_REASONS: ReadonlySet<PullReason> = new Set<PullReason>(['manual', 'page', 'admin']);

/** The BullMQ side of on-demand pulls (job state, add), replaceable in tests. */
export interface PullJobQueue {
    /**
     * The state of a kept job (waiting, delayed, active, completed, failed, …), null when none, UNREADABLE_JOB_STATE
     * when Redis didn't answer in time or the read failed.
     */
    stateOf(jobId: string): Promise<string | null>;
    /** Adds a `pull` job; the id, or null when Redis didn't take it (the caller pulls in-process). */
    add(jobId: string, data: PullJobData): Promise<string | null>;
}

const STATE_TIMEOUT_MS = 3_000;

/** `stateOf`'s answer when the state read timed out or failed: Redis isn't answering, so `enqueuePull` doesn't try an add. */
export const UNREADABLE_JOB_STATE = 'unknown';

const bullPullJobs: PullJobQueue = {
    async stateOf(jobId) {
        if (!isQueueAvailable()) return null;
        let timer: NodeJS.Timeout | undefined;
        const timeout = new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new Error('Redis timed out')), STATE_TIMEOUT_MS)));
        try {
            const job = await Promise.race([calendarSyncQueue().getJob(jobId), timeout]);
            return job ? await Promise.race([job.getState(), timeout]) : null;
        } catch {
            // Timed out or failed: Redis isn't answering. `enqueuePull` returns null so the caller pulls in-process.
            return UNREADABLE_JOB_STATE;
        } finally {
            clearTimeout(timer);
        }
    },
    add: (jobId, data) =>
        tryEnqueue(calendarSyncQueue, CALENDAR_SYNC_JOBS.pull, data, {
            jobId,
            // A failed pull isn't retried: the next poll (every few minutes) pulls again from the same cursor.
            attempts: 1,
        }),
};
let pullJobs: PullJobQueue = bullPullJobs;

/** Tests: replace the BullMQ side of `enqueuePull` (null = BullMQ). */
export function setPullJobQueueForTests(queue: PullJobQueue | null): void {
    pullJobs = queue ?? bullPullJobs;
}

/**
 * `pull` job of one connection (P2-5): the poll fan-out, Sync now, the calendar page, the nightly re-baseline. Pulls
 * of the same connection within 10 s share the bucket id `pull-<connectionId>-<10 s bucket>`. Null without Redis
 * (callers then pull in-process).
 *
 * On-demand pulls (ON_DEMAND_PULL_REASONS) follow P2-7's pending-only rule (`pendingOnlyPullJobId`, as webhook pings
 * do): only a still-pending bucket job absorbs them; when that job already started, finished or failed (BullMQ keeps
 * it an hour and would silently ignore the same id) they get `pull-<connectionId>-<bucket>-<ms>`, so the person's
 * "Sync now" always reads the calendar after the click. A running pull holds the lease; the new job waits for it
 * (`pullRetryDelay`). The poll fan-out, re-baseline and missed-webhook pulls keep the bucket id (one state read less per
 * person and tick; a just-finished pull of the same 10 s covered them).
 *
 * When the state read times out or fails (UNREADABLE_JOB_STATE), an on-demand pull returns null at once instead of
 * also trying the add: Redis isn't answering, and the person waits on the request, so the caller pulls in-process
 * (under the lease) after at most one 3 s timeout, as before the state read existed.
 */
export async function enqueuePull(connectionId: string, reason: PullReason, now: Date = new Date()): Promise<string | null> {
    if (!ENV.INTEGRATIONS.SYNC_ENABLED) return null;
    const data: PullJobData = { connectionId, reason };
    const bucketId = pullJobId(connectionId, now);
    if (!ON_DEMAND_PULL_REASONS.has(reason)) return pullJobs.add(bucketId, data);
    const state = await pullJobs.stateOf(bucketId);
    // Redis didn't answer the state read: don't wait out a second timeout on the add.
    if (state === UNREADABLE_JOB_STATE) return null;
    const jobId = pendingOnlyPullJobId(state, bucketId, freshPullJobId(connectionId, now));
    // The pending bucket job hasn't started: it will read the calendar after this request.
    if (jobId === null) return bucketId;
    return pullJobs.add(jobId, data);
}

/**
 * P2-8: customer-meeting import was just turned on (the company switch: `usernames` null = everyone who imports; an
 * admin's per-person switch: that person). Pulls are incremental (a Google sync token / Graph delta only returns events
 * that changed), so meetings already in the calendar would never reach the importer: each affected live connection
 * drops its cursor and gets one full pull (`rebaseline`). The cursor drop is durable, so without Redis the next poll
 * pulls in full. One full pull per person per switch-on; never throws. Returns how many connections start over.
 */
export async function startImportPulls(usernames: readonly string[] | null, now: Date = new Date()): Promise<number> {
    try {
        if (!ENV.INTEGRATIONS.SYNC_ENABLED) return 0;
        let people: string[];
        if (usernames) {
            people = [...usernames];
        } else {
            const rows = await prisma.calendarSyncUser.findMany({ where: { importMeetings: true, excluded: false }, select: { username: true } });
            people = rows.map((r) => r.username);
        }
        if (people.length === 0) return 0;
        // `pending` rows have no cursor yet: their first pull is full anyway.
        const connections: { id: string }[] = [];
        for (let i = 0; i < people.length; i += IMPORT_LOOKUP_CHUNK) {
            connections.push(
                ...(await prisma.calendarConnection.findMany({
                    where: { username: { in: people.slice(i, i + IMPORT_LOOKUP_CHUNK) }, status: { in: ['ok', 'error'] }, syncCursor: { not: null } },
                    select: { id: true },
                })),
            );
        }
        for (const { id } of connections) {
            await prisma.calendarConnection.updateMany({ where: { id }, data: { syncCursor: null } });
            await enqueuePull(id, 'rebaseline', now).catch(() => null);
        }
        if (connections.length > 0) logger.info({ connections: connections.length }, 'Customer-meeting import turned on; full calendar pulls started');
        return connections.length;
    } catch (err) {
        logger.warn({ err: (err as Error).message }, 'Could not start the full pulls for customer-meeting import; meetings come in as they change');
        return 0;
    }
}

/** `calendar_invites_held` to each owner, naming who added the guests. */
export async function notifyHeldInvites(notices: readonly HeldNotice[], now: Date = new Date()): Promise<void> {
    if (notices.length === 0) return;
    const actors = [...new Set(notices.map((n) => n.actor))];
    const users = await prisma.user.findMany({ where: { username: { in: actors } }, select: { username: true, fullName: true } });
    const nameOf = new Map(users.map((u) => [u.username.toLowerCase(), u.fullName || u.username]));
    await notify(notices.map((n) => invitesHeldNotification(n, nameOf.get(n.actor.toLowerCase()) ?? n.actor, now)));
}

/** After a commit: the outbox results the write left for these rows (each handed out once). Never throws. */
export async function runCalendarPostCommit(rows: readonly { after: object }[]): Promise<void> {
    const links: DirtyLink[] = [];
    const notices: HeldNotice[] = [];
    const pulls = new Set<string>();
    for (const row of rows) {
        const result = takeOutboxResult(row.after);
        if (!result) continue;
        links.push(...result.links);
        notices.push(...result.notices);
        for (const id of result.pulls ?? []) pulls.add(id);
    }
    // P2-8: a restored imported meeting's calendars pull in full (the dropped cursor makes the next poll full without Redis).
    for (const id of pulls) await enqueuePull(id, 'rebaseline').catch(() => null);
    try {
        await wakePushes(links);
    } catch (err) {
        logger.warn({ err: (err as Error).message, links: links.length }, 'Could not wake the calendar push; the outbox sweep covers it');
    }
    try {
        await notifyHeldInvites(notices);
    } catch (err) {
        logger.warn({ err: (err as Error).message }, 'Could not send "invitations held" notifications');
    }
}
