import { Router, type Request, type Response } from 'express';
import { authenticate, requireAdmin } from '../../middlewares/authMiddleware.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { requireUser } from '../../utils/requestContext.js';
import { companyFormatsService } from './companyFormats.service.js';

/**
 * /api/company-formats: how dates, times and numbers are shown across the CRM, its PDFs and emails.
 *   GET    /   (any signed-in user) the company formats, `customized`, the fixed currency and the business timezone
 *
 *   (admin only)
 *   PUT    /   { dateFormat, timeFormat, numberGrouping }: saves (all three required); unchanged values write nothing
 *   DELETE /   reset to the CRM defaults: deletes the setting, so every screen keeps its pre-company-formats style
 *
 * Formats change display only: stored values and API JSON (ISO dates, plain numbers) never change.
 */
const router = Router();

router.get('/', authenticate, async (_req: Request, res: Response) => {
    sendSuccess(res, await companyFormatsService.get());
});

router.use(authenticate, requireAdmin);

router.put('/', async (req: Request, res: Response) => {
    sendSuccess(res, await companyFormatsService.save(req.body, requireUser(req)), 'Company formats saved');
});

router.delete('/', async (req: Request, res: Response) => {
    sendSuccess(res, await companyFormatsService.reset(requireUser(req)), 'Company formats reset to the CRM defaults');
});

export default router;
