import type { Worker } from 'bullmq';
import { logger } from '../../config/logger.js';
import { startAuditWorker } from './audit.worker.js';
import { startImportWorker } from './import.worker.js';

let running: Worker[] = [];

/** Starts the import and audit workers (in the API process, or standalone via src/jobs/worker.ts). */
export function startWorkers(): void {
    if (running.length > 0) return;
    running = [startImportWorker(), startAuditWorker()];
    logger.info('Background workers started (import, audit)');
}

/** Lets in-flight jobs finish, then disconnects. */
export async function stopWorkers(): Promise<void> {
    await Promise.allSettled(running.map((worker) => worker.close()));
    running = [];
}
