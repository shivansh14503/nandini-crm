import { randomInt } from 'node:crypto';
import { FIELD_MAX_LENGTH as L } from '../../config/fieldLimits.js';
import { passwordPolicyIssue } from '../auth/passwordPolicy.js';
import { isAdminAccessRole } from './roles.js';

/** Pure rules of Admin › Users (no database), unit tested in userAdmin.rules.test.ts. */

// ── Reports to ───────────────────────────────────────────────────────────────

/** Longest manager chain walked when checking for a cycle; a longer chain is refused as if it were one. */
export const MAX_MANAGER_DEPTH = 50;

export type ManagerIssue = 'self' | 'cycle';

/**
 * Whether `userId` may report to `managerId`, given every user's current manager (`reportsTo`: id → manager id).
 * `self` when they are the same user; `cycle` when `userId` already appears up `managerId`'s chain (the manager
 * reports, directly or not, to the user), or the chain is longer than MAX_MANAGER_DEPTH. `userId` null = a new user
 * (nobody can report to them yet, so only the depth matters). Null when the manager is fine.
 */
export function managerIssue(userId: number | null, managerId: number, reportsTo: ReadonlyMap<number, number | null>): ManagerIssue | null {
    if (userId !== null && userId === managerId) return 'self';
    const seen = new Set<number>();
    let current: number | null | undefined = managerId;
    for (let depth = 0; current !== null && current !== undefined; depth++) {
        if (depth >= MAX_MANAGER_DEPTH || seen.has(current)) return 'cycle';
        if (userId !== null && current === userId) return 'cycle';
        seen.add(current);
        current = reportsTo.get(current);
    }
    return null;
}

export const MANAGER_MESSAGES: Record<ManagerIssue | 'missing' | 'inactive' | 'group', string> = {
    self: 'A user cannot report to themselves.',
    cycle: 'This manager already reports to this user (directly or through others). Pick someone else.',
    missing: 'This manager was not found.',
    inactive: 'This manager is inactive. Pick an active user.',
    group: 'A shared (group) login cannot be a manager.',
};

// ── Admins ───────────────────────────────────────────────────────────────────

export type AdminGuardIssue = 'SELF_LOCKOUT' | 'LAST_ADMIN';

export interface AdminGuardInput {
    /** The admin making the change. */
    actorId: number;
    target: { id: number; role: string; isActive: boolean };
    /** The target's role and active flag after the change. */
    next: { role: string; isActive: boolean };
    /** Active users whose role opens the admin panel, the target included when it is one. */
    activeAdminCount: number;
}

/** Whether an active admin stops being one (demoted to a non-admin role, or deactivated). */
export function losesAdminAccess(target: { role: string; isActive: boolean }, next: { role: string; isActive: boolean }): boolean {
    return target.isActive && isAdminAccessRole(target.role) && !(next.isActive && isAdminAccessRole(next.role));
}

/**
 * Whether a change would take admin access away so nobody (or not the actor) can manage users any more:
 * `SELF_LOCKOUT` when admins demote or deactivate themselves, `LAST_ADMIN` when the target is the only active admin.
 * Null when the change is fine (including any change that keeps the target an active admin).
 */
export function adminGuardIssue({ actorId, target, next, activeAdminCount }: AdminGuardInput): AdminGuardIssue | null {
    if (!losesAdminAccess(target, next)) return null;
    if (target.id === actorId) return 'SELF_LOCKOUT';
    if (activeAdminCount <= 1) return 'LAST_ADMIN';
    return null;
}

export const ADMIN_GUARD_MESSAGES: Record<AdminGuardIssue, string> = {
    SELF_LOCKOUT: 'You cannot remove your own admin access. Ask another admin to do it.',
    LAST_ADMIN: 'This is the last active admin. Give another active user an admin role first.',
};

// ── Names ────────────────────────────────────────────────────────────────────

/**
 * The combined-name rule of My Profile (profile.service.ts): `fullName` (first + ' ' + last) must fit the column.
 * Null when it fits.
 */
export function fullNameLengthIssue(fullName: string): string | null {
    return fullName.length > L.personName ? `First and last name together cannot exceed ${L.personName - 1} characters.` : null;
}

// ── Temporary passwords ──────────────────────────────────────────────────────

export const TEMPORARY_PASSWORD_LENGTH = 12;
// No look-alikes (0/O/o, 1/l/I), so a password read out or copied by hand isn't mistyped.
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';
const DIGITS = '23456789';
const ALPHABET = LETTERS + DIGITS;

const pick = (chars: string, random: (max: number) => number) => chars[random(chars.length)];

/**
 * A random 12-character password of letters and digits (at least one of each) that passes the password rules for
 * `username`. Shown to the admin once; never stored in clear, logged or audited. `random` is crypto `randomInt`.
 */
export function generateTemporaryPassword(username: string, random: (max: number) => number = randomInt): string {
    for (;;) {
        const chars = [pick(LETTERS, random), pick(DIGITS, random)];
        while (chars.length < TEMPORARY_PASSWORD_LENGTH) chars.push(pick(ALPHABET, random));
        // Fisher–Yates, so the guaranteed letter and digit can sit anywhere.
        for (let i = chars.length - 1; i > 0; i--) {
            const j = random(i + 1);
            [chars[i], chars[j]] = [chars[j], chars[i]];
        }
        const password = chars.join('');
        if (!passwordPolicyIssue(password, { username })) return password;
    }
}
