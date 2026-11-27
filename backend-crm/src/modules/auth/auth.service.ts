import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcrypt';
import { StatusCodes } from 'http-status-codes';
import { prisma } from '../../config/prisma.js';
import { logger } from '../../config/logger.js';
import { loginRateLimit } from '../../middlewares/rateLimiter.js';
import { HttpError } from '../../utils/httpError.js';
import { auditService } from '../../services/audit.service.js';
import { acquireLocks, runInTransaction } from '../shared/transactions.js';
import { AUTH_ME_SELECT, toAuthMeDto, type AuthMeDto } from '../profile/profile.dto.js';
import { passwordPolicyIssue } from './passwordPolicy.js';
import { sessionService, type SessionMetadata } from './session.service.js';
import { tokenService } from './token.service.js';
import type { ChangePasswordInput, LoginInput } from './auth.validator.js';
import type { AuthSession, AuthUser } from '../../types/user.types.js';

const BCRYPT_ROUNDS = 12;
const BCRYPT_HASH_PATTERN = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;
const INVALID_CREDENTIALS = 'Invalid username or password';

// Compared against when the username doesn't exist, so response time doesn't reveal which usernames are valid.
let dummyHashPromise: Promise<string> | undefined;
const dummyHash = () => (dummyHashPromise ??= bcrypt.hash(randomUUID(), BCRYPT_ROUNDS));

export function hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

/** Constant-time comparison for legacy plain-text passwords (hashing first equalizes the lengths). */
function plainTextMatches(candidate: string, stored: string): boolean {
    const a = createHash('sha256').update(candidate).digest();
    const b = createHash('sha256').update(stored).digest();
    return timingSafeEqual(a, b);
}

/** Checks a password against the stored value; `needsRehash` flags legacy plain-text rows to migrate to bcrypt. */
export async function verifyPassword(candidate: string, stored: string): Promise<{ valid: boolean; needsRehash: boolean }> {
    if (BCRYPT_HASH_PATTERN.test(stored)) {
        return { valid: await bcrypt.compare(candidate, stored), needsRehash: false };
    }
    const valid = plainTextMatches(candidate, stored);
    return { valid, needsRehash: valid };
}

export interface LoginResult {
    /** The same shape as GET /api/auth/me, so the navbar shows the name and photo right after sign-in. */
    user: AuthMeDto;
    token: string;
}

export interface ChangePasswordResult {
    passwordChangedAt: string;
    /** Always false after a change: a temporary password (new user, admin reset) has now been replaced. */
    mustChangePassword: false;
    /**
     * How many of the user's other sessions were signed out, or null when they could not be (Redis unavailable or
     * failing): the password is changed, but the user should sign out other sessions again from My Profile.
     */
    signedOutSessions: number | null;
}

export interface ChangePasswordOutcome {
    result: ChangePasswordResult;
    /**
     * A re-issued token for the same session (same jti) without the `mcp` claim, when the session or the account was
     * flagged to change its password; the controller sets it as the auth cookie. Undefined otherwise.
     */
    token?: string;
}

const SESSION_ENDED = 'Your account was not found. Please sign in again.';

const accountInactive = () =>
    new HttpError('This account has been deactivated. Contact your administrator.', StatusCodes.FORBIDDEN, { code: 'ACCOUNT_INACTIVE' });

const currentPasswordRequired = () => {
    const message = 'Current password is required.';
    return new HttpError(message, StatusCodes.BAD_REQUEST, { code: 'VALIDATION_ERROR', errors: [{ message, path: ['currentPassword'] }] });
};

const wrongPassword = () => {
    const message = 'Current password is incorrect.';
    return new HttpError(message, StatusCodes.BAD_REQUEST, { code: 'WRONG_PASSWORD', errors: [{ message, path: ['currentPassword'] }] });
};

