/** Mirrors backend-crm/src/modules/integrations/integration.routes.ts (/api/admin/integrations, admin roles only). */
import type { PullRequestResult } from '../components/integrations/calendarConnections.types';
import type { ApiResponse } from '../types/api.types';
import type {
    CalendarSyncSettings,
    IntegrationProviderKey,
    IntegrationsAdmin,
    CalendarCheckOutcome,
    Person,
    PersonCalendarPayload,
    PersonEmailPayload,
    ProviderAdmin,
    SaveProviderPayload,
    SyncType,
    TestConnectionPayload,
    TestConnectionResult,
} from '../types/integration.types';
import { apiClient } from './apiClient';
import { notifyCrmUpdate } from './crmSync';
import { FORM_CONFIG_SYNC_ENTITY } from './formConfig.service';
import { MASTER_DATA_SYNC_ENTITY } from './masterData.service';

/** Also the sync entity: `notifyCrmUpdate(BASE)` maps to the `integrations` query keys (never a sub-path). */
export const INTEGRATIONS_ENDPOINT = '/api/admin/integrations';
const BASE = INTEGRATIONS_ENDPOINT;
const enc = encodeURIComponent;

export const integrationsAdminService = {
    async get(): Promise<IntegrationsAdmin> {
        return (await apiClient.get<ApiResponse<IntegrationsAdmin>>(BASE)).data;
    },
    async saveProvider(provider: IntegrationProviderKey, payload: SaveProviderPayload): Promise<ProviderAdmin> {
        const res = await apiClient.put<ApiResponse<ProviderAdmin>>(`${BASE}/providers/${enc(provider)}`, payload);
        notifyCrmUpdate(BASE);
        return res.data;
    },
    async clearSecret(provider: IntegrationProviderKey): Promise<ProviderAdmin> {
        const res = await apiClient.delete<ApiResponse<ProviderAdmin>>(`${BASE}/providers/${enc(provider)}/secret`);
        notifyCrmUpdate(BASE);
        return res.data;
    },
    /** Checks the saved credentials (the app step), and with `asUsername` that person's calendar too (6 a minute per admin). */
    async testProvider(provider: IntegrationProviderKey, payload: TestConnectionPayload = {}): Promise<TestConnectionResult> {
        const res = await apiClient.post<ApiResponse<TestConnectionResult>>(`${BASE}/providers/${enc(provider)}/test`, payload);
        notifyCrmUpdate(BASE);
        return res.data;
    },
    /** Saved as a form-config module setting: open Form Builders reload so they never write stale settings back. */
    async saveSettings(patch: Partial<CalendarSyncSettings>): Promise<CalendarSyncSettings> {
        const res = await apiClient.put<ApiResponse<CalendarSyncSettings>>(`${BASE}/settings`, patch);
        notifyCrmUpdate(BASE);
        notifyCrmUpdate(FORM_CONFIG_SYNC_ENTITY);
        return res.data;
    },
    /** Option meta `calendarSync` on Followup Types: Form Builders reload so they don't save options without it. */
    async saveSyncTypes(changes: Record<string, boolean>): Promise<SyncType[]> {
        const res = await apiClient.put<ApiResponse<SyncType[]>>(`${BASE}/sync-types`, changes);
        notifyCrmUpdate(BASE);
        notifyCrmUpdate(FORM_CONFIG_SYNC_ENTITY);
        return res.data;
    },
    /** `{ "<Followup Type>": on }` → option meta `videoMeeting` (offers a Video meeting on the activity form). */
    async saveVideoTypes(changes: Record<string, boolean>): Promise<SyncType[]> {
        const res = await apiClient.put<ApiResponse<SyncType[]>>(`${BASE}/video-types`, changes);
        notifyCrmUpdate(BASE);
        notifyCrmUpdate(FORM_CONFIG_SYNC_ENTITY);
        return res.data;
    },
    async people(): Promise<Person[]> {
        return (await apiClient.get<ApiResponse<Person[]>>(`${BASE}/people`)).data;
    },
    /** Users.email also feeds the user directory (master data): every open tab refetches it, not only this one. */
    async setPersonEmail(username: string, payload: PersonEmailPayload): Promise<Person> {
        const res = await apiClient.put<ApiResponse<Person>>(`${BASE}/people/${enc(username)}/email`, payload);
        notifyCrmUpdate(BASE);
        notifyCrmUpdate(MASTER_DATA_SYNC_ENTITY);
        return res.data;
    },
    /** The admin's calendar choice for one person (provider override, exclusion + note); the person is re-enrolled at once. */
    async setPersonCalendar(username: string, payload: PersonCalendarPayload): Promise<Person> {
        const res = await apiClient.put<ApiResponse<Person>>(`${BASE}/people/${enc(username)}/calendar`, payload);
        notifyCrmUpdate(BASE);
        return res.data;
    },
    /** "Check now": one health check of the person's calendar sync (409 CALENDAR_NOT_SYNCED when they have none). */
    async checkPersonCalendar(username: string): Promise<Person & { check: CalendarCheckOutcome }> {
        const res = await apiClient.post<ApiResponse<Person & { check: CalendarCheckOutcome }>>(`${BASE}/people/${enc(username)}/calendar/check`);
        notifyCrmUpdate(BASE);
        return res.data;
    },
    /** "Sync now": pulls the person's calendar changes now (409 CALENDAR_NOT_SYNCED when they have none; 6 a minute per admin). */
    async syncPersonCalendar(username: string): Promise<Person & { sync: PullRequestResult }> {
        const res = await apiClient.post<ApiResponse<Person & { sync: PullRequestResult }>>(`${BASE}/people/${enc(username)}/calendar/sync`);
        notifyCrmUpdate(BASE);
        return res.data;
    },
};
