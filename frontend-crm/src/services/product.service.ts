import type { ApiResponse } from '../types/api.types';
import type { ManufacturerSuggestion, Product, ProductFormData } from '../types/product.types';
import { apiClient } from './apiClient';
import { createCrudService } from './base.service';

export const productService = createCrudService<Product, ProductFormData, Partial<ProductFormData>>('/api/products');

/** Manufacturers already in the catalog, A to Z, for the product form's Manufacturer suggestions. */
export async function fetchProductManufacturers(signal?: AbortSignal): Promise<ManufacturerSuggestion[]> {
    const res = await apiClient.get<ApiResponse<ManufacturerSuggestion[]>>('/api/products/manufacturers', { params: { limit: 200 }, signal });
    return res.data ?? [];
}
