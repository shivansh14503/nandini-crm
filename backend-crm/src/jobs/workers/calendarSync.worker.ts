import { DelayedError, Worker, type Job } from 'bullmq';
import { ENV } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { redis } from '../../config/redis.js';
import { checkConnection } from '../../modules/calendar-sync/calendarAccess.js';
import {
    CALENDAR_SYNC_JOBS,
    LEASE_RETRY_DELAY_MS,
    NIGHTLY_PATTERN,
    NIGHTLY_SCHEDULER,
    POLL_SCHEDULER,
    PULL_REASONS,
    WORKER_HEARTBEAT_EVERY_MS,
    type PullReason,
} from '../../modules/calendar-sync/sync.constants.js';
import { runCalendarNightly, runCalendarPoll, runEnrolled, runFallbackTick, sweepOutbox } from '../../modules/calendar-sync/sync.maintenance.js';
import { isWatchOp, runWatchJob } from '../../modules/calendar-sync/sync.channels.js';
import { pullConnection, type PullResult } from '../../modules/calendar-sync/sync.pull.js';
import { markPushExhausted, pushLink, type PushResult } from '../../modules/calendar-sync/sync.push.js';
import { checkConference, markConferenceExhausted } from '../../modules/calendar-sync/sync.conference.js';
import { pollCron } from '../../modules/calendar-sync/syncHours.js';
import { pullAgainIfNotified } from '../../modules/calendar-sync/webhook.service.js';
import { writeWorkerHeartbeat } from '../../modules/calendar-sync/workerHeartbeat.js';
import { runWithAuditOrigin } from '../../services/auditContext.js';
import { calendarSyncQueue, createQueueConnection, isQueueAvailable, QUEUE_NAMES } from '../queues.js';
import { throttledLogger } from './throttledLogger.js';

/**
 * Calendar sync (Calendar Phase 2 spec §10, docs/system-design.md §5.4): the `crm-calendar-sync` queue.
 *   push      one link (`push-<linkId>-<dirtyAtMs>`, the sweep adds `-s<minute>`), after a CRM save and by the sweep
 *   enrolled  a connection row reached `ok`, first time or after an error
 *             (`enrolled-<connectionId>-<enrolledAtMs>-r<readyAtMs>`): push its dirty links
 *   check     a connection health check (`check-<connectionId>-<minute>`): new enrolments and due re-checks
 *   conference  read an event again until its video link is ready (`conference-<linkId>-<request>-<attempt>`, 5 s
 *             apart, at most 5 tries; Calendar Phase 3 P3-1)
 *   pull      calendar → CRM changes of one connection (`pull-<connectionId>-<10 s bucket>`, P2-5): poll fan-out,
 *             Sync now, the calendar page, the nightly Outlook re-baseline; one attempt (the next poll retries).
 *             On-demand pulls get `…-<ms>` when the bucket's job already started or finished (pending-only rule)
 *   watch     a webhook channel of one connection (`watch-<connectionId>-<op>-<minute>`, P2-7): ensure | renew |
 *             recreate | stop (Graph lifecycle notifications)
 *   poll      scheduler 'calendar-poll', every CALENDAR_POLL_MINUTES (5) inside CALENDAR_SYNC_HOURS (07:00–22:00):
 *             a pull per synced person (with webhooks live, every CALENDAR_POLL_MINUTES_WITH_WEBHOOKS for people whose
 *             channel is healthy) + outbox sweep + due checks + up to 20 webhook channels created / renewed
 *   nightly   scheduler 'calendar-nightly', 00:25: reconcile + due checks + admin digest (from the reminders worker),
 *             the follow-up activity backfill (from the reminders worker), error-link retries, client secrets
 *             expiring, expired leases cleared, Outlook delta windows re-baselined, webhook channels (P2-7)
 * All in the business timezone. A push that finds the connection's lease taken, or the provider rate-limiting, moves
 * itself back without spending an attempt. Every Redis `ready` upserts the schedulers and runs one outbox sweep. While
 * Redis is down a one-minute tick runs due checks, pushes due links and pulls due people in-process inside the sync
 * hours only. A
 * heartbeat key (`calendar:worker:heartbeat`, 2 min TTL, Redis only) tells Admin › API Integrations the worker is
 * alive. CALENDAR_SYNC_ENABLED=false skips push / enrolled / the sweep; checks and the nightly connection steps run.
 */

