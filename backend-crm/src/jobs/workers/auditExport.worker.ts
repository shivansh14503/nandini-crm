import { Worker } from 'bullmq';
import { logger } from '../../config/logger.js';
import { runExport, type AuditExportJobData } from '../../modules/audit/auditExport.service.js';
import { runWithAuditOrigin } from '../../services/auditContext.js';
import { createQueueConnection, QUEUE_NAMES } from '../queues.js';
import { throttledLogger } from './throttledLogger.js';

/** Large audit log exports (Admin › Audit Log), one at a time so a big export can't crowd the database. */
export function startAuditExportWorker(): Worker<AuditExportJobData> {
    const worker = new Worker<AuditExportJobData>(
        QUEUE_NAMES.auditExport,
        (job) => runWithAuditOrigin({ ...job.data.origin, source: job.data.origin?.source ?? 'API' }, () => runExport(job.data.exportId, job.data.origin)),
        { connection: createQueueConnection(), concurrency: 1 },
    );
    const warn = throttledLogger();
    worker.on('failed', (job, err) => logger.error({ exportId: job?.data.exportId, err: err.message }, 'Audit export job failed'));
    worker.on('error', (err) => warn(err.message, 'Audit export worker error'));
    return worker;
}
