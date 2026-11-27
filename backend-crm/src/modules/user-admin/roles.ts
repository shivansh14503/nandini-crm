import { accessSummary, PERMISSION_MODULES, type RoleAccessSummary, type RolePermissions } from '../roles/permissions.js';
import { isSuperAdminRole, normalizeRole, SUPER_ADMIN_ROLE } from '../roles/roleDefaults.js';
import { resolveRole } from '../roles/roleRegistry.js';

/**
 * Roles as Admin › Users sees them: the role picker's options and each user's access badge. The roles and what they
 * allow live in Admin › Roles (modules/roles); a user's role must be one of them.
 *
 * Mirrored by frontend-crm/src/utils/roleAccess.ts (the badge labels); src/validators/contractSync.test.ts checks the
 * two agree.
 */

export { isSuperAdminRole, normalizeRole, SUPER_ADMIN_ROLE };

export const ROLE_ACCESS_LEVELS = ['admin', 'all-records', 'own-records', 'custom'] as const;
/** `admin`: admin panel. `all-records`: every CRM record. `own-records`: records the user owns or created. `custom`: a mix. */
export type RoleAccess = RoleAccessSummary;

/** Longest role name (`Users.role` is NVARCHAR(50)). */
export const ROLE_NAME_MAX_LENGTH = 50;

/** Whether the role opens the admin panel (and Admin › Users / Roles). */
export function isAdminAccessRole(role: string | null | undefined): boolean {
    return resolveRole(role).adminPanel;
}

/** Whether the role sees every record of every module. */
export function hasGlobalAccessRole(role: string | null | undefined): boolean {
    const { permissions } = resolveRole(role);
    return PERMISSION_MODULES.every((m) => permissions[m.key].view === 'all');
}

/** The badge Admin › Users shows for the role. */
export function roleAccess(role: string): RoleAccess {
    const resolved = resolveRole(role);
    return accessSummary(resolved.adminPanel, resolved.permissions);
}

export interface RoleOption {
    id: number;
    name: string;
    access: RoleAccess;
    /** Opens the admin panel. */
    adminPanel: boolean;
    /** Sees every record. */
    allRecords: boolean;
    /** Active users with this role. */
    userCount: number;
    /** Inactive users with this role, so the list can still be filtered by a role only deactivated users hold. */
    inactiveUserCount: number;
}

/**
 * The roles the picker offers: every Admin › Roles row, with its user counts (users matched by `normalizeRole`).
 * Super Admin first, then by name. Pure.
 */
export function roleOptionsFrom(
    roles: readonly { id: number; name: string; adminPanel: boolean; permissions: RolePermissions }[],
    counts: readonly { role: string; count: number; inactiveCount?: number }[],
): RoleOption[] {
    const byKey = new Map<string, { active: number; inactive: number }>();
    for (const { role, count, inactiveCount = 0 } of counts) {
        const key = normalizeRole(role);
        const entry = byKey.get(key) ?? { active: 0, inactive: 0 };
        entry.active += count;
        entry.inactive += inactiveCount;
        byKey.set(key, entry);
    }
    return roles
        .map((role) => {
            const adminPanel = role.adminPanel || isSuperAdminRole(role.name);
            const entry = byKey.get(normalizeRole(role.name)) ?? { active: 0, inactive: 0 };
            return {
                id: role.id,
                name: role.name,
                access: accessSummary(adminPanel, role.permissions),
                adminPanel,
                allRecords: PERMISSION_MODULES.every((m) => role.permissions[m.key].view === 'all'),
                userCount: entry.active,
                inactiveUserCount: entry.inactive,
            };
        })
        .sort((a, b) => Number(isSuperAdminRole(b.name)) - Number(isSuperAdminRole(a.name)) || a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
}

/**
 * The Admin › Roles spelling of the role the admin picked ("sales manager" → "Sales Manager"), matched exactly
 * (ignoring case) first, then by `normalizeRole`; null when no role matches (the API answers 400). Pure.
 */
export function canonicalRoleName(input: string, known: readonly string[]): string | null {
    const typed = input.trim().replace(/\s+/g, ' ');
    const key = normalizeRole(typed);
    return known.find((name) => name.toLowerCase() === typed.toLowerCase()) ?? known.find((name) => normalizeRole(name) === key) ?? null;
}
