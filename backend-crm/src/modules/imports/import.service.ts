import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { StatusCodes } from 'http-status-codes';
import { importQueue, isQueueAvailable, tryEnqueue } from '../../jobs/queues.js';
import type { AuthUser } from '../../types/user.types.js';
import { HttpError } from '../../utils/httpError.js';
import { optionalText } from '../../validators/common.js';
import { IMPORT_ENTITIES, processImport, type ImportEntity, type ImportJobData, type ImportResult } from './import.processor.js';

export const MAX_IMPORT_ROWS = 5_000;
/** Without Redis, imports up to this size run inside the request; larger ones need the background queue. */
export const MAX_INLINE_IMPORT_ROWS = 500;
const MAX_CELL_LENGTH = 5_000;

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
    /** BullMQ state: waiting | active | completed | failed | delayed … */
    state: string;
    progress: number;
    result?: ImportResult;
    failedReason?: string;
}

export const importService = {
    /** Queues the import (202) or, when Redis is down and the file is small enough, runs it now (200). */
    async start(entity: ImportEntity, body: z.infer<typeof importBodySchema>, user: AuthUser): Promise<ImportStartResult> {
        const importId = randomUUID();
        const data: ImportJobData = { importId, entity, rows: body.rows, user, fileName: body.fileName };

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
        if (!isQueueAvailable()) {
            throw new HttpError('Import status is temporarily unavailable.', StatusCodes.SERVICE_UNAVAILABLE, { code: 'IMPORT_QUEUE_UNAVAILABLE' });
        }
        const job = await importQueue().getJob(importId);
        const data = job?.data as ImportJobData | undefined;
        if (!job || !data || data.user.id !== user.id) throw HttpError.notFound('Import not found');

        return {
            importId,
            entity: data.entity,
            total: data.rows.length,
            state: await job.getState(),
            progress: typeof job.progress === 'number' ? job.progress : 0,
            result: (job.returnvalue as ImportResult | null) ?? undefined,
            failedReason: job.failedReason || undefined,
        };
    },
};
