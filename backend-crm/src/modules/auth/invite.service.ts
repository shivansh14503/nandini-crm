import { randomUUID } from 'node:crypto';
import { StatusCodes } from 'http-status-codes';
import { ENV } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { prisma, type TransactionClient } from '../../config/prisma.js';
import { auditService } from '../../services/audit.service.js';
import { isMailConfigured, MAIL_DISABLED_MESSAGE, sendMail } from '../../services/mail.service.js';
import type { AuthUser } from '../../types/user.types.js';
import { HttpError } from '../../utils/httpError.js';
import { AUTH_ME_SELECT, toAuthMeDto } from '../profile/profile.dto.js';
import { acquireLocks, runInTransaction } from '../shared/transactions.js';
import { hashPassword, verifyPassword, type LoginResult } from './auth.service.js';
import { formatExpiry, renderSetPasswordEmail } from './inviteEmail.render.js';
import {
    generateInviteToken,
    hashInviteToken,
    INVITE_TTL_MS,
    isInviteUsable,
    isWellFormedToken,
    setPasswordUrl,
    tokenMatchesHash,
    type InvitePurpose,
} from './invite.token.js';
import { LOCKOUT_CLEARED } from './accountLockout.js';
import { passwordPolicyIssue } from './passwordPolicy.js';
import { normalizeUserEmail } from '../users/userEmail.service.js';
import { sessionService, type SessionMetadata } from './session.service.js';
import { tokenService } from './token.service.js';

/**
 * One-time set-password links (docs/system-design.md › Invite links). An admin's action (a new user is added, "Resend
 * invite", "Send password reset link") emails a link to the user's company address; the public set-password page
 * checks it (`verify`) and uses it (`accept`), which sets the password, burns the link and signs the user in.
 *
 * Security: the token (256 random bits) exists only in the email; the database holds its SHA-256, looked up by that and
 * compared in constant time. Every failure of a link (unknown, malformed, expired, used, revoked, the account
 * deactivated) answers the same 400 INVALID_INVITE. Tokens are never logged or audited. The public routes are rate
 * limited per IP (auth.routes.ts).
 */

export const INVALID_INVITE_MESSAGE =
    'This link is no longer valid. It may have expired or already been used. Request a new one with “Forgot password?” on the sign-in page, or ask your administrator.';

export const invalidInvite = () => new HttpError(INVALID_INVITE_MESSAGE, StatusCodes.BAD_REQUEST, { code: 'INVALID_INVITE' });

const userLock = (id: number) => `user:id:${id}`;

/** EmailLog.kind of each purpose. */
const MAIL_KIND: Record<InvitePurpose, string> = { invite: 'user_invite', reset: 'password_reset_link' };

/** Revokes the user's links that still work (a newer one was sent, the email changed, the user was deactivated). */
export async function revokeOutstandingInvites(db: Pick<TransactionClient, 'userInvite'>, userId: number, options: { exceptId?: number; now?: Date } = {}): Promise<number> {
    const { count } = await db.userInvite.updateMany({
        where: { userId, usedAt: null, revokedAt: null, ...(options.exceptId !== undefined ? { id: { not: options.exceptId } } : {}) },
        data: { revokedAt: options.now ?? new Date() },
    });
    return count;
}

export interface InviteRecipient {
    id: number;
    username: string;
    email: string;
    firstName: string | null;
    fullName: string;
}

export type InviteSendOutcome =
    | { status: 'sent'; purpose: InvitePurpose; sentTo: string; expiresAt: string }
    /** `mail_disabled`: outgoing email is turned off on the server; `failed`: the SMTP send (or saving the link) failed. */
    | { status: 'failed' | 'mail_disabled'; purpose: InvitePurpose; sentTo: string; error: string };

export interface InviteCheck {
    username: string;
    /** First name, else the username (the page greets them). */
    name: string;
    purpose: InvitePurpose;
    expiresAt: string;
}

