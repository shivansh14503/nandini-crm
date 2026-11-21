import type { Worker } from 'bullmq';
import { logger } from '../../config/logger.js';
import { startAuditWorker } from './audit.worker.js';
import { startImportWorker } from './import.worker.js';
import { startLeadRatingWorker } from './leadRating.worker.js';

let running: Worker[] = [];

/** Starts the import, audit and Lead Rating workers (in the API process, or standalone via src/jobs/worker.ts). */
export function startWorkers(): void {
    if (running.length > 0) return;
    running = [startImportWorker(), startAuditWorker(), startLeadRatingWorker()];
    logger.info('Background workers started (import, audit, lead rating)');
}

/** Lets in-flight jobs finish, then disconnects. */
export async function stopWorkers(): Promise<void> {
    await Promise.allSettled(running.map((worker) => worker.close()));
    running = [];
}
