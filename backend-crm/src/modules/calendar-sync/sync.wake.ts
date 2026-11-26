import { ENV } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { prisma } from '../../config/prisma.js';
import { calendarSyncQueue, tryEnqueue } from '../../jobs/queues.js';
import { notify } from '../notifications/notification.producer.js';
import { CALENDAR_SYNC_JOBS, PUSH_JOB_DELAY_MS, type PullReason } from './sync.constants.js';
import { checkJobId, enrolledJobId, pullJobId, pushJobId } from './sync.keys.js';
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

/**
 * `pull` job of one connection (P2-5): the poll fan-out, Sync now, the calendar page, the nightly re-baseline. Pulls
 * of the same connection within 10 s share one job id. Null without Redis (callers then pull in-process).
 */
export function enqueuePull(connectionId: string, reason: PullReason, now: Date = new Date()): Promise<string | null> {
    if (!ENV.INTEGRATIONS.SYNC_ENABLED) return Promise.resolve(null);
    return tryEnqueue(calendarSyncQueue, CALENDAR_SYNC_JOBS.pull, { connectionId, reason } satisfies PullJobData, {
        jobId: pullJobId(connectionId, now),
        // A failed pull isn't retried: the next poll (every few minutes) pulls again from the same cursor.
        attempts: 1,
    });
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
    for (const row of rows) {
        const result = takeOutboxResult(row.after);
        if (!result) continue;
        links.push(...result.links);
        notices.push(...result.notices);
    }
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
