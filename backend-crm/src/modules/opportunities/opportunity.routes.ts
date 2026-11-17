import { Router } from 'express';
import { authenticate } from '../../middlewares/authMiddleware.js';
import { registerCrudRoutes } from '../shared/crud.js';
import { opportunityController } from './opportunity.controller.js';

/**
 * /api/opportunities
 *   GET    /             ?page&limit&search&sortBy&sortOrder&salesStage&excludeSalesStage&organizationId&contactId
 *                         &productId&assignedTo&mine&minGrandTotal&nextFollowupDate&createdWithinDays
 *   GET    /:id
 *   POST   /             (line-item totals are computed server-side)
 *   PUT    /:id          (partial; PATCH is an alias; line items replaced only when sent)
 *   DELETE /:id          (soft delete)
 *   POST   /bulk-delete  { ids }
 */
const router = Router();
router.use(authenticate);
registerCrudRoutes(router, opportunityController);

export default router;
