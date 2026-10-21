import type { Product, ProductFormData } from '../types/product.types';
import {
    getStoredProducts,
    saveStoredProducts,
    getStoredProductById,
    addStoredProduct,
    updateStoredProduct,
    deleteStoredProduct,
    deleteMultipleStoredProducts,
} from '../data/mockProducts';
import { createCrudService } from './base.service';

export const productService = createCrudService<Product, ProductFormData, Partial<ProductFormData>>(
    '/api/products',
    {
        getAll: getStoredProducts,
        getById: getStoredProductById,
        create: addStoredProduct,
        update: updateStoredProduct,
        delete: deleteStoredProduct,
        deleteBulk: deleteMultipleStoredProducts,
        saveAll: saveStoredProducts,
    }
);
