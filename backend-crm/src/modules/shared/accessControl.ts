import type { TransactionClient } from '../../config/prisma.js';
import type { AuthUser } from '../../types/user.types.js';
import { HttpError } from '../../utils/httpError.js';

import { PERMISSION_ACTION_LABELS, PERMISSION_MODULE_BY_KEY, levelOf, type AccessLevel, type PermissionAction, type PermissionModule } from '../roles/permissions.js';
import { GLOBAL_ACCESS_ROLES, normalizeRole, type ResolvedRole } from '../roles/roleDefaults.js';
import { resolveRole, teammatesOf } from '../roles/roleRegistry.js';

export { GLOBAL_ACCESS_ROLES, normalizeRole };
export type { PermissionAction, PermissionModule };

/**
 * Row-level access for the CRM modules, decided by the user's role in Admin › Roles (roles/permissions.ts): each
 * module's View / Edit / Delete is `all` (every record), `group` (records owned or created by anyone who shares a
 * security group with the user, Admin › Security Groups: `teammatesOf`), `own` (records the user owns, `assignedTo`, or
 * created) or `none`. Super Admin (the developer role) always has full access. Activities extend the rule with their attendees: an
 * invited colleague sees the activity but may only reply to it (see activities/activity.access.ts). The route guard
 * (`requirePermission`) answers 403 before a service runs when the level is `none`; the checks here are the record
 * filter behind it.
 */

/** Column holding a record's owner (`assignedTo` on every module). */
export type OwnerField = 'assignedTo';

/** The user's role as the access checks see it. */
export function roleOf(user: Pick<AuthUser, 'role'>): ResolvedRole {
    return resolveRole(user.role);
}

/** The level the user's role gives `action` on `module`. */
export function accessLevel(user: Pick<AuthUser, 'role'>, module: PermissionModule, action: PermissionAction): AccessLevel {
    return levelOf(roleOf(user).permissions, module, action);
}

/** Whether the user may do `action` on `module` at all (any level but `none`). */
export function canDo(user: Pick<AuthUser, 'role'>, module: PermissionModule, action: PermissionAction): boolean {
    return accessLevel(user, module, action) !== 'none';
}

/** Whether the role opens the admin panel. */
export function isAdminUser(user: Pick<AuthUser, 'role'>): boolean {
    return roleOf(user).adminPanel;
}

/** The 403 message for an action the role doesn't allow, e.g. "Your role doesn't allow you to delete Leads." */
export function permissionDeniedMessage(module: PermissionModule, action: PermissionAction): string {
    return `Your role doesn't allow you to ${PERMISSION_ACTION_LABELS[action].toLowerCase()} ${PERMISSION_MODULE_BY_KEY[module].label}.`;
}

/** Throws 403 unless the role allows `action` on `module` at some level. */
export function assertPermission(user: Pick<AuthUser, 'role'>, module: PermissionModule, action: PermissionAction): void {
    if (!canDo(user, module, action)) throw HttpError.forbidden(permissionDeniedMessage(module, action));
}

/** True when the role gives `action` on every record of `module`. */
export function hasGlobalAccess(user: Pick<AuthUser, 'role'>, module: PermissionModule, action: PermissionAction): boolean {
    return accessLevel(user, module, action) === 'all';
}

/** Matches no owner: usernames can't contain '#'. */
const NO_ACCESS_OWNER = '#no-access#';

/** Who a scope matches: one username, or (Group level) any of a list of usernames. */
export type OwnerMatch = string | { in: string[] };

/** `{}` for `all`, otherwise "owned by or created by the user / their teammates" (nobody's records for `none`). */
export type AccessScopeWhere<F extends OwnerField> =
    | Record<string, never>
    | { OR: [{ [K in F]: OwnerMatch }, { createdBy: OwnerMatch }] };

/**
 * The owners a level covers for `user`: null for `all` (anyone), the user's teammates for `group` (themselves included),
 * the user for `own`, nobody for `none`.
 */
export function ownersFor(user: Pick<AuthUser, 'username'>, level: AccessLevel): string[] | null {
    if (level === 'all') return null;
    if (level === 'group') return teammatesOf(user.username);
    if (level === 'own') return [user.username];
    return [];
}

