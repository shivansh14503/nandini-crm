import { FULL_PERMISSIONS, OWN_RECORDS_PERMISSIONS, type RolePermissions } from './permissions.js';

/**
 * What a role gave before Admin › Roles existed, when access was decided by the role's name. Used once, to seed the
 * Roles table so everyone keeps their access, and as the fallback for a role name the table doesn't hold (tests,
 * a role typed straight into the database). Pure.
 */

/** The developer role: full access everywhere, locked in Admin › Roles; the only role that manages Super Admin users. */
export const SUPER_ADMIN_ROLE = 'Super Admin';

/** Roles that opened the admin panel (matched case-insensitively). */
export const LEGACY_ADMIN_ROLES = ['Admin', 'Administrator', 'Super Admin'] as const;

/** Roles that saw and changed every record (matched by `normalizeRole`). */
export const GLOBAL_ACCESS_ROLES = [
    'Super Admin',
    'Admin',
    'Director – Operations',
    'Regional Sales Head',
    'Sales Manager',
    'System Administrator',
    'Accounts Manager',
] as const;

/** The key role names are compared by: any case, any dash style, runs of spaces as one (mirrored in frontend utils/permissions.ts). */
export const normalizeRole = (role: string): string =>
    role
        .normalize('NFKC')
        .replace(/[‐-―−]/g, '-')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();

const LEGACY_ADMIN_KEYS: ReadonlySet<string> = new Set(LEGACY_ADMIN_ROLES.map(normalizeRole));
const GLOBAL_ROLE_KEYS: ReadonlySet<string> = new Set(GLOBAL_ACCESS_ROLES.map(normalizeRole));

/** Whether the role is Super Admin (any case, any spacing). */
export function isSuperAdminRole(role: string | null | undefined): boolean {
    return normalizeRole(role ?? '') === normalizeRole(SUPER_ADMIN_ROLE);
}

/** A role as the access checks use it. */
export interface ResolvedRole {
    /** The role's name as stored in Admin › Roles (or the user's role text when no role matches). */
    name: string;
    /** Opens the admin panel (forms, users, roles, PDF templates, …). */
    adminPanel: boolean;
    /** Super Admin: full access, can't be edited. */
    superAdmin: boolean;
    permissions: RolePermissions;
}

/** The access a role name gave before Admin › Roles. */
export function legacyRole(name: string): ResolvedRole {
    const key = normalizeRole(name);
    const superAdmin = isSuperAdminRole(name);
    return {
        name: name.trim(),
        adminPanel: superAdmin || LEGACY_ADMIN_KEYS.has(key),
        superAdmin,
        permissions: superAdmin || GLOBAL_ROLE_KEYS.has(key) ? FULL_PERMISSIONS : OWN_RECORDS_PERMISSIONS,
    };
}
