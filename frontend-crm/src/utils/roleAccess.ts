/**
 * What a role name gives access to (Admin › Users: the role picker's hint and the "Admin" / "Sees all" badges).
 * Access is decided by the role's name only; there is no permissions table. Pure and dependency-free.
 *
 * Mirrors backend-crm/src/modules/user-admin/roles.ts, which reads the lists the API enforces (FORM_CONFIG_ADMIN_ROLES
 * for the admin panel, GLOBAL_ACCESS_ROLES in modules/shared/accessControl.ts for "see all records");
 * backend-crm/src/validators/contractSync.test.ts checks the two agree, so change both together.
 */

export const ROLE_ACCESS_LEVELS = ['admin', 'all-records', 'own-records'] as const;
/**
 * `admin`: opens the admin panel (forms, users, PDF templates, …). `all-records`: sees and changes every CRM record.
 * `own-records`: only the records the user owns or created. An admin role may or may not also see all records (see
 * `hasGlobalAccessRole`): "Admin" does, "Administrator" and "Super Admin" don't today.
 */
export type RoleAccess = (typeof ROLE_ACCESS_LEVELS)[number];

/** Roles that open the admin panel, matched case-insensitively (exact text otherwise), like the API's requireRole. */
export const ADMIN_ROLES = ['Admin', 'Administrator', 'Super Admin'] as const;

/** Roles that see and change every record, matched by `normalizeRole` (any case, any dash style). */
export const GLOBAL_ACCESS_ROLES = [
    'Admin',
    'Director – Operations',
    'Regional Sales Head',
    'Sales Manager',
    'System Administrator',
    'Accounts Manager',
] as const;

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

const ADMIN_ROLE_KEYS: ReadonlySet<string> = new Set(ADMIN_ROLES.map((role) => role.toLowerCase()));
const GLOBAL_ROLE_KEYS: ReadonlySet<string> = new Set(GLOBAL_ACCESS_ROLES.map(normalizeRole));

/** Whether the role opens the admin panel. */
export function isAdminAccessRole(role: string | null | undefined): boolean {
    return ADMIN_ROLE_KEYS.has((role ?? '').toLowerCase());
}

/** Whether the role sees and changes every record. */
export function hasGlobalAccessRole(role: string | null | undefined): boolean {
    return GLOBAL_ROLE_KEYS.has(normalizeRole(role ?? ''));
}

/** The highest access the role gives: admin panel, then every record, else only the user's own records. */
export function roleAccess(role: string): RoleAccess {
    if (isAdminAccessRole(role)) return 'admin';
    if (hasGlobalAccessRole(role)) return 'all-records';
    return 'own-records';
}