const FALLBACK_TICK_MS = 60_000;
const ORIGIN = { source: 'JOB', route: 'job:calendar-sync' } as const;

const idOf = (data: unknown, key: string): string => {
    const value = (data as Record<string, unknown> | null)?.[key];
    return typeof value === 'string' ? value : '';
};

/** When a push that couldn't run now should run again (ms from now), or null when it is finished. Pure. */
export function pushRetryDelay(result: PushResult, random: () => number = Math.random): number | null {
    if (result.status === 'busy') return LEASE_RETRY_DELAY_MS + Math.floor(random() * 2_000);
    if (result.status === 'rate_limited') return Math.max(1_000, result.retryAfterMs) + Math.floor(random() * 1_000);
    return null;
}

/** When a pull that couldn't run now should run again (ms from now), or null. Pure. */
export function pullRetryDelay(result: PullResult, random: () => number = Math.random): number | null {
    if (result.status === 'busy') return LEASE_RETRY_DELAY_MS + Math.floor(random() * 2_000);
    if (result.status === 'rate_limited') return Math.max(1_000, result.retryAfterMs) + Math.floor(random() * 1_000);
    return null;
}

const reasonOf = (data: unknown): PullReason => {
    const value = (data as Record<string, unknown> | null)?.reason;
    return typeof value === 'string' && (PULL_REASONS as readonly string[]).includes(value) ? (value as PullReason) : 'poll';
};

/** Whether a failed job used its last attempt. Pure. */
export const isLastAttempt = (job: Pick<Job, 'attemptsMade' | 'opts'>): boolean => job.attemptsMade >= (job.opts.attempts ?? 1);

export async function processCalendarJob(job: Job, token?: string): Promise<unknown> {
    return runWithAuditOrigin(ORIGIN, async () => {
        switch (job.name) {
            case CALENDAR_SYNC_JOBS.push: {
                const linkId = idOf(job.data, 'linkId');
                if (!linkId) return null;
                const result = await pushLink(linkId);
                const delay = pushRetryDelay(result);
                if (delay !== null) {
                    // Not an attempt: the lease holder or the provider asked us to wait.
                    await job.moveToDelayed(Date.now() + delay, token);
                    throw new DelayedError();
                }
                return result;
            }
            case CALENDAR_SYNC_JOBS.enrolled: {
                const connectionId = idOf(job.data, 'connectionId');
                return connectionId ? runEnrolled(connectionId) : null;
            }
            case CALENDAR_SYNC_JOBS.pull: {
                const connectionId = idOf(job.data, 'connectionId');
                if (!connectionId) return null;
                const startedAt = new Date();
                const result = await pullConnection(connectionId, reasonOf(job.data));
                const delay = pullRetryDelay(result);
                if (delay !== null) {
                    // Not an attempt: a push / pull of the same calendar holds the lease, or the provider asked to wait.
                    await job.moveToDelayed(Date.now() + delay, token);
                    throw new DelayedError();
                }
                // D26 (P2-7): a webhook that arrived while this pull ran gets one more pull.
                if (result.status === 'done') await pullAgainIfNotified(connectionId, startedAt).catch(() => false);
                return result;
            }
            case CALENDAR_SYNC_JOBS.watch: {
                const connectionId = idOf(job.data, 'connectionId');
                const op = (job.data as Record<string, unknown> | null)?.op;
                return connectionId && isWatchOp(op) ? { outcome: await runWatchJob(connectionId, op) } : null;
            }
            case CALENDAR_SYNC_JOBS.check: {
                const connectionId = idOf(job.data, 'connectionId');
                return connectionId ? { outcome: await checkConnection(connectionId) } : null;
            }
            case CALENDAR_SYNC_JOBS.conference: {
                const linkId = idOf(job.data, 'linkId');
                const data = job.data as { request?: unknown; attempt?: unknown };
                if (!linkId || typeof data.request !== 'number' || typeof data.attempt !== 'number') return null;
                return { outcome: await checkConference({ linkId, request: data.request, attempt: data.attempt }) };
            }
            case CALENDAR_SYNC_JOBS.poll:
                return runCalendarPoll();
            case CALENDAR_SYNC_JOBS.nightly:
                return runCalendarNightly();
            default:
                logger.warn({ job: job.name }, 'Unknown calendar sync job');
                return null;
        }
    });
}

