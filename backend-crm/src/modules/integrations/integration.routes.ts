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
import { peopleQuerySchema, personEmailBodySchema, providerParamSchema, settingsBodySchema, syncTypesBodySchema, usernameParamSchema } from './integration.validator.js';

/**
 * /api/admin/integrations (Admin › API Integrations; admin roles only). Secrets are write-only: no response carries
 * one. Errors: 409 INTEGRATION_NOT_CONFIGURED, 409 INTEGRATION_NOT_AVAILABLE (Zoom before Phase 3),
 * 503 INTEGRATIONS_NOT_READY (INTEGRATIONS_ENCRYPTION_KEY unset), 409 DUPLICATE_RECORD (email), 429 RATE_LIMITED.
 *
 *   GET    /                           → { ready: { ok, reason }, keyStatus: ok|missing|unreadable, activeKeyId, publicApiUrl,
 *                                          publicApiUrlConfigured, webhooksActive, worker, providers: ProviderAdminDto[],
 *                                          settings: CalendarSyncSettings, syncTypes: [{ value, label, calendarSync, locked, lockReason? }] }
 *   PUT    /providers/:provider        { enabled?, clientId?, clientSecret? (write-only, ≥ 8 chars; omitted = keep),
 *                                        webhookSecret? (zoom), clientSecretExpiresOn? (YYYY-MM-DD | null; microsoft, zoom),
 *                                        settings? (google { scopeProfile, pkce }, microsoft { tenantId }) } → ProviderAdminDto
 *                                        A changed client id / tenant bumps clientVersion. Turning a provider off pauses it.
 *                                        Enabling without client id + readable secret → 409 INTEGRATION_NOT_CONFIGURED;
 *                                        Microsoft without a tenant → 400 VALIDATION_ERROR on settings.tenantId.
 *   DELETE /providers/:provider/secret → ProviderAdminDto (secrets removed, provider switched off)
 *   POST   /providers/:provider/test   → { ok, code, message, testedAt } (saved credentials; 6 / min per admin, in memory
 *                                        whenever Redis can't count). Stored as lastTest only if the credentials are
 *                                        unchanged since the probe began, else code credentials_changed.
 *   PUT    /settings                   partial CalendarSyncSettings → CalendarSyncSettings (ModuleSetting activities/calendarSync)
 *   PUT    /sync-types                 { "<Followup Type>": boolean } → syncTypes (option meta calendarSync; Task / Note refused)
 *   GET    /people                     ?search&issue=any|missing|duplicate|not_company → active non-group users
 *                                        [{ username, fullName, department, role, email, emailIssue, connection }]
 *   PUT    /people/:username/email     { email (required; '' / null clears), allowOtherDomain? } → person row
 *                                        (users/userEmail.service.ts: lower-cased, unique among active non-group users,
 *                                        company domain unless allowOtherDomain; audited User UPDATE)
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
    sendSuccess(res, await integrationService.testProvider(providerOf(req)));
});

router.put('/settings', validateRequest({ body: settingsBodySchema }), async (req: Request, res: Response) => {
    sendSuccess(res, await saveCalendarSettings(req.body, requireUser(req)), 'Settings saved');
});

router.put('/sync-types', validateRequest({ body: syncTypesBodySchema }), async (req: Request, res: Response) => {
    sendSuccess(res, await integrationService.saveSyncTypes(req.body, requireUser(req)), 'Saved');
});

router.get('/people', validateRequest({ query: peopleQuerySchema }), async (req: Request, res: Response) => {
    sendSuccess(res, await integrationService.listPeople(req.query));
});

router.put('/people/:username/email', validateRequest({ params: usernameParamSchema, body: personEmailBodySchema }), async (req: Request, res: Response) => {
    sendSuccess(res, await integrationService.setPersonEmail(String(req.params.username), req.body, requireUser(req)), 'Email saved');
});

export default router;
