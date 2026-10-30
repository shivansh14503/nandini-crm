import type { Product, ProductFormData } from '../types/product.types';
import { createCrudService } from './base.service';

export const productService = createCrudService<Product, ProductFormData, Partial<ProductFormData>>('/api/products');
