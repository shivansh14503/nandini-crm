import { Router } from 'express';
import { authenticate } from '../../middlewares/authMiddleware.js';
import { registerCrudRoutes } from '../shared/crud.js';
import { contactController } from './contact.controller.js';

/**
 * /api/contacts
 *   GET    /             ?page&limit&search&sortBy&sortOrder&organizationId&assignedTo&isPrimaryContact&mine&createdWithinDays
 *   GET    /:id
 *   POST   /
 *   PUT    /:id          (partial; PATCH is an alias)
 *   DELETE /:id          (soft delete)
 *   POST   /bulk-delete  { ids }
 */
const router = Router();
router.use(authenticate);
registerCrudRoutes(router, contactController);

export default router;
