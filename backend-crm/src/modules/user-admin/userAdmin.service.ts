import { randomBytes } from 'node:crypto';
import { StatusCodes } from 'http-status-codes';
import { prisma, type TransactionClient } from '../../config/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { auditService, diffRecords } from '../../services/audit.service.js';
import type { AuthUser } from '../../types/user.types.js';
import { HttpError, type ApiFieldError } from '../../utils/httpError.js';
import { businessToday } from '../../validators/notInPast.js';
import { hashPassword } from '../auth/auth.service.js';
import { inviteService, revokeOutstandingInvites, type InviteSendOutcome } from '../auth/invite.service.js';
import type { InvitePurpose } from '../auth/invite.token.js';
import { sessionService } from '../auth/session.service.js';
import { loadCalendarSettings } from '../integrations/integration.settings.js';
import { joinFullName, photoUrlOf, resolveNameParts } from '../profile/profile.dto.js';
import { acquireLocks, runInTransaction } from '../shared/transactions.js';
import { calendarConnectionUserLockKey } from '../calendar-sync/connection.constants.js';
import { reconcileUserQuietly } from '../calendar-sync/enrolment.js';
import {
    assertCompanyEmailAllowed,
    assertUserEmailFree,
    duplicateEmailsAmong,
    holdsAddress,
    invalidateUserCaches,
    normalizeUserEmail,
    userEmailLockKey,
    userEmailService,
} from '../users/userEmail.service.js';
import {
    ADMIN_USER_SELECT,
    adminUserAuditSnapshot,
    canonicalDepartment,
    departmentOptionsFrom,
    toAdminUserDto,
    type AdminUserDto,
    type DepartmentOption,
    type EmailRuleContext,
} from './userAdmin.dto.js';
import {
    ADMIN_GUARD_MESSAGES,
    adminGuardIssue,
    fullNameLengthIssue,
    losesAdminAccess,
    MANAGER_MESSAGES,
    managerIssue,
    SUPER_ADMIN_ONLY_MESSAGE,
    superAdminOnly,
} from './userAdmin.rules.js';
import type { CreateUserInput, ListUsersQuery, UpdateUserInput } from './userAdmin.validator.js';
import { ADMIN_ROLES, canonicalRoleName, GLOBAL_ACCESS_ROLES, isAdminAccessRole, roleOptionsFrom, type RoleOption } from './roles.js';

/**
 * Admin › Users (/api/admin/users): list, add (with an emailed invite link), edit, deactivate / activate CRM users and
 * email them set-password links (auth/invite.service.ts).
 * Access stays decided by the role's name (roles.ts). Every write is audited as the acting admin and drops the user
 * lookup caches. Writes to one user serialize on the same lock as My Profile (`user:id:<id>`).
 */

// ── Locks ────────────────────────────────────────────────────────────────────

const userLock = (id: number) => `user:id:${id}`;
const usernameLock = (username: string) => `user-username:${username}`;
/** Serializes changes that can take admin access away, so two admins can't demote each other at once. */
const ADMIN_ROSTER_LOCK = 'user-admin:admins';
/** Serializes "reports to" changes, so two edits can't close a cycle between them. */
const REPORTS_TO_LOCK = 'user-admin:reports-to';

// ── Errors ───────────────────────────────────────────────────────────────────

const fieldError = (message: string, status: number, code: string, path?: string) =>
    new HttpError(message, status, { code, ...(path ? { errors: [{ message, path: [path] }] satisfies ApiFieldError[] } : {}) });

const userNotFound = () => HttpError.notFound('User not found.');
/** 403 SUPER_ADMIN_ONLY when a non-Super Admin touches a Super Admin (or the role). */
function assertSuperAdminRule(actor: AuthUser, targetRole: string | null, nextRole: string | null, path?: string): void {
    if (superAdminOnly(actor.role, targetRole, nextRole)) throw fieldError(SUPER_ADMIN_ONLY_MESSAGE, StatusCodes.FORBIDDEN, 'SUPER_ADMIN_ONLY', path);
}

const invalidManager = (message: string) => fieldError(message, StatusCodes.BAD_REQUEST, 'INVALID_MANAGER', 'reportsToId');

// ── Reads ────────────────────────────────────────────────────────────────────

/** Duplicates among active non-group users and the company domains, for each row's `emailIssue`. */
async function emailRuleContext(): Promise<EmailRuleContext> {
    const [users, settings] = await Promise.all([userEmailService.listForEmailRule(), loadCalendarSettings()]);
    return { duplicates: duplicateEmailsAmong(users), companyDomains: settings.companyDomains };
}

