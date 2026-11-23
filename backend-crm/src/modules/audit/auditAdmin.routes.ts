import { Router, type Request, type Response } from 'express';
import { authenticate, requireRole } from '../../middlewares/authMiddleware.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { FORM_CONFIG_ADMIN_ROLES } from '../form-configs/formConfig.routes.js';
import { auditAdminService } from './auditAdmin.service.js';

/**
 * /api/admin/audit-logs (admin only) — Admin › Audit Log: every change in the CRM, sign-ins and refused access.
 *   GET /         ?from&to&user&module&action&category&severity&source&entityType&entityId&entityCode&entityLabel
 *                  &field&ip&requestId&q&cursor&limit=50 (max 200)
 *                 → { items: AuditListItem[], nextCursor: string | null, limit }, newest first. Keyset paging on id:
 *                   pass `nextCursor` back as `cursor`; there is no total. Multi-value filters take repeated params or
 *                   comma lists. `from` / `to`: YYYY-MM-DD (business-timezone day, `to` included) or an ISO date-time
 *                   with a timezone. `field`: a field key or `customFields.<key>`. `ip`: exact, or a prefix ending in `*`.
 *   GET /facets   ?from&to (default: last 30 days, max 366) → { from, to, total, users, modules, actions, categories,
 *                   severities, sources: [{ value, label, count }] }
 *   GET /stats    ?from&to (default: last 30 days, max 366) → { from, to, today, failedSignIns24h, accessDenied24h,
 *                   deletes7d, total, mostActiveUsers: [{ username, label, count }],
 *                   eventsPerDay: [{ date, total, data, config, security }] }
 *   GET /:id      → { entry, changes, fields: [{ key, label, before, after }], details: [{ key, label, value }],
 *                   related: AuditListItem[] (same request, first 100), relatedCount } — 404 when there's no such entry
 * Invalid filter values → 400 VALIDATION_ERROR. Non-admins → 403 (itself audited as ACCESS_DENIED).
 */
const router = Router();

router.use(authenticate, requireRole(...FORM_CONFIG_ADMIN_ROLES));

router.get('/', async (req: Request, res: Response) => {
    sendSuccess(res, await auditAdminService.list(req.query));
});

router.get('/facets', async (req: Request, res: Response) => {
    sendSuccess(res, await auditAdminService.facets(req.query));
});

router.get('/stats', async (req: Request, res: Response) => {
    sendSuccess(res, await auditAdminService.stats(req.query));
});

router.get('/:id', async (req: Request, res: Response) => {
    sendSuccess(res, await auditAdminService.get(req.params));
});

export default router;
