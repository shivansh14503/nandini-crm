import type { NextFunction, Request, Response } from 'express';
import { ENV } from '../config/env.js';
import { sessionService } from '../modules/auth/session.service.js';
import { tokenService, type VerifiedToken } from '../modules/auth/token.service.js';
import { HttpError } from '../utils/httpError.js';

/** Reads the session token from the auth cookie, falling back to an `Authorization: Bearer` header. */
export function readToken(req: Request): string | undefined {
    const fromCookie: unknown = req.cookies?.[ENV.COOKIE.NAME];
    if (typeof fromCookie === 'string' && fromCookie) return fromCookie;
    return req.headers.authorization?.replace(/^Bearer\s+/i, '') || undefined;
}

/** Verifies a token without throwing; returns undefined if it is missing, invalid or expired. */
export function tryVerifyToken(token: string | undefined): VerifiedToken | undefined {
    if (!token) return undefined;
    try {
        return tokenService.verifyToken(token);
    } catch {
        return undefined;
    }
}

/**
 * Requires a valid session: verifies the JWT, then (for tracked sessions) checks Redis that it hasn't been
 * revoked. If Redis is unreachable the signed, unexpired JWT is trusted so an outage doesn't log everyone out.
 */
export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const token = readToken(req);
    if (!token) return next(HttpError.unauthorized());

    const verified = tryVerifyToken(token);
    if (!verified) return next(HttpError.unauthorized('Invalid or expired session token'));

    if (verified.tracked && (await sessionService.isActive(verified.id, verified.jti)) === false) {
        return next(HttpError.unauthorized('Your session has ended. Please sign in again.'));
    }

    req.user = { id: verified.id, username: verified.username, role: verified.role };
    req.auth = { jti: verified.jti, tracked: verified.tracked };
    next();
}

/** Restricts a route to the given roles (case-insensitive). Use after `authenticate`. */
export function requireRole(...roles: string[]) {
    const allowed = new Set(roles.map((role) => role.toLowerCase()));
    return (req: Request, _res: Response, next: NextFunction): void => {
        if (!req.user) return next(HttpError.unauthorized());
        if (!allowed.has(req.user.role.toLowerCase())) return next(HttpError.forbidden());
        next();
    };
}