async function loadDto(id: number): Promise<AdminUserDto> {
    const [row, emailRule] = await Promise.all([prisma.user.findUnique({ where: { id }, select: ADMIN_USER_SELECT }), emailRuleContext()]);
    if (!row) throw userNotFound();
    return toAdminUserDto(row, emailRule, businessToday());
}

/** Role names the picker offers, stored ones first (the spelling a typed role snaps to). */
async function knownRoles(tx: TransactionClient): Promise<string[]> {
    const rows = await tx.user.findMany({ distinct: ['role'], select: { role: true } });
    return [...rows.map((r) => r.role.trim()).filter(Boolean), ...ADMIN_ROLES, ...GLOBAL_ACCESS_ROLES];
}

async function knownDepartments(tx: TransactionClient): Promise<string[]> {
    const rows = await tx.user.findMany({ where: { department: { not: null } }, distinct: ['department'], select: { department: true } });
    return rows.map((r) => r.department?.trim() ?? '').filter(Boolean);
}

/** Active users whose role opens the admin panel (matched as requireRole matches). */
async function countActiveAdmins(tx: TransactionClient): Promise<number> {
    const rows = await tx.user.findMany({ where: { isActive: true }, select: { role: true } });
    return rows.filter((r) => isAdminAccessRole(r.role)).length;
}

// ── Write checks ─────────────────────────────────────────────────────────────

/**
 * 400 INVALID_MANAGER unless `managerId` is an existing, active, non-group user and `userId` (null for a new user)
 * isn't up their chain. The caller holds REPORTS_TO_LOCK.
 */
async function assertManager(tx: TransactionClient, userId: number | null, managerId: number): Promise<void> {
    if (userId === managerId) throw invalidManager(MANAGER_MESSAGES.self);
    const manager = await tx.user.findUnique({ where: { id: managerId }, select: { isActive: true, isGroupUser: true } });
    if (!manager) throw invalidManager(MANAGER_MESSAGES.missing);
    if (!manager.isActive) throw invalidManager(MANAGER_MESSAGES.inactive);
    if (manager.isGroupUser) throw invalidManager(MANAGER_MESSAGES.group);
    const links = await tx.user.findMany({ where: { reportsToId: { not: null } }, select: { id: true, reportsToId: true } });
    const issue = managerIssue(userId, managerId, new Map(links.map((l) => [l.id, l.reportsToId])));
    if (issue) throw invalidManager(MANAGER_MESSAGES[issue]);
}

/** 400 SELF_LOCKOUT / LAST_ADMIN when the change would take admin access away. The caller holds ADMIN_ROSTER_LOCK. */
async function assertAdminsKept(
    tx: TransactionClient,
    actor: AuthUser,
    target: { id: number; role: string; isActive: boolean },
    next: { role: string; isActive: boolean },
    path?: string,
): Promise<void> {
    // Most changes don't take admin access from anybody: no need to count the admins.
    if (!losesAdminAccess(target, next)) return;
    const issue = adminGuardIssue({ actorId: actor.id, target, next, activeAdminCount: await countActiveAdmins(tx) });
    if (issue) throw fieldError(ADMIN_GUARD_MESSAGES[issue], StatusCodes.BAD_REQUEST, issue, path);
}

/**
 * The stored hash of a new (Invited) user: of 32 random bytes nobody ever sees, so no password works until they set
 * one from their link (sign-in also refuses Invited accounts: INVITE_PENDING).
 */
const unusablePasswordHash = () => hashPassword(randomBytes(32).toString('base64url'));

/** Why a set-password email couldn't go out, as the admin sees it (the user and anything else saved stay saved). */
function inviteEmailError(outcome: Extract<InviteSendOutcome, { error: string }>): HttpError {
    if (outcome.status === 'mail_disabled') {
        return new HttpError(`The email to ${outcome.sentTo} could not be sent: ${outcome.error}`, StatusCodes.SERVICE_UNAVAILABLE, { code: 'MAIL_DISABLED' });
    }
    return new HttpError(`The email to ${outcome.sentTo} could not be sent: ${outcome.error}`, StatusCodes.BAD_GATEWAY, { code: 'INVITE_EMAIL_FAILED' });
}

function assertFullNameFits(fullName: string, path: string): void {
    const issue = fullNameLengthIssue(fullName);
    if (issue) throw fieldError(issue, StatusCodes.BAD_REQUEST, 'VALIDATION_ERROR', path);
}

