import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData, type QueryClient } from '@tanstack/react-query';
import { notificationService } from '@/services/notification.service';
import type { MorningSummaryPreview, NotificationPage } from '@/types/notification.types';
import { queryKeys } from './queryKeys';

/**
 * The navbar bell (docs/system-design.md › Frontend › Notifications). The badge polls the unread count every minute
 * while the tab is visible and on focus; the server answers it from Redis, so open tabs don't keep the database awake.
 * There is no push: a reminder shows within about a minute of its time. Writes (read / read all) broadcast
 * `notifyCrmUpdate('/api/notifications')`, which refreshes the bell in every open tab (QueryProvider).
 */

/** How often the badge asks for the unread count while the tab is visible. */
export const NOTIFICATION_POLL_MS = 60_000;
/** Rows per page of the bell list. */
export const NOTIFICATION_PAGE_SIZE = 20;
/** Its own namespace, so a bell refresh doesn't reload a preview that is open. */
export const MORNING_SUMMARY_PREVIEW_QUERY_KEY = ['morning-summary', 'preview'] as const;

/** The badge count. Background tabs don't poll; coming back to the tab refetches. */
export function useUnreadNotificationCount(options: { enabled?: boolean } = {}) {
    return useQuery<number>({
        queryKey: queryKeys.notifications.unreadCount(),
        queryFn: () => notificationService.unreadCount(),
        enabled: options.enabled ?? true,
        refetchInterval: NOTIFICATION_POLL_MS,
        refetchIntervalInBackground: false,
        refetchOnWindowFocus: true,
        staleTime: 30_000,
    });
}

/** The bell list, newest first, a page at a time (`fetchNextPage` loads older ones). Loaded when the bell opens. */
export function useNotifications(options: { enabled?: boolean; unreadOnly?: boolean } = {}) {
    const queryClient = useQueryClient();
    const unreadOnly = options.unreadOnly ?? false;
    return useInfiniteQuery({
        queryKey: queryKeys.notifications.list({ unreadOnly }),
        queryFn: async ({ pageParam }) => {
            const page = await notificationService.list({ unreadOnly, limit: NOTIFICATION_PAGE_SIZE, before: pageParam });
            // Each page carries the unread count: keep the badge in step without another request.
            queryClient.setQueryData(queryKeys.notifications.unreadCount(), page.unreadCount);
            return page;
        },
        initialPageParam: undefined as string | undefined,
        getNextPageParam: (last) => last.nextCursor ?? undefined,
        enabled: options.enabled ?? true,
        // Every opening shows what is there now.
        staleTime: 0,
    });
}

type ListCache = InfiniteData<NotificationPage, string | undefined>;
const listFilter = { queryKey: [...queryKeys.notifications.all, 'list'] };

/** Marks rows read in every cached list page; returns how many of them were unread. */
function markCachedRead(queryClient: QueryClient, isTarget: (id: string) => boolean, readAt: string): number {
    let changed = 0;
    for (const [key, data] of queryClient.getQueriesData<ListCache>(listFilter)) {
        if (!data) continue;
        let touched = false;
        const pages = data.pages.map((page) => ({
            ...page,
            data: page.data.map((row) => {
                if (row.readAt || !isTarget(row.id)) return row;
                touched = true;
                changed++;
                return { ...row, readAt };
            }),
        }));
        if (touched) queryClient.setQueryData<ListCache>(key, { ...data, pages });
    }
    return changed;
}

/** Marks one notification read, at once on screen; the server's answer then refreshes the bell everywhere. */
export function useMarkNotificationRead() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => notificationService.markRead(id),
        onMutate: async (id) => {
            await queryClient.cancelQueries({ queryKey: queryKeys.notifications.all });
            // Rows in several cached lists are the same notification: count it once.
            const wasUnread = markCachedRead(queryClient, (rowId) => rowId === id, new Date().toISOString()) > 0;
            if (wasUnread) queryClient.setQueryData<number>(queryKeys.notifications.unreadCount(), (count) => Math.max(0, (count ?? 1) - 1));
        },
        onError: () => queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all }),
    });
}

export function useMarkAllNotificationsRead() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: () => notificationService.markAllRead(),
        onMutate: async () => {
            await queryClient.cancelQueries({ queryKey: queryKeys.notifications.all });
            markCachedRead(queryClient, () => true, new Date().toISOString());
            queryClient.setQueryData<number>(queryKeys.notifications.unreadCount(), 0);
        },
        onError: () => queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all }),
    });
}

/** The caller's morning summary email for today, fetched fresh for every opening of the preview. */
export function useMorningSummaryPreview(options: { enabled?: boolean } = {}) {
    return useQuery<MorningSummaryPreview>({
        queryKey: MORNING_SUMMARY_PREVIEW_QUERY_KEY,
        queryFn: () => notificationService.morningSummaryPreview(),
        enabled: options.enabled ?? true,
        staleTime: 0,
        gcTime: 0,
    });
}

/** Admin roles: send the caller's summary to their own address now. */
export function useSendMorningSummaryTest() {
    return useMutation({ mutationFn: () => notificationService.sendMorningSummaryTest() });
}
