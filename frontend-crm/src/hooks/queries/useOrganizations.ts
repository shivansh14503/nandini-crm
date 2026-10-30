import { organizationService } from '@/services/organization.service';
import { createEntityHooks } from './createEntityHooks';
import { queryKeys } from './queryKeys';

const organizationHooks = createEntityHooks(queryKeys.organizations, organizationService);

export const useOrganizations = organizationHooks.useList;
export const usePaginatedOrganizations = organizationHooks.usePaginatedList;
export const useOrganization = organizationHooks.useDetail;
export const useCreateOrganization = organizationHooks.useCreate;
export const useUpdateOrganization = organizationHooks.useUpdate;
export const useDeleteOrganization = organizationHooks.useDelete;
export const useBulkDeleteOrganizations = organizationHooks.useBulkDelete;
