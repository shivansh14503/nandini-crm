import { Router } from 'express';
import { authenticate } from '../../middlewares/authMiddleware.js';
import { registerCrudRoutes } from '../shared/crud.js';
import { ticketController } from './ticket.controller.js';

/**
 * /api/tickets
 *   GET    /             ?page&limit&search&sortBy&sortOrder&ticketStatus&excludeStatus&ticketPriority&supportType
 *                         &supportMode&organizationId&contactId&assignedTo&mine&overdue&createdWithinDays
 *   GET    /:id
 *   POST   /             (Nature of Call must exist in the master)
 *   PUT    /:id          (partial; PATCH is an alias)
 *   DELETE /:id          (soft delete)
 *   POST   /bulk-delete  { ids }
 */
const router = Router();
router.use(authenticate);
registerCrudRoutes(router, ticketController);

export default router;
