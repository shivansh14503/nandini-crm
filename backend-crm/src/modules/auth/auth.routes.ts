import { Router, type Request } from 'express';
import { changePassword, getMe, login, logout } from './auth.controller.js';
import { authenticate } from '../../middlewares/authMiddleware.js';
import { createRateLimiter, loginRateLimit } from '../../middlewares/rateLimiter.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import { changePasswordSchema, loginSchema } from './auth.validator.js';

/**
 * /api/auth   (the older `{ status: 'ok', … }` envelope, except change-password)
 *   POST   /login             { username, password }                    sets the httpOnly cookie → { status, message, user }
 *                             (user as /me; mustChangePassword → the token carries `mcp`, see middlewares/passwordChangeGate.ts)
 *   POST   /logout                                                      clears the cookie, ends the session
 *   GET    /me                → { status, user: { id, username, role, fullName, firstName, lastName, photoUrl, mustChangePassword } }
 *   POST   /change-password   { currentPassword, newPassword }          → { passwordChangedAt, mustChangePassword: false, signedOutSessions }
 *                             clears mustChangePassword and re-issues the cookie (same session) without `mcp`
 *                             400 WRONG_PASSWORD (currentPassword) · 400 WEAK_PASSWORD (newPassword) · 429 after 10 / 15 min
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

// POST /api/auth/login — failed attempts are rate limited per IP (ratelimit:login:{ip}).
router.post('/login', loginRateLimit.guard, validateRequest({ body: loginSchema }), login);

// POST /api/auth/logout
router.post('/logout', logout);

// GET /api/auth/me
router.get('/me', authenticate, getMe);

// POST /api/auth/change-password — signs out the user's other sessions on success.
router.post('/change-password', authenticate, changePasswordLimiter, validateRequest({ body: changePasswordSchema }), changePassword);

export default router;
