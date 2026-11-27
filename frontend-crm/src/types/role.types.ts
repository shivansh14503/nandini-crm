/**
 * Admin › Roles (`/api/admin/roles`, roles with the admin panel only). Mirrors backend-crm/src/modules/roles (route
 * header comment = source of truth).
 */
import type { RoleAccess } from '../utils/roleAccess';
import type { RolePermissions } from '../utils/permissions';

export const ROLE_DESCRIPTION_MAX_LENGTH = 500;

export interface RoleDto {
    id: number;
    name: string;
    description: string | null;
    adminPanel: boolean;
    /** Super Admin: full access, can't be edited, renamed or deleted. */
    isSystem: boolean;
    permissions: RolePermissions;
    access: RoleAccess;
    /** Active users with the role. */
    userCount: number;
    inactiveUserCount: number;
    createdAt: string;
    createdBy: string | null;
    updatedAt: string;
    updatedBy: string | null;
}

export interface RolePayload {
    name: string;
    description: string | null;
    adminPanel: boolean;
    permissions: RolePermissions;
}

export interface DeleteRoleResult {
    id: number;
    movedUsers: number;
}
