import { opportunityService } from '@/services/opportunity.service';
import { createEntityHooks } from './createEntityHooks';
import { queryKeys } from './queryKeys';

const opportunityHooks = createEntityHooks(queryKeys.opportunities, opportunityService);

export const useOpportunities = opportunityHooks.useList;
export const usePaginatedOpportunities = opportunityHooks.usePaginatedList;
export const useOpportunity = opportunityHooks.useDetail;
export const useCreateOpportunity = opportunityHooks.useCreate;
export const useUpdateOpportunity = opportunityHooks.useUpdate;
export const useDeleteOpportunity = opportunityHooks.useDelete;
export const useBulkDeleteOpportunities = opportunityHooks.useBulkDelete;
