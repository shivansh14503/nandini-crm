import type { OrganizationFormData, ExtendedOrganization } from '../types/organization.types';
import type { ApiResponse } from '../types/api.types';
import { createCrudService } from './base.service';
import { apiClient } from './apiClient';
import { notifyCrmUpdate } from './crmSync';
import type { OrgNameMatchField, OrgNameMatchKind } from '../utils/organizationName';

const baseOrganizationService = createCrudService<
    ExtendedOrganization,
    OrganizationFormData | Partial<ExtendedOrganization>,
    Partial<ExtendedOrganization>
>('/api/organizations');

/** An existing organization whose name matches or resembles the one checked (server-ranked, best first). */
export interface SimilarOrganizationMatch {
    id: string;
    accountCode: string;
    organizationName: string;
    tradeName: string | null;
    billingCity: string | null;
    billingState: string | null;
    accountStatus: string;
    gstNo: string | null;
    matchKind: OrgNameMatchKind;
    /** Whether the legal name or the trade name matched (older servers omit it: legal name). */
    matchedField?: OrgNameMatchField;
}

export interface OrganizationUniqueCheck {
    exists: boolean;
    /** How the duplicate was found: same name (exact), same legal name written differently (canonical), or GSTIN. */
    matchKind?: 'exact' | 'canonical' | 'gstNo';
    field?: 'organizationName' | 'gstNo';
    id?: string;
    accountCode?: string;
    organizationName?: string;
    /** For a name duplicate: the existing organization's legal name or its trade name matched. */
    matchedField?: OrgNameMatchField;
    tradeName?: string | null;
    message?: string;
    /** Existing organizations with matching / similar names, for the autocomplete dropdown. */
    suggestions?: SimilarOrganizationMatch[];
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
