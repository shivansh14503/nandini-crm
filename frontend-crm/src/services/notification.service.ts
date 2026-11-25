import type { ApiResponse } from '../types/api.types';
import type {
    MorningSummaryPreview,
    MorningSummaryTestResult,
    NotificationListParams,
    NotificationPage,
    NotificationReadResult,
} from '../types/notification.types';
import { apiClient } from './apiClient';
import { notifyCrmUpdate } from './crmSync';

/** Also the `notifyCrmUpdate` entity of notification writes (QueryProvider maps it to the `notifications` keys). */
export const NOTIFICATIONS_ENDPOINT = '/api/notifications';

/**
 * The signed-in user's own notifications (navbar bell) and the morning summary email preview / test send
 * (docs/api-plan.md › Notifications). Reads are personal and never audited. Writes broadcast
 * `notifyCrmUpdate(NOTIFICATIONS_ENDPOINT)`, so the bell refreshes in this tab and in every other open tab.
 */
export const notificationService = {
    /** One page, newest first, with the unread count beside it. */
    list: async (params: NotificationListParams = {}): Promise<NotificationPage> => {
        const res = await apiClient.get<ApiResponse<NotificationPage['data']> & Omit<NotificationPage, 'data'>>(NOTIFICATIONS_ENDPOINT, {
            params: { unreadOnly: params.unreadOnly, limit: params.limit, before: params.before },
        });
        return { data: res.data ?? [], nextCursor: res.nextCursor ?? null, unreadCount: res.unreadCount ?? 0 };
    },

    /** The bell's badge (served from Redis on the server, so polling it doesn't wake the database). */
    unreadCount: async (): Promise<number> =>
        (await apiClient.get<ApiResponse<{ count: number }>>(`${NOTIFICATIONS_ENDPOINT}/unread-count`)).data?.count ?? 0,

    /** Safe to call twice. 404 when the notification isn't the caller's. */
    markRead: async (id: string): Promise<NotificationReadResult> => {
        const res = await apiClient.post<ApiResponse<NotificationReadResult>>(`${NOTIFICATIONS_ENDPOINT}/${encodeURIComponent(id)}/read`);
        notifyCrmUpdate(NOTIFICATIONS_ENDPOINT, id);
        return res.data;
    },

    markAllRead: async (): Promise<number> => {
        const res = await apiClient.post<ApiResponse<{ updated: number }>>(`${NOTIFICATIONS_ENDPOINT}/read-all`);
        notifyCrmUpdate(NOTIFICATIONS_ENDPOINT);
        return res.data?.updated ?? 0;
    },

    /** The caller's morning summary email for today; sends nothing and works while email is turned off. */
    morningSummaryPreview: async (): Promise<MorningSummaryPreview> =>
        (await apiClient.get<ApiResponse<MorningSummaryPreview>>(`${NOTIFICATIONS_ENDPOINT}/morning-summary/preview`)).data,

    /**
     * Admin roles: sends the caller's summary to their own address now. A send that fails still resolves (status
     * `failed`, message saying why); mail turned off or no address on the account reject with the API's 400 message.
     */
    sendMorningSummaryTest: async (): Promise<MorningSummaryTestResult> => {
        const res = await apiClient.post<ApiResponse<MorningSummaryTestResult>>(`${NOTIFICATIONS_ENDPOINT}/morning-summary/test`);
        return { ...res.data, message: res.data?.message || res.message || '' };
    },
};
