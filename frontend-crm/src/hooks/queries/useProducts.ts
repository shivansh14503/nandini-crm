import { productService } from '@/services/product.service';
import { createEntityHooks } from './createEntityHooks';
import { queryKeys } from './queryKeys';

const productHooks = createEntityHooks(queryKeys.products, productService);

export const useProducts = productHooks.useList;
export const useProduct = productHooks.useDetail;
export const useCreateProduct = productHooks.useCreate;
export const useUpdateProduct = productHooks.useUpdate;
export const useDeleteProduct = productHooks.useDelete;
export const useBulkDeleteProducts = productHooks.useBulkDelete;
