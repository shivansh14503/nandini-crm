import { Router, type NextFunction, type Request, type Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { authenticate, requireRole } from '../../middlewares/authMiddleware.js';
import { createRateLimiter } from '../../middlewares/rateLimiter.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { HttpError } from '../../utils/httpError.js';
import { requireUser } from '../../utils/requestContext.js';
import { FORM_CONFIG_ADMIN_ROLES } from '../form-configs/formConfig.routes.js';
import type { IntegrationProviderKey } from './integration.constants.js';
import { integrationService } from './integration.service.js';
import { saveCalendarSettings } from './integration.settings.js';
import {
    peopleQuerySchema,
    personCalendarBodySchema,
    personEmailBodySchema,
    providerParamSchema,
    settingsBodySchema,
    syncTypesBodySchema,
    usernameParamSchema,
} from './integration.validator.js';

/**
 * /api/admin/integrations (Admin › API Integrations; admin roles only). Secrets are write-only: no response carries
 * one. Errors: 409 INTEGRATION_NOT_CONFIGURED, 409 INTEGRATION_NOT_TESTED, 409 INTEGRATION_NOT_AVAILABLE (Zoom before
 * Phase 3), 409 DOMAIN_IN_USE, 409 CALENDAR_NOT_SYNCED, 503 INTEGRATIONS_NOT_READY (INTEGRATIONS_ENCRYPTION_KEY unset),
 * 409 DUPLICATE_RECORD (email), 429 RATE_LIMITED.
 *
 *   GET    /                           → { ready: { ok, reason }, keyStatus: ok|missing|unreadable, activeKeyId, publicApiUrl,
 *                                          publicApiUrlConfigured, webhooksActive, fakeProvider, worker, providers: ProviderAdminDto[],
 *                                          settings: CalendarSyncSettings, syncTypes: [{ value, label, calendarSync, videoMeeting, locked, lockReason? }] }
 *   PUT    /providers/:provider        { enabled?, serviceAccountKey? (google: the key file's text, write-only),
 *                                        clientId? (microsoft, zoom), clientSecret? (microsoft, zoom; write-only, ≥ 8 chars),
 *                                        webhookSecret? (zoom), clientSecretExpiresOn? (YYYY-MM-DD | null; microsoft, zoom),
 *                                        settings? (google { domains }, microsoft { tenantId, domains }) } → ProviderAdminDto
 *                                        Any credentials change bumps clientVersion and clears the last test and health.
 *                                        Switching on needs complete credentials (409 INTEGRATION_NOT_CONFIGURED) and a
 *                                        passing app-level test since the last credentials change (409 INTEGRATION_NOT_TESTED).
 *                                        Domains: company domains only (400), one provider each (409 DOMAIN_IN_USE).
 *                                        People are enrolled / stopped to match after the save.
 *   DELETE /providers/:provider/secret → ProviderAdminDto (secrets / key removed, provider switched off, live rows stopped)
 *   POST   /providers/:provider/test   { asUsername? } → { ok, code, message, steps: [{ step: app|user, ok, code, message }],
 *                                        testedAt } (saved credentials; 6 / min per admin, in memory whenever Redis can't
 *                                        count). Stored as lastTest only if the credentials are unchanged since the probe
 *                                        began, else code credentials_changed. asUsername: only someone this provider
 *                                        would sync (else 409 CALENDAR_TEST_NOT_ALLOWED); audited TEST_AS_USER.
 *   PUT    /settings                   partial CalendarSyncSettings → CalendarSyncSettings (ModuleSetting activities/calendarSync).
 *                                        409 DOMAIN_IN_USE when a removed company domain is still a provider's.
 *   PUT    /sync-types                 { "<Followup Type>": boolean } → syncTypes (option meta calendarSync; Task / Note refused)
 *   PUT    /video-types                { "<Followup Type>": boolean } → syncTypes (option meta videoMeeting: offers a Video
 *                                        meeting on the activity form; Task / Note refused; Calendar Phase 3, P3-1)
 *   GET    /people                     ?search&issue=any|missing|duplicate|not_company|calendar_problem → active non-group users
 *                                        [{ username, fullName, department, role, email, emailIssue,
 *                                           calendar: { target, reason, connection, choice } }]
 *   PUT    /people/:username/email     { email (required; '' / null clears), allowOtherDomain? } → person row
 *                                        (users/userEmail.service.ts: lower-cased, unique among active non-group users,
 *                                        company domain unless allowOtherDomain; audited User UPDATE). The person's
 *                                        calendar sync moves to the new mailbox.
 *   PUT    /people/:username/calendar  { provider? (google|microsoft|fake|null = by email domain), excluded?, note? } → person row
 *                                        (CalendarSyncUser, audited; the person is reconciled at once)
 *   POST   /people/:username/calendar/check → person row + { check: ok|user_error|provider_unhealthy|transient|skipped }
 *                                        ("Check now"; 409 CALENDAR_NOT_SYNCED without a live row; same rate limit as tests)
 *
 * Removed in P2-2b: GET /connections and POST /connections/:id/disconnect (the People tab covers both).
 */
const router = Router();
router.use(authenticate, requireRole(...FORM_CONFIG_ADMIN_ROLES));

const TEST_LIMIT = 6;
const TEST_WINDOW_SECONDS = 60;
const TEST_LIMIT_MESSAGE = 'Too many connection tests. Wait a minute and try again.';
const testLimitKey = (req: Request) => `user:${req.user?.id ?? 'unknown'}`;

/**
 * In-memory fallback whenever Redis can't count a test (down, or a command failing while it reports ready), so the
 * probes can't be used to hammer Google / Microsoft. Per process.
 */
const localTestHits = new Map<string, { count: number; resetAt: number }>();
export function localTestLimit(key: string, now: number = Date.now()): { allowed: boolean; retryAfterSeconds: number } {
    const entry = localTestHits.get(key);
    if (!entry || entry.resetAt <= now) {
        if (localTestHits.size > 1000) localTestHits.clear();
        localTestHits.set(key, { count: 1, resetAt: now + TEST_WINDOW_SECONDS * 1000 });
        return { allowed: true, retryAfterSeconds: 0 };
    }
    entry.count += 1;
    return { allowed: entry.count <= TEST_LIMIT, retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) };
}

