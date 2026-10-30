import { Router } from 'express';
import { authenticate } from '../../middlewares/authMiddleware.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import { idParamSchema } from '../../validators/common.js';
import { registerCrudRoutes } from '../shared/crud.js';
import { leadController } from './lead.controller.js';

/**
 * /api/leads
 *   GET    /             ?page&limit&search&sortBy&sortOrder&status&excludeStatus&leadType&leadSource
 *                         &organizationName&assignedTo&mine&nextFollowupDate&createdWithinDays
 *   GET    /:id
 *   POST   /
 *   PUT    /:id          (partial; PATCH is an alias; status can't be set to/from Converted here)
 *   DELETE /:id          (soft delete)
 *   POST   /bulk-delete  { ids }
 *   POST   /:id/convert  ConvertLeadFormValues → LeadConversionResult (atomic)
 */
const router = Router();
router.use(authenticate);

router.post('/:id/convert', validateRequest({ params: idParamSchema }), leadController.convert);
registerCrudRoutes(router, leadController);

export default router;
