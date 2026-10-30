import { createCrudController } from '../shared/crud.js';
import { productService } from './product.service.js';

export const productController = createCrudController(productService, { singular: 'Product', plural: 'products' });
