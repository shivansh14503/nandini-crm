import type { ApiResponse } from '../types/api.types';
import { apiClient } from './apiClient';

/** Which kind of record a GSTIN / PAN must be unique within (mirrors the backend's `TaxIdOwner`). */
export type TaxIdOwner = 'organization' | 'partnerCompany' | 'lead';
export type TaxIdField = 'gstNumber' | 'panNumber';

/** Another live record of the same kind already holding a GSTIN / PAN. */
export interface TaxIdHolder {
    field: TaxIdField;
    value: string;
    holder: string;
    message: string;
}

export const taxIdService = {
    /** Live, read-only duplicate check (`GET /api/lookups/tax-id-holders`); the save re-checks authoritatively. */
    findHolders: async (
        params: { owner: TaxIdOwner; gstNumber?: string; panNumber?: string; excludeId?: string },
        signal?: AbortSignal
    ): Promise<TaxIdHolder[]> => {
        const res = await apiClient.get<ApiResponse<TaxIdHolder[]>>('/api/lookups/tax-id-holders', { params, signal });
        return res.data;
    },
};
