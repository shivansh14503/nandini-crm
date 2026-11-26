import type { ApiResponse, PaginationParams } from '../types/api.types';
import type {
    Activity,
    ActivityBulkDeleteResult,
    ActivityFormData,
    ActivityLinkTarget,
    ActivityLinkTargetParams,
    ActivityMeta,
    AttendeeResponse,
    BusyTimes,
    BusyTimesParams,
    CalendarFeed,
    CalendarFeedParams,
    VideoOptions,
} from '../types/activity.types';
import { apiClient } from './apiClient';
import { createCrudService } from './base.service';
import { notifyCrmUpdate } from './crmSync';

const ENDPOINT = '/api/activities';

const crud = createCrudService<Activity, Partial<ActivityFormData>, Partial<ActivityFormData>>(ENDPOINT);

/** `['a', 'b']` → `'a,b'` (the API reads csv lists); empty → undefined. */
const csv = (values: readonly string[] | undefined) => (values && values.length > 0 ? values.join(',') : undefined);

export const activityService = {
    ...crud,

    /** Business timezone, default durations per Followup Type, reminders and statuses (cache it: staleTime Infinity). */
    meta: async (): Promise<ActivityMeta> => (await apiClient.get<ApiResponse<ActivityMeta>>(`${ENDPOINT}/meta`)).data,

    /** Activities, lead / opportunity follow-ups and contract renewals in `[from, to)`. */
    calendar: async (params: CalendarFeedParams): Promise<CalendarFeed> => {
        const query: PaginationParams = {
            from: params.from,
            to: params.to,
            users: csv(params.users),
            types: csv(params.types),
            sources: csv(params.sources),
            status: csv(params.status),
        };
        return (await apiClient.get<ApiResponse<CalendarFeed>>(`${ENDPOINT}/calendar`, { params: query })).data;
    },

    /**
     * Colleagues' busy times in `[from, to)`: CRM activities plus their company calendar, times only. With `suggest`,
     * the server's first common free slot of that many minutes (the client never computes one itself).
     */
    busy: async (params: BusyTimesParams): Promise<BusyTimes> => {
        const query: PaginationParams = { users: csv(params.users), from: params.from, to: params.to, exclude: params.exclude, suggest: params.suggest };
        return (await apiClient.get<ApiResponse<BusyTimes>>(`${ENDPOINT}/busy`, { params: query })).data;
    },

    /** Records of one module the user can link an activity to ("Related To" picker). */
    linkTargets: async (params: ActivityLinkTargetParams): Promise<ActivityLinkTarget[]> =>
        (await apiClient.get<ApiResponse<ActivityLinkTarget[]>>(`${ENDPOINT}/link-targets`, { params: { ...params } })).data,

    /**
     * Bulk delete that reads the API's answer (the shared `deleteBulk` keeps its `void` shape for every other module):
     * `skipped` lists live activities left alone (lead / opportunity follow-ups), where the API sends it.
     */
    bulkDelete: async (ids: string[]): Promise<ActivityBulkDeleteResult> => {
        const res = await apiClient.post<ApiResponse<ActivityBulkDeleteResult>>(`${ENDPOINT}/bulk-delete`, { ids });
        notifyCrmUpdate(ENDPOINT);
        return res.data ?? { deleted: ids.length, ids, notFound: [] };
    },

    /** Push the owner's calendar copy again now (Retry), or bring back an event deleted in the calendar (Add again). */
    retryCalendarSync: async (id: string): Promise<Activity> => {
        const res = await apiClient.post<ApiResponse<Activity>>(`${ENDPOINT}/${encodeURIComponent(id)}/calendar-sync/retry`, {});
        notifyCrmUpdate(ENDPOINT, id);
        return res.data;
    },

    /** The owner sends the invitations held for them (a private copy, or guests someone else added). Owner only. */
    sendCalendarInvites: async (id: string): Promise<Activity> => {
        const res = await apiClient.post<ApiResponse<Activity>>(`${ENDPOINT}/${encodeURIComponent(id)}/calendar-sync/send-invites`, {});
        notifyCrmUpdate(ENDPOINT, id);
        return res.data;
    },

    /** An invited colleague's reply. Notifies the entity endpoint itself (a sub-path would refresh every query). */
    respond: async (id: string, responseStatus: Exclude<AttendeeResponse, 'needsAction'>): Promise<Activity> => {
        const res = await apiClient.post<ApiResponse<Activity>>(`${ENDPOINT}/${encodeURIComponent(id)}/response`, { responseStatus });
        notifyCrmUpdate(ENDPOINT, id);
        return res.data;
    },

    /** Video meeting choices for an owner: what their company calendar can create (Meet / Teams; Zoom later). */
    videoOptions: async (owner: string): Promise<VideoOptions> =>
        (await apiClient.get<ApiResponse<VideoOptions>>(`${ENDPOINT}/video-options`, { params: { owner } })).data,

    /** Asks the calendar again for a video link that failed (a new request). */
    retryConference: async (id: string): Promise<Activity> => {
        const res = await apiClient.post<ApiResponse<Activity>>(`${ENDPOINT}/${encodeURIComponent(id)}/conference/retry`, {});
        notifyCrmUpdate(ENDPOINT, id);
        return res.data;
    },
};
