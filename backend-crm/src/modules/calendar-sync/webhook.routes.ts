import express, { Router, type NextFunction, type Request, type Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { logger } from '../../config/logger.js';
import { createRateLimiter } from '../../middlewares/rateLimiter.js';
import { HttpError } from '../../utils/httpError.js';
import { handleGoogleNotification, handleGraphNotifications, logWebhook, MAX_VALIDATION_TOKEN } from './webhook.service.js';

/**
 * /api/webhooks: calendar change notifications from Google and Microsoft (Calendar Phase 2 spec §3.4; P2-7).
 * **Unauthenticated but signature-verified** (the documented exception in api-plan §1): no session, no CSRF; each
 * notification is checked against an HMAC the CRM gave the provider (webhook.service.ts).
 *
 * Mounted in app.ts **before** the global `express.json`, with its own parsers: Google sends headers only (no body is
 * read; a body over 16 KB is refused by its length header), Graph JSON up to 256 KB (`express.json` on its routes only).
 * Every answer is `Cache-Control: no-store`; nothing logs a header value or a body (logger.ts redacts
 * `x-goog-channel-token`; redactUrl.ts masks `validationToken`). Rate limit: 600 requests / minute per IP (Redis; an
 * in-process counter while Redis can't count). The provider gets its answer at once; the work runs right after it.
 *
 *   POST /google/calendar        headers X-Goog-Channel-ID / -Token / -Resource-ID / -Resource-State → 200 (always,
 *                                 also for unknown channels; `sync` does nothing)
 *   POST /microsoft/calendar     ?validationToken=… → 200 text/plain echo (≤ 4096 chars, else 400); else Graph change
 *                                 notifications `{ value: [...] }` → 202
 *   POST /microsoft/lifecycle    the same for lifecycle notifications (reauthorizationRequired, subscriptionRemoved,
 *                                 missed), processed at any hour → 202
 *   429 RATE_LIMITED, 413 when a body is too large, 400 for unreadable JSON.
 */

export const WEBHOOK_RATE_LIMIT = { max: 600, windowSeconds: 60 } as const;
const GRAPH_BODY_LIMIT = '256kb';
const GOOGLE_MAX_BODY_BYTES = 16 * 1024;
const MESSAGE = 'Too many requests.';

const windows = new Map<string, { count: number; resetAt: number }>();
/** In-process counter while Redis can't count (exported for tests). */
export function localWebhookHit(key: string, now: number = Date.now()): boolean {
    const entry = windows.get(key);
    if (!entry || entry.resetAt <= now) {
        if (windows.size > 10_000) windows.clear();
        windows.set(key, { count: 1, resetAt: now + WEBHOOK_RATE_LIMIT.windowSeconds * 1000 });
        return true;
    }
    entry.count += 1;
    return entry.count <= WEBHOOK_RATE_LIMIT.max;
}
export function resetWebhookLimitsForTests(): void {
    windows.clear();
}

const byIp = (req: Request) => `ip:${req.ip ?? 'unknown'}`;
const limiter = createRateLimiter({
    keyPrefix: 'ratelimit:calendar-webhooks',
    max: WEBHOOK_RATE_LIMIT.max,
    windowSeconds: WEBHOOK_RATE_LIMIT.windowSeconds,
    keyGenerator: byIp,
    message: MESSAGE,
    fallback: (req, res, next) => {
        if (localWebhookHit(byIp(req))) return next();
        res.setHeader('Retry-After', String(WEBHOOK_RATE_LIMIT.windowSeconds));
        next(new HttpError(MESSAGE, StatusCodes.TOO_MANY_REQUESTS, { code: 'RATE_LIMITED' }));
    },
});

/** Work started after the answer (tests await it through this hook). */
type AfterAnswer = (work: Promise<unknown>) => void;
const defaultAfterAnswer: AfterAnswer = (work) => {
    void work.catch((err: Error) => logger.warn({ err: err.message }, 'Calendar webhook processing failed; the next poll covers it'));
};
let afterAnswer: AfterAnswer = defaultAfterAnswer;
export function setWebhookAfterAnswerForTests(hook: AfterAnswer | null): void {
    afterAnswer = hook ?? defaultAfterAnswer;
}

const router = Router();

router.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
});
router.use(limiter);

const header = (req: Request, name: string): string | undefined => {
    const value = req.headers[name];
    return typeof value === 'string' ? value : undefined;
};

router.post('/google/calendar', (req: Request, res: Response) => {
    const length = Number(req.headers['content-length'] ?? 0);
    if (Number.isFinite(length) && length > GOOGLE_MAX_BODY_BYTES) {
        res.status(StatusCodes.REQUEST_TOO_LONG).end();
        return;
    }
    const notification = {
        channelId: header(req, 'x-goog-channel-id'),
        token: header(req, 'x-goog-channel-token'),
        resourceId: header(req, 'x-goog-resource-id'),
        resourceState: header(req, 'x-goog-resource-state'),
    };
    res.status(StatusCodes.OK).end();
    afterAnswer(handleGoogleNotification(notification).then((outcome) => logWebhook('google', outcome)));
});

/** Graph's subscription validation: echo the decoded token as text/plain within 10 s [V]. */
function graphValidation(req: Request, res: Response, next: NextFunction): void {
    const token = req.query.validationToken;
    if (token === undefined) return next();
    if (typeof token !== 'string' || token.length === 0 || token.length > MAX_VALIDATION_TOKEN) {
        res.status(StatusCodes.BAD_REQUEST).type('text/plain').send('Bad validation token');
        return;
    }
    res.status(StatusCodes.OK).type('text/plain').send(token);
}

const graphJson = express.json({ limit: GRAPH_BODY_LIMIT, type: ['application/json', 'application/*+json'] });

function graphNotifications(req: Request, res: Response): void {
    const body: unknown = req.body;
    res.status(StatusCodes.ACCEPTED).end();
    afterAnswer(handleGraphNotifications(body).then((outcome) => logWebhook('microsoft', outcome)));
}

router.post('/microsoft/calendar', graphValidation, graphJson, graphNotifications);
router.post('/microsoft/lifecycle', graphValidation, graphJson, graphNotifications);

export default router;
