import { Router } from 'express';
import { authenticate } from '../../middlewares/authMiddleware.js';
import { registerCrudRoutes } from '../shared/crud.js';
import { partnerCompanyController } from './partnerCompany.controller.js';

/**
 * /api/partner-companies
 *   GET    /             ?page&limit&search&sortBy&sortOrder&natureOfPartner&assignedTo&mine&createdWithinDays
 *   GET    /:id
 *   POST   /
 *   PUT    /:id          (partial; PATCH is an alias)
 *   DELETE /:id          (soft delete)
 *   POST   /bulk-delete  { ids }
 */
const router = Router();
router.use(authenticate);
registerCrudRoutes(router, partnerCompanyController);

export default router;