/**
 * Prisma `where` fragment limiting a query to the records `user` may `action` (default View) in `module`. Combine it
 * with `AND` (it carries its own `OR`, which would otherwise collide with a search clause):
 * `{ isDeleted: false, AND: [buildAccessScopeWhere(user, 'assignedTo', 'leads')] }`.
 * SQL Server's default collation compares case-insensitively, matching `assertRecordAccess`.
 */
export function buildAccessScopeWhere<F extends OwnerField>(
    user: AuthUser,
    ownerField: F,
    module: PermissionModule,
    action: PermissionAction = 'view',
): AccessScopeWhere<F> {
    const owners = ownersFor(user, accessLevel(user, module, action));
    if (owners === null) return {};
    // One owner stays a plain equality (the query plan Own always had); Group matches the teammates with IN.
    const who: OwnerMatch = owners.length === 0 ? NO_ACCESS_OWNER : owners.length === 1 ? owners[0] : { in: owners };
    return { OR: [{ [ownerField]: who } as { [K in F]: OwnerMatch }, { createdBy: who }] };
}

const sameUser = (a: string | null | undefined, b: string) => typeof a === 'string' && a.trim().toLowerCase() === b.trim().toLowerCase();

/** Whether `user` owns (assignee) or created `record`. */
export function ownsRecord(user: AuthUser, record: { assignedTo?: string | null; createdBy?: string | null }): boolean {
    return sameUser(record.assignedTo, user.username) || sameUser(record.createdBy, user.username);
}

/** True when `user` may `action` (default View) `record` of `module`. */
export function canAccessRecord(
    user: AuthUser,
    record: { assignedTo?: string | null; createdBy?: string | null },
    module: PermissionModule,
    action: PermissionAction = 'view',
): boolean {
    const owners = ownersFor(user, accessLevel(user, module, action));
    if (owners === null) return true;
    if (owners.length === 0) return false;
    if (ownsRecord(user, record)) return true;
    return owners.some((name) => sameUser(record.assignedTo, name) || sameUser(record.createdBy, name));
}

/** Throws 403 unless `user` may `action` (default View) `record` of `module`. Call it after the not-found check. */
export function assertRecordAccess(
    user: AuthUser,
    record: { assignedTo?: string | null; createdBy?: string | null },
    module: PermissionModule,
    action: PermissionAction = 'view',
): void {
    if (canAccessRecord(user, record, module, action)) return;
    throw HttpError.forbidden(
        canDo(user, module, action)
            ? 'You do not have permission to access or modify this record.'
            : permissionDeniedMessage(module, action),
    );
}

/** Display suffix the user pickers append to the signed-in user, which older clients / data sometimes submitted. */
const YOU_SUFFIX = /\s*\(you\)\s*$/i;

/** `"mittal.sharma (You)"` → `"mittal.sharma"`; blank → null. */
export function normalizeAssignee(username: string | null | undefined): string | null {
    const cleaned = (username ?? '').replace(YOU_SUFFIX, '').trim();
    return cleaned || null;
}

export interface AssigneeCheckOptions {
    /** The record's stored assignee: an unchanged assignee is accepted even if that user was since deactivated. */
    previous?: string | null;
    /** Form field to flag on failure. */
    path?: OwnerField;
    /** Lowercased usernames of active users, prefetched for bulk writes (imports) to skip the per-row query. */
    activeUsernames?: ReadonlySet<string>;
}

/**
 * Verifies an assignee is an existing, active user and returns it cleaned (`" (You)"` stripped), or null when
 * blank. Callers store the returned value. Run it inside the write transaction.
 */
export async function assertAssigneeValid(
    tx: TransactionClient,
    username: string | null | undefined,
    options: AssigneeCheckOptions = {},
): Promise<string | null> {
    const cleaned = normalizeAssignee(username);
    if (!cleaned) return null;
    const previous = normalizeAssignee(options.previous);
    if (previous && sameUser(previous, cleaned)) return previous;

    let exists: boolean;
    let stored = cleaned;
    if (options.activeUsernames) {
        exists = options.activeUsernames.has(cleaned.toLowerCase());
    } else {
        const user = await tx.user.findFirst({ where: { username: cleaned, isActive: true }, select: { username: true } });
        exists = Boolean(user);
        if (user) stored = user.username;
    }
    if (!exists) {
        const message = `"${cleaned}" is not an active user.`;
        throw HttpError.badRequest(message, [{ message: 'Select an active user.', path: [options.path ?? 'assignedTo'] }]);
    }
    return stored;
}
