import { Worker, type Job } from 'bullmq';
import { ENV } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { redis } from '../../config/redis.js';
import { armPendingReminders, deliverActivityReminder, runNightlyMaintenance, runReminderSweep } from '../../modules/notifications/notification.reminders.js';
import { runCalendarConnectionNightly } from '../../modules/calendar-sync/connection.service.js';
import { runFollowUpBackfillNightly } from '../../modules/activities/activity.followUpBackfill.js';
import { runWithAuditOrigin } from '../../services/auditContext.js';
import { createQueueConnection, isQueueAvailable, QUEUE_NAMES, remindersQueue } from '../queues.js';
import { throttledLogger } from './throttledLogger.js';

/**
 * Reminders and notifications (docs/system-design.md §5.1): the `crm-reminders` queue.
 *   remind   delayed job per activity reminder, fires at `remindAt` (added after every committed activity save)
 *   sweep    scheduler 'reminder-sweep', every 15 minutes 07:00–21:45: missed reminders + contract renewals
 *   nightly  scheduler 'reminder-nightly', 00:20: notification / email log retention + re-arm pending reminders, then the
 *            calendar steps (reconcile everyone's enrolment, due health checks, the admins' calendar problem digest;
 *            P2-2b) and the follow-up activity backfill (P2-4: missing / out-of-line follow-up activities, audited under
 *            job:followup-backfill) until the calendar sync worker (Calendar Phase 2 P2-3b) takes them over
 * All in the business timezone. Every Redis `ready` (start-up and each reconnect) upserts the schedulers, re-arms
 * pending reminders and runs one sweep. While Redis is down a one-minute in-process tick does the sweep instead; it
 * does nothing while Redis is up, so the database is only queried when something is due. The morning summary email
 * has its own queue and worker (mail.worker.ts), so SMTP trouble never delays a reminder.
 */

/** Every 15 minutes from 07:00 to 21:45. */
export const SWEEP_PATTERN = '*/15 7-21 * * *';
/** 00:20, after the 00:05 Lead Rating ageing and the 00:15 audit ledger digest. */
export const NIGHTLY_PATTERN = '20 0 * * *';
const SWEEP_SCHEDULER = 'reminder-sweep';
const NIGHTLY_SCHEDULER = 'reminder-nightly';
/** The no-Redis fallback checks this often. */
const FALLBACK_TICK_MS = 60_000;

const ORIGIN = { source: 'JOB', route: 'job:reminders' } as const;

async function processJob(job: Job): Promise<unknown> {
    return runWithAuditOrigin(ORIGIN, async () => {
        switch (job.name) {
            case 'remind': {
                const activityId = typeof job.data?.activityId === 'string' ? job.data.activityId : '';
                return activityId ? deliverActivityReminder(activityId) : null;
            }
            case 'sweep':
                return runReminderSweep();
            case 'nightly': {
                const result = await runNightlyMaintenance();
                // Never throws (each step logs its own failure).
                const calendar = await runCalendarConnectionNightly();
                const followUps = await runFollowUpBackfillNightly();
                return { ...result, calendar, followUps };
            }
            default:
                logger.warn({ job: job.name }, 'Unknown reminders job');
                return null;
        }
    });
}

/** Creates or updates the job schedulers (one occurrence each for every API / worker process). */
async function scheduleJobs(): Promise<void> {
    const queue = remindersQueue();
    const tz = ENV.BUSINESS_TIMEZONE;
    await queue.upsertJobScheduler(SWEEP_SCHEDULER, { pattern: SWEEP_PATTERN, tz }, { name: 'sweep' });
    await queue.upsertJobScheduler(NIGHTLY_SCHEDULER, { pattern: NIGHTLY_PATTERN, tz }, { name: 'nightly' });
}

const step = async (label: string, fn: () => Promise<unknown>) => {
    try {
        await fn();
    } catch (err) {
        logger.warn({ err: (err as Error).message }, label);
    }
};

let recovering = false;

/** On every Redis `ready`: schedulers, re-arm, one catch-up sweep. */
async function recover(): Promise<void> {
    if (recovering) return;
    recovering = true;
    try {
        await runWithAuditOrigin(ORIGIN, async () => {
            await step('Could not schedule the reminder jobs', scheduleJobs);
            await step('Could not re-arm pending reminders', () => armPendingReminders());
            await step('Catch-up reminder sweep failed', () => runReminderSweep());
        });
    } finally {
        recovering = false;
    }
}

let ticking = false;

/** Without Redis: sweep every minute; with Redis: nothing. */
async function fallbackTick(): Promise<void> {
    if (ticking || isQueueAvailable()) return;
    ticking = true;
    try {
        await runWithAuditOrigin(ORIGIN, async () => {
            await step('Reminder sweep (Redis unavailable) failed', () => runReminderSweep());
        });
    } finally {
        ticking = false;
    }
}

export function startRemindersWorker(): Worker {
    const worker = new Worker(QUEUE_NAMES.reminders, processJob, { connection: createQueueConnection(), concurrency: 1 });
    const warn = throttledLogger();
    worker.on('failed', (job, err) =>
        logger.error({ job: job?.name, jobId: job?.id, attempts: job?.attemptsMade, err: err.message }, 'Reminders job failed'),
    );
    worker.on('error', (err) => warn(err.message, 'Reminders worker error'));

    // The shared client emits `ready` on start-up and after every reconnect; the worker may start before it is ready.
    const onReady = () => void recover();
    redis.on('ready', onReady);
    if (isQueueAvailable()) onReady();
    else logger.warn('Redis is unavailable: reminders fall back to a once-a-minute database check until it is back');

    const timer = setInterval(() => void fallbackTick(), FALLBACK_TICK_MS);
    timer.unref();
    worker.once('closing', () => {
        clearInterval(timer);
        redis.off('ready', onReady);
    });
    return worker;
}
