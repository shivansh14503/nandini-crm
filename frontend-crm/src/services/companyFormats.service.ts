import type { ApiResponse } from '../types/api.types';
import type { CompanyFormatsDto, SaveCompanyFormatsPayload } from '../types/companyFormats.types';
import { setCompanyFormats } from '../utils/formats';
import { apiClient } from './apiClient';

const BASE = '/api/company-formats';

/** Sync event name: other tabs refetch the company formats when an admin saves or resets them. */
export const COMPANY_FORMATS_SYNC_ENTITY = 'company-formats';

/** Company display formats (/api/company-formats: any signed-in user reads, admins save / reset). */
export const companyFormatsService = {
    async get(): Promise<CompanyFormatsDto> {
        const res = await apiClient.get<ApiResponse<CompanyFormatsDto>>(BASE);
        return res.data;
    },
    async save(payload: SaveCompanyFormatsPayload): Promise<CompanyFormatsDto> {
        const res = await apiClient.put<ApiResponse<CompanyFormatsDto>>(BASE, payload);
        return res.data;
    },
    /** Deletes the saved formats: screens go back to their pre-company-formats styles. */
    async reset(): Promise<CompanyFormatsDto> {
        const res = await apiClient.delete<ApiResponse<CompanyFormatsDto>>(BASE);
        return res.data;
    },
};

/** Reads the company formats and puts them in the display store (utils/formats). */
export async function loadCompanyFormats(): Promise<CompanyFormatsDto> {
    const dto = await companyFormatsService.get();
    setCompanyFormats(dto);
    return dto;
}
