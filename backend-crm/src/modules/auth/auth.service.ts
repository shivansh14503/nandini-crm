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
    /**
     * How many of the user's other sessions were signed out, or null when they could not be (Redis unavailable or
     * failing): the password is changed, but the user should sign out other sessions again from My Profile.
     */
    signedOutSessions: number | null;
}

const SESSION_ENDED = 'Your account was not found. Please sign in again.';

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
            throw new HttpError('This account has been deactivated. Contact your administrator.', StatusCodes.FORBIDDEN, {
                code: 'ACCOUNT_INACTIVE',
            });
        }

        await prisma.user.update({
            where: { id: user.id },
            data: {
                lastLoginAt: new Date(),
                ...(needsRehash ? { passwordHash: await hashPassword(credentials.password) } : {}),
            },
        });
        if (needsRehash) logger.info({ userId: user.id }, 'Migrated legacy plain-text password to bcrypt');

        await loginRateLimit.reset(context.ip);

        const authUser: AuthUser = { id: user.id, username: user.username, role: user.role };
        const jti = randomUUID();
        const tracked = await sessionService.create(user.id, jti, context);
        void auditService.enqueue({
            entityType: 'User',
            entityId: String(user.id),
            action: 'LOGIN',
            changedBy: user.username,
            actor: { id: user.id, role: user.role, sessionId: jti },
            changes: { ip: context.ip },
        });

        // The token carries only { id, username, role }; the response user also has the name and photo (as /me).
        return { user: toAuthMeDto(user), token: tokenService.generateToken(authUser, { jti, tracked }) };
    },

    /** GET /api/auth/me: the signed-in user read from the database (name and photo for the navbar). */
    async me(userId: number): Promise<AuthMeDto> {
        const row = await prisma.user.findUnique({ where: { id: userId }, select: AUTH_ME_SELECT });
        if (!row) throw HttpError.unauthorized(SESSION_ENDED);
        return toAuthMeDto(row);
    },

    /**
     * POST /api/auth/change-password (My Profile › Security). Checks the current password (bcrypt or a legacy
     * plain-text row) and the password rules, stores the new bcrypt hash with `passwordChangedAt`, audits
     * PASSWORD_CHANGE (no password in the entry), then signs out every other session of the user, keeping this one.
     */
    async changePassword(user: AuthUser, session: AuthSession, input: ChangePasswordInput): Promise<ChangePasswordResult> {
        const row = await prisma.user.findUnique({
            where: { id: user.id },
            select: { id: true, username: true, passwordHash: true, passwordChangedAt: true },
        });
        if (!row) throw HttpError.unauthorized(SESSION_ENDED);

        const { valid } = await verifyPassword(input.currentPassword, row.passwordHash);
        if (!valid) throw wrongPassword();
        const issue = passwordPolicyIssue(input.newPassword, { username: row.username, currentPassword: input.currentPassword });
        if (issue) {
            throw new HttpError(issue, StatusCodes.BAD_REQUEST, { code: 'WEAK_PASSWORD', errors: [{ message: issue, path: ['newPassword'] }] });
        }

        // Hashed before the transaction: bcrypt takes ~a quarter second and needs no row lock.
        const passwordHash = await hashPassword(input.newPassword);
        const passwordChangedAt = new Date();
        await runInTransaction(async (tx) => {
            // The same per-user lock as profile writes: two concurrent changes from the old password must not both win.
            await acquireLocks(tx, [`user:id:${row.id}`]);
            const current = await tx.user.findUnique({ where: { id: row.id }, select: { passwordHash: true, passwordChangedAt: true } });
            if (!current) throw HttpError.unauthorized(SESSION_ENDED);
            // Changed since it was checked above (another change, or a legacy row rehashed at sign-in): check again.
            if (current.passwordHash !== row.passwordHash && !(await verifyPassword(input.currentPassword, current.passwordHash)).valid) {
                throw wrongPassword();
            }
            await tx.user.update({ where: { id: row.id }, data: { passwordHash, passwordChangedAt } });
            await auditService.record(tx, {
                entityType: 'User',
                entityId: String(row.id),
                action: 'PASSWORD_CHANGE',
                changedBy: row.username,
                changes: { passwordChangedAt: { from: current.passwordChangedAt?.toISOString() ?? null, to: passwordChangedAt.toISOString() } },
            });
        });

        // After the commit: a stolen session must not outlive the password it was opened with. The request's own
        // session stays signed in (untracked sessions aren't in Redis, so there is nothing to keep). null tells the
        // user the others could not be signed out, rather than reporting 0 as if there were none.
        const signedOutSessions = await sessionService.revokeAllExcept(row.id, session.jti);
        return { passwordChangedAt: passwordChangedAt.toISOString(), signedOutSessions };
    },

    async logout(user: AuthUser, session: AuthSession): Promise<void> {
        if (session.tracked) await sessionService.revoke(user.id, session.jti);
        void auditService.enqueue({ entityType: 'User', entityId: String(user.id), action: 'LOGOUT', changedBy: user.username });
    },
};
