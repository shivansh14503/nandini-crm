import { Router, type NextFunction, type Request, type Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { acceptInvite, changePassword, forgotPassword, getMe, login, logout, verifyInvite } from './auth.controller.js';
import { authenticate } from '../../middlewares/authMiddleware.js';
import { createRateLimiter, loginRateLimit } from '../../middlewares/rateLimiter.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import { HttpError } from '../../utils/httpError.js';
import { acceptInviteSchema, changePasswordSchema, forgotPasswordSchema, loginSchema, verifyInviteSchema } from './auth.validator.js';

/**
 * /api/auth   (the older `{ status: 'ok', … }` envelope, except change-password and invite)
 *   POST   /login             { username, password }                    sets the httpOnly cookie → { status, message, user }
 *                             (user as /me) · 401 INVALID_CREDENTIALS · 403 ACCOUNT_INACTIVE
 *                             423 ACCOUNT_LOCKED (too many wrong passwords: 5 in a row lock the account for 15 min,
 *                             accountLockout.ts; refused without checking the password; the message says how long)
 *                             403 INVITE_PENDING (right password, but the account is still Invited: set it from the link)
 *   POST   /logout                                                      clears the cookie, ends the session
 *   GET    /me                → { status, user: { id, username, role, fullName, firstName, lastName, photoUrl } }
 *   POST   /change-password   { currentPassword, newPassword }          → { passwordChangedAt, signedOutSessions }
 *                             400 WRONG_PASSWORD (currentPassword) · 400 WEAK_PASSWORD (newPassword) · 429 after 10 / 15 min
 *   Emailed set-password links (no sign-in needed; 30 requests / 15 min per IP across both, counted always):
 *   POST   /invite/verify     { token }                                → { username, name, purpose: invite|reset, expiresAt }
 *   POST   /invite/accept     { token, newPassword }                   sets the password, burns the link, signs in (cookie)
 *                                                                        → { status, message, user } (as /login)
 *                             400 INVALID_INVITE (unknown, expired, used, revoked or deactivated: one message for all)
 *                             400 WEAK_PASSWORD (newPassword) · 429 RATE_LIMITED
 *   POST   /forgot-password   { identifier }   (username typed on sign-in, or work email)  → 200 { message, sentTo } whether
 *                             or not an account matched (`sentTo` = masked work email, or a stand-in); an active account with a work email is emailed a reset link (as an
 *                             admin's, 72 h, single use; an Invited user gets the invite again). 5 requests / 15 min per
 *                             IP (429 RATE_LIMITED); at most 3 links per account per hour (more are dropped quietly).
 */
const router = Router();

/** Every change-password request counts (right or wrong), per user, so the current password can't be guessed here. */
const changePasswordLimiter = createRateLimiter({
    keyPrefix: 'ratelimit:change-password',
    max: 10,
    windowSeconds: 15 * 60,
    keyGenerator: (req: Request) => (req.user ? `user:${req.user.id}` : `ip:${req.ip ?? 'unknown'}`),
    message: 'Too many password attempts. Please wait a few minutes.',
});

// ── Set-password links ───────────────────────────────────────────────────────

export const INVITE_LIMIT = 30;
export const INVITE_WINDOW_SECONDS = 15 * 60;
const INVITE_LIMIT_MESSAGE = 'Too many attempts. Please wait a few minutes and try again.';

/** In-process counter used while Redis can't count: the public link routes are never unlimited. */
const localInviteHits = new Map<string, { count: number; resetAt: number }>();
export function localInviteLimit(key: string, now: number = Date.now()): { allowed: boolean; retryAfterSeconds: number } {
    const entry = localInviteHits.get(key);
    if (!entry || entry.resetAt <= now) {
        if (localInviteHits.size > 5000) localInviteHits.clear();
        localInviteHits.set(key, { count: 1, resetAt: now + INVITE_WINDOW_SECONDS * 1000 });
        return { allowed: true, retryAfterSeconds: 0 };
    }
    entry.count += 1;
    return { allowed: entry.count <= INVITE_LIMIT, retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) };
}

