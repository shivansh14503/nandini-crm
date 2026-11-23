import { Router, type Request, type Response } from 'express';
import { authenticate, requireRole } from '../../middlewares/authMiddleware.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { requireUser } from '../../utils/requestContext.js';
import { FORM_CONFIG_ADMIN_ROLES } from '../form-configs/formConfig.routes.js';
import { auditActionsService } from './auditActions.service.js';
import { auditAdminService } from './auditAdmin.service.js';
import { auditExportService } from './auditExport.service.js';
import { auditLedgerService } from './auditLedger.service.js';

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
 *                   related: AuditListItem[] (same request, first 100), relatedCount,
 *                   actions: { undo, restore: { available, reason? } | null }, reversedBy, reverses: AuditListItem | null }
 *                 — 404 when there's no such entry
 *   GET /:id/undo → { id, canUndo, fields: [{ key, label, from, to, current, status: ready|conflict|already|blocked }] }
 *                   (values as shown); 409 NOT_UNDOABLE (not an UPDATE / STATUS_CHANGE of a CRM record) or
 *                   ALREADY_REVERSED; 404 when the record is deleted or gone
 *   POST /:id/undo { fields?: string[] } → { id, revertId, undone, conflicts, notReverted } (same field shape). Puts the
 *                   `ready` fields back through the module's own update (its validation applies: 400 VALIDATION_ERROR);
 *                   409 CONFLICT listing each field when none can be undone
 *   POST /:id/restore → { id, restoreId, entityType, entityId, module }: brings back the record of a DELETE entry;
 *                   409 NOT_RESTORABLE / ALREADY_REVERSED / CONFLICT (not deleted, or its name / tax ids are taken now)
 *   POST /exports { format: csv|xlsx, filters: <GET / query> } → AuditExport { id, format, status: queued|running|
 *                   completed|failed|expired, rowCount, truncated, cap, fileName, fileSize, message, createdAt,
 *                   finishedAt, expiresAt }. Up to 5,000 entries it comes back completed; larger ones run in the
 *                   background (poll GET /exports/:id). Caps: CSV 1,000,000, Excel 500,000 newest entries.
 *   GET /exports/:id → AuditExport (only the admin who asked for it; others get 404)
 *   GET /exports/:id/download → the file (text/csv with a BOM, or .xlsx); 409 not ready, 410 EXPORT_EXPIRED (24 h)
 *   GET /integrity → { digestDirConfigured, schedule, digests: { count, latest }, lastCheck: { entryId, time, result:
 *                   verified|failed|error, message, digests, upToBlock, durationMs, changedBy } | null,
 *                   running: { by, startedAt } | null }
 *   POST /integrity/digest → { digest, status }: saves a ledger digest now
 *   POST /integrity/verify → status (running): "Verify integrity" in the background; poll GET /integrity
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

router.post('/exports', async (req: Request, res: Response) => {
    sendSuccess(res, await auditExportService.create(req.body, requireUser(req)));
});

router.get('/exports/:id', async (req: Request, res: Response) => {
    sendSuccess(res, await auditExportService.get(req.params, requireUser(req)));
});

router.get('/exports/:id/download', async (req: Request, res: Response) => {
    const file = await auditExportService.file(req.params, requireUser(req));
    res.setHeader('Cache-Control', 'no-store');
    res.download(file.path, file.fileName, { headers: { 'Content-Type': file.contentType } });
});

router.get('/integrity', async (_req: Request, res: Response) => {
    sendSuccess(res, await auditLedgerService.status());
});

router.post('/integrity/digest', async (req: Request, res: Response) => {
    sendSuccess(res, await auditLedgerService.digestNow(requireUser(req)), 'Digest saved');
});

router.post('/integrity/verify', async (req: Request, res: Response) => {
    sendSuccess(res, await auditLedgerService.verify(requireUser(req)), 'Integrity check started');
});

router.get('/:id', async (req: Request, res: Response) => {
    sendSuccess(res, await auditAdminService.get(req.params));
});

router.get('/:id/undo', async (req: Request, res: Response) => {
    sendSuccess(res, await auditActionsService.undoPreview(req.params, requireUser(req)));
});

router.post('/:id/undo', async (req: Request, res: Response) => {
    sendSuccess(res, await auditActionsService.undo(req.params, req.body, requireUser(req)), 'Change undone');
});

router.post('/:id/restore', async (req: Request, res: Response) => {
    sendSuccess(res, await auditActionsService.restore(req.params, requireUser(req)), 'Record restored');
});

export default router;
