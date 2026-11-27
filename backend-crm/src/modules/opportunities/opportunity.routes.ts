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
 * Save side effect (Calendar Phase 2 P2-4, switch `followUpActivities`): every write keeps the opportunity's follow-up
 * activity in line in the same transaction (create / re-align / complete with the recorded response / cancel at
 * Closed Won / Lost or on delete). See activities/activity.followUp.ts.
 */
const router = Router();
router.use(authenticate);
registerCrudRoutes(router, opportunityController, 'opportunities');

export default router;
