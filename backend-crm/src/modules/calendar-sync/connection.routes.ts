import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middlewares/authMiddleware.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { requireUser } from '../../utils/requestContext.js';
import { connectionService } from './connection.service.js';
import { pullRequestLimiter, requestPull } from './pull.requests.js';

/**
 * /api/calendar-connections: the signed-in employee's own company calendar sync, read-only (Calendar Phase 2,
 * admin-managed: P2-2b; addendum §5.2). Admins connect the company once on Admin › API Integrations; every active,
 * non-group user with a company email is enrolled automatically, so there is no connect or disconnect here.
 *
 *   GET /  → { ready, calendar: null | { provider, providerLabel, accountEmail, status: pending|ok|error|paused, since,
 *              lastSyncedAt, backfill: { state: waiting|done|off, at, copied, sending } }, reason: null | no_email|not_company|
 *              no_provider|excluded|inactive|group, syncHours: { start: 'HH:MM', end: 'HH:MM', everyMinutes } }
 *              (backfill: the first-sync copy of upcoming activities, P2-3c; syncHours: the poll's office hours, P2-5)
 *            Same for every role, only the caller. No error codes or provider text (admins see those on People).
 *   POST /sync  { reason?: manual (default) | page } → { status: queued|done|recent|busy|not_synced|not_ready|failed|off,
 *              changed? (in-process pulls), lastSyncedAt }  (P2-5) The caller's own "Sync now" (manual) and the silent
 *              pull when the calendar page opens (page): changes made in Google Calendar / Outlook come back now instead of
 *              at the next poll. At most one pull per 30 s (manual) / 3 min (page) per person; 6 requests / min per
 *              user (429 RATE_LIMITED). Redis down → the pull runs in the API and is awaited.
 *
 * Removed in P2-2b: the per-user connect, OAuth callback and disconnect routes, and their state cookie
 * (connection.routes.test.ts keeps them gone).
 */
const router = Router();

router.use(authenticate);

router.get('/', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    sendSuccess(res, await connectionService.getOwn(requireUser(req)));
});

const syncBodySchema = z.object({ reason: z.enum(['manual', 'page']).optional() }).strict();

router.post('/sync', validateRequest({ body: syncBodySchema }), pullRequestLimiter, async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as z.infer<typeof syncBodySchema>;
    sendSuccess(res, await requestPull(requireUser(req).username, body.reason ?? 'manual'));
});

export default router;
