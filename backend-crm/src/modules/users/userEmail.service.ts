import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
import { prisma, type TransactionClient } from '../../config/prisma.js';
import { auditService } from '../../services/audit.service.js';
import { CACHE_KEYS, cacheService } from '../../services/cache.service.js';
import type { AuthUser } from '../../types/user.types.js';
import { HttpError } from '../../utils/httpError.js';
import { acquireLocks, runInTransaction } from '../shared/transactions.js';

/**
 * Company email of a CRM user: the one backend rule for `Users.email`, shared by Admin › API Integrations › People
 * (PUT /api/admin/integrations/people/:username/email), Admin › Users (user-admin/userAdmin.service.ts, through
 * `assertCompanyEmailAllowed` + `assertUserEmailFree` inside its own transaction) and, later, the calendar connect auto-fill.
 *
 * Rule (database-design §4.1): stored trimmed and lower-cased, blank = none (NULL); unique among **active, non-group**
 * users (`isActive = 1 AND isGroupUser = 0`). Group (shared) logins aren't calendar identities, so they may share an
 * address with a real user; inactive users don't hold an address either. A company domain is expected
 * (`companyDomains`, Admin › API Integrations settings) unless the admin explicitly allows another one.
 * Calendar Phase 2 P2-2 adds the hand-written `UX_Users_email` index on the same rule; until then this service is
 * the only guard (writes for one address serialize on an application lock).
 */

export const USER_EMAIL_MAX_LENGTH = 120;

export const USER_EMAIL_ISSUES = ['missing', 'duplicate', 'not_company'] as const;
export type UserEmailIssue = (typeof USER_EMAIL_ISSUES)[number];

/** The stored form: trimmed and lower-cased; blank / null → null. */
export function normalizeUserEmail(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    const text = String(value).trim().toLowerCase();
    return text === '' ? null : text;
}

/** `asha@nandiniinfosys.com` → `nandiniinfosys.com` (lower-cased); '' for a value without `@`. */
export function emailDomainOf(email: string | null | undefined): string {
    const at = (email ?? '').lastIndexOf('@');
    return at === -1 ? '' : (email ?? '').slice(at + 1).trim().toLowerCase();
}

/** Whether the address is on one of the company domains (exact domain, no subdomains). */
export function isCompanyEmail(email: string | null | undefined, companyDomains: readonly string[]): boolean {
    const domain = emailDomainOf(email);
    return domain !== '' && companyDomains.some((d) => d.toLowerCase() === domain);
}

/** People who hold an address under the uniqueness rule (`isActive` and not a group login). */
export const holdsAddress = (user: { isActive: boolean; isGroupUser: boolean }) => user.isActive && !user.isGroupUser;

/** Lower-cased addresses used by more than one active, non-group user. Pure. */
export function duplicateEmailsAmong(users: readonly { email: string | null; isActive: boolean; isGroupUser: boolean }[]): Set<string> {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const user of users) {
        const email = normalizeUserEmail(user.email);
        if (!email || !holdsAddress(user)) continue;
        if (seen.has(email)) duplicates.add(email);
        seen.add(email);
    }
    return duplicates;
}

/** What is wrong with a user's address, most important first; null when it is fine. Pure. */
export function emailIssueFor(email: string | null | undefined, duplicates: ReadonlySet<string>, companyDomains: readonly string[]): UserEmailIssue | null {
    const normalized = normalizeUserEmail(email);
    if (!normalized) return 'missing';
    if (duplicates.has(normalized)) return 'duplicate';
    if (!isCompanyEmail(normalized, companyDomains)) return 'not_company';
    return null;
}

/**
 * Body of an email change: `{ email, allowOtherDomain? }`. `email` is required: '' or null clears the address, but a
 * body without the key is refused (400) so a partial client can't wipe an address by accident.
 */
export const userEmailBodySchema = z.object({
    email: z.preprocess(
        (value) => (value === undefined ? value : normalizeUserEmail(value)),
        z
            .email({ error: (issue) => (issue.input === undefined ? 'Email is required (send an empty value to clear it).' : 'Enter a valid email address.') })
            .max(USER_EMAIL_MAX_LENGTH, { message: `Email cannot exceed ${USER_EMAIL_MAX_LENGTH} characters.` })
            .nullable(),
    ),
    /** Lets an admin save an address outside the company domains (e.g. a consultant's own domain). */
    allowOtherDomain: z.boolean().optional().default(false),
});
export type UserEmailBody = z.infer<typeof userEmailBodySchema>;

/** The user row an email change returns. */
export interface UserEmailRow {
    id: number;
    username: string;
    fullName: string;
    department: string | null;
    role: string;
    email: string | null;
    isActive: boolean;
    isGroupUser: boolean;
}

