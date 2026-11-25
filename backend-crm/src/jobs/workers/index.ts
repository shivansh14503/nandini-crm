import type { Worker } from 'bullmq';
import { logger } from '../../config/logger.js';
import { startAuditWorker } from './audit.worker.js';
import { startAuditExportWorker } from './auditExport.worker.js';
import { startAuditLedgerWorker } from './auditLedger.worker.js';
import { startImportWorker } from './import.worker.js';
import { startLeadRatingWorker } from './leadRating.worker.js';
import { startMailWorker } from './mail.worker.js';
import { startRemindersWorker } from './reminders.worker.js';

let running: Worker[] = [];

/**
 * Starts the import, audit, audit export / ledger, Lead Rating, reminders (notifications) and mail (morning summary
 * email) workers, in the API process (RUN_WORKERS=true) or standalone via src/jobs/worker.ts.
 */
export function startWorkers(): void {
    if (running.length > 0) return;
    running = [
        startImportWorker(),
        startAuditWorker(),
        startAuditExportWorker(),
        startAuditLedgerWorker(),
        startLeadRatingWorker(),
        startRemindersWorker(),
        startMailWorker(),
    ];
    logger.info('Background workers started (import, audit, audit export, audit ledger, lead rating, reminders, mail)');
}

/** Lets in-flight jobs finish, then disconnects. */
export async function stopWorkers(): Promise<void> {
    await Promise.allSettled(running.map((worker) => worker.close()));
    running = [];
}
