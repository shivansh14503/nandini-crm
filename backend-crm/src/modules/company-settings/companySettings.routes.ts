import { Router, type Request, type Response } from 'express';
import { authenticate, requireAdmin } from '../../middlewares/authMiddleware.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { requireUser } from '../../utils/requestContext.js';
import { companySettingsService } from './companySettings.service.js';

/**
 * /api/company-settings: the company's own details (Admin › Company Details).
 *   GET /   (any signed-in user) { companyState, updatedBy, updatedAt }; companyState '' while not set
 *
 *   (admin only)
 *   PUT /   { companyState }: an Indian state or union territory by name or ISO code ('' clears it). Line items charge
 *           IGST to customers in another state and CGST + SGST within it; records saved without a company state take
 *           the split when it is first set.
 */
const router = Router();

router.get('/', authenticate, async (_req: Request, res: Response) => {
    sendSuccess(res, await companySettingsService.get());
});

router.put('/', authenticate, requireAdmin, async (req: Request, res: Response) => {
    sendSuccess(res, await companySettingsService.save(req.body, requireUser(req)), 'Company details saved');
});

export default router;