const USER_EMAIL_SELECT = { id: true, username: true, fullName: true, department: true, role: true, email: true, isActive: true, isGroupUser: true } as const;

/** Drops the cached user directory (`cache:lookups:users:*`) after a write to a user commits. */
export async function invalidateUserCaches(): Promise<void> {
    await cacheService.invalidatePattern(`${CACHE_KEYS.lookups('users')}*`);
}

const domainList = (domains: readonly string[]) => domains.map((d) => `@${d}`).join(', ');

/**
 * 400 (`VALIDATION_ERROR`, field `email`) for an address outside the company domains unless the admin allowed another
 * domain. Blank addresses pass (clearing is always allowed).
 */
export function assertCompanyEmailAllowed(email: string | null, allowOtherDomain: boolean, companyDomains: readonly string[]): void {
    if (!email || allowOtherDomain || isCompanyEmail(email, companyDomains)) return;
    const message = `Use a company address (${domainList(companyDomains)}), or allow another domain.`;
    throw new HttpError(message, StatusCodes.BAD_REQUEST, { code: 'VALIDATION_ERROR', errors: [{ message, path: ['email'] }] });
}

/** The application lock serializing every write of one address (take it before reading who holds the address). */
export const userEmailLockKey = (email: string) => `user-email:${email}`;

export interface SetUserEmailOptions {
    /** Company domains (Admin › API Integrations settings): an address elsewhere needs `allowOtherDomain`. */
    companyDomains: readonly string[];
    actor: AuthUser;
}

export const userEmailService = {
    /**
     * Sets (or clears) a user's email under the rule above, audited as `User UPDATE` by the actor. 404 for an unknown
     * username; 400 (`VALIDATION_ERROR`, field `email`) outside the company domains without `allowOtherDomain`;
     * 409 (`DUPLICATE_RECORD`, field `email`) when another active, non-group user holds it. An unchanged address is a
     * no-op (no audit entry). Calendar Phase 2 P2-2 adds 409 `EMAIL_CONNECTED` for a user whose connected calendar
     * account has another address.
     */
    async setEmail(username: string, body: unknown, options: SetUserEmailOptions): Promise<UserEmailRow> {
        const { email, allowOtherDomain } = userEmailBodySchema.parse(body);
        assertCompanyEmailAllowed(email, allowOtherDomain, options.companyDomains);
        const { row, changed } = await runInTransaction(async (tx) => {
            // Two admins saving the same address at once: the second waits, then sees the first as a duplicate.
            if (email) await acquireLocks(tx, [userEmailLockKey(email)]);
            const user = await tx.user.findUnique({ where: { username }, select: USER_EMAIL_SELECT });
            if (!user) throw HttpError.notFound(`User '${username}' not found.`);
            if (user.email === email) return { row: user, changed: false };
            if (email && holdsAddress(user)) await assertUserEmailFree(tx, email, user.id);
            const updated = await tx.user.update({ where: { id: user.id }, data: { email }, select: USER_EMAIL_SELECT });
            await auditService.record(tx, {
                entityType: 'User',
                entityId: String(user.id),
                action: 'UPDATE',
                changedBy: options.actor.username,
                changes: { email: { from: user.email, to: email } },
            });
            return { row: updated, changed: true };
        });
        if (changed) await invalidateUserCaches();
        return row;
    },

    /** Every user (active or not) with the fields the email rule needs; callers filter. */
    async listForEmailRule(client: Pick<TransactionClient, 'user'> = prisma): Promise<UserEmailRow[]> {
        return client.user.findMany({ select: USER_EMAIL_SELECT, orderBy: [{ fullName: 'asc' }, { username: 'asc' }] });
    },
};

/**
 * 409 (`DUPLICATE_RECORD`, field `email`) when an active, non-group user other than `exceptUserId` holds the address.
 * SQL Server's default collation compares case-insensitively and ignores trailing spaces, so rows saved before
 * addresses were normalized still match. Also for writers that set `Users.email` in their own transaction (Admin ›
 * Users): they must already hold `userEmailLockKey(email)` (in the same `acquireLocks` call as their other keys) and
 * call it only when the user being written holds an address (active and not a group login).
 */
export async function assertUserEmailFree(tx: TransactionClient, email: string, exceptUserId: number | null): Promise<void> {
    const holder = await tx.user.findFirst({
        where: { email, isActive: true, isGroupUser: false, ...(exceptUserId !== null ? { id: { not: exceptUserId } } : {}) },
        select: { username: true, fullName: true },
    });
    if (!holder) return;
    const message = `${holder.fullName || holder.username} (${holder.username}) already uses this email.`;
    throw new HttpError(message, StatusCodes.CONFLICT, { code: 'DUPLICATE_RECORD', errors: [{ message, path: ['email'] }] });
}
