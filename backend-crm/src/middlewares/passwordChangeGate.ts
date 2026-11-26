import { StatusCodes } from 'http-status-codes';
import { HttpError } from '../utils/httpError.js';

/**
 * While a user must change their password (a new user, or after an admin reset: the JWT's `mcp` claim), the API
 * answers only what the change-password screen needs. Everything else is refused with 403 PASSWORD_CHANGE_REQUIRED,
 * which the frontend turns into a redirect to My Profile › Security. Pure (no Express or database), unit tested.
 */

interface AllowedRoute {
    method: string;
    /** Matched against the whole path (no query string), lower-cased, without a trailing slash. */
    path: RegExp;
}

export const PASSWORD_CHANGE_ALLOWED_ROUTES: readonly AllowedRoute[] = [
    { method: 'GET', path: /^\/api\/auth\/me$/ },
    { method: 'POST', path: /^\/api\/auth\/logout$/ },
    { method: 'POST', path: /^\/api\/auth\/change-password$/ },
    { method: 'GET', path: /^\/api\/me\/profile$/ },
    { method: 'GET', path: /^\/api\/me\/sessions$/ },
    // One path segment of id characters only (a photo id), never a way into another router.
    { method: 'GET', path: /^\/api\/user-photos\/[0-9a-z-]+$/ },
];

/**
 * The request path as routes are matched: no query string, lower-cased (Express routing is case-insensitive), without
 * a trailing slash. Paths with dot segments are returned as-is and so never match the allow-list.
 */
export function gatePath(originalUrl: string): string {
    const path = originalUrl.split('?')[0].split('#')[0].toLowerCase();
    return path.length > 1 ? path.replace(/\/+$/, '') : path;
}

/** Whether a user who must change their password may make this request. HEAD counts as GET. */
export function isAllowedWhilePasswordChangeRequired(method: string, originalUrl: string): boolean {
    const verb = method.toUpperCase() === 'HEAD' ? 'GET' : method.toUpperCase();
    const path = gatePath(originalUrl);
    return PASSWORD_CHANGE_ALLOWED_ROUTES.some((route) => route.method === verb && route.path.test(path));
}

export const passwordChangeRequired = () =>
    new HttpError('Change your password to continue.', StatusCodes.FORBIDDEN, { code: 'PASSWORD_CHANGE_REQUIRED' });

/**
 * What GET /api/auth/me reports as `mustChangePassword`: the stored flag, or the session's own `mcp` claim. The gate above
 * reads only the claim, so a session that still carries it (its password was changed on another device while Redis was
 * down, so it could not be signed out) must stay locked in the UI too, rather than unlock and then hit 403 on every
 * call. Such a session gets out by changing the password again or by signing in again.
 */
export function effectiveMustChangePassword(stored: boolean, sessionClaim: boolean): boolean {
    return stored || sessionClaim;
}
