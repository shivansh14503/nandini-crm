import type { OrganizationFormData, ExtendedOrganization } from '../types/organization.types';
import type { ApiResponse } from '../types/api.types';
import { createCrudService } from './base.service';
import { apiClient } from './apiClient';
import { notifyCrmUpdate } from './crmSync';

const baseOrganizationService = createCrudService<
    ExtendedOrganization,
    OrganizationFormData | Partial<ExtendedOrganization>,
    Partial<ExtendedOrganization>
>('/api/organizations');

export const organizationService = {
    ...baseOrganizationService,
    /** Sets the account status of several organizations in one audited transaction (PATCH /bulk-status). */
    updateStatusBulk: async (
        ids: Iterable<string>,
        status: ExtendedOrganization['accountStatus'],
        inactivityReason?: string
    ): Promise<ExtendedOrganization[]> => {
        const res = await apiClient.patch<ApiResponse<ExtendedOrganization[]>>(`${baseOrganizationService.endpoint}/bulk-status`, {
            ids: [...new Set(ids)],
            status,
            inactivityReason,
        });
        notifyCrmUpdate(baseOrganizationService.endpoint);
        return res.data;
    },
};