/** The link's row when it still works for an active user; INVALID_INVITE otherwise (always the same answer). */
async function findUsable(token: unknown, now: Date) {
    if (!isWellFormedToken(token)) throw invalidInvite();
    const row = await prisma.userInvite.findUnique({
        where: { tokenHash: hashInviteToken(token) },
        select: {
            id: true,
            tokenHash: true,
            purpose: true,
            expiresAt: true,
            usedAt: true,
            revokedAt: true,
            user: { select: { id: true, username: true, firstName: true, fullName: true, role: true, isActive: true, passwordHash: true } },
        },
    });
    if (!row || !tokenMatchesHash(token, row.tokenHash) || !isInviteUsable(row, now) || !row.user.isActive) throw invalidInvite();
    return row;
}

/** The mail calls, behind an object so tests can stand in for SMTP. */
export const inviteMail = { sendMail, isMailConfigured };

export interface SendOptions {
    /**
     * The user asked for it themselves ("Forgot password?" on the sign-in page): the email says they asked for it
     * (no admin's name) and the audit entry says `requestedBy: 'self'` with the address it came from.
     */
    selfService?: boolean;
    ip?: string;
}

/** Self-service links a user may request in this many minutes before further requests are quietly dropped. */
export const SELF_SERVICE_LIMIT = 3;
export const SELF_SERVICE_WINDOW_MINUTES = 60;

const purposeOf = (value: string): InvitePurpose => (value === 'reset' ? 'reset' : 'invite');

