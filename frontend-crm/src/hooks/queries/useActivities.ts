import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { activityService } from '@/services/activity.service';
import type { PaginationParams } from '@/types/api.types';
import type { ActivityMeta, ActivityRelatedModule, BusyTimes, BusyTimesParams, CalendarFeed, CalendarFeedParams, SeriesScope, VideoOptions } from '@/types/activity.types';
import { createEntityHooks } from './createEntityHooks';
import { queryKeys } from './queryKeys';

const activityHooks = createEntityHooks(queryKeys.activities, activityService);

export const useActivities = activityHooks.useList;
export const usePaginatedActivities = activityHooks.usePaginatedList;
export const useActivity = activityHooks.useDetail;
export const useCreateActivity = activityHooks.useCreate;
export const useUpdateActivity = activityHooks.useUpdate;
export const useDeleteActivity = activityHooks.useDelete;
export const useBulkDeleteActivities = activityHooks.useBulkDelete;

/** Bulk delete that returns the API's answer (`skipped` follow-up activities), for the list's toast. */
export function useBulkDeleteActivitiesWithResult() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (ids: string[]) => activityService.bulkDelete(ids),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.activities.all }),
    });
}

/** Delete of an occurrence of a recurring activity with its scope (this / following / all; Calendar Phase 4). */
export function useDeleteActivityScoped() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, scope }: { id: string; scope: SeriesScope }) => activityService.deleteScoped(id, scope),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.activities.all }),
    });
}

/** Business timezone, default durations, reminders and statuses: fixed for the session, so never refetched. */
export function useActivityMeta() {
    return useQuery<ActivityMeta>({
        queryKey: queryKeys.activities.meta(),
        queryFn: () => activityService.meta(),
        staleTime: Infinity,
    });
}

/** The calendar feed of a window `[from, to)`. The previous window's entries stay while the next one loads. */
export function useCalendarFeed(params: CalendarFeedParams | undefined, options: { enabled?: boolean } = {}) {
    const key: PaginationParams = params
        ? {
              from: params.from,
              to: params.to,
              users: params.users?.join(','),
              types: params.types?.join(','),
              sources: params.sources?.join(','),
              status: params.status?.join(','),
          }
        : {};
    return useQuery<CalendarFeed>({
        queryKey: queryKeys.activities.calendar(key),
        queryFn: () => activityService.calendar(params!),
        enabled: Boolean(params) && (options.enabled ?? true),
        placeholderData: keepPreviousData,
    });
}

/**
 * Colleagues' busy times of a window (the activity form's availability strip). Fresh for 60 s (the server caches the
 * calendar part as long); the previous answer stays on screen while the next day / people load.
 */
export function useBusyTimes(params: Omit<BusyTimesParams, 'suggest'> | undefined, options: { enabled?: boolean } = {}) {
    const key: PaginationParams = params ? { users: params.users.join(','), from: params.from, to: params.to, exclude: params.exclude } : {};
    return useQuery<BusyTimes>({
        queryKey: queryKeys.activities.busy(key),
        queryFn: () => activityService.busy(params!),
        enabled: Boolean(params && params.users.length > 0) && (options.enabled ?? true),
        staleTime: 60_000,
        placeholderData: keepPreviousData,
    });
}

/** Video meeting choices of an owner (the activity form's Video meeting field). Fresh for 5 minutes. */
export function useVideoOptions(owner: string, options: { enabled?: boolean } = {}) {
    return useQuery<VideoOptions>({
        queryKey: queryKeys.activities.videoOptions(owner),
        queryFn: () => activityService.videoOptions(owner),
        enabled: Boolean(owner) && (options.enabled ?? true),
        staleTime: 5 * 60_000,
    });
}

/**
 * Activities of a record (its Activities tab). Organizations and contacts roll up: an organization's tab lists the
 * activities that carry it or are related to it, a contact's those that carry it, are related to it or it attends.
 */
export function useRecordActivities(module: ActivityRelatedModule, id: string | undefined, options: { enabled?: boolean } = {}) {
    const params: PaginationParams =
        module === 'organizations'
            ? { organizationId: id, rollup: true }
            : module === 'contacts'
              ? { contactId: id, rollup: true }
              : { relatedModule: module, relatedId: id };
    return activityHooks.useList(params, { enabled: Boolean(id) && (options.enabled ?? true) });
}
