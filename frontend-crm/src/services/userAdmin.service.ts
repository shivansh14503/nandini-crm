/** Mirrors backend-crm/src/modules/user-admin/userAdmin.routes.ts (/api/admin/users, admin roles only). */
import type { ApiResponse } from '../types/api.types';
import type {
    AdminUserDto,
    AdminUserListParams,
    AdminUserListResponse,
    AdminUsersMeta,
    AdminUserStatusResult,
    AdminUserUnlockResult,
    AdminUserUpdateResult,
    CreateAdminUserPayload,
    CreateAdminUserResult,
    SendInviteResult,
    UpdateAdminUserPayload,
} from '../types/userAdmin.types';
import { apiClient } from './apiClient';
import { notifyCrmUpdate } from './crmSync';
import { MASTER_DATA_SYNC_ENTITY } from './masterData.service';

/**
 * Also the sync entity: `notifyCrmUpdate('/api/admin/users')` maps to the `users` query keys (and the audit log) in
 * every open tab.
 */
export const USER_ADMIN_ENDPOINT = '/api/admin/users';
const BASE = USER_ADMIN_ENDPOINT;
const enc = (id: number) => encodeURIComponent(String(id));

/** A user write changes the users list and the user directory behind every owner / assignee picker. */
const broadcast = () => {
    notifyCrmUpdate(BASE);
    notifyCrmUpdate(MASTER_DATA_SYNC_ENTITY);
};

export const userAdminService = {
    async list(params: AdminUserListParams): Promise<AdminUserListResponse> {
        return apiClient.get<AdminUserListResponse>(BASE, { params: { ...params } });
    },
    async meta(): Promise<AdminUsersMeta> {
        return (await apiClient.get<ApiResponse<AdminUsersMeta>>(`${BASE}/meta`)).data;
    },
    async get(id: number): Promise<AdminUserDto> {
        return (await apiClient.get<ApiResponse<AdminUserDto>>(`${BASE}/${enc(id)}`)).data;
    },
    async create(payload: CreateAdminUserPayload): Promise<CreateAdminUserResult> {
        const res = await apiClient.post<ApiResponse<CreateAdminUserResult>>(BASE, payload);
        broadcast();
        return res.data;
    },
    /** A role change also signs the user out everywhere, so the new role applies at once. */
    async update(id: number, payload: UpdateAdminUserPayload): Promise<AdminUserUpdateResult> {
        const res = await apiClient.patch<ApiResponse<AdminUserUpdateResult>>(`${BASE}/${enc(id)}`, payload);
        broadcast();
        return res.data;
    },
    /** Signs the user out everywhere; they can't sign in until activated again. */
    async deactivate(id: number): Promise<AdminUserStatusResult> {
        const res = await apiClient.post<ApiResponse<AdminUserStatusResult>>(`${BASE}/${enc(id)}/deactivate`);
        broadcast();
        return res.data;
    },
    async activate(id: number): Promise<AdminUserStatusResult> {
        const res = await apiClient.post<ApiResponse<AdminUserStatusResult>>(`${BASE}/${enc(id)}/activate`);
        broadcast();
        return res.data;
    },
    /** Ends a lock after too many wrong passwords and resets the count, so the user can sign in at once. */
    async unlock(id: number): Promise<AdminUserUnlockResult> {
        const res = await apiClient.post<ApiResponse<AdminUserUnlockResult>>(`${BASE}/${enc(id)}/unlock`);
        broadcast();
        return res.data;
    },
    /**
     * Emails a new one-time set-password link (72 h) and stops the older ones: the invite again for an Invited user,
     * a password reset link otherwise. Rejects with the reason when the email can't be sent (INVITE_EMAIL_FAILED,
     * MAIL_DISABLED).
     */
    async sendInvite(id: number): Promise<SendInviteResult> {
        const res = await apiClient.post<ApiResponse<SendInviteResult>>(`${BASE}/${enc(id)}/send-invite`);
        broadcast();
        return res.data;
    },
};
