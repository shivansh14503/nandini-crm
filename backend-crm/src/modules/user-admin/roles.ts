import { GLOBAL_ACCESS_ROLES, normalizeRole } from '../shared/accessControl.js';
import { FORM_CONFIG_ADMIN_ROLES } from '../form-configs/formConfig.routes.js';

/**
 * Roles for Admin › Users: what a role name gives access to, and the list the role picker offers. Access stays decided
 * by the role's name only (no permissions table): `requireRole(...FORM_CONFIG_ADMIN_ROLES)` for the admin panel and
 * `hasGlobalAccess` (GLOBAL_ACCESS_ROLES) for "see all records". This module only reads those two lists.
 *
 * Mirrored by frontend-crm/src/utils/roleAccess.ts; src/validators/contractSync.test.ts checks the two agree.
 */

export { normalizeRole };

export const ROLE_ACCESS_LEVELS = ['admin', 'all-records', 'own-records'] as const;
/** `admin`: admin panel. `all-records`: every CRM record. `own-records`: records the user owns or created. */
export type RoleAccess = (typeof ROLE_ACCESS_LEVELS)[number];

export const ADMIN_ROLES = FORM_CONFIG_ADMIN_ROLES;
export { GLOBAL_ACCESS_ROLES };

/** Longest role name (`Users.role` is NVARCHAR(50)). */
export const ROLE_NAME_MAX_LENGTH = 50;

// Matched exactly as `requireRole` matches (lower-cased, nothing else), so the badge never promises more than the API allows.
const ADMIN_ROLE_KEYS: ReadonlySet<string> = new Set(ADMIN_ROLES.map((role) => role.toLowerCase()));
const GLOBAL_ROLE_KEYS: ReadonlySet<string> = new Set(GLOBAL_ACCESS_ROLES.map(normalizeRole));

/** Whether the role opens the admin panel (and Admin › Users). */
export function isAdminAccessRole(role: string | null | undefined): boolean {
    return ADMIN_ROLE_KEYS.has((role ?? '').toLowerCase());
}

/** Whether the role sees and changes every record (the same test as `hasGlobalAccess`). */
export function hasGlobalAccessRole(role: string | null | undefined): boolean {
    return GLOBAL_ROLE_KEYS.has(normalizeRole(role ?? ''));
}

/** The highest access the role gives: admin panel, then every record, else only the user's own records. */
export function roleAccess(role: string): RoleAccess {
    if (isAdminAccessRole(role)) return 'admin';
    if (hasGlobalAccessRole(role)) return 'all-records';
    return 'own-records';
}

export interface RoleOption {
    name: string;
    access: RoleAccess;
    /** Opens the admin panel. */
    adminPanel: boolean;
    /** Sees every record. */
    allRecords: boolean;
    /** Active users with this role (0 for a role only inactive users still hold, or nobody yet). */
    userCount: number;
    /** Inactive users with this role, so the list can still be filtered by a role only deactivated users hold. */
    inactiveUserCount: number;
}

/**
 * The roles the picker offers: every role in `Users.role` (grouped case-insensitively, as SQL Server groups them, the
 * most used spelling kept) plus the admin and global-access roles nobody holds yet (left out when a stored role
 * already matches them by `normalizeRole`). Sorted by name. Pure.
 */
export function roleOptionsFrom(counts: readonly { role: string; count: number; inactiveCount?: number }[]): RoleOption[] {
    const groups = new Map<string, { name: string; best: number; userCount: number; inactiveUserCount: number }>();
    for (const { role, count, inactiveCount = 0 } of counts) {
        const name = role.trim();
        if (!name) continue;
        const key = name.toLowerCase();
        const group = groups.get(key);
        if (!group) groups.set(key, { name, best: count, userCount: count, inactiveUserCount: inactiveCount });
        else {
            group.userCount += count;
            group.inactiveUserCount += inactiveCount;
            if (count > group.best) Object.assign(group, { name, best: count });
        }
    }
    const storedKeys = new Set([...groups.values()].map((g) => normalizeRole(g.name)));
    for (const name of [...ADMIN_ROLES, ...GLOBAL_ACCESS_ROLES]) {
        if (storedKeys.has(normalizeRole(name)) || groups.has(name.toLowerCase())) continue;
        groups.set(name.toLowerCase(), { name, best: 0, userCount: 0, inactiveUserCount: 0 });
    }
    return [...groups.values()]
        .map(({ name, userCount, inactiveUserCount }) => ({
            name,
            access: roleAccess(name),
            adminPanel: isAdminAccessRole(name),
            allRecords: hasGlobalAccessRole(name),
            userCount,
            inactiveUserCount,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
}

/**
 * The spelling to store for a role the admin picked or typed: an existing role with the same `normalizeRole` key
 * keeps its spelling ("sales manager" → "Sales Manager"), so one role never splits into near-duplicates; a new role is
 * stored as typed (trimmed, inner spaces collapsed). Pure.
 */
export function canonicalRoleName(input: string, known: readonly string[]): string {
    const typed = input.trim().replace(/\s+/g, ' ');
    const key = normalizeRole(typed);
    // An exact (case-insensitive) match first, so access never changes because of a near-match with another spelling.
    return known.find((name) => name.toLowerCase() === typed.toLowerCase()) ?? known.find((name) => normalizeRole(name) === key) ?? typed;
}
