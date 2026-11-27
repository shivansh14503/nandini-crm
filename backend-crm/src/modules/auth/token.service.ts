import jwt from 'jsonwebtoken';
import { ENV } from '../../config/env.js';
import type { AuthSession, AuthUser } from '../../types/user.types.js';

const ALGORITHM = 'HS256';

export interface VerifiedToken extends AuthUser, AuthSession {}

export const tokenService = {
    generateToken(user: AuthUser, session: AuthSession): string {
        return jwt.sign({ id: user.id, username: user.username, role: user.role, tracked: session.tracked }, ENV.JWT_SECRET, {
            algorithm: ALGORITHM,
            expiresIn: ENV.SESSION_TTL_SECONDS,
            jwtid: session.jti,
        });
    },

    /**
     * Verifies signature, algorithm and expiry, then checks the claims have the expected shape. Throws on any failure.
     * A token with the retired `mcp` claim (a session opened with a temporary password, before those were replaced by
     * emailed set-password links) is refused: it was never allowed past the change-password screen.
     */
    verifyToken(token: string): VerifiedToken {
        const payload = jwt.verify(token, ENV.JWT_SECRET, { algorithms: [ALGORITHM] });
        if (
            typeof payload !== 'object' ||
            typeof payload.id !== 'number' ||
            typeof payload.username !== 'string' ||
            typeof payload.role !== 'string' ||
            typeof payload.jti !== 'string'
        ) {
            throw new Error('Malformed token payload');
        }
        if ('mcp' in payload) throw new Error('Retired must-change-password session');
        return { id: payload.id, username: payload.username, role: payload.role, jti: payload.jti, tracked: payload.tracked === true };
    },
};
