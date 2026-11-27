import { Router, type Request, type Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { authenticate, requireAdmin } from '../../middlewares/authMiddleware.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { requireUser } from '../../utils/requestContext.js';
import { emailValidationAdminService, runIdParamSchema } from './emailValidation.admin.service.js';

/**
 * /api/email-validation (admin only) — Settings › Email Validation
 *   GET  /summary            address counts per status, provider state, the active run (if any)
 *   GET  /addresses          ?status=all|unchecked|valid|risky|invalid|attention &search &sort=oldest|newest|email &page &pageSize
 *                            → { items: EmailAddressDto[], total, page, pageSize } (distinct addresses of live records)
 *   GET  /runs               last 10 bulk checks
 *   GET  /runs/:id           one bulk check (poll while running)
 *   POST /runs               { emails: string[] } | { filter: { status, search, sort }, limit } → 202, the queued run
 *                            409 when a check is already running
 *   POST /runs/:id/cancel    stops a queued / running check before its next address
 *   POST /actions            { action: accept|markBounced|remove, emails: string[] } → { affectedRecords }
 */
const router = Router();

router.use(authenticate, requireAdmin);

router.get('/summary', async (_req: Request, res: Response) => {
    sendSuccess(res, await emailValidationAdminService.summary());
});

router.get('/addresses', async (req: Request, res: Response) => {
    sendSuccess(res, await emailValidationAdminService.listAddresses(req.query));
});

router.get('/runs', async (_req: Request, res: Response) => {
    sendSuccess(res, await emailValidationAdminService.listRuns());
});

router.get('/runs/:id', async (req: Request, res: Response) => {
    sendSuccess(res, await emailValidationAdminService.getRun(runIdParamSchema.parse(req.params).id));
});

router.post('/runs', async (req: Request, res: Response) => {
    sendSuccess(res, await emailValidationAdminService.startRun(req.body, requireUser(req)), 'Email check started', StatusCodes.ACCEPTED);
});

router.post('/runs/:id/cancel', async (req: Request, res: Response) => {
    sendSuccess(res, await emailValidationAdminService.cancelRun(runIdParamSchema.parse(req.params).id, requireUser(req)), 'Email check cancelled');
});

router.post('/actions', async (req: Request, res: Response) => {
    sendSuccess(res, await emailValidationAdminService.applyAction(req.body, requireUser(req)), 'Email addresses updated');
});

export default router;
