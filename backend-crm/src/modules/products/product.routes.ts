import { Router } from 'express';
import { authenticate } from '../../middlewares/authMiddleware.js';
import { registerCrudRoutes } from '../shared/crud.js';
import { productController } from './product.controller.js';

/**
 * /api/products
 *   GET    /             ?page&limit&search&sortBy&sortOrder&category&type&isActive&createdWithinDays
 *   GET    /:id
 *   POST   /
 *   PUT    /:id          (partial; PATCH is an alias)
 *   DELETE /:id          (soft delete)
 *   POST   /bulk-delete  { ids }
 */
const router = Router();
router.use(authenticate);
registerCrudRoutes(router, productController);

export default router;
