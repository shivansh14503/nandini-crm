import { Queue, type JobsOptions } from 'bullmq';
import type { Redis } from 'ioredis';
import { logger } from '../config/logger.js';
import { createRedisConnection, isRedisReady } from '../config/redis.js';

export const QUEUE_NAMES = {
    import: 'crm-import',
    audit: 'crm-audit',
    leadRating: 'crm-lead-rating',
    auditExport: 'crm-audit-export',
    auditLedger: 'crm-audit-ledger',
    reminders: 'crm-reminders',
    mail: 'crm-mail',
    calendarSync: 'crm-calendar-sync',
} as const;

/** How long a producer waits for Redis before falling back to synchronous processing. */
const ENQUEUE_TIMEOUT_MS = 3_000;

/** BullMQ needs its own connections with `maxRetriesPerRequest: null`; it shares REDIS_URL with the cache. */
export function createQueueConnection(): Redis {
    return createRedisConnection({ maxRetriesPerRequest: null, enableOfflineQueue: true, lazyConnect: false });
}

let producerConnection: Redis | undefined;
const queues = new Map<string, Queue>();

function getQueue(name: string, defaultJobOptions: JobsOptions): Queue {
    let queue = queues.get(name);
    if (!queue) {
        producerConnection ??= createQueueConnection();
        queue = new Queue(name, { connection: producerConnection, defaultJobOptions });
        queue.on('error', (err) => logger.warn({ err: err.message, queue: name }, 'Queue error'));
        queues.set(name, queue);
    }
    return queue;
}

/** Imports run once: a retry would re-create rows that already succeeded. Results are kept for a day. */
export const importQueue = () =>
    getQueue(QUEUE_NAMES.import, {
        attempts: 1,
        removeOnComplete: { age: 24 * 60 * 60, count: 500 },
        removeOnFail: { age: 7 * 24 * 60 * 60 },
    });

/** Audit writes retry with backoff; failures are kept for inspection. */
export const auditQueue = () =>
    getQueue(QUEUE_NAMES.audit, {
        attempts: 5,
        backoff: { type: 'exponential', delay: 1_000 },
        removeOnComplete: { age: 60 * 60, count: 1_000 },
        removeOnFail: { age: 7 * 24 * 60 * 60 },
    });

/** Nightly Lead Rating ageing (job scheduler at 00:05 IST): no retries, the next night or start-up catches up. */
export const leadRatingQueue = () =>
    getQueue(QUEUE_NAMES.leadRating, {
        attempts: 1,
        removeOnComplete: { age: 7 * 24 * 60 * 60, count: 30 },
        removeOnFail: { age: 30 * 24 * 60 * 60 },
    });

/** Audit log exports (Admin › Audit Log): once each; the AuditExport row keeps the outcome. */
export const auditExportQueue = () =>
    getQueue(QUEUE_NAMES.auditExport, {
        attempts: 1,
        removeOnComplete: { age: 24 * 60 * 60, count: 200 },
        removeOnFail: { age: 7 * 24 * 60 * 60 },
    });

/**
 * Audit ledger: the nightly digest (job scheduler) and "Verify integrity" runs. Once each; a verify job is added under
 * a fixed id and removed when it ends, so only one runs at a time and its presence means "running".
 */
export const auditLedgerQueue = () =>
    getQueue(QUEUE_NAMES.auditLedger, {
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: true,
    });

/**
 * Reminders and notifications (src/jobs/workers/reminders.worker.ts): a delayed job per activity reminder (`remind`),
 * the business-hours sweep (`sweep`) and nightly purge + re-arm (`nightly`). Every job is idempotent (claim columns
 * and unique dedupe keys), so retries are safe.
 */
export const remindersQueue = () =>
    getQueue(QUEUE_NAMES.reminders, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: { age: 24 * 60 * 60, count: 1_000 },
        removeOnFail: { age: 7 * 24 * 60 * 60 },
    });

/**
 * Outgoing email (src/jobs/workers/mail.worker.ts): the morning summary (`morning`). Its own queue and worker, so a
 * slow or unreachable SMTP server never holds back reminders. Sends are deduplicated in EmailLog, so retries only
 * re-send what failed.
 */
export const mailQueue = () =>
    getQueue(QUEUE_NAMES.mail, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: { age: 7 * 24 * 60 * 60, count: 100 },
        removeOnFail: { age: 30 * 24 * 60 * 60 },
    });

/**
 * Calendar sync (src/jobs/workers/calendarSync.worker.ts, Calendar Phase 2 spec §10.1): `push` (one link), `enrolled`
 * (a connection row first reached ok), `check` (a connection health check), and the `calendar-poll` and
 * `calendar-nightly` schedulers. Its own queue and worker, so provider latency never delays reminders or mail. Pushes
 * are idempotent (requested ids, compare-and-set on the outbox), so retries are safe; job ids use hyphens only.
 */
export const calendarSyncQueue = () =>
    getQueue(QUEUE_NAMES.calendarSync, {
        attempts: 5,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: { age: 60 * 60, count: 2_000 },
        removeOnFail: { age: 7 * 24 * 60 * 60 },
    });

/** Background jobs are usable only while Redis is reachable (checked on the shared client). */
export const isQueueAvailable = (): boolean => isRedisReady();

/**
 * Adds a job, or returns null when Redis is unavailable / doesn't answer in time, so the caller can process
 * synchronously instead of hanging the request. The queue is created only once Redis is known to be up.
 */
export async function tryEnqueue<T>(getQueueFn: () => Queue, name: string, data: T, options?: JobsOptions): Promise<string | null> {
    if (!isQueueAvailable()) return null;
    const queue = getQueueFn();
    let timer: NodeJS.Timeout | undefined;
    try {
        const job = await Promise.race([
            queue.add(name, data, options),
            new Promise<never>((_, reject) => {
                timer = setTimeout(() => reject(new Error('Enqueue timed out')), ENQUEUE_TIMEOUT_MS);
            }),
        ]);
        return job.id ?? null;
    } catch (err) {
        logger.warn({ err: (err as Error).message, queue: queue.name }, 'Could not enqueue job; processing synchronously');
        return null;
    } finally {
        clearTimeout(timer);
    }
}

export async function closeQueues(): Promise<void> {
    await Promise.allSettled([...queues.values()].map((queue) => queue.close()));
    await producerConnection?.quit().catch(() => undefined);
}
