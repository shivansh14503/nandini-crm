import { Router } from 'express';
import { authenticate } from '../../middlewares/authMiddleware.js';
import { registerRecordPdfRoute } from '../pdf/pdf.routes.js';
import { registerCrudRoutes } from '../shared/crud.js';
import { quotationController } from './quotation.controller.js';

/**
 * /api/quotations
 *   GET    /             ?page&limit&search&sortBy&sortOrder&status&quoteStage&opportunityId&organizationId
 *                         &contactId&productId&assignedTo&mine&createdWithinDays
 *   GET    /:id
 *   GET    /:id/pdf      ?templateId&disposition=inline|attachment → application/pdf (default / chosen template;
 *                         30 renders/min/user; Content-Disposition carries `<code>_<customer>.pdf`)
 *   POST   /             (totals verified against line items; advances the linked opportunity's stage)
 *   PUT    /:id          (partial; PATCH is an alias; line items replaced only when sent)
 *   DELETE /:id          (soft delete)
 *   POST   /bulk-delete  { ids }
 */
const router = Router();
router.use(authenticate);
// Before registerCrudRoutes so `/:id` doesn't swallow `/:id/pdf`.
registerRecordPdfRoute(router, 'QUOTATION');
registerCrudRoutes(router, quotationController);

export default router;
