/** Mirrors backend-crm/src/modules/integrations/integration.routes.ts (/api/admin/integrations, admin roles only). */
import type { ApiResponse } from '../types/api.types';
import type {
    AdminDisconnectPayload,
    CalendarSyncSettings,
    IntegrationProviderKey,
    IntegrationsAdmin,
    Person,
    PersonEmailPayload,
    ProviderAdmin,
    SaveProviderPayload,
    SyncType,
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
    /** Checks the saved credentials with the provider (6 a minute per admin). */
    async testProvider(provider: IntegrationProviderKey): Promise<TestConnectionResult> {
        const res = await apiClient.post<ApiResponse<TestConnectionResult>>(`${BASE}/providers/${enc(provider)}/test`);
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
    /** Ends a person's calendar connection (tokens dropped, Google grant revoked); the person's own page refreshes too. */
    async disconnectConnection(id: string, payload: AdminDisconnectPayload = {}): Promise<void> {
        await apiClient.post(`${BASE}/connections/${enc(id)}/disconnect`, payload);
        notifyCrmUpdate(BASE);
    },
};
