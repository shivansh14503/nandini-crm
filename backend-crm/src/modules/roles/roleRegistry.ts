import { logger } from '../../config/logger.js';
import { prisma } from '../../config/prisma.js';
import { FULL_PERMISSIONS, normalizePermissions } from './permissions.js';
import { isSuperAdminRole, LEGACY_ADMIN_ROLES, legacyRole, normalizeRole, type ResolvedRole } from './roleDefaults.js';

/**
 * In-process snapshot of Admin › Roles (every role with its permissions) and each user's current role, so the access
 * checks stay synchronous. `authenticate` calls `ensureFresh()` on every request: the snapshot is re-read when it is
 * older than REFRESH_MS, and at once in the process that saved a role or a user's role (`refresh()`). Another API
 * instance picks a change up within REFRESH_MS.
 *
 * Reading the user's role from here (not from the session token) means a renamed role or a changed permission applies
 * to signed-in users without signing them out.
 */

const REFRESH_MS = 15_000;

interface Snapshot {
    loadedAt: number;
    roles: Map<string, ResolvedRole>;
    userRoles: Map<number, string>;
}

let snapshot: Snapshot | null = null;
let loading: Promise<void> | null = null;

function toResolved(row: { name: string; adminPanel: boolean; permissionsJson: string }): ResolvedRole {
    const superAdmin = isSuperAdminRole(row.name);
    let parsed: unknown = {};
    try {
        parsed = JSON.parse(row.permissionsJson);
    } catch {
        logger.warn({ role: row.name }, 'Role permissions are not valid JSON; treating them as no access');
    }
    return {
        name: row.name,
        adminPanel: superAdmin || row.adminPanel,
        superAdmin,
        permissions: superAdmin ? FULL_PERMISSIONS : normalizePermissions(parsed),
    };
}

async function load(): Promise<void> {
    const [roles, users] = await Promise.all([
        prisma.role.findMany({ select: { name: true, adminPanel: true, permissionsJson: true } }),
        prisma.user.findMany({ select: { id: true, role: true } }),
    ]);
    snapshot = {
        loadedAt: Date.now(),
        roles: new Map(roles.map((r) => [normalizeRole(r.name), toResolved(r)])),
        userRoles: new Map(users.map((u) => [u.id, u.role])),
    };
}

/** Re-reads the snapshot now (after a role or a user's role is saved). Never throws: a failed read keeps the old one. */
export async function refresh(): Promise<void> {
    loading ??= load()
        .catch((err: Error) => logger.warn({ err: err.message }, 'Could not load roles; keeping the previous snapshot'))
        .finally(() => {
            loading = null;
        });
    await loading;
}

/** Loads the snapshot when it is missing or older than REFRESH_MS. */
export async function ensureFresh(): Promise<void> {
    if (snapshot && Date.now() - snapshot.loadedAt < REFRESH_MS) return;
    await refresh();
}

/** Whether a snapshot has been loaded (false in unit tests and before the first request). */
export function isLoaded(): boolean {
    return snapshot !== null;
}

/**
 * The role `name` resolves to: the Admin › Roles row with the same `normalizeRole` key; Super Admin always has full
 * access; a name no row matches gets what it gave before Admin › Roles (`legacyRole`) until the snapshot is loaded,
 * and own-records access without the admin panel after.
 */
export function resolveRole(name: string | null | undefined): ResolvedRole {
    const text = (name ?? '').trim();
    const found = snapshot?.roles.get(normalizeRole(text));
    if (found) return found;
    if (!snapshot || isSuperAdminRole(text)) return legacyRole(text);
    return { ...legacyRole(text), adminPanel: false, permissions: legacyRole('').permissions };
}

/** The user's current role (the snapshot's), else `fallback` (the role in their session token). */
export function currentRoleOf(userId: number, fallback: string): string {
    return snapshot?.userRoles.get(userId) ?? fallback;
}

/** Names of the roles that open the admin panel (for "notify the admins" queries). */
export function adminRoleNames(): string[] {
    if (!snapshot) return [...LEGACY_ADMIN_ROLES];
    return [...snapshot.roles.values()].filter((r) => r.adminPanel).map((r) => r.name);
}

/** Test hook: replaces the snapshot (null clears it). */
export function setSnapshotForTests(roles: { name: string; adminPanel: boolean; permissions: unknown }[] | null, userRoles: [number, string][] = []): void {
    snapshot = roles
        ? {
              loadedAt: Date.now(),
              roles: new Map(roles.map((r) => [normalizeRole(r.name), toResolved({ name: r.name, adminPanel: r.adminPanel, permissionsJson: JSON.stringify(r.permissions) })])),
              userRoles: new Map(userRoles),
          }
        : null;
}
