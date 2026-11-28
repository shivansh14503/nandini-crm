import { Router, type Request, type Response } from 'express';
import { authenticate, requireAdmin } from '../../middlewares/authMiddleware.js';
import { createRateLimiter } from '../../middlewares/rateLimiter.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { requireUser } from '../../utils/requestContext.js';
import { emailAdminService } from './email.admin.service.js';

/**
 * /api/admin/email: Admin › Email (admins only). docs/api-plan.md › Admin email.
 *   GET  /outbound                     → OutboundEmailDto (settings, readiness, Google key facts, SMTP host; no secrets)
 *   PUT  /outbound                     { provider?, enabled?, senderEmail?, senderName?, replyTo?, dailyLimit? } → OutboundEmailDto
 *   POST /outbound/check               → { ok, message, outbound }  (Gmail: token as the sender with gmail.send; SMTP: verify)
 *   POST /outbound/test                { to } → { ok, message, outbound }  (400 while mail is off)
 *   GET  /templates                    → TemplateDto[]
 *   GET  /templates/:key               → TemplateDto (404 unknown key)
 *   PUT  /templates/:key               { subject, heading, body, buttonLabel?, afterButton?, footer? } → TemplateDto
 *                                      (400 unknown merge field / missing button label on a link template)
 *   POST /templates/:key/reset         → TemplateDto (back to the built-in wording)
 *   POST /templates/:key/preview       { …unsaved wording } | {} → { subject, html, text } with sample values
 *   POST /templates/:key/test          → { ok, message } (sent to the admin's own address)
 *   GET  /queue                        ?status&kind&q&page&limit → { data: EmailLogDto[], total, page, limit, summary }
 *   POST /queue/:id/retry              → { ok, message, email } (409 not retryable / being sent)
 * Check, test and retry calls are rate limited (they reach Google / the SMTP server).
 */
const router = Router();
router.use(authenticate, requireAdmin);

const outboundCalls = createRateLimiter({ windowSeconds: 60, max: 10, keyPrefix: 'ratelimit:admin-email', keyGenerator: (req) => req.user?.username ?? req.ip ?? 'unknown' });

router.get('/outbound', async (_req: Request, res: Response) => {
    sendSuccess(res, await emailAdminService.getOutbound());
});

router.put('/outbound', async (req: Request, res: Response) => {
    sendSuccess(res, await emailAdminService.saveOutbound(req.body, requireUser(req)), 'Outbound email settings saved');
});

router.post('/outbound/check', outboundCalls, async (_req: Request, res: Response) => {
    sendSuccess(res, await emailAdminService.checkConnection());
});

router.post('/outbound/test', outboundCalls, async (req: Request, res: Response) => {
    sendSuccess(res, await emailAdminService.sendTest(req.body, requireUser(req)));
});

router.get('/templates', async (_req: Request, res: Response) => {
    sendSuccess(res, await emailAdminService.listTemplates());
});

router.get('/templates/:key', async (req: Request, res: Response) => {
    sendSuccess(res, await emailAdminService.getTemplate(String(req.params.key)));
});

router.put('/templates/:key', async (req: Request, res: Response) => {
    sendSuccess(res, await emailAdminService.saveTemplate(String(req.params.key), req.body, requireUser(req)), 'Template saved');
});

router.post('/templates/:key/reset', async (req: Request, res: Response) => {
    sendSuccess(res, await emailAdminService.resetTemplate(String(req.params.key), requireUser(req)), 'Template reset to default');
});

router.post('/templates/:key/preview', async (req: Request, res: Response) => {
    sendSuccess(res, await emailAdminService.previewTemplate(String(req.params.key), req.body));
});

router.post('/templates/:key/test', outboundCalls, async (req: Request, res: Response) => {
    sendSuccess(res, await emailAdminService.sendTemplateTest(String(req.params.key), requireUser(req)));
});

router.get('/queue', async (req: Request, res: Response) => {
    sendSuccess(res, await emailAdminService.listQueue(req.query));
});

router.post('/queue/:id/retry', outboundCalls, async (req: Request, res: Response) => {
    sendSuccess(res, await emailAdminService.retry(String(req.params.id), requireUser(req)));
});

export default router;
