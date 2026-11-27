import type { ApiResponse } from '../types/api.types';
import type { CompanySettingsDto, SaveCompanySettingsPayload } from '../types/companySettings.types';
import { apiClient } from './apiClient';

const BASE = '/api/company-settings';

/** Sync event name: other tabs refetch the company details when an admin saves them. */
export const COMPANY_SETTINGS_SYNC_ENTITY = 'company-settings';

/** Company details (/api/company-settings: any signed-in user reads, admins save). */
export const companySettingsService = {
    async get(): Promise<CompanySettingsDto> {
        const res = await apiClient.get<ApiResponse<CompanySettingsDto>>(BASE);
        return res.data;
    },
    async save(payload: SaveCompanySettingsPayload): Promise<CompanySettingsDto> {
        const res = await apiClient.put<ApiResponse<CompanySettingsDto>>(BASE, payload);
        return res.data;
    },
};
