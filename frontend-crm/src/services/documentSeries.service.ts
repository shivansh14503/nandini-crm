import type { ApiResponse } from '../types/api.types';
import type { DocumentSeriesConfig, SaveDocumentSeriesPayload, SeriesModule } from '../types/documentSeries.types';
import { apiClient } from './apiClient';

const BASE = '/api/document-series';

/** Admin-only numbering configuration (NIPL/L/26-27/1004 style document numbers). */
export const documentSeriesService = {
    async get(): Promise<DocumentSeriesConfig> {
        const res = await apiClient.get<ApiResponse<DocumentSeriesConfig>>(BASE);
        return res.data;
    },
    async save(payload: SaveDocumentSeriesPayload): Promise<DocumentSeriesConfig> {
        const res = await apiClient.put<ApiResponse<DocumentSeriesConfig>>(BASE, payload);
        return res.data;
    },
    /** Any signed-in user: modules with an admin-added series, the only ones whose numbers the UI shows. */
    async getShownModules(): Promise<SeriesModule[]> {
        const res = await apiClient.get<ApiResponse<{ modules: SeriesModule[] }>>(`${BASE}/shown-modules`);
        return res.data.modules;
    },
};
