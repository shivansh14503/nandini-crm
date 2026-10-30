import type { Request } from 'express';

/** The signed-in user as returned to the frontend (`User` in frontend-crm/src/types/auth.types.ts). */
export interface AuthUser {
    id: number;
    username: string;
    role: string;
}

/** Session identity carried by the JWT, used for Redis-backed revocation. */
export interface AuthSession {
    /** JWT id; the Redis session key is `session:{userId}:{jti}`. */
    jti: string;
    /** False when Redis was down at login, so the session could not be recorded (and can't be revoked early). */
    tracked: boolean;
}

declare global {
    namespace Express {
        interface Request {
            /** Set by the `authenticate` middleware. */
            user?: AuthUser;
            auth?: AuthSession;
        }
    }
}

/** @deprecated `Request` now carries `user` / `auth` directly; kept so existing imports compile. */
export type AuthenticatedRequest = Request;
