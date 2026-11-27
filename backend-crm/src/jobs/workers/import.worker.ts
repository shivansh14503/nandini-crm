import { Worker } from 'bullmq';
import { logger } from '../../config/logger.js';
import { redis } from '../../config/redis.js';
import { importCancelKey, processImport, type ImportJobData, type ImportResult } from '../../modules/imports/import.processor.js';
import { createQueueConnection, QUEUE_NAMES } from '../queues.js';
import { throttledLogger } from './throttledLogger.js';

/** One import at a time: rows run in serializable transactions, so parallel imports would only contend. */
export function startImportWorker(): Worker<ImportJobData, ImportResult> {
    const worker = new Worker<ImportJobData, ImportResult>(
        QUEUE_NAMES.import,
        (job) =>
            processImport(job.data, {
                // Live counts (processed / created / failed) for the wizard's progress screen.
                onProgress: (progress) => job.updateProgress({ ...progress }),
                // The owner's Cancel (POST /api/import/jobs/:importId/cancel) sets this key; a Redis hiccup never stops an import.
                shouldCancel: async () => (await redis.exists(importCancelKey(job.data.importId)).catch(() => 0)) === 1,
            }),
        { connection: createQueueConnection(), concurrency: 1 },
    );
    const warn = throttledLogger();
    worker.on('failed', (job, err) => logger.error({ importId: job?.id, err: err.message }, 'Import job failed'));
    worker.on('error', (err) => warn(err.message, 'Import worker error'));
    return worker;
}
