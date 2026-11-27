/** Mirrors backend-crm/src/modules/roles/role.routes.ts (/api/admin/roles, roles with the admin panel only). */
import type { ApiResponse } from '../types/api.types';
import type { DeleteRoleResult, RoleDto, RolePayload } from '../types/role.types';
import { apiClient } from './apiClient';
import { notifyCrmUpdate } from './crmSync';
import { USER_ADMIN_ENDPOINT } from './userAdmin.service';

export const ROLE_ADMIN_ENDPOINT = '/api/admin/roles';
const BASE = ROLE_ADMIN_ENDPOINT;
const enc = (id: number) => encodeURIComponent(String(id));

/** A role write changes Admin › Users too (role names, badges, the role picker). */
const broadcast = () => {
    notifyCrmUpdate(BASE);
    notifyCrmUpdate(USER_ADMIN_ENDPOINT);
};

export const roleService = {
    async list(): Promise<RoleDto[]> {
        return (await apiClient.get<ApiResponse<RoleDto[]>>(BASE)).data;
    },
    async create(payload: RolePayload): Promise<RoleDto> {
        const res = await apiClient.post<ApiResponse<RoleDto>>(BASE, payload);
        broadcast();
        return res.data;
    },
    /** A rename renames the role on its users. */
    async update(id: number, payload: Partial<RolePayload>): Promise<RoleDto> {
        const res = await apiClient.patch<ApiResponse<RoleDto>>(`${BASE}/${enc(id)}`, payload);
        broadcast();
        return res.data;
    },
    /** Moves the role's users to `reassignTo` (required when it has any), then deletes it. */
    async remove(id: number, reassignTo?: number): Promise<DeleteRoleResult> {
        const query = reassignTo ? `?reassignTo=${enc(reassignTo)}` : '';
        const res = await apiClient.delete<ApiResponse<DeleteRoleResult>>(`${BASE}/${enc(id)}${query}`);
        broadcast();
        return res.data;
    },
};
