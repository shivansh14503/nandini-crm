import { Router, type Request, type Response } from 'express';
import { authenticate } from '../../middlewares/authMiddleware.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { requireUser } from '../../utils/requestContext.js';
import { emailLogService } from './emailLog.service.js';

/**
 * /api/email-logs (Calendar Phase 4 email logging; signed in). Emails exchanged between employees and CRM contacts /
 * leads, logged automatically from the company mailboxes (admins switch it on; docs/api-plan.md › Email logging).
 *
 *   GET /    ?module=contacts|leads|opportunities&recordId&page&limit(≤ 50) → { enabled, visibility, seesAll, total, page,
 *            limit, items: [{ id, subject, from { email, name? }, to [], cc [], moreRecipients, sentAt, direction in|out,
 *            snippet (plain text) | null, hasAttachments, provider, participants [{ username, name }], openLink
 *            { provider, url } | null (the caller's own copy only) }] } newest first. 404 record missing / deleted, 403 no
 *            access to the record. Visibility `restricted` (default): the record's owner, managers / admins and the
 *            participants see every email; others who can open the record see only the ones they took part in
 *            (seesAll false). `record`: everyone who can open the record. Company switch off: enabled false, no items.
 *   GET /me  → { companyEnabled, logging, reason (server_off|company_off|user_inactive|person_off|not_synced|null),
 *            provider, accountEmail, status (idle|ok|error|null), lastSuccessAt, storeSnippets, retentionMonths,
 *            visibility } — read-only: employees can't switch their own logging (admins decide).
 */
const router = Router();
router.use(authenticate);

router.get('/me', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    sendSuccess(res, await emailLogService.ownStatus(requireUser(req)));
});

router.get('/', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    sendSuccess(res, await emailLogService.listForRecord(req.query, requireUser(req)));
});

export default router;
