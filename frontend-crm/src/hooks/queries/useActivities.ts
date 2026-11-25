import { useQuery } from '@tanstack/react-query';
import { activityService } from '@/services/activity.service';
import type { PaginationParams } from '@/types/api.types';
import type { ActivityMeta, ActivityRelatedModule, CalendarFeed, CalendarFeedParams } from '@/types/activity.types';
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

/** Business timezone, default durations, reminders and statuses: fixed for the session, so never refetched. */
export function useActivityMeta() {
    return useQuery<ActivityMeta>({
        queryKey: queryKeys.activities.meta(),
        queryFn: () => activityService.meta(),
        staleTime: Infinity,
    });
}

/** The calendar feed of a window `[from, to)`. */
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