export const authService = {
    async loginUser(credentials: LoginInput, context: SessionMetadata = {}): Promise<LoginResult> {
        const user = await prisma.user.findUnique({ where: { username: credentials.username }, include: { photo: { select: { id: true } } } });

        if (!user) {
            await bcrypt.compare(credentials.password, await dummyHash());
            await loginRateLimit.recordFailure(context.ip);
            throw new HttpError(INVALID_CREDENTIALS, StatusCodes.UNAUTHORIZED, { code: 'INVALID_CREDENTIALS' });
        }

        const { valid, needsRehash } = await verifyPassword(credentials.password, user.passwordHash);
        if (!valid) {
            await loginRateLimit.recordFailure(context.ip);
            // Failures for unknown usernames aren't audited: anyone could flood the log with made-up names.
            void auditService.enqueue({
                entityType: 'User',
                entityId: String(user.id),
                action: 'LOGIN_FAILED',
                changedBy: user.username,
                actor: { id: user.id, role: user.role },
                changes: { ip: context.ip, reason: 'Wrong password' },
            });
            throw new HttpError(INVALID_CREDENTIALS, StatusCodes.UNAUTHORIZED, { code: 'INVALID_CREDENTIALS' });
        }

        // Only revealed after a correct password, so it doesn't help username enumeration.
        if (!user.isActive) {
            void auditService.enqueue({
                entityType: 'User',
                entityId: String(user.id),
                action: 'LOGIN_FAILED',
                changedBy: user.username,
                actor: { id: user.id, role: user.role },
                changes: { ip: context.ip, reason: 'Account deactivated' },
            });
            throw accountInactive();
        }

        const rehashed = needsRehash ? await hashPassword(credentials.password) : null;
        await prisma.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date(), ...(rehashed ? { passwordHash: rehashed } : {}) },
        });
        if (needsRehash) logger.info({ userId: user.id }, 'Migrated legacy plain-text password to bcrypt');

        await loginRateLimit.reset(context.ip);

        const authUser: AuthUser = { id: user.id, username: user.username, role: user.role };
        const jti = randomUUID();
        const tracked = await sessionService.create(user.id, jti, context);
        // Read again after the session exists: an admin deactivation or password reset that committed while the password
        // was being checked ran its revokeAll before this session was recorded, so it is caught here instead. One that
        // commits after this read revokes the session itself (its revokeAll runs after its commit).
        const fresh = await prisma.user.findUnique({ where: { id: user.id }, select: { isActive: true, mustChangePassword: true, passwordHash: true } });
        if (!fresh || !fresh.isActive || fresh.passwordHash !== (rehashed ?? user.passwordHash)) {
            if (tracked) await sessionService.revoke(user.id, jti);
            if (fresh && !fresh.isActive) throw accountInactive();
            throw new HttpError(INVALID_CREDENTIALS, StatusCodes.UNAUTHORIZED, { code: 'INVALID_CREDENTIALS' });
        }
        // A new user or one an admin reset: the token carries `mcp`, so only the change-password screen works.
        const mustChangePassword = fresh.mustChangePassword;
        void auditService.enqueue({
            entityType: 'User',
            entityId: String(user.id),
            action: 'LOGIN',
            changedBy: user.username,
            actor: { id: user.id, role: user.role, sessionId: jti },
            changes: { ip: context.ip },
        });

        // The token carries only { id, username, role }; the response user also has the name and photo (as /me).
        return { user: toAuthMeDto({ ...user, mustChangePassword }), token: tokenService.generateToken(authUser, { jti, tracked, mustChangePassword }) };
    },

    /** GET /api/auth/me: the signed-in user read from the database (name and photo for the navbar). */
    async me(userId: number): Promise<AuthMeDto> {
        const row = await prisma.user.findUnique({ where: { id: userId }, select: AUTH_ME_SELECT });
        if (!row) throw HttpError.unauthorized(SESSION_ENDED);
        return toAuthMeDto(row);
    },

    /**
     * POST /api/auth/change-password (My Profile › Security). Checks the current password (not asked for on the
     * first-login / forced change, when the session's `mcp` claim and the stored flag are both set) (bcrypt or a legacy
     * plain-text row) and the password rules, stores the new bcrypt hash with `passwordChangedAt`, audits
     * PASSWORD_CHANGE (no password in the entry), then signs out every other session of the user, keeping this one.
     * Also clears `mustChangePassword` (same transaction); when it or the session's `mcp` claim was set, a token for the
     * same session without the claim is returned for the cookie, and the session's Redis expiry restarts with it.
     * 403 ACCOUNT_INACTIVE for a deactivated user (nothing is changed and no token is issued).
     */
    async changePassword(user: AuthUser, session: AuthSession, input: ChangePasswordInput): Promise<ChangePasswordOutcome> {
        const row = await prisma.user.findUnique({
            where: { id: user.id },
            select: { id: true, username: true, role: true, isActive: true, passwordHash: true, passwordChangedAt: true, mustChangePassword: true },
        });
        if (!row) throw HttpError.unauthorized(SESSION_ENDED);
        // A deactivated user whose session outlived the deactivation (Redis down, an untracked token) must not change the
        // password, nor get the fresh token below.
        if (!row.isActive) throw accountInactive();

        // First login / forced change: this session was opened moments ago with the temporary password (its token carries
        // `mcp`) and the account is still flagged, so the temporary password isn't asked for again. Anywhere else the
        // current password is required.
        const forced = session.mustChangePassword && row.mustChangePassword;
        const currentPassword = input.currentPassword ?? '';
        if (!forced || currentPassword !== '') {
            if (currentPassword === '') throw currentPasswordRequired();
            const { valid } = await verifyPassword(currentPassword, row.passwordHash);
            if (!valid) throw wrongPassword();
        }
        const issue =
            passwordPolicyIssue(input.newPassword, { username: row.username, currentPassword }) ??
            // Without a typed current password, "different from the current one" is checked against the stored hash.
            (currentPassword === '' && (await verifyPassword(input.newPassword, row.passwordHash)).valid
                ? 'New password must be different from your temporary password.'
                : null);
        if (issue) {
            throw new HttpError(issue, StatusCodes.BAD_REQUEST, { code: 'WEAK_PASSWORD', errors: [{ message: issue, path: ['newPassword'] }] });
        }

        // Hashed before the transaction: bcrypt takes ~a quarter second and needs no row lock.
        const passwordHash = await hashPassword(input.newPassword);
        const passwordChangedAt = new Date();
        const wasRequired = await runInTransaction(async (tx) => {
            // The same per-user lock as profile writes: two concurrent changes from the old password must not both win.
            await acquireLocks(tx, [`user:id:${row.id}`]);
            const current = await tx.user.findUnique({
                where: { id: row.id },
                select: { isActive: true, passwordHash: true, passwordChangedAt: true, mustChangePassword: true },
            });
            if (!current) throw HttpError.unauthorized(SESSION_ENDED);
            if (!current.isActive) throw accountInactive();
            // Changed since it was checked above (another change, or a legacy row rehashed at sign-in): check again.
            if (current.passwordHash !== row.passwordHash && (currentPassword === '' || !(await verifyPassword(currentPassword, current.passwordHash)).valid)) {
                throw wrongPassword();
            }
            await tx.user.update({ where: { id: row.id }, data: { passwordHash, passwordChangedAt, mustChangePassword: false } });
            await auditService.record(tx, {
                entityType: 'User',
                entityId: String(row.id),
                action: 'PASSWORD_CHANGE',
                changedBy: row.username,
                changes: {
                    passwordChangedAt: { from: current.passwordChangedAt?.toISOString() ?? null, to: passwordChangedAt.toISOString() },
                    // Not `mustChangePassword`: keys ending in "Password" are redacted from audit entries.
                    ...(current.mustChangePassword ? { passwordChangeRequired: { from: true, to: false } } : {}),
                },
            });
            return current.mustChangePassword;
        });

        // After the commit: a stolen session must not outlive the password it was opened with. The request's own
        // session stays signed in (untracked sessions aren't in Redis, so there is nothing to keep). null tells the
        // user the others could not be signed out, rather than reporting 0 as if there were none.
        const signedOutSessions = await sessionService.revokeAllExcept(row.id, session.jti);
        const result: ChangePasswordResult = { passwordChangedAt: passwordChangedAt.toISOString(), mustChangePassword: false, signedOutSessions };
        if (!wasRequired && !session.mustChangePassword) return { result };

        // Same jti (so the Redis session and My Profile's "this device" stay the same), no `mcp`, the current role.
        if (session.tracked) await sessionService.refresh(row.id, session.jti);
        const token = tokenService.generateToken({ id: row.id, username: row.username, role: row.role }, { jti: session.jti, tracked: session.tracked });
        return { result, token };
    },

    async logout(user: AuthUser, session: AuthSession): Promise<void> {
        if (session.tracked) await sessionService.revoke(user.id, session.jti);
        void auditService.enqueue({ entityType: 'User', entityId: String(user.id), action: 'LOGOUT', changedBy: user.username });
    },
};
