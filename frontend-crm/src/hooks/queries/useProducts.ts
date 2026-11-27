import { useQuery } from '@tanstack/react-query';
import { fetchProductManufacturers, productService } from '@/services/product.service';
import { createEntityHooks } from './createEntityHooks';
import { queryKeys } from './queryKeys';

const productHooks = createEntityHooks(queryKeys.products, productService);

export const useProducts = productHooks.useList;
export const usePaginatedProducts = productHooks.usePaginatedList;
export const useProduct = productHooks.useDetail;
export const useCreateProduct = productHooks.useCreate;
export const useUpdateProduct = productHooks.useUpdate;
export const useDeleteProduct = productHooks.useDelete;
export const useBulkDeleteProducts = productHooks.useBulkDelete;

/** Manufacturers already in the catalog (under the products key, so product writes refresh them). */
export function useProductManufacturers(enabled = true) {
    return useQuery({
        queryKey: [...queryKeys.products.all, 'manufacturers'] as const,
        queryFn: ({ signal }) => fetchProductManufacturers(signal),
        enabled,
        staleTime: 60_000,
    });
}
