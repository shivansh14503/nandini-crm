import type { ApiResponse } from '../types/api.types';
import type { CrmModuleKey } from '../types/formConfig.types';
import type { SaveScorecardPayload, ScorecardConfig } from '../types/scorecard.types';
import { apiClient } from './apiClient';

/** Scorecards of the list screens (/api/scorecards): any user reads, admins save / reset. */
export const scorecardService = {
    listAll: async (): Promise<Partial<Record<CrmModuleKey, ScorecardConfig>>> =>
        (await apiClient.get<ApiResponse<Partial<Record<CrmModuleKey, ScorecardConfig>>>>('/api/scorecards')).data,

    save: async (module: CrmModuleKey, payload: SaveScorecardPayload): Promise<ScorecardConfig> =>
        (await apiClient.put<ApiResponse<ScorecardConfig>>(`/api/scorecards/${encodeURIComponent(module)}`, payload)).data,

    reset: async (module: CrmModuleKey): Promise<{ module: string }> =>
        (await apiClient.delete<ApiResponse<{ module: string }>>(`/api/scorecards/${encodeURIComponent(module)}`)).data,
};