const inviteLimitKey = (req: Request) => `ip:${req.ip ?? 'unknown'}`;

/** 30 requests / 15 min per IP across verify and accept: Redis when it can count, in-process otherwise. */
const inviteLimiter = createRateLimiter({
    keyPrefix: 'ratelimit:set-password-link',
    max: INVITE_LIMIT,
    windowSeconds: INVITE_WINDOW_SECONDS,
    keyGenerator: inviteLimitKey,
    message: INVITE_LIMIT_MESSAGE,
    fallback: (req: Request, res: Response, next: NextFunction) => {
        const { allowed, retryAfterSeconds } = localInviteLimit(inviteLimitKey(req));
        if (allowed) return next();
        res.setHeader('Retry-After', String(retryAfterSeconds));
        next(new HttpError(INVITE_LIMIT_MESSAGE, StatusCodes.TOO_MANY_REQUESTS, { code: 'RATE_LIMITED' }));
    },
});

// ── Forgot password ──────────────────────────────────────────────────────────

export const FORGOT_LIMIT = 5;
export const FORGOT_WINDOW_SECONDS = 15 * 60;
const FORGOT_LIMIT_MESSAGE = 'Too many reset requests. Please wait a few minutes and try again.';

/** In-process counter used while Redis can't count, as for the link routes. */
const localForgotHits = new Map<string, { count: number; resetAt: number }>();
export function localForgotLimit(key: string, now: number = Date.now()): { allowed: boolean; retryAfterSeconds: number } {
    const entry = localForgotHits.get(key);
    if (!entry || entry.resetAt <= now) {
        if (localForgotHits.size > 5000) localForgotHits.clear();
        localForgotHits.set(key, { count: 1, resetAt: now + FORGOT_WINDOW_SECONDS * 1000 });
        return { allowed: true, retryAfterSeconds: 0 };
    }
    entry.count += 1;
    return { allowed: entry.count <= FORGOT_LIMIT, retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) };
}

/** 5 requests / 15 min per IP: Redis when it can count, in-process otherwise (never unlimited). */
const forgotLimiter = createRateLimiter({
    keyPrefix: 'ratelimit:forgot-password',
    max: FORGOT_LIMIT,
    windowSeconds: FORGOT_WINDOW_SECONDS,
    keyGenerator: inviteLimitKey,
    message: FORGOT_LIMIT_MESSAGE,
    fallback: (req: Request, res: Response, next: NextFunction) => {
        const { allowed, retryAfterSeconds } = localForgotLimit(inviteLimitKey(req));
        if (allowed) return next();
        res.setHeader('Retry-After', String(retryAfterSeconds));
        next(new HttpError(FORGOT_LIMIT_MESSAGE, StatusCodes.TOO_MANY_REQUESTS, { code: 'RATE_LIMITED' }));
    },
});

/** Link answers (and the password typed with them) must never be cached by a browser or proxy. */
const noStore = (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
};

// POST /api/auth/login — failed attempts are rate limited per IP (ratelimit:login:{ip}).
router.post('/login', loginRateLimit.guard, validateRequest({ body: loginSchema }), login);

// POST /api/auth/logout
router.post('/logout', logout);

// GET /api/auth/me
router.get('/me', authenticate, getMe);

// POST /api/auth/change-password — signs out the user's other sessions on success.
router.post('/change-password', authenticate, changePasswordLimiter, validateRequest({ body: changePasswordSchema }), changePassword);

// POST /api/auth/invite/verify — who an emailed link is for.
router.post('/invite/verify', noStore, inviteLimiter, validateRequest({ body: verifyInviteSchema }), verifyInvite);

// POST /api/auth/invite/accept — sets the password from an emailed link and signs in.
router.post('/invite/accept', noStore, inviteLimiter, validateRequest({ body: acceptInviteSchema }), acceptInvite);

// POST /api/auth/forgot-password — "Forgot password?" on the sign-in page (always the same answer).
router.post('/forgot-password', noStore, forgotLimiter, validateRequest({ body: forgotPasswordSchema }), forgotPassword);

export default router;
