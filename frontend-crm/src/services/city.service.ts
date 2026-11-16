import type { ApiResponse } from '../types/api.types';
import { apiClient } from './apiClient';

/** One city suggestion (`GET /api/lookups/cities`). */
export interface CitySuggestion {
    cityName: string;
    /** ISO 3166-2 code of the city's state ('' when unknown). */
    subdivisionCode: string;
}

export const cityService = {
    /**
     * City suggestions for a country, optionally narrowed to a state (ISO 3166-2 code). Without a search, only a
     * state's list is returned (a country-wide list is empty).
     */
    search: async (
        params: { country: string; state?: string; search?: string; limit?: number },
        signal?: AbortSignal
    ): Promise<CitySuggestion[]> => {
        const res = await apiClient.get<ApiResponse<CitySuggestion[]>>('/api/lookups/cities', { params, signal });
        return res.data;
    },
};
