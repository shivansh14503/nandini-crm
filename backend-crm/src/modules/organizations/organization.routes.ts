import { Router } from 'express';
import { authenticate } from '../../middlewares/authMiddleware.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import { registerCrudRoutes } from '../shared/crud.js';
import { organizationController } from './organization.controller.js';
import { bulkStatusSchema } from './organization.validator.js';

/**
 * /api/organizations
 *   GET    /             ?page&limit&search&sortBy&sortOrder&accountStatus&customerType&natureOfBusiness
 *                         &assignedUser&parentOrganizationId&mine&recent&createdWithinDays
 *   GET    /:id          (also records a "recently viewed" entry for the caller)
 *   POST   /
 *   PUT    /:id          (partial; PATCH is an alias)
 *   DELETE /:id          (soft delete)
 *   POST   /bulk-delete  { ids }
 *   PATCH  /bulk-status  { ids, status: 'Active' | 'Inactive', inactivityReason? }
 */
const router = Router();
router.use(authenticate);

// Registered before the CRUD routes so `/bulk-status` isn't captured by `PATCH /:id`.
router.patch('/bulk-status', validateRequest({ body: bulkStatusSchema }), organizationController.updateStatusBulk);
registerCrudRoutes(router, organizationController);

export default router;
