import type { TransactionClient } from '../../config/prisma.js';
import type { AuthUser } from '../../types/user.types.js';
import { HttpError } from '../../utils/httpError.js';

/**
 * Row-level access for the core CRM entities (organizations, contacts, leads, opportunities, quotations, tickets).
 *
 * Global roles see and change every record. Every other role is scoped to the records it owns (assignee) or
 * created. Role names are matched case-insensitively with any dash style, so "Director - Operations" typed with a
 * hyphen is the same role as the seeded "Director – Operations" (en dash).
 */
export const GLOBAL_ACCESS_ROLES = [
    'Admin',
    'Director – Operations',
    'Regional Sales Head',
    'Sales Manager',
    'System Administrator',
    'Accounts Manager',
] as const;

/** Column holding a record's owner: `assignedUser` on organizations, `assignedTo` everywhere else. */
export type OwnerField = 'assignedTo' | 'assignedUser';

const normalizeRole = (role: string) =>
    role
        .normalize('NFKC')
        .replace(/[‐-―−]/g, '-')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();

const GLOBAL_ROLE_KEYS: ReadonlySet<string> = new Set(GLOBAL_ACCESS_ROLES.map(normalizeRole));

export function hasGlobalAccess(user: Pick<AuthUser, 'role'>): boolean {
    return GLOBAL_ROLE_KEYS.has(normalizeRole(user.role ?? ''));
}

/** `{}` for global roles, otherwise "owned by or created by the user". */
export type AccessScopeWhere<F extends OwnerField> =
    | Record<string, never>
    | { OR: [{ [K in F]: string }, { createdBy: string }] };

/**
 * Prisma `where` fragment limiting a query to the records `user` may see. Combine it with `AND` (it carries its
 * own `OR`, which would otherwise collide with a search clause):
 * `{ isDeleted: false, AND: [buildAccessScopeWhere(user, 'assignedTo')] }`.
 * SQL Server's default collation compares case-insensitively, matching `assertRecordAccess`.
 */
export function buildAccessScopeWhere<F extends OwnerField>(user: AuthUser, ownerField: F): AccessScopeWhere<F> {
    if (hasGlobalAccess(user)) return {};
    return { OR: [{ [ownerField]: user.username } as { [K in F]: string }, { createdBy: user.username }] };
}

const sameUser = (a: string | null | undefined, b: string) => typeof a === 'string' && a.trim().toLowerCase() === b.trim().toLowerCase();

/** True when `user` may read / change `record` (global role, assignee or creator). */
export function canAccessRecord(
    user: AuthUser,
    record: { assignedTo?: string | null; assignedUser?: string | null; createdBy?: string | null },
): boolean {
    if (hasGlobalAccess(user)) return true;
    return sameUser(record.assignedTo, user.username) || sameUser(record.assignedUser, user.username) || sameUser(record.createdBy, user.username);
}

/** Throws 403 unless `user` may read / change `record`. Call it after the not-found check. */
export function assertRecordAccess(
    user: AuthUser,
    record: { assignedTo?: string | null; assignedUser?: string | null; createdBy?: string | null },
): void {
    if (!canAccessRecord(user, record)) {
        throw HttpError.forbidden('You do not have permission to access or modify this record.');
    }
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
