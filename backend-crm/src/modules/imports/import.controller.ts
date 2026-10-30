import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import type { z } from 'zod';
import { sendSuccess } from '../../utils/apiResponse.js';
import { requireUser } from '../../utils/requestContext.js';
import type { ImportEntity } from './import.processor.js';
import { importService, type importBodySchema } from './import.service.js';

export const importController = {
    /** POST /api/import/:entity → 202 { status: 'queued', importId } or 200 { status: 'completed', result }. */
    async start(req: Request, res: Response): Promise<void> {
        const outcome = await importService.start(
            req.params.entity as ImportEntity,
            req.body as z.infer<typeof importBodySchema>,
            requireUser(req),
        );
        if (outcome.status === 'queued') {
            sendSuccess(res, outcome, `Import of ${outcome.total} rows queued`, StatusCodes.ACCEPTED);
        } else {
            const { created, failed } = outcome.result;
            sendSuccess(res, outcome, `Imported ${created} of ${outcome.result.total} rows${failed.length ? ` (${failed.length} failed)` : ''}`);
        }
    },

    /** GET /api/import/jobs/:importId */
    async status(req: Request, res: Response): Promise<void> {
        sendSuccess(res, await importService.status(String(req.params.importId), requireUser(req)));
    },
};
