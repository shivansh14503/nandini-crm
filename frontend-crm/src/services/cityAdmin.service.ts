import type { ApiResponse } from '../types/api.types';
import { apiClient } from './apiClient';

/** A city of the list address forms pick from, as the admin manager shows it (`/api/cities`). */
export interface AdminCity {
    id: number;
    cityName: string;
    countryIso2: string;
    subdivisionCode: string | null;
    population: number | null;
    /** From the city master file (false = added by an admin). */
    isSeeded: boolean;
    /** Live organizations, leads, quotations and partner companies whose address uses this city. */
    usageCount: number;
}

export type CityOwner = 'organization' | 'lead' | 'quotation' | 'partnerCompany';

export interface CityUsageGroup {
    owner: CityOwner;
    /** 'organization' / 'organizations', … */
    label: string;
    count: number;
    /** The first few records. */
    records: { id: string; code: string; name: string }[];
}

export interface CityUsage {
    total: number;
    groups: CityUsageGroup[];
}

export interface CityPage {
    data: AdminCity[];
    total: number;
    page: number;
    limit: number;
}

/** Records rewritten by a rename / move / clear, per owner. */
export type UpdatedRecords = Partial<Record<CityOwner, number>>;

export type CityDeleteAction = { action?: undefined } | { action: 'clear' } | { action: 'move'; targetCityId: number };

/** Admin management of the city list (admins only). Changes apply immediately. */
export const cityAdminService = {
    list: async (params: { country: string; state?: string; search?: string; page?: number; limit?: number }, signal?: AbortSignal): Promise<CityPage> =>
        (await apiClient.get<ApiResponse<CityPage>>('/api/cities', { params, signal })).data,

    usage: async (id: number): Promise<CityUsage> => (await apiClient.get<ApiResponse<CityUsage>>(`/api/cities/${id}/usage`)).data,

    create: async (body: { countryIso2: string; subdivisionCode: string | null; cityName: string }): Promise<AdminCity> =>
        (await apiClient.post<ApiResponse<AdminCity>>('/api/cities', body)).data,

    rename: async (id: number, cityName: string): Promise<{ city: AdminCity; updatedRecords: UpdatedRecords }> =>
        (await apiClient.patch<ApiResponse<{ city: AdminCity; updatedRecords: UpdatedRecords }>>(`/api/cities/${id}`, { cityName })).data,

    remove: async (id: number, body: CityDeleteAction = {}): Promise<{ action: 'move' | 'clear' | null; updatedRecords: UpdatedRecords }> =>
        (
            await apiClient.delete<ApiResponse<{ action: 'move' | 'clear' | null; updatedRecords: UpdatedRecords }>>(`/api/cities/${id}`, {
                body: JSON.stringify(body),
            })
        ).data,
};

const OWNER_LABELS: Record<CityOwner, [singular: string, plural: string]> = {
    organization: ['organization', 'organizations'],
    lead: ['lead', 'leads'],
    quotation: ['quotation', 'quotations'],
    partnerCompany: ['partner company', 'partner companies'],
};

/** "3 leads and 1 quotation" (empty when nothing changed). */
export function describeUpdatedRecords(updated: UpdatedRecords): string {
    const parts = (Object.entries(updated) as [CityOwner, number][])
        .filter(([, n]) => n > 0)
        .map(([owner, n]) => `${n} ${OWNER_LABELS[owner][n === 1 ? 0 : 1]}`);
    if (parts.length <= 1) return parts[0] ?? '';
    return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}
