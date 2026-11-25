import { referralService } from '@/services/referral.service';
import { createEntityHooks } from './createEntityHooks';
import { queryKeys } from './queryKeys';

const referralHooks = createEntityHooks(queryKeys.referrals, referralService);

export const useReferrals = referralHooks.useList;
export const usePaginatedReferrals = referralHooks.usePaginatedList;
export const useReferral = referralHooks.useDetail;
export const useCreateReferral = referralHooks.useCreate;
export const useUpdateReferral = referralHooks.useUpdate;
export const useDeleteReferral = referralHooks.useDelete;
export const useBulkDeleteReferrals = referralHooks.useBulkDelete;
