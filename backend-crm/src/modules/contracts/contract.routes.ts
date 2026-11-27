import { Router } from 'express';
import { authenticate } from '../../middlewares/authMiddleware.js';
import { registerCrudRoutes } from '../shared/crud.js';
import { contractController } from './contract.controller.js';

/**
 * /api/contracts
 *   GET    /             ?page&limit&search&sortBy&sortOrder&status&excludeStatus&organizationId&contactId
 *                         &opportunityId&assignedTo&mine&createdWithinDays
 *   GET    /:id
 *   POST   /
 *   PUT    /:id          (partial; PATCH is an alias)
 *   DELETE /:id          (soft delete)
 *   POST   /bulk-delete  { ids }
 */
const router = Router();
router.use(authenticate);
registerCrudRoutes(router, contractController, 'contracts');

export default router;
