import type { ApiResponse } from '../types/api.types';
import type {
    CalendarHoliday,
    Holiday,
    HolidayBulkAction,
    HolidayFormData,
    HolidayImportResult,
    HolidayImportRow,
    HolidayListParams,
    HolidayListResult,
} from '../types/holiday.types';
import { apiClient } from './apiClient';

const BASE = '/api/holidays';

/** Admin › Holidays (admin only), plus the calendar's read of active holidays (any signed-in user). */
export const holidayService = {
    async list(params: HolidayListParams): Promise<HolidayListResult> {
        const query = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== '') query.set(key, String(value));
        });
        const res = await apiClient.get<HolidayListResult & { success: boolean }>(`${BASE}?${query.toString()}`);
        return { data: res.data, total: res.total, page: res.page, limit: res.limit, years: res.years };
    },
    async create(data: HolidayFormData): Promise<Holiday> {
        const res = await apiClient.post<ApiResponse<Holiday>>(BASE, data);
        return res.data;
    },
    async update(id: string, data: Partial<HolidayFormData>): Promise<Holiday> {
        const res = await apiClient.put<ApiResponse<Holiday>>(`${BASE}/${encodeURIComponent(id)}`, data);
        return res.data;
    },
    async remove(id: string): Promise<void> {
        await apiClient.delete<ApiResponse<null>>(`${BASE}/${encodeURIComponent(id)}`);
    },
    async bulk(action: HolidayBulkAction, ids: string[]): Promise<{ affected: number }> {
        const res = await apiClient.post<ApiResponse<{ affected: number }>>(`${BASE}/bulk`, { action, ids });
        return res.data;
    },
    /** `dryRun` checks the rows without saving (the import preview). */
    async import(rows: HolidayImportRow[], options: { dryRun: boolean; fileName?: string }): Promise<HolidayImportResult> {
        const res = await apiClient.post<ApiResponse<HolidayImportResult>>(`${BASE}/import`, { rows, ...options });
        return res.data;
    },
    /** Active holidays on the days `[from, to]`, inclusive (`YYYY-MM-DD`). */
    async calendar(from: string, to: string): Promise<CalendarHoliday[]> {
        const res = await apiClient.get<ApiResponse<CalendarHoliday[]>>(`${BASE}/calendar?from=${from}&to=${to}`);
        return res.data;
    },
};