export const inviteService = {
    /**
     * Creates a link for `user` and emails it. Never throws for a send that fails: the outcome says so (the caller
     * shows the admin the reason). On success the user's older links stop working; on failure the new link is
     * dropped and the older ones are left as they were. Audited as INVITE_SENT (purpose, expiry, email outcome).
     */
    async send(actor: AuthUser, user: InviteRecipient, purpose: InvitePurpose, now: Date = new Date(), options: SendOptions = {}): Promise<InviteSendOutcome> {
        const sentTo = user.email;
        const selfService = options.selfService === true;
        const auditSend = (email: 'sent' | 'failed' | 'skipped', expiresAt?: Date) =>
            void auditService.enqueue({
                entityType: 'User',
                entityId: String(user.id),
                action: 'INVITE_SENT',
                changedBy: actor.username,
                // A self-service request has no signed-in request behind it: say who it was for.
                ...(selfService ? { actor: { id: actor.id, role: actor.role } } : {}),
                changes: { purpose, email, ...(selfService ? { requestedBy: 'self', ip: options.ip } : {}), ...(expiresAt ? { expiresAt: expiresAt.toISOString() } : {}) },
            });

        if (!inviteMail.isMailConfigured()) {
            auditSend('skipped');
            return { status: 'mail_disabled', purpose, sentTo, error: MAIL_DISABLED_MESSAGE };
        }

        const token = generateInviteToken();
        const expiresAt = new Date(now.getTime() + INVITE_TTL_MS);
        let inviteId: number;
        try {
            const created = await prisma.userInvite.create({
                data: { userId: user.id, tokenHash: hashInviteToken(token), purpose, expiresAt, createdAt: now, createdBy: actor.username },
                select: { id: true },
            });
            inviteId = created.id;
        } catch (err) {
            logger.error({ err: (err as Error).message, userId: user.id }, 'Could not save a set-password link');
            auditSend('failed');
            return { status: 'failed', purpose, sentTo, error: 'The link could not be saved. Please try again.' };
        }

        const admin = selfService ? null : await prisma.user.findUnique({ where: { id: actor.id }, select: { fullName: true } }).catch(() => null);
        const email = renderSetPasswordEmail({
            purpose,
            recipientName: user.firstName?.trim() || user.fullName.trim().split(/\s+/)[0] || user.username,
            username: user.username,
            url: setPasswordUrl(ENV.MAIL.APP_PUBLIC_URL, token),
            expiresLabel: formatExpiry(expiresAt, ENV.BUSINESS_TIMEZONE),
            sentBy: admin?.fullName?.trim() || null,
            requestedBySelf: selfService,
        });
        // A one-off send (unique dedupe key): EmailLog keeps the subject and recipient, never the body (or the link).
        const result = await inviteMail.sendMail({
            to: sentTo,
            toUsername: user.username,
            subject: email.subject,
            html: email.html,
            text: email.text,
            kind: MAIL_KIND[purpose],
            dedupeKey: `${MAIL_KIND[purpose]}:${user.id}:${randomUUID()}`,
        });

        if (result.status === 'sent') {
            // Only the newest link works. `id < new` so two sends at once leave the later one standing.
            await prisma.userInvite
                .updateMany({ where: { userId: user.id, usedAt: null, revokedAt: null, id: { lt: inviteId } }, data: { revokedAt: new Date() } })
                .catch((err: Error) => logger.warn({ err: err.message, userId: user.id }, 'Older set-password links could not be revoked'));
            auditSend('sent', expiresAt);
            return { status: 'sent', purpose, sentTo, expiresAt: expiresAt.toISOString() };
        }

        await prisma.userInvite.delete({ where: { id: inviteId } }).catch((err: Error) => {
            logger.warn({ err: err.message, userId: user.id }, 'An unsent set-password link could not be removed');
        });
        auditSend(result.status === 'skipped' ? 'skipped' : 'failed');
        if (result.status === 'skipped') return { status: 'mail_disabled', purpose, sentTo, error: MAIL_DISABLED_MESSAGE };
        return { status: 'failed', purpose, sentTo, error: result.error ?? 'The mail server did not accept the email.' };
    },

    /**
     * POST /api/auth/forgot-password ("Forgot password?" on the sign-in page). Finds the account by username or work
     * email and emails it a password reset link (the same single-use, 72 hour link an admin sends; an Invited user gets
     * their invite again). Answers nothing: the route says the same thing whatever happens, so nobody can learn which
     * usernames or emails exist. Sent only to an active account that has a work email; an email address must belong to
     * exactly one active person (a shared group login is reached by its username). At most `SELF_SERVICE_LIMIT`
     * self-service links per account per `SELF_SERVICE_WINDOW_MINUTES` (counted from UserInvites, so it holds without
     * Redis); more are dropped quietly. The route limits requests per address too.
     */
    async requestPasswordReset(identifier: string, context: { ip?: string } = {}, now: Date = new Date()): Promise<'sent' | 'skipped'> {
        const value = identifier.trim();
        if (!value) return 'skipped';
        const select = { id: true, username: true, email: true, firstName: true, fullName: true, role: true, isActive: true, invitePending: true } as const;
        let user;
        if (value.includes('@')) {
            const email = normalizeUserEmail(value);
            if (!email) return 'skipped';
            const found = await prisma.user.findMany({ where: { email, isActive: true, isGroupUser: false }, select, take: 2 });
            if (found.length !== 1) return 'skipped';
            user = found[0];
        } else {
            user = await prisma.user.findUnique({ where: { username: value }, select });
        }
        if (!user || !user.isActive) return 'skipped';
        const email = normalizeUserEmail(user.email);
        if (!email) return 'skipped';

        const recent = await prisma.userInvite.count({
            where: { userId: user.id, createdBy: user.username, createdAt: { gt: new Date(now.getTime() - SELF_SERVICE_WINDOW_MINUTES * 60_000) } },
        });
        if (recent >= SELF_SERVICE_LIMIT) {
            logger.info({ userId: user.id }, 'Forgot password: too many self-service links requested; not sent');
            return 'skipped';
        }

        const purpose: InvitePurpose = user.invitePending ? 'invite' : 'reset';
        const outcome = await inviteService.send({ id: user.id, username: user.username, role: user.role }, { ...user, email }, purpose, now, {
            selfService: true,
            ip: context.ip,
        });
        if (outcome.status !== 'sent') logger.warn({ userId: user.id, status: outcome.status }, 'Forgot password: the reset email could not be sent');
        return outcome.status === 'sent' ? 'sent' : 'skipped';
    },

    /** POST /api/auth/invite/verify: who the link is for, so the page can greet them. 400 INVALID_INVITE otherwise. */
    async verify(token: unknown, now: Date = new Date()): Promise<InviteCheck> {
        const row = await findUsable(token, now);
        return {
            username: row.user.username,
            name: row.user.firstName?.trim() || row.user.username,
            purpose: purposeOf(row.purpose),
            expiresAt: row.expiresAt.toISOString(),
        };
    },

    /**
     * POST /api/auth/invite/accept: sets the password (the same rules as everywhere else), burns the link (and every
     * other link of the user), clears "Invited", signs out every session of the user and opens a new one, as a sign-in
     * does. Audited as PASSWORD_SET and LOGIN. 400 INVALID_INVITE · 400 WEAK_PASSWORD (field `newPassword`).
     */
    async accept(token: unknown, newPassword: string, context: SessionMetadata = {}): Promise<LoginResult> {
        const now = new Date();
        const row = await findUsable(token, now);
        const purpose = purposeOf(row.purpose);
        const user = row.user;

        const issue =
            passwordPolicyIssue(newPassword, { username: user.username }) ??
            // A reset keeps the rule of My Profile: the new password differs from the current one.
            (purpose === 'reset' && (await verifyPassword(newPassword, user.passwordHash)).valid
                ? 'New password must be different from your current password.'
                : null);
        if (issue) {
            throw new HttpError(issue, StatusCodes.BAD_REQUEST, { code: 'WEAK_PASSWORD', errors: [{ message: issue, path: ['newPassword'] }] });
        }

        // Hashed before the transaction: bcrypt takes ~a quarter second and needs no lock.
        const passwordHash = await hashPassword(newPassword);
        const passwordChangedAt = new Date();
        await runInTransaction(async (tx) => {
            await acquireLocks(tx, [userLock(user.id)]);
            // Single use: only the request that flips usedAt goes on (two tabs, a double click).
            const burned = await tx.userInvite.updateMany({
                where: { id: row.id, usedAt: null, revokedAt: null, expiresAt: { gt: now } },
                data: { usedAt: passwordChangedAt },
            });
            if (burned.count !== 1) throw invalidInvite();
            const current = await tx.user.findUnique({ where: { id: user.id }, select: { isActive: true } });
            if (!current?.isActive) throw invalidInvite();
            await revokeOutstandingInvites(tx, user.id, { exceptId: row.id, now: passwordChangedAt });
            // A new password also ends any lockout (the account may have been locked by the guesses that prompted it).
            await tx.user.update({ where: { id: user.id }, data: { passwordHash, passwordChangedAt, invitePending: false, ...LOCKOUT_CLEARED } });
            await auditService.record(tx, {
                entityType: 'User',
                entityId: String(user.id),
                action: 'PASSWORD_SET',
                changedBy: user.username,
                actor: { id: user.id, role: user.role },
                changes: { purpose, passwordChangedAt: passwordChangedAt.toISOString() },
            });
        });

        // After the commit: no session opened with the old password outlives it. Then sign in here, as POST /login does.
        await sessionService.revokeAll(user.id);
        const jti = randomUUID();
        const tracked = await sessionService.create(user.id, jti, context);
        const me = await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() }, select: AUTH_ME_SELECT });
        void auditService.enqueue({
            entityType: 'User',
            entityId: String(user.id),
            action: 'LOGIN',
            changedBy: user.username,
            actor: { id: user.id, role: me.role, sessionId: jti },
            changes: { ip: context.ip, via: 'set_password_link' },
        });
        return { user: toAuthMeDto(me), token: tokenService.generateToken({ id: me.id, username: me.username, role: me.role }, { jti, tracked }) };
    },
};
