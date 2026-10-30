import { Router } from 'express';
import { authenticate } from '../../middlewares/authMiddleware.js';
import { registerCrudRoutes } from '../shared/crud.js';
import { quotationController } from './quotation.controller.js';

/**
 * /api/quotations
 *   GET    /             ?page&limit&search&sortBy&sortOrder&status&quoteStage&opportunityId&organizationId
 *                         &contactId&productId&assignedTo&mine&createdWithinDays
 *   GET    /:id
 *   POST   /             (totals verified against line items; advances the linked opportunity's stage)
 *   PUT    /:id          (partial; PATCH is an alias; line items replaced only when sent)
 *   DELETE /:id          (soft delete)
 *   POST   /bulk-delete  { ids }
 */
const router = Router();
router.use(authenticate);
registerCrudRoutes(router, quotationController);

export default router;
