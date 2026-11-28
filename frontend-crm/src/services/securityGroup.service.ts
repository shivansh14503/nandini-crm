/** Mirrors backend-crm/src/modules/security-groups/securityGroup.routes.ts (/api/admin/security-groups, admin panel only). */
import type { ApiResponse } from '../types/api.types';
import type { SecurityGroupDto, SecurityGroupPayload, SecurityGroupUserOption } from '../types/securityGroup.types';
import { apiClient } from './apiClient';
import { notifyCrmUpdate } from './crmSync';

export const SECURITY_GROUP_ADMIN_ENDPOINT = '/api/admin/security-groups';
const BASE = SECURITY_GROUP_ADMIN_ENDPOINT;
const enc = (id: number) => encodeURIComponent(String(id));

export const securityGroupService = {
    async list(): Promise<SecurityGroupDto[]> {
        return (await apiClient.get<ApiResponse<SecurityGroupDto[]>>(BASE)).data;
    },
    async users(): Promise<SecurityGroupUserOption[]> {
        return (await apiClient.get<ApiResponse<SecurityGroupUserOption[]>>(`${BASE}/users`)).data;
    },
    async create(payload: SecurityGroupPayload & { memberIds: number[] }): Promise<SecurityGroupDto> {
        const res = await apiClient.post<ApiResponse<SecurityGroupDto>>(BASE, payload);
        notifyCrmUpdate(BASE);
        return res.data;
    },
    /** Rename, describe, move under another parent, archive (`isActive: false`) or restore. */
    async update(id: number, payload: Partial<SecurityGroupPayload> & { isActive?: boolean }): Promise<SecurityGroupDto> {
        const res = await apiClient.patch<ApiResponse<SecurityGroupDto>>(`${BASE}/${enc(id)}`, payload);
        notifyCrmUpdate(BASE);
        return res.data;
    },
    /** Replaces the member list. */
    async setMembers(id: number, memberIds: number[]): Promise<SecurityGroupDto> {
        const res = await apiClient.put<ApiResponse<SecurityGroupDto>>(`${BASE}/${enc(id)}/members`, { memberIds });
        notifyCrmUpdate(BASE);
        return res.data;
    },
    async remove(id: number): Promise<{ id: number }> {
        const res = await apiClient.delete<ApiResponse<{ id: number }>>(`${BASE}/${enc(id)}`);
        notifyCrmUpdate(BASE);
        return res.data;
    },
};
