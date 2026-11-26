import { Router, type Request, type Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
import { ENV } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { authenticate, readToken, tryVerifyToken } from '../../middlewares/authMiddleware.js';
import { createRateLimiter } from '../../middlewares/rateLimiter.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { requireUser } from '../../utils/requestContext.js';
import { sessionService } from '../auth/session.service.js';
import { CALENDAR_PROVIDERS, OAUTH_COOKIE_NAME, type CalendarProvider } from './connection.constants.js';
import { connectionService } from './connection.service.js';
import { callbackLocation, callbackSessionOf, completeConnect, oauthCookieClearOptions, oauthCookieOptions, startConnect } from './oauth.js';

/**
 * /api/calendar-connections: an employee's own calendar connection (Calendar Phase 2 P2-2; spec §3.3, §3.5, §6.3).
 * Own rows only; tokens never leave the server. Providers stay off until an admin switches one on.
 *
 *   GET  /                            → { ready, providers: [{ provider, label, kind, available, canRevoke }],
 *                                         connections: OwnConnectionDto[], email, publicApiUrl, webhooksActive,
 *                                         syncHours (null until P2-5), syncActive (false until P2-3) }
 *   POST /:provider/start             (google | microsoft | fake) → { authUrl } and the sealed httpOnly cookie crm_oauth
 *                                       (10 min, path /api/calendar-connections/oauth). 503 INTEGRATIONS_NOT_READY,
 *                                       409 PROVIDER_DISABLED, 409 CALENDAR_ALREADY_CONNECTED, 403 FORBIDDEN (shared /
 *                                       inactive login), 400 (fake provider without a company email), 429 RATE_LIMITED.
 *   GET  /oauth/:provider/callback    the provider's redirect (not behind `authenticate`: it checks the session itself).
 *                                       Always 302 to <origin>/profile?tab=connected-accounts&calendar=connected&provider=<key>
 *                                       or …&calendar=error&reason=<fixed code>&provider=<key> (My Profile › Connected
 *                                       accounts); no session (or one that must change its password, the mcp claim) →
 *                                       APP_PUBLIC_URL/login?next=%2Fprofile%3Ftab%3Dconnected-accounts.
 *                                       Clears crm_oauth. Start is behind `authenticate`, so an mcp token gets 403
 *                                       PASSWORD_CHANGE_REQUIRED there.
 *   POST /:id/disconnect              → 204 (own connection; 404 otherwise). Revokes the grant at Google (Microsoft has
 *                                       no per-app revoke: tokens are deleted). Events already in the calendar stay.
 *
 * Planned: POST /sync (P2-5), PATCH /:id { importMeetings } (P2-8).
 */
const router = Router();

const providerParamSchema = z.object({
    provider: z.enum(CALENDAR_PROVIDERS, { error: `provider must be one of: ${CALENDAR_PROVIDERS.join(', ')}.` }),
});
const idParamSchema = z.object({ id: z.string().trim().min(1).max(50) });

/** Connect attempts: 10 a minute per user (each one opens a provider consent screen). */
const startLimiter = createRateLimiter({
    keyPrefix: 'ratelimit:calendar-connect',
    max: 10,
    windowSeconds: 60,
    keyGenerator: (req: Request) => `user:${req.user?.id ?? 'unknown'}`,
    message: 'Too many connect attempts. Wait a minute and try again.',
});

// The provider's redirect: answered with a 302 only, so it sits before `authenticate` (which answers JSON 401).
router.get('/oauth/:provider/callback', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    let location: string;
    try {
        const verified = tryVerifyToken(readToken(req));
        let session = callbackSessionOf(verified);
        if (verified?.tracked && (await sessionService.isActive(verified.id, verified.jti)) === false) session = null;
        location = await completeConnect({
            provider: String(req.params.provider ?? ''),
            query: req.query as Record<string, unknown>,
            cookie: req.cookies?.[OAUTH_COOKIE_NAME],
            session,
        });
    } catch (err) {
        // Still a redirect (never a JSON page in the user's browser), with a fixed reason.
        logger.error({ err: (err as Error).message }, 'Calendar connect callback failed');
        location = callbackLocation(ENV.MAIL.APP_PUBLIC_URL, { ok: false, reason: 'server_error' });
    }
    res.clearCookie(OAUTH_COOKIE_NAME, oauthCookieClearOptions());
    res.redirect(StatusCodes.MOVED_TEMPORARILY, location);
});

router.use(authenticate);

router.get('/', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    sendSuccess(res, await connectionService.listOwn(requireUser(req)));
});

router.post('/:provider/start', validateRequest({ params: providerParamSchema }), startLimiter, async (req: Request, res: Response) => {
    const result = await startConnect(requireUser(req), req.params.provider as CalendarProvider, req.get('origin'));
    res.setHeader('Cache-Control', 'no-store');
    res.cookie(OAUTH_COOKIE_NAME, result.cookie, oauthCookieOptions());
    sendSuccess(res, { authUrl: result.authUrl });
});

router.post('/:id/disconnect', validateRequest({ params: idParamSchema }), async (req: Request, res: Response) => {
    await connectionService.disconnectOwn(String(req.params.id), requireUser(req));
    res.status(StatusCodes.NO_CONTENT).end();
});

export default router;
