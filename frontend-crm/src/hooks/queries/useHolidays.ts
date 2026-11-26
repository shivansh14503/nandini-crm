import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { holidayService } from '@/services/holiday.service';
import type { HolidayBulkAction, HolidayFormData, HolidayImportRow, HolidayListParams } from '@/types/holiday.types';

export const HOLIDAYS_QUERY_KEY = ['holidays'] as const;
const listKey = (params: HolidayListParams) => [...HOLIDAYS_QUERY_KEY, 'list', params] as const;
const calendarKey = (from: string, to: string) => [...HOLIDAYS_QUERY_KEY, 'calendar', from, to] as const;

/** Admin list (Admin › Holidays). The previous page stays on screen while the next loads. */
export function useHolidayList(params: HolidayListParams) {
    return useQuery({ queryKey: listKey(params), queryFn: () => holidayService.list(params), placeholderData: keepPreviousData, staleTime: 15 * 1000 });
}

/**
 * Active holidays on the days `[from, to]` (inclusive), for the calendar and the activity forms. Holidays rarely
 * change, so they're kept for 10 minutes; an admin's change refreshes them at once (every holiday query is reset).
 */
export function useCalendarHolidays(from: string | undefined, to: string | undefined) {
    return useQuery({
        queryKey: calendarKey(from ?? '', to ?? ''),
        queryFn: () => holidayService.calendar(from!, to!),
        enabled: Boolean(from && to && from <= to),
        placeholderData: keepPreviousData,
        staleTime: 10 * 60 * 1000,
    });
}

function useHolidayMutation<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
    const queryClient = useQueryClient();
    return useMutation({ mutationFn: fn, onSuccess: () => queryClient.invalidateQueries({ queryKey: HOLIDAYS_QUERY_KEY }) });
}

export const useCreateHoliday = () => useHolidayMutation((data: HolidayFormData) => holidayService.create(data));
export const useUpdateHoliday = () => useHolidayMutation(({ id, data }: { id: string; data: Partial<HolidayFormData> }) => holidayService.update(id, data));
export const useDeleteHoliday = () => useHolidayMutation((id: string) => holidayService.remove(id));
export const useBulkHolidays = () => useHolidayMutation(({ action, ids }: { action: HolidayBulkAction; ids: string[] }) => holidayService.bulk(action, ids));
export const useImportHolidays = () =>
    useHolidayMutation(({ rows, fileName }: { rows: HolidayImportRow[]; fileName?: string }) => holidayService.import(rows, { dryRun: false, fileName }));
