import express, { Router } from 'express';
import { authenticate } from '../../middlewares/authMiddleware.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import { importController } from './import.controller.js';
import { importBodySchema, importEntityParamSchema, importIdParamSchema } from './import.service.js';

/**
 * /api/import
 *   POST /:entity          { rows: [{ rowNumber, values }], fileName? }  entity = organizations|contacts|products|leads
 *                          → 202 queued (poll the job) or 200 completed (no Redis; ≤ 500 rows run inline)
 *   GET  /jobs/:importId   → state, progress and per-row results (owner only)
 */
const router = Router();
// Imports carry up to 5,000 rows, so they get a larger body limit than the API's default 1 MB.
router.use(express.json({ limit: '10mb' }));
router.use(authenticate);

router.get('/jobs/:importId', validateRequest({ params: importIdParamSchema }), importController.status);
router.post('/:entity', validateRequest({ params: importEntityParamSchema, body: importBodySchema }), importController.start);

export default router;
