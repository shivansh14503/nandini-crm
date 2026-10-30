import { quotationService } from '@/services/quotation.service';
import { createEntityHooks } from './createEntityHooks';
import { queryKeys } from './queryKeys';

const quotationHooks = createEntityHooks(queryKeys.quotations, quotationService);

export const useQuotations = quotationHooks.useList;
export const usePaginatedQuotations = quotationHooks.usePaginatedList;
export const useQuotation = quotationHooks.useDetail;
export const useCreateQuotation = quotationHooks.useCreate;
export const useUpdateQuotation = quotationHooks.useUpdate;
export const useDeleteQuotation = quotationHooks.useDelete;
export const useBulkDeleteQuotations = quotationHooks.useBulkDelete;
