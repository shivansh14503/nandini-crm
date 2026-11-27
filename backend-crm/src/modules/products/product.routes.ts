import { Router } from 'express';
import { authenticate } from '../../middlewares/authMiddleware.js';
import { registerCrudRoutes } from '../shared/crud.js';
import { productController } from './product.controller.js';

/**
 * /api/products
 *   GET    /             ?page&limit&search&sortBy&sortOrder&productCategory&type&isActive&createdWithinDays
 *   GET    /manufacturers ?search&limit → { name, products }[] (manufacturers of live products, A to Z)
 *   GET    /:id
 *   POST   /
 *   PUT    /:id          (partial; PATCH is an alias)
 *   DELETE /:id          (soft delete)
 *   POST   /bulk-delete  { ids }
 */
const router = Router();
router.use(authenticate);
// Before the CRUD routes, so /:id doesn't capture it.
router.get('/manufacturers', productController.manufacturers);
registerCrudRoutes(router, productController);

export default router;
