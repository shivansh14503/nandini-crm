import { Router } from 'express';
import { authenticate } from '../../middlewares/authMiddleware.js';
import { registerCrudRoutes } from '../shared/crud.js';
import { referralController } from './referral.controller.js';

/**
 * /api/referrals (the Referrals module; active ones are offered as Referred By on leads and opportunities)
 *   GET    /             ?page&limit&search&sortBy&sortOrder&status&assignedTo&mine&createdWithinDays
 *   GET    /:id
 *   POST   /
 *   PUT    /:id          (partial; PATCH is an alias)
 *   DELETE /:id          (soft delete)
 *   POST   /bulk-delete  { ids }
 */
const router = Router();
router.use(authenticate);
registerCrudRoutes(router, referralController);

export default router;
