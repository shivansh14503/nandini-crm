import { apiClient } from './apiClient';
import type {
    OrganizationFormData,
    Organization,
    CreateOrganizationResponse,
    OrganizationListResponse,
} from '../types/organization.types';

const BASE = '/api/organizations';

export const organizationService = {
    /** Fetch paginated list of organizations */
    list: (params?: { page?: number; limit?: number; search?: string }) => {
        const qs = new URLSearchParams();
        if (params?.page) qs.set('page', String(params.page));
        if (params?.limit) qs.set('limit', String(params.limit));
        if (params?.search) qs.set('search', params.search);
        return apiClient.get<OrganizationListResponse>(`${BASE}?${qs.toString()}`);
    },

    /** Fetch a single organization by ID */
    getById: (id: string) =>
        apiClient.get<{ success: boolean; data: Organization }>(`${BASE}/${id}`),

    /** Create a new organization */
    create: (data: OrganizationFormData) =>
        apiClient.post<CreateOrganizationResponse>(BASE, data),

    /** Update an existing organization */
    update: (id: string, data: Partial<OrganizationFormData>) =>
        apiClient.put<{ success: boolean; data: Organization; message: string }>(`${BASE}/${id}`, data),

    /** Delete an organization */
    delete: (id: string) =>
        apiClient.delete<{ success: boolean; message: string }>(`${BASE}/${id}`),
};
