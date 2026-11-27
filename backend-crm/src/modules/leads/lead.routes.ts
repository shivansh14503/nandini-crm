import { Router } from 'express';
import { authenticate, requirePermission } from '../../middlewares/authMiddleware.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import { idParamSchema } from '../../validators/common.js';
import { registerCrudRoutes } from '../shared/crud.js';
import { leadController } from './lead.controller.js';

/**
 * /api/leads
 *   GET    /             ?page&limit&search&sortBy&sortOrder&status&excludeStatus&leadType&rating&leadSource
 *                         &organizationName&assignedTo&mine&nextFollowupDate&createdWithinDays
 *   GET    /check-duplicates ?mobile&emails&excludeId&excludeType  (informational; never blocks a save)
 *   GET    /:id
 *   POST   /
 *   PUT    /:id          (partial; PATCH is an alias; status can't be set to/from Converted here)
 *   DELETE /:id          (soft delete)
 *   POST   /bulk-delete  { ids }
 *   POST   /:id/convert  ConvertLeadFormValues → LeadConversionResult (atomic)
 * Save side effect (Calendar Phase 2 P2-4, switch `followUpActivities`): every write keeps the lead's follow-up
 * activity in line in the same transaction (create / re-align / complete with the recorded response / cancel when
 * closed or deleted; Convert moves it to the new opportunity). See activities/activity.followUp.ts.
 */
const router = Router();
router.use(authenticate);

// Before the CRUD routes so `/check-duplicates` isn't captured by `/:id`.
router.get('/check-duplicates', leadController.checkDuplicates);
// Convert edits the lead and creates an opportunity (Admin › Roles: Leads › Edit and Opportunities › Create).
router.post(
    '/:id/convert',
    requirePermission('leads', 'edit'),
    requirePermission('opportunities', 'create'),
    validateRequest({ params: idParamSchema }),
    leadController.convert,
);
registerCrudRoutes(router, leadController, 'leads');

export default router;
