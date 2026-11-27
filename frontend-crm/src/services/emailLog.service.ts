/**
 * Email logging (Calendar Phase 4): the record lists and own status (`/api/email-logs`, emailLog.routes.ts) and the
 * admin side (`/api/admin/email-logging`, emailLogAdmin.routes.ts).
 */
import type { ApiResponse } from '../types/api.types';
import type { EmailLogModule, EmailLoggingOverview, EmailLoggingSettings, EmailLogRun, OwnEmailLogging, PersonEmailLogging, RecordEmails } from '../types/emailLog.types';
import { apiClient } from './apiClient';
import { notifyCrmUpdate } from './crmSync';
import { FORM_CONFIG_SYNC_ENTITY } from './formConfig.service';

export const EMAIL_LOGS_ENDPOINT = '/api/email-logs';
const ADMIN = '/api/admin/email-logging';
const enc = encodeURIComponent;

export const emailLogService = {
    async forRecord(module: EmailLogModule, recordId: string, page = 1, limit = 20): Promise<RecordEmails> {
        return (await apiClient.get<ApiResponse<RecordEmails>>(EMAIL_LOGS_ENDPOINT, { params: { module, recordId, page, limit } })).data;
    },
    async own(): Promise<OwnEmailLogging> {
        return (await apiClient.get<ApiResponse<OwnEmailLogging>>(`${EMAIL_LOGS_ENDPOINT}/me`)).data;
    },
    async overview(): Promise<EmailLoggingOverview> {
        return (await apiClient.get<ApiResponse<EmailLoggingOverview>>(ADMIN)).data;
    },
    async saveSettings(patch: Partial<EmailLoggingSettings>): Promise<EmailLoggingSettings> {
        const res = await apiClient.put<ApiResponse<EmailLoggingSettings>>(`${ADMIN}/settings`, patch);
        // The switch also lives in the form configs (record drawers show the Emails tab from it).
        notifyCrmUpdate(FORM_CONFIG_SYNC_ENTITY);
        notifyCrmUpdate(EMAIL_LOGS_ENDPOINT);
        return res.data;
    },
    async person(username: string): Promise<PersonEmailLogging> {
        return (await apiClient.get<ApiResponse<PersonEmailLogging>>(`${ADMIN}/people/${enc(username)}`)).data;
    },
    async setPersonMode(username: string, mode: PersonEmailLogging['mode']): Promise<PersonEmailLogging> {
        return (await apiClient.put<ApiResponse<PersonEmailLogging>>(`${ADMIN}/people/${enc(username)}`, { mode })).data;
    },
    async runPerson(username: string): Promise<PersonEmailLogging & { run: EmailLogRun }> {
        return (await apiClient.post<ApiResponse<PersonEmailLogging & { run: EmailLogRun }>>(`${ADMIN}/people/${enc(username)}/run`, {})).data;
    },
    async purgePerson(username: string): Promise<{ copies: number; emails: number }> {
        const res = await apiClient.delete<ApiResponse<{ copies: number; emails: number }>>(`${ADMIN}/people/${enc(username)}/emails`);
        notifyCrmUpdate(EMAIL_LOGS_ENDPOINT);
        return res.data;
    },
};
