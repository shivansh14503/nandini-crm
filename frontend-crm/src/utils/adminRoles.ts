import type { User } from '@/types/auth.types';

/** Roles that opened the admin panel before Admin › Roles; only a fallback for a user object without `access`. */
const LEGACY_ADMIN_ROLES: ReadonlySet<string> = new Set(['admin', 'administrator', 'super admin']);

/**
 * Whether the signed-in user's role opens the admin panel (Admin › Roles "Admin panel"), as the API's `requireAdmin`
 * decides it. Reads `user.access`; a user object without it (an older cached sign-in) falls back to the old role names.
 */
export function isAdminUser(user: Pick<User, 'role' | 'access'> | null | undefined): boolean {
    if (!user) return false;
    if (user.access) return user.access.adminPanel;
    return LEGACY_ADMIN_ROLES.has((user.role ?? '').trim().toLowerCase());
}
