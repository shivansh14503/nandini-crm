import { Worker } from 'bullmq';
import { ENV } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { ageLeadRatings } from '../../modules/leads/lead.ageing.js';
import { createQueueConnection, isQueueAvailable, leadRatingQueue, QUEUE_NAMES } from '../queues.js';
import { throttledLogger } from './throttledLogger.js';

/** One scheduler for every API / worker process: BullMQ runs each occurrence once. */
const SCHEDULER_ID = 'lead-rating-ageing';
/** 00:05 every day in the business timezone (IST). */
const PATTERN = '5 0 * * *';

/**
 * Nightly Rating ageing (docs/lead-rating-rules.md): a BullMQ job scheduler fires at 00:05 IST and this worker runs
 * `ageLeadRatings`. A catch-up run also happens once when the worker starts, so a night missed while nothing was
 * running (or Redis was down) is made up; runs are idempotent.
 */
export function startLeadRatingWorker(): Worker {
    const worker = new Worker(QUEUE_NAMES.leadRating, () => ageLeadRatings(), { connection: createQueueConnection(), concurrency: 1 });
    const warn = throttledLogger();
    worker.on('failed', (job, err) => logger.error({ jobId: job?.id, err: err.message }, 'Lead Rating ageing job failed'));
    worker.on('error', (err) => warn(err.message, 'Lead Rating worker error'));

    void scheduleNightlyRun();
    ageLeadRatings().catch((err: Error) => logger.error({ err: err.message }, 'Lead Rating catch-up run failed'));
    return worker;
}

async function scheduleNightlyRun(): Promise<void> {
    if (!isQueueAvailable()) {
        logger.warn('Redis is unavailable: Lead Ratings age only when a worker starts until it is back');
        return;
    }
    try {
        await leadRatingQueue().upsertJobScheduler(SCHEDULER_ID, { pattern: PATTERN, tz: ENV.BUSINESS_TIMEZONE }, { name: 'age-ratings' });
    } catch (err) {
        logger.warn({ err: (err as Error).message }, 'Could not schedule the nightly Lead Rating ageing');
    }
}
