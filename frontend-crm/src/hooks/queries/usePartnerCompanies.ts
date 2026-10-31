import { partnerCompanyService } from '@/services/partnerCompany.service';
import { createEntityHooks } from './createEntityHooks';
import { queryKeys } from './queryKeys';

const partnerCompanyHooks = createEntityHooks(queryKeys.partnerCompanies, partnerCompanyService);

export const usePartnerCompanies = partnerCompanyHooks.useList;
export const usePaginatedPartnerCompanies = partnerCompanyHooks.usePaginatedList;
export const usePartnerCompany = partnerCompanyHooks.useDetail;
export const useCreatePartnerCompany = partnerCompanyHooks.useCreate;
export const useUpdatePartnerCompany = partnerCompanyHooks.useUpdate;
export const useDeletePartnerCompany = partnerCompanyHooks.useDelete;
export const useBulkDeletePartnerCompanies = partnerCompanyHooks.useBulkDelete;
