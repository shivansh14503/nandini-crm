import type { ApiResponse } from '../types/api.types';
import type { FilterCriteria, TableFilterLists, TableFilterScope } from '../components/common/TableFilter/types';
import { apiClient } from './apiClient';

/** The signed-in user's recent (last 10 applied) and saved filters of a list screen or the audit log (/api/table-filters). */
export const tableFilterService = {
    list: async (module: TableFilterScope): Promise<TableFilterLists> =>
        (await apiClient.get<ApiResponse<TableFilterLists>>('/api/table-filters', { params: { module } })).data,

    recordRecent: async (module: TableFilterScope, criteria: FilterCriteria): Promise<TableFilterLists> =>
        (await apiClient.post<ApiResponse<TableFilterLists>>('/api/table-filters/recent', { module, criteria })).data,

    save: async (module: TableFilterScope, name: string, criteria: FilterCriteria): Promise<TableFilterLists> =>
        (await apiClient.post<ApiResponse<TableFilterLists>>('/api/table-filters/saved', { module, name, criteria })).data,

    remove: async (id: string): Promise<TableFilterLists> =>
        (await apiClient.delete<ApiResponse<TableFilterLists>>(`/api/table-filters/${encodeURIComponent(id)}`)).data,
};
