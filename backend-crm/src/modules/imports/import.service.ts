import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { StatusCodes } from 'http-status-codes';
import { redis } from '../../config/redis.js';
import { importQueue, isQueueAvailable, tryEnqueue } from '../../jobs/queues.js';
import { currentAuditOrigin } from '../../services/auditContext.js';
import type { AuthUser } from '../../types/user.types.js';
import { HttpError } from '../../utils/httpError.js';
import { optionalText } from '../../validators/common.js';
import {
    IMPORT_ENTITIES,
    importCancelKey,
    processImport,
    type ImportEntity,
    type ImportJobData,
    type ImportProgress,
    type ImportResult,
} from './import.processor.js';

export const MAX_IMPORT_ROWS = 5_000;
/** Without Redis, imports up to this size run inside the request; larger ones need the background queue. */
export const MAX_INLINE_IMPORT_ROWS = 500;
const MAX_CELL_LENGTH = 5_000;
/** A cancel request outlives any import (5,000 rows), then expires on its own. */
const CANCEL_KEY_TTL_SECONDS = 6 * 60 * 60;
const QUEUED_STATES = new Set(['waiting', 'delayed', 'prioritized', 'waiting-children']);

const cell = z
    .union([z.string(), z.number(), z.boolean(), z.null()])
    .transform((value) => (value === null ? '' : String(value).trim()))
    .pipe(z.string().max(MAX_CELL_LENGTH, { message: `Cells cannot exceed ${MAX_CELL_LENGTH} characters.` }));

export const importEntityParamSchema = z.object({
    entity: z.enum(IMPORT_ENTITIES, { error: `Entity must be one of: ${IMPORT_ENTITIES.join(', ')}.` }),
});

/** The wizard's valid `MappedRow`s (`{ rowNumber, values }`), plus an optional file name for the audit log. */
export const importBodySchema = z.object({
    rows: z
        .array(z.object({ rowNumber: z.coerce.number().int().min(1), values: z.record(z.string(), cell) }), { error: 'rows must be an array.' })
        .min(1, { message: 'There are no rows to import.' })
        .max(MAX_IMPORT_ROWS, { message: `At most ${MAX_IMPORT_ROWS} rows can be imported at once.` }),
    fileName: optionalText('File name', 255),
});

export const importIdParamSchema = z.object({ importId: z.uuid({ error: 'Invalid import id.' }) });

export type ImportStartResult =
    | { status: 'queued'; importId: string; total: number }
    | { status: 'completed'; importId: string; result: ImportResult };

export interface ImportJobStatus {
    importId: string;
    entity: ImportEntity;
    total: number;
    /** BullMQ state (waiting | active | completed | failed | delayed …), or `cancelled` for a queued import removed by Cancel. */
    state: string;
    /** 0–100: processed / total. */
    progress: number;
    /** Live counts while the rows run (and their final values once done). */
    processed: number;
    created: number;
    failedCount: number;
    /** The owner asked to cancel; the worker stops before its next row. */
    cancelRequested: boolean;
    result?: ImportResult;
    failedReason?: string;
}

/** BullMQ job progress: the processor's counts object (older jobs stored a bare percentage). */
function readProgress(raw: unknown, total: number): ImportProgress {
    if (raw && typeof raw === 'object') {
        const p = raw as Partial<ImportProgress>;
        const processed = Number(p.processed) || 0;
        return { processed, total, created: Number(p.created) || 0, failed: Number(p.failed) || 0, percent: Number(p.percent) || 0 };
    }
    const percent = typeof raw === 'number' ? raw : 0;
    return { processed: Math.round((percent / 100) * total), total, created: 0, failed: 0, percent };
}

export const importService = {
    /** Queues the import (202) or, when Redis is down and the file is small enough, runs it now (200). */
    async start(entity: ImportEntity, body: z.infer<typeof importBodySchema>, user: AuthUser): Promise<ImportStartResult> {
        const importId = randomUUID();
        const data: ImportJobData = { importId, entity, rows: body.rows, user, fileName: body.fileName, origin: currentAuditOrigin() };

        const jobId = await tryEnqueue(importQueue, entity, data, { jobId: importId });
        if (jobId) return { status: 'queued', importId, total: body.rows.length };

        if (body.rows.length > MAX_INLINE_IMPORT_ROWS) {
            throw new HttpError(
                `Background imports are temporarily unavailable. Import at most ${MAX_INLINE_IMPORT_ROWS} rows at a time, or try again later.`,
                StatusCodes.SERVICE_UNAVAILABLE,
                { code: 'IMPORT_QUEUE_UNAVAILABLE' },
            );
        }
        return { status: 'completed', importId, result: await processImport(data) };
    },

    /** Status of a queued import; only its owner can see it. */
    async status(importId: string, user: AuthUser): Promise<ImportJobStatus> {
        const { job, data } = await ownJob(importId, user);
        const total = data.rows.length;
        const state = await job.getState();
        const result = (job.returnvalue as ImportResult | null) ?? undefined;
        const progress = result
            ? { processed: result.processed ?? total, created: result.created, failed: result.failed.length, percent: 100 }
            : readProgress(job.progress, total);
        return {
            importId,
            entity: data.entity,
            total,
            state,
            progress: progress.percent,
            processed: progress.processed,
            created: progress.created,
            failedCount: progress.failed,
            cancelRequested: !result && (await redis.exists(importCancelKey(importId)).catch(() => 0)) === 1,
            result,
            failedReason: job.failedReason || undefined,
        };
    },

    /**
     * Cancels the owner's import. A queued one is removed before any row runs; a running one stops before its next
     * row (the rows already imported stay) and finishes with `result.cancelled`. A finished one is returned as is.
     */
    async cancel(importId: string, user: AuthUser): Promise<ImportJobStatus> {
        const { job, data } = await ownJob(importId, user);
        const state = await job.getState();
        if (QUEUED_STATES.has(state)) {
            try {
                await job.remove();
                const total = data.rows.length;
                return { importId, entity: data.entity, total, state: 'cancelled', progress: 0, processed: 0, created: 0, failedCount: 0, cancelRequested: true };
            } catch {
                // A worker picked it up meanwhile (a locked job can't be removed): cancel it as a running one.
            }
        }
        if (state !== 'completed' && state !== 'failed') await redis.set(importCancelKey(importId), '1', 'EX', CANCEL_KEY_TTL_SECONDS);
        return importService.status(importId, user);
    },
};

async function ownJob(importId: string, user: AuthUser) {
    if (!isQueueAvailable()) {
        throw new HttpError('Import status is temporarily unavailable.', StatusCodes.SERVICE_UNAVAILABLE, { code: 'IMPORT_QUEUE_UNAVAILABLE' });
    }
    const job = await importQueue().getJob(importId);
    const data = job?.data as ImportJobData | undefined;
    if (!job || !data || data.user.id !== user.id) throw HttpError.notFound('Import not found');
    return { job, data };
}
