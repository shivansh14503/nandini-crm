import type { ApiResponse, PaginationParams } from '../types/api.types';
import type {
    Activity,
    ActivityFormData,
    ActivityLinkTarget,
    ActivityLinkTargetParams,
    ActivityMeta,
    AttendeeResponse,
    CalendarFeed,
    CalendarFeedParams,
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

    /** Records of one module the user can link an activity to ("Related To" picker). */
    linkTargets: async (params: ActivityLinkTargetParams): Promise<ActivityLinkTarget[]> =>
        (await apiClient.get<ApiResponse<ActivityLinkTarget[]>>(`${ENDPOINT}/link-targets`, { params: { ...params } })).data,

    /** An invited colleague's reply. Notifies the entity endpoint itself (a sub-path would refresh every query). */
    respond: async (id: string, responseStatus: Exclude<AttendeeResponse, 'needsAction'>): Promise<Activity> => {
        const res = await apiClient.post<ApiResponse<Activity>>(`${ENDPOINT}/${encodeURIComponent(id)}/response`, { responseStatus });
        notifyCrmUpdate(ENDPOINT, id);
        return res.data;
    },
};
