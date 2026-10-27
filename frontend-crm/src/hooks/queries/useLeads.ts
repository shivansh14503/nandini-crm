import { leadService } from '@/services/lead.service';
import { createEntityHooks } from './createEntityHooks';
import { queryKeys } from './queryKeys';

const leadHooks = createEntityHooks(queryKeys.leads, leadService);

export const useLeads = leadHooks.useList;
export const useLead = leadHooks.useDetail;
export const useCreateLead = leadHooks.useCreate;
export const useUpdateLead = leadHooks.useUpdate;
export const useDeleteLead = leadHooks.useDelete;
export const useBulkDeleteLeads = leadHooks.useBulkDelete;