const audit = (tx: TransactionClient, actor: AuthUser, id: number, action: 'CREATE' | 'UPDATE' | 'STATUS_CHANGE', changes: unknown) =>
    auditService.record(tx, { entityType: 'User', entityId: String(id), action, changedBy: actor.username, changes });

// ── Service ──────────────────────────────────────────────────────────────────

export interface AdminUserListResult {
    data: AdminUserDto[];
    meta: { total: number; page: number; pageSize: number };
}

export interface AdminUsersMeta {
    roles: RoleOption[];
    departments: DepartmentOption[];
    /** Who a user can report to: active, non-group users, by name. */
    managers: { id: number; name: string; username: string; photoUrl: string | null }[];
    companyDomains: string[];
}

export interface CreateUserResult {
    user: AdminUserDto;
    /**
     * The invite email: `sent` (with `expiresAt`), or `failed` / `mail_disabled` with the reason to show the admin. The
     * user is added either way (Invited); "Resend invite" sends a new link once the problem is fixed.
     */
    invite: InviteSendOutcome;
}

export interface SendInviteResult {
    user: AdminUserDto;
    /** invite (the user is still Invited) or reset (an active account: a password reset link). */
    purpose: InvitePurpose;
    sentTo: string;
    expiresAt: string;
}

export type StatusChangeResult = AdminUserDto & { signedOutSessions: number | null };

/** PATCH answer; `signedOutSessions` only when the role changed (the user's sessions were signed out). */
export type UpdateUserResult = AdminUserDto & { signedOutSessions?: number | null };

export function listWhere(query: Partial<Pick<ListUsersQuery, 'search' | 'role' | 'department'>> & Pick<ListUsersQuery, 'status'>): Prisma.UserWhereInput {
    const and: Prisma.UserWhereInput[] = [];
    if (query.status === 'active') and.push({ isActive: true });
    if (query.status === 'inactive') and.push({ isActive: false });
    // SQL Server's default collation compares case-insensitively.
    if (query.role) and.push({ role: query.role });
    if (query.department) and.push({ department: query.department });
    if (query.search) {
        const contains = query.search;
        and.push({
            OR: [
                { fullName: { contains } },
                { username: { contains } },
                { email: { contains } },
                { jobTitle: { contains } },
                { department: { contains } },
                { role: { contains } },
            ],
        });
    }
    return and.length > 0 ? { AND: and } : {};
}

