import type { ApiResponse } from '../types/api.types';
import type { CrmModuleKey } from '../types/formConfig.types';
import type { FilterCriteria, TableFilterLists } from '../components/common/TableFilter/types';
import { apiClient } from './apiClient';

/** The signed-in user's recent (last 10 applied) and saved filters of a list screen (/api/table-filters). */
export const tableFilterService = {
    list: async (module: CrmModuleKey): Promise<TableFilterLists> =>
        (await apiClient.get<ApiResponse<TableFilterLists>>('/api/table-filters', { params: { module } })).data,

    recordRecent: async (module: CrmModuleKey, criteria: FilterCriteria): Promise<TableFilterLists> =>
        (await apiClient.post<ApiResponse<TableFilterLists>>('/api/table-filters/recent', { module, criteria })).data,

    save: async (module: CrmModuleKey, name: string, criteria: FilterCriteria): Promise<TableFilterLists> =>
        (await apiClient.post<ApiResponse<TableFilterLists>>('/api/table-filters/saved', { module, name, criteria })).data,

    remove: async (id: string): Promise<TableFilterLists> =>
        (await apiClient.delete<ApiResponse<TableFilterLists>>(`/api/table-filters/${encodeURIComponent(id)}`)).data,
};
