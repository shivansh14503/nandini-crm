import { Router, type NextFunction, type Request, type Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { authenticate, requireRole } from '../../middlewares/authMiddleware.js';
import { createRateLimiter } from '../../middlewares/rateLimiter.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { HttpError } from '../../utils/httpError.js';
import { requireUser } from '../../utils/requestContext.js';
import { FORM_CONFIG_ADMIN_ROLES } from '../form-configs/formConfig.routes.js';
import { emailLogService } from './emailLog.service.js';
import { usernameParamSchema } from './emailLog.validator.js';

/**
 * /api/admin/email-logging (Admin › API Integrations › Email logging and the People dialog; admin roles only).
 *
 *   GET    /                              → { settings, serverEnabled, pollMinutes, scopes { google, googleAdminConsole,
 *                                            microsoft }, providers [{ provider, label, problem { code, message, at } | null,
 *                                            people, mailboxes { ok, error } }], counts { people, emails } }
 *   PUT    /settings                      { enabled?, defaultForPeople? on|off, visibility? restricted|record,
 *                                            retentionMonths? 6|12|24|36, storeSnippets? } → settings
 *                                            (ModuleSetting activities/emailLogging, audited)
 *   GET    /people/:username              → { username, fullName, mode on|off|null, effective, companyDefault, logging,
 *                                            reason, mailbox { provider, accountEmail, status, errorLevel, lastErrorCode,
 *                                            lastErrorMessage, lastRunAt, lastSuccessAt, nextRunAt, loggedCount, purgedAt }
 *                                            | null, copies }
 *   PUT    /people/:username              { mode: on|off|null } → person (audited LoggedEmailMailbox CREATE / UPDATE)
 *   POST   /people/:username/run          → person + { run: { status: queued } | { status, logged, copies } } ("Log now";
 *                                            409 EMAIL_LOGGING_OFF when the person isn't logged; 6 / min per admin)
 *   DELETE /people/:username/emails       → { copies, emails } (purge: the person's copies and every email left without
 *                                            one; audited LoggedEmailMailbox PURGE)
 * Errors: 404 user not found, 400 VALIDATION_ERROR, 429 RATE_LIMITED.
 */
const router = Router();
router.use(authenticate, requireRole(...FORM_CONFIG_ADMIN_ROLES));

const RUN_LIMIT = 6;
const RUN_WINDOW_SECONDS = 60;
const RUN_LIMIT_MESSAGE = 'Too many runs. Wait a minute and try again.';
const runKey = (req: Request) => `user:${req.user?.id ?? 'unknown'}`;

/** In-memory fallback whenever Redis can't count (per process; never unlimited). */
const localHits = new Map<string, { count: number; resetAt: number }>();
function localRunLimiter(req: Request, res: Response, next: NextFunction): void {
    const now = Date.now();
    const key = runKey(req);
    const entry = localHits.get(key);
    if (!entry || entry.resetAt <= now) {
        if (localHits.size > 1000) localHits.clear();
        localHits.set(key, { count: 1, resetAt: now + RUN_WINDOW_SECONDS * 1000 });
        return next();
    }
    entry.count += 1;
    if (entry.count <= RUN_LIMIT) return next();
    res.setHeader('Retry-After', String(Math.max(1, Math.ceil((entry.resetAt - now) / 1000))));
    next(new HttpError(RUN_LIMIT_MESSAGE, StatusCodes.TOO_MANY_REQUESTS, { code: 'RATE_LIMITED' }));
}

const runLimiter = createRateLimiter({ keyPrefix: 'ratelimit:email-log-run', max: RUN_LIMIT, windowSeconds: RUN_WINDOW_SECONDS, keyGenerator: runKey, message: RUN_LIMIT_MESSAGE, fallback: localRunLimiter });

const usernameOf = (req: Request) => String(req.params.username);

router.get('/', async (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    sendSuccess(res, await emailLogService.overview());
});

router.put('/settings', async (req: Request, res: Response) => {
    sendSuccess(res, await emailLogService.saveSettings(req.body, requireUser(req)), 'Settings saved');
});

router.get('/people/:username', validateRequest({ params: usernameParamSchema }), async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    sendSuccess(res, await emailLogService.person(usernameOf(req)));
});

router.put('/people/:username', validateRequest({ params: usernameParamSchema }), async (req: Request, res: Response) => {
    sendSuccess(res, await emailLogService.setPersonMode(usernameOf(req), req.body, requireUser(req)), 'Saved');
});

router.post('/people/:username/run', validateRequest({ params: usernameParamSchema }), runLimiter, async (req: Request, res: Response) => {
    const { run } = await emailLogService.runPerson(usernameOf(req));
    sendSuccess(res, { ...(await emailLogService.person(usernameOf(req))), run });
});

router.delete('/people/:username/emails', validateRequest({ params: usernameParamSchema }), async (req: Request, res: Response) => {
    sendSuccess(res, await emailLogService.purgePerson(usernameOf(req), requireUser(req)), 'Logged emails deleted');
});

export default router;