export const userAdminService = {
    async list(query: ListUsersQuery): Promise<AdminUserListResult> {
        const where = listWhere(query);
        const [total, rows, emailRule] = await Promise.all([
            prisma.user.count({ where }),
            prisma.user.findMany({
                where,
                select: ADMIN_USER_SELECT,
                orderBy: [{ fullName: 'asc' }, { username: 'asc' }],
                skip: (query.page - 1) * query.pageSize,
                take: query.pageSize,
            }),
            emailRuleContext(),
        ]);
        const today = businessToday();
        return { data: rows.map((row) => toAdminUserDto(row, emailRule, today)), meta: { total, page: query.page, pageSize: query.pageSize } };
    },

    async meta(): Promise<AdminUsersMeta> {
        const [roleCounts, departmentCounts, managers, settings] = await Promise.all([
            prisma.user.groupBy({ by: ['role', 'isActive'], _count: { _all: true } }),
            prisma.user.groupBy({ by: ['department', 'isActive'], _count: { _all: true } }),
            prisma.user.findMany({
                where: { isActive: true, isGroupUser: false },
                select: { id: true, fullName: true, username: true, photo: { select: { id: true } } },
                orderBy: [{ fullName: 'asc' }, { username: 'asc' }],
            }),
            loadCalendarSettings(),
        ]);
        return {
            roles: roleOptionsFrom(roleCounts.map((r) => ({ role: r.role, count: r.isActive ? r._count._all : 0, inactiveCount: r.isActive ? 0 : r._count._all }))),
            departments: departmentOptionsFrom(departmentCounts.map((d) => ({ department: d.department, count: d.isActive ? d._count._all : 0 }))),
            managers: managers.map((m) => ({ id: m.id, name: m.fullName.trim() || m.username, username: m.username, photoUrl: photoUrlOf(m.photo?.id) })),
            companyDomains: [...settings.companyDomains],
        };
    },

    get: loadDto,

    /**
     * Adds a user: active and Invited, then emails them a one-time link (72 h) to set their password. No password is
     * set or shown here. 409 DUPLICATE_RECORD (username, or email held by another active non-group user); 400
     * VALIDATION_ERROR (email outside the company domains without allowOtherDomain, names too long together); 400
     * INVALID_MANAGER. A failed email doesn't undo the add: `invite` carries the reason.
     */
    async create(actor: AuthUser, input: CreateUserInput): Promise<CreateUserResult> {
        const email = input.email;
        const isGroupUser = input.isGroupUser ?? false;
        assertCompanyEmailAllowed(email, input.allowOtherDomain ?? false, (await loadCalendarSettings()).companyDomains);
        const lastName = input.lastName ?? null;
        const fullName = joinFullName(input.firstName, lastName);
        assertFullNameFits(fullName, lastName ? 'lastName' : 'firstName');
        // Hashed before the transaction: bcrypt takes ~a quarter second and needs no lock.
        const passwordHash = await unusablePasswordHash();

        const row = await runInTransaction(async (tx) => {
            const checksEmail = holdsAddress({ isActive: true, isGroupUser });
            await acquireLocks(tx, [usernameLock(input.username), checksEmail ? userEmailLockKey(email) : null, input.reportsToId ? REPORTS_TO_LOCK : null]);
            // Case-insensitive (SQL Server collation): "Palak" already taken blocks "palak".
            if (await tx.user.findFirst({ where: { username: input.username }, select: { id: true } })) {
                throw fieldError(`The username "${input.username}" is already taken.`, StatusCodes.CONFLICT, 'DUPLICATE_RECORD', 'username');
            }
            if (checksEmail) await assertUserEmailFree(tx, email, null);
            if (input.reportsToId) await assertManager(tx, null, input.reportsToId);
            const role = canonicalRoleName(input.role, await knownRoles(tx));
            assertSuperAdminRule(actor, null, role, 'role');
            const department = input.department ? canonicalDepartment(input.department, await knownDepartments(tx)) : null;

            const created = await tx.user.create({
                data: {
                    username: input.username,
                    passwordHash,
                    role,
                    email,
                    fullName,
                    firstName: input.firstName,
                    lastName,
                    phone: input.mobile ?? null,
                    officePhone: input.officePhone ?? null,
                    department,
                    jobTitle: input.jobTitle ?? null,
                    reportsToId: input.reportsToId ?? null,
                    isActive: true,
                    isGroupUser,
                    onLeave: false,
                    invitePending: true,
                    createdBy: actor.username,
                },
                select: ADMIN_USER_SELECT,
            });
            // A snapshot of the new user: no password or hash.
            await audit(tx, actor, created.id, 'CREATE', adminUserAuditSnapshot(created));
            return created;
        });
        await invalidateUserCaches();
        // A new person with a company email on a served domain starts syncing their calendar (P2-2b).
        await reconcileUserQuietly(row.username, 'user_created', { actor: actor.username });
        const invite = await inviteService.send(actor, { id: row.id, username: row.username, email, firstName: row.firstName, fullName: row.fullName }, 'invite');
        return { user: await loadDto(row.id), invite };
    },

    /**
     * Edits a user (keys left out stay as they are; the username never changes). An unchanged result is a no-op with
     * no audit entry. A role change signs the user out everywhere: their token carries the role, so the new access
     * applies from their next sign-in (except the acting admin's own sessions, which keep the old role until then).
     */
    async update(actor: AuthUser, id: number, input: UpdateUserInput): Promise<UpdateUserResult> {
        const companyDomains = input.email !== undefined ? (await loadCalendarSettings()).companyDomains : [];

        const outcome = await runInTransaction(async (tx) => {
            await acquireLocks(tx, [userLock(id), input.role !== undefined ? ADMIN_ROSTER_LOCK : null, input.reportsToId ? REPORTS_TO_LOCK : null]);
            const before = await tx.user.findUnique({ where: { id }, select: ADMIN_USER_SELECT });
            if (!before) throw userNotFound();
            assertSuperAdminRule(actor, before.role, null);

            // Names as shown (split from fullName when the stored parts are stale), so an edit of other fields keeps them.
            const shown = resolveNameParts(before);
            const sameText = (a: string | null | undefined, b: string | null | undefined) => (a?.trim() || null) === (b?.trim() || null);
            const namesChanged =
                (input.firstName !== undefined && !sameText(input.firstName, shown.firstName)) ||
                (input.lastName !== undefined && !sameText(input.lastName, shown.lastName));
            let names = { firstName: before.firstName, lastName: before.lastName, fullName: before.fullName };
            if (namesChanged) {
                const firstName = input.firstName !== undefined ? input.firstName : shown.firstName;
                const lastName = input.lastName !== undefined ? input.lastName : shown.lastName;
                if (!firstName?.trim()) throw fieldError('First Name is required.', StatusCodes.BAD_REQUEST, 'VALIDATION_ERROR', 'firstName');
                const fullName = joinFullName(firstName, lastName);
                assertFullNameFits(fullName, input.lastName !== undefined ? 'lastName' : 'firstName');
                names = { firstName, lastName, fullName };
            }

            const isGroupUser = input.isGroupUser ?? before.isGroupUser;
            const email = input.email !== undefined ? input.email : before.email;
            if (input.email !== undefined && email !== before.email) assertCompanyEmailAllowed(email, input.allowOtherDomain ?? false, companyDomains);
            // The address must be free when it changes, or when the user starts holding one (no longer a group login).
            const startsHolding = holdsAddress({ isActive: before.isActive, isGroupUser }) && (email !== before.email || before.isGroupUser);
            const emailChanges = email !== before.email;
            // A changed address also takes the user's calendar lock (with the address lock, as the People screen does), so
            // the change and the calendar enrolment reconcile after it serialize (P2-2b: the sync follows the address).
            await acquireLocks(tx, [emailChanges ? calendarConnectionUserLockKey(before.username) : null, email && startsHolding ? userEmailLockKey(email) : null]);
            if (email && startsHolding) await assertUserEmailFree(tx, email, id);

            const role = input.role !== undefined ? canonicalRoleName(input.role, await knownRoles(tx)) : before.role;
            if (role !== before.role) {
                assertSuperAdminRule(actor, before.role, role, 'role');
                await assertAdminsKept(tx, actor, before, { role, isActive: before.isActive }, 'role');
            }

            let department = before.department;
            if (input.department !== undefined) department = input.department ? canonicalDepartment(input.department, await knownDepartments(tx)) : null;

            const reportsToId = input.reportsToId !== undefined ? input.reportsToId : before.reportsToId;
            // An unchanged manager is kept even if they were deactivated since (like an unchanged assignee).
            if (reportsToId !== null && reportsToId !== before.reportsToId) await assertManager(tx, id, reportsToId);

            const next = {
                ...names,
                email,
                role,
                department,
                jobTitle: input.jobTitle !== undefined ? input.jobTitle : before.jobTitle,
                reportsToId,
                phone: input.mobile !== undefined ? input.mobile : before.phone,
                officePhone: input.officePhone !== undefined ? input.officePhone : before.officePhone,
                isGroupUser,
                onLeave: input.onLeave ?? before.onLeave,
            };
            const changes = diffRecords(adminUserAuditSnapshot(before), adminUserAuditSnapshot({ ...before, ...next }));
            if (Object.keys(changes).length === 0) return { row: before, changed: false, roleChanged: false };

            // Only the columns that change: one this edit leaves alone is never written back from `before`, so a concurrent
            // write to it (the People screen's email, which doesn't take this user's lock) isn't reverted.
            const data = Object.fromEntries(Object.entries(next).filter(([key, value]) => value !== before[key as keyof typeof next])) as Partial<typeof next>;
            // A link already emailed went to the old address: it stops working (send a new one to the new address).
            if ('email' in data) await revokeOutstandingInvites(tx, id);
            const after = await tx.user.update({ where: { id }, data, select: ADMIN_USER_SELECT });
            await audit(tx, actor, id, 'UPDATE', changes);
            return { row: after, changed: true, roleChanged: 'role' in changes };
        });

        if (outcome.changed) {
            await invalidateUserCaches();
            // Email or group-login changes move / start / stop the person's calendar sync (P2-2b).
            await reconcileUserQuietly(outcome.row.username, 'user_updated', { actor: actor.username });
        }
        const dto = toAdminUserDto(outcome.row, await emailRuleContext(), businessToday());
        if (!outcome.roleChanged || id === actor.id) return dto;
        return { ...dto, signedOutSessions: await sessionService.revokeAll(id) };
    },

    /**
     * Deactivates a user and signs out all their sessions. Their records, direct reports and username stay. 400
     * SELF_LOCKOUT for the acting admin, 400 LAST_ADMIN for the only active admin. Already inactive: no change, no
     * audit entry (their sessions are still signed out).
     */
    async deactivate(actor: AuthUser, id: number): Promise<StatusChangeResult> {
        if (id === actor.id) {
            throw fieldError('You cannot deactivate your own account.', StatusCodes.BAD_REQUEST, 'SELF_LOCKOUT');
        }
        const changed = await runInTransaction(async (tx) => {
            await acquireLocks(tx, [userLock(id), ADMIN_ROSTER_LOCK]);
            const before = await tx.user.findUnique({ where: { id }, select: { id: true, role: true, isActive: true } });
            if (!before) throw userNotFound();
            assertSuperAdminRule(actor, before.role, null);
            if (!before.isActive) return false;
            await assertAdminsKept(tx, actor, before, { role: before.role, isActive: false });
            const deactivatedAt = new Date();
            await tx.user.update({ where: { id }, data: { isActive: false, deactivatedAt } });
            // Set-password links stop working too (they also check the account is active when used).
            await revokeOutstandingInvites(tx, id);
            await audit(tx, actor, id, 'STATUS_CHANGE', { isActive: { from: true, to: false } });
            return true;
        });
        // After the commit: tracked sessions end at once (authenticate checks Redis); untracked ones at token expiry.
        const signedOutSessions = await sessionService.revokeAll(id);
        if (changed) await invalidateUserCaches();
        const dto = await loadDto(id);
        // Calendar sync stops for a deactivated person (events already in their calendar stay).
        if (changed) await reconcileUserQuietly(dto.username, 'user_deactivated', { actor: actor.username });
        return { ...dto, signedOutSessions };
    },

    /**
     * Activates a user again. 409 DUPLICATE_RECORD (field `email`) when another active, non-group user took their
     * address meanwhile (clear or change it first). Already active: no change.
     */
    async activate(actor: AuthUser, id: number): Promise<StatusChangeResult> {
        const changed = await runInTransaction(async (tx) => {
            await acquireLocks(tx, [userLock(id)]);
            const before = await tx.user.findUnique({ where: { id }, select: { isActive: true, isGroupUser: true, email: true, role: true } });
            if (!before) throw userNotFound();
            assertSuperAdminRule(actor, before.role, null);
            if (before.isActive) return false;
            const email = normalizeUserEmail(before.email);
            if (email && !before.isGroupUser) {
                await acquireLocks(tx, [userEmailLockKey(email)]);
                await assertUserEmailFree(tx, email, id);
            }
            await tx.user.update({ where: { id }, data: { isActive: true, deactivatedAt: null } });
            await audit(tx, actor, id, 'STATUS_CHANGE', { isActive: { from: false, to: true } });
            return true;
        });
        if (changed) await invalidateUserCaches();
        const dto = await loadDto(id);
        if (changed) await reconcileUserQuietly(dto.username, 'user_activated', { actor: actor.username });
        return { ...dto, signedOutSessions: null };
    },

    /**
     * POST /:id/send-invite: emails the user a new one-time set-password link (72 h) and stops their older links. An
     * Invited user gets the invite again ("Resend invite"); an active account gets a password reset link (their current
     * password keeps working until they use it). Audited as INVITE_SENT.
     * 400 for the acting admin's own account (use My Profile) · 400 USER_INACTIVE · 400 NO_EMAIL (field `email`) · 403
     * SUPER_ADMIN_ONLY · 404 · 502 INVITE_EMAIL_FAILED / 503 MAIL_DISABLED with the reason (nothing changes then).
     */
    async sendInvite(actor: AuthUser, id: number): Promise<SendInviteResult> {
        if (id === actor.id) throw HttpError.badRequest('Change your own password from My Profile › Security.');
        const target = await prisma.user.findUnique({
            where: { id },
            select: { id: true, username: true, email: true, firstName: true, fullName: true, role: true, isActive: true, invitePending: true },
        });
        if (!target) throw userNotFound();
        assertSuperAdminRule(actor, target.role, null);
        if (!target.isActive) throw fieldError('Activate this user first: a deactivated account can’t set a password.', StatusCodes.BAD_REQUEST, 'USER_INACTIVE');
        const email = normalizeUserEmail(target.email);
        if (!email) throw fieldError('Add a work email first: the link is sent there.', StatusCodes.BAD_REQUEST, 'NO_EMAIL', 'email');

        const purpose: InvitePurpose = target.invitePending ? 'invite' : 'reset';
        const outcome = await inviteService.send(actor, { ...target, email }, purpose);
        if (outcome.status !== 'sent') throw inviteEmailError(outcome);
        return { user: await loadDto(id), purpose, sentTo: outcome.sentTo, expiresAt: outcome.expiresAt };
    },
};
