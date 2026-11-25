import { contractService } from '@/services/contract.service';
import { createEntityHooks } from './createEntityHooks';
import { queryKeys } from './queryKeys';

const contractHooks = createEntityHooks(queryKeys.contracts, contractService);

export const useContracts = contractHooks.useList;
export const usePaginatedContracts = contractHooks.usePaginatedList;
export const useContract = contractHooks.useDetail;
export const useCreateContract = contractHooks.useCreate;
export const useUpdateContract = contractHooks.useUpdate;
export const useDeleteContract = contractHooks.useDelete;
export const useBulkDeleteContracts = contractHooks.useBulkDelete;
