import { Worker, type Job } from 'bullmq';
import { ENV } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { redis } from '../../config/redis.js';
import { catchUpMorningSummary, missedMorningSummaryDay, runMorningSummary } from '../../modules/notifications/morningSummary.service.js';
import { runWithAuditOrigin } from '../../services/auditContext.js';
import { zonedDayOf } from '../../utils/zonedTime.js';
import { createQueueConnection, isQueueAvailable, mailQueue, QUEUE_NAMES } from '../queues.js';
import { throttledLogger } from './throttledLogger.js';

/**
 * Outgoing email (docs/system-design.md §5.2): the `crm-mail` queue.
 *   morning  scheduler 'morning-summary', MORNING_SUMMARY_CRON (default 09:00 Mon–Sat, business timezone);
 *            a missed run is added as a one-off `morning` job (id `morning-catchup-<day>`)
 * Kept apart from `crm-reminders`: a run sends to every user with 20 s SMTP timeouts and is retried while sends fail,
 * so a slow or unreachable SMTP server would otherwise hold back activity reminders for minutes. Every Redis `ready`
 * (start-up and each reconnect) upserts the scheduler (removes it while the summary is off; the upsert also drops an
 * occurrence left overdue while no worker ran) and queues a missed morning summary, so the catch-up gets the job's
 * retries, stalled-run recovery and graceful shutdown. While Redis is down a one-minute in-process tick sends it
 * inline instead (it reads the database at most once a day per process, between the scheduled time and noon).
 */

const MORNING_SCHEDULER = 'morning-summary';
/** The no-Redis fallback checks this often. */
const FALLBACK_TICK_MS = 60_000;

const ORIGIN = { source: 'JOB', route: 'job:mail' } as const;

/** One catch-up job per business day for every process: BullMQ ignores an add under an id it already holds. */
export const morningCatchUpJobId = (day: string) => `morning-catchup-${day}`;

/** A catch-up job carries its day; the scheduler's jobs carry none. */
interface MorningJobData {
    day?: string;
}

/** A catch-up job of an earlier day (a worker that was down until after midnight) would send the wrong day's email. */
export const isStaleMorningJob = (data: MorningJobData | undefined, now: Date, timeZone: string): boolean =>
    typeof data?.day === 'string' && data.day !== zonedDayOf(now, timeZone);

async function processJob(job: Job): Promise<unknown> {
    return runWithAuditOrigin(ORIGIN, async () => {
        if (job.name !== 'morning') {
            logger.warn({ job: job.name }, 'Unknown mail job');
            return null;
        }
        if (isStaleMorningJob(job.data as MorningJobData | undefined, new Date(), ENV.BUSINESS_TIMEZONE)) {
            logger.warn({ jobId: job.id }, 'Morning summary catch-up of an earlier day skipped');
            return null;
        }
        const result = await runMorningSummary();
        // Failed sends are retried by the job's next attempt (EmailLog lets a failed row be re-claimed < 3 times).
        if (result.failed > 0) throw new Error(`${result.failed} morning summary email(s) failed; retrying`);
        return result;
    });
}

/** Creates or updates the scheduler (one occurrence for every API / worker process), or removes it while turned off. */
async function scheduleJobs(): Promise<void> {
    const queue = mailQueue();
    if (ENV.NOTIFICATIONS.MORNING_SUMMARY_ENABLED) {
        await queue.upsertJobScheduler(MORNING_SCHEDULER, { pattern: ENV.NOTIFICATIONS.MORNING_SUMMARY_CRON, tz: ENV.BUSINESS_TIMEZONE }, { name: 'morning' });
    } else {
        await queue.removeJobScheduler(MORNING_SCHEDULER);
    }
}

/** Queues a missed morning summary as a one-off `morning` job. */
async function queueCatchUp(): Promise<void> {
    const day = await missedMorningSummaryDay();
    if (!day) return;
    logger.info({ day }, 'Morning summary missed its scheduled time; queueing it now');
    await mailQueue().add('morning', { day } satisfies MorningJobData, { jobId: morningCatchUpJobId(day) });
}

const step = async (label: string, fn: () => Promise<unknown>) => {
    try {
        await fn();
    } catch (err) {
        logger.warn({ err: (err as Error).message }, label);
    }
};

let recovering = false;

/** On every Redis `ready`: the scheduler, then a missed morning summary (queued). */
async function recover(): Promise<void> {
    if (recovering) return;
    recovering = true;
    try {
        await runWithAuditOrigin(ORIGIN, async () => {
            await step('Could not schedule the morning summary', scheduleJobs);
            await step('Could not queue the morning summary catch-up', queueCatchUp);
        });
    } finally {
        recovering = false;
    }
}

let ticking = false;

/** Without Redis: make up a missed morning summary inline (no job can be queued); with Redis: nothing. */
async function fallbackTick(): Promise<void> {
    if (ticking || isQueueAvailable()) return;
    ticking = true;
    try {
        await runWithAuditOrigin(ORIGIN, () => step('Morning summary catch-up failed', () => catchUpMorningSummary()));
    } finally {
        ticking = false;
    }
}

export function startMailWorker(): Worker {
    const worker = new Worker(QUEUE_NAMES.mail, processJob, { connection: createQueueConnection(), concurrency: 1 });
    const warn = throttledLogger();
    worker.on('failed', (job, err) => logger.error({ job: job?.name, jobId: job?.id, attempts: job?.attemptsMade, err: err.message }, 'Mail job failed'));
    worker.on('error', (err) => warn(err.message, 'Mail worker error'));

    // The shared client emits `ready` on start-up and after every reconnect; the worker may start before it is ready.
    const onReady = () => void recover();
    redis.on('ready', onReady);
    if (isQueueAvailable()) onReady();

    const timer = setInterval(() => void fallbackTick(), FALLBACK_TICK_MS);
    timer.unref();
    worker.once('closing', () => {
        clearInterval(timer);
        redis.off('ready', onReady);
    });
    return worker;
}
