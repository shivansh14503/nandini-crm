import { Worker } from 'bullmq';
import { logger } from '../../config/logger.js';
import { auditService, type AuditEntry } from '../../services/audit.service.js';
import { createQueueConnection, QUEUE_NAMES } from '../queues.js';
import { throttledLogger } from './throttledLogger.js';

/** Persists queued audit events (logins, import summaries); retried with backoff by the queue's job options. */
export function startAuditWorker(): Worker<AuditEntry> {
    const worker = new Worker<AuditEntry>(QUEUE_NAMES.audit, (job) => auditService.write(job.data), {
        connection: createQueueConnection(),
        concurrency: 5,
    });
    const warn = throttledLogger();
    worker.on('failed', (job, err) =>
        logger.error({ jobId: job?.id, attempts: job?.attemptsMade, err: err.message }, 'Audit job failed'),
    );
    worker.on('error', (err) => warn(err.message, 'Audit worker error'));
    return worker;
}
