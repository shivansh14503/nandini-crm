import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcrypt';
import { StatusCodes } from 'http-status-codes';
import { prisma } from '../../config/prisma.js';
import { logger } from '../../config/logger.js';
import { loginRateLimit } from '../../middlewares/rateLimiter.js';
import { HttpError } from '../../utils/httpError.js';
import { auditService } from '../../services/audit.service.js';
import { sessionService, type SessionMetadata } from './session.service.js';
import { tokenService } from './token.service.js';
import type { LoginInput } from './auth.validator.js';
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
async function verifyPassword(candidate: string, stored: string): Promise<{ valid: boolean; needsRehash: boolean }> {
    if (BCRYPT_HASH_PATTERN.test(stored)) {
        return { valid: await bcrypt.compare(candidate, stored), needsRehash: false };
    }
    const valid = plainTextMatches(candidate, stored);
    return { valid, needsRehash: valid };
}

export interface LoginResult {
    user: AuthUser;
    token: string;
}

export const authService = {
    async loginUser(credentials: LoginInput, context: SessionMetadata = {}): Promise<LoginResult> {
        const user = await prisma.user.findUnique({ where: { username: credentials.username } });

        if (!user) {
            await bcrypt.compare(credentials.password, await dummyHash());
            await loginRateLimit.recordFailure(context.ip);
            throw new HttpError(INVALID_CREDENTIALS, StatusCodes.UNAUTHORIZED, { code: 'INVALID_CREDENTIALS' });
        }

        const { valid, needsRehash } = await verifyPassword(credentials.password, user.passwordHash);
        if (!valid) {
            await loginRateLimit.recordFailure(context.ip);
            // Failures for unknown usernames aren't audited: anyone could flood the log with made-up names.
            void auditService.enqueue({ entityType: 'User', entityId: String(user.id), action: 'LOGIN_FAILED', changedBy: user.username, changes: { ip: context.ip } });
            throw new HttpError(INVALID_CREDENTIALS, StatusCodes.UNAUTHORIZED, { code: 'INVALID_CREDENTIALS' });
        }

        // Only revealed after a correct password, so it doesn't help username enumeration.
        if (!user.isActive) {
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
        void auditService.enqueue({ entityType: 'User', entityId: String(user.id), action: 'LOGIN', changedBy: user.username, changes: { ip: context.ip } });

        return { user: authUser, token: tokenService.generateToken(authUser, { jti, tracked }) };
    },

    async logout(user: AuthUser, session: AuthSession): Promise<void> {
        if (session.tracked) await sessionService.revoke(user.id, session.jti);
        void auditService.enqueue({ entityType: 'User', entityId: String(user.id), action: 'LOGOUT', changedBy: user.username });
    },
};