export function localTestLimiter(req: Request, res: Response, next: NextFunction): void {
    const { allowed, retryAfterSeconds } = localTestLimit(testLimitKey(req));
    if (allowed) return next();
    res.setHeader('Retry-After', String(retryAfterSeconds));
    next(new HttpError(TEST_LIMIT_MESSAGE, StatusCodes.TOO_MANY_REQUESTS, { code: 'RATE_LIMITED' }));
}

/** 6 tests / min per admin: Redis when it can count, the in-memory limiter otherwise (never unlimited). */
export const testLimiter = createRateLimiter({
    keyPrefix: 'ratelimit:integration-test',
    max: TEST_LIMIT,
    windowSeconds: TEST_WINDOW_SECONDS,
    keyGenerator: testLimitKey,
    message: TEST_LIMIT_MESSAGE,
    fallback: localTestLimiter,
});

const providerOf = (req: Request) => req.params.provider as IntegrationProviderKey;

router.get('/', async (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    sendSuccess(res, await integrationService.getAdmin());
});

router.put('/providers/:provider', validateRequest({ params: providerParamSchema }), async (req: Request, res: Response) => {
    sendSuccess(res, await integrationService.saveProvider(providerOf(req), req.body, requireUser(req)), 'Saved');
});

router.delete('/providers/:provider/secret', validateRequest({ params: providerParamSchema }), async (req: Request, res: Response) => {
    sendSuccess(res, await integrationService.clearSecret(providerOf(req), requireUser(req)), 'Secret removed');
});

router.post('/providers/:provider/test', validateRequest({ params: providerParamSchema }), testLimiter, async (req: Request, res: Response) => {
    sendSuccess(res, await integrationService.testProvider(providerOf(req), req.body ?? {}, requireUser(req)));
});

router.put('/settings', validateRequest({ body: settingsBodySchema }), async (req: Request, res: Response) => {
    sendSuccess(res, await saveCalendarSettings(req.body, requireUser(req)), 'Settings saved');
});

router.put('/sync-types', validateRequest({ body: syncTypesBodySchema }), async (req: Request, res: Response) => {
    sendSuccess(res, await integrationService.saveSyncTypes(req.body, requireUser(req)), 'Saved');
});

router.put('/video-types', validateRequest({ body: syncTypesBodySchema }), async (req: Request, res: Response) => {
    sendSuccess(res, await integrationService.saveVideoTypes(req.body, requireUser(req)), 'Saved');
});

router.get('/people', validateRequest({ query: peopleQuerySchema }), async (req: Request, res: Response) => {
    sendSuccess(res, await integrationService.listPeople(req.query));
});

router.put('/people/:username/email', validateRequest({ params: usernameParamSchema, body: personEmailBodySchema }), async (req: Request, res: Response) => {
    sendSuccess(res, await integrationService.setPersonEmail(String(req.params.username), req.body, requireUser(req)), 'Email saved');
});

router.put('/people/:username/calendar', validateRequest({ params: usernameParamSchema, body: personCalendarBodySchema }), async (req: Request, res: Response) => {
    sendSuccess(res, await integrationService.setPersonCalendar(String(req.params.username), req.body, requireUser(req)), 'Calendar choice saved');
});

router.post('/people/:username/calendar/check', validateRequest({ params: usernameParamSchema }), testLimiter, async (req: Request, res: Response) => {
    sendSuccess(res, await integrationService.checkPersonCalendar(String(req.params.username)));
});

export default router;
