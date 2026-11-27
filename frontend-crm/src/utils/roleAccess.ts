/**
 * Role names and the one-word access summary Admin › Users shows (badges, the role picker's hint). What a role allows
 * lives in Admin › Roles (utils/permissions.ts); the API sends each role's summary with it. Pure and dependency-free.
 *
 * Mirrors backend-crm/src/modules/user-admin/roles.ts; backend-crm/src/validators/contractSync.test.ts checks the two
 * agree, so change both together.
 */

export const ROLE_ACCESS_LEVELS = ['admin', 'all-records', 'own-records', 'custom'] as const;
/**
 * `admin`: opens the admin panel. `all-records`: views every record of every module. `own-records`: views its own
 * records (as every role did before Admin › Roles). `custom`: any other mix of module permissions.
 */
export type RoleAccess = (typeof ROLE_ACCESS_LEVELS)[number];

/** Longest role name (the `Users.role` column). */
export const ROLE_NAME_MAX_LENGTH = 50;

/**
 * The key role names are compared by: Unicode-normalized, any dash as '-', runs of spaces as one, trimmed, lower-cased.
 * "Director - Operations" typed with a hyphen is the same role as the seeded "Director – Operations" (en dash).
 */
export function normalizeRole(role: string): string {
    return role
        .normalize('NFKC')
        .replace(/[‐-―−]/g, '-')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

/** The developer role: full access everywhere, and the only role that may create or manage Super Admin users. */
export const SUPER_ADMIN_ROLE = 'Super Admin';

/** Whether the role is Super Admin (any case, any spacing). */
export function isSuperAdminRole(role: string | null | undefined): boolean {
    return normalizeRole(role ?? '') === normalizeRole(SUPER_ADMIN_ROLE);
}
