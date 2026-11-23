import { Worker, type Job } from 'bullmq';
import { logger } from '../../config/logger.js';
import { cleanupAuditExports } from '../../modules/audit/auditExport.service.js';
import { auditLedgerService, runVerify, type VerifyJobData } from '../../modules/audit/auditLedger.service.js';
import { runWithAuditOrigin } from '../../services/auditContext.js';
import { createQueueConnection, QUEUE_NAMES } from '../queues.js';
import { throttledLogger } from './throttledLogger.js';

/**
 * Audit ledger jobs (auditLedger.service.ts): `digest` (job scheduler, 00:15 every night in the business timezone)
 * saves the night's ledger digest and removes audit exports older than 24 hours; `verify` is "Verify integrity".
 */
async function process(job: Job): Promise<unknown> {
    if (job.name === 'verify') {
        const data = job.data as VerifyJobData;
        return runWithAuditOrigin({ ...data.origin, source: data.origin?.source ?? 'API' }, () => runVerify(data));
    }
    return runWithAuditOrigin({ source: 'JOB', route: 'job:audit-ledger-digest' }, async () => {
        await auditLedgerService.nightly();
        await cleanupAuditExports();
    });
}

export function startAuditLedgerWorker(): Worker {
    const worker = new Worker(QUEUE_NAMES.auditLedger, process, { connection: createQueueConnection(), concurrency: 1 });
    const warn = throttledLogger();
    worker.on('failed', (job, err) => logger.error({ job: job?.name, err: err.message }, 'Audit ledger job failed'));
    worker.on('error', (err) => warn(err.message, 'Audit ledger worker error'));
    void auditLedgerService.schedule();
    return worker;
}
