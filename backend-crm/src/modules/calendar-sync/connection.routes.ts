import { Router, type Request, type Response } from 'express';
import { authenticate } from '../../middlewares/authMiddleware.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { requireUser } from '../../utils/requestContext.js';
import { connectionService } from './connection.service.js';

/**
 * /api/calendar-connections: the signed-in employee's own company calendar sync, read-only (Calendar Phase 2,
 * admin-managed: P2-2b; addendum §5.2). Admins connect the company once on Admin › API Integrations; every active,
 * non-group user with a company email is enrolled automatically, so there is no connect or disconnect here.
 *
 *   GET /  → { ready, calendar: null | { provider, providerLabel, accountEmail, status: pending|ok|error|paused, since,
 *              lastSyncedAt }, reason: null | no_email|not_company|no_provider|excluded|inactive|group }
 *            Same for every role, only the caller. No error codes or provider text (admins see those on People).
 *
 * Removed in P2-2b: the per-user connect, OAuth callback and disconnect routes, and their state cookie
 * (connection.routes.test.ts keeps them gone). Planned: POST /sync (P2-5).
 */
const router = Router();

router.use(authenticate);

router.get('/', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    sendSuccess(res, await connectionService.getOwn(requireUser(req)));
});

export default router;