async function scheduleJobs(): Promise<void> {
    const queue = calendarSyncQueue();
    const tz = ENV.BUSINESS_TIMEZONE;
    await queue.upsertJobScheduler(POLL_SCHEDULER, { pattern: pollCron(), tz }, { name: CALENDAR_SYNC_JOBS.poll });
    await queue.upsertJobScheduler(NIGHTLY_SCHEDULER, { pattern: NIGHTLY_PATTERN, tz }, { name: CALENDAR_SYNC_JOBS.nightly });
}

const step = async (label: string, fn: () => Promise<unknown>) => {
    try {
        await fn();
    } catch (err) {
        logger.warn({ err: (err as Error).message }, label);
    }
};

let recovering = false;

/** On every Redis `ready`: schedulers and one outbox sweep (pushes the fallback tick didn't get to). */
async function recover(): Promise<void> {
    if (recovering) return;
    recovering = true;
    try {
        await runWithAuditOrigin(ORIGIN, async () => {
            await step('Could not schedule the calendar sync jobs', scheduleJobs);
            await step('Calendar outbox sweep after Redis came back failed', () => sweepOutbox());
        });
    } finally {
        recovering = false;
    }
}

let ticking = false;

async function fallbackTick(): Promise<void> {
    if (ticking || isQueueAvailable()) return;
    ticking = true;
    try {
        await runWithAuditOrigin(ORIGIN, () => step('Calendar sync (Redis unavailable) failed', () => runFallbackTick()));
    } finally {
        ticking = false;
    }
}

export function startCalendarSyncWorker(): Worker {
    const worker = new Worker(QUEUE_NAMES.calendarSync, processCalendarJob, {
        connection: createQueueConnection(),
        concurrency: 4,
        limiter: { max: 10, duration: 1_000 },
    });
    const warn = throttledLogger();
    worker.on('failed', (job, err) => {
        logger.error({ job: job?.name, jobId: job?.id, attempts: job?.attemptsMade, err: err.message }, 'Calendar sync job failed');
        if (job?.name === CALENDAR_SYNC_JOBS.push && isLastAttempt(job)) {
            void markPushExhausted(idOf(job.data, 'linkId')).catch((e: Error) => logger.warn({ err: e.message }, 'Could not mark a calendar push as failed'));
        }
        // P3-1: a video link check that failed on every attempt (the database, not the provider) gives up for good.
        if (job?.name === CALENDAR_SYNC_JOBS.conference && isLastAttempt(job)) {
            void markConferenceExhausted(job.data as { linkId?: string; request?: number }).catch((e: Error) => logger.warn({ err: e.message }, 'Could not mark a video link check as failed'));
        }
    });
    worker.on('error', (err) => warn(err.message, 'Calendar sync worker error'));

    const onReady = () => {
        void recover();
        void writeWorkerHeartbeat();
    };
    redis.on('ready', onReady);
    if (isQueueAvailable()) onReady();
    else logger.warn('Redis is unavailable: calendar pushes and pulls fall back to a once-a-minute in-process check (inside the sync hours) until it is back');

    const tick = setInterval(() => void fallbackTick(), FALLBACK_TICK_MS);
    tick.unref();
    const beat = setInterval(() => void writeWorkerHeartbeat(), WORKER_HEARTBEAT_EVERY_MS);
    beat.unref();
    worker.once('closing', () => {
        clearInterval(tick);
        clearInterval(beat);
        redis.off('ready', onReady);
    });
    return worker;
}
