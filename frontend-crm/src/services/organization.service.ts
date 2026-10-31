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

export interface OrganizationUniqueCheck {
    exists: boolean;
    field?: 'organizationName' | 'gstNo';
    accountCode?: string;
    organizationName?: string;
    message?: string;
}

export const organizationService = {
    ...baseOrganizationService,
    /** Read-only duplicate check against live organizations; `excludeId` skips the record being edited. */
    checkUnique: async (
        params: { organizationName?: string; gstNo?: string; excludeId?: string },
        signal?: AbortSignal
    ): Promise<OrganizationUniqueCheck> => {
        const res = await apiClient.get<ApiResponse<OrganizationUniqueCheck>>(`${baseOrganizationService.endpoint}/check-unique`, {
            params,
            signal,
        });
        return res.data;
    },
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
