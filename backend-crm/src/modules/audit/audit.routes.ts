import { Router, type Request, type Response } from 'express';
import { authenticate } from '../../middlewares/authMiddleware.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { requireUser } from '../../utils/requestContext.js';
import { auditLogService } from './audit.service.js';

/**
 * /api/audit-logs/:entityType/:entityId?limit=100
 *   entityType: organizations | contacts | leads | opportunities | quotations | products | tickets | partner-companies | users
 *             | pdf-templates | form-configs (entityId: a module key, `shared`, or `all` — the Form Customization admin trail)
 *   → { entityType, entityId, entries: [...], revisions: AuditRevisionItem[] } (newest first)
 *   Access: admins read every trail. Others: organizations / contacts / leads / opportunities / quotations / tickets
 *   need access to the record (403, or 404 when it doesn't exist); users (own trail only), pdf-templates and
 *   form-configs are admin-only (403); products and partner companies are open to any signed-in user.
 */
const router = Router();
router.use(authenticate);

router.get('/:entityType/:entityId', async (req: Request, res: Response) => {
    sendSuccess(res, await auditLogService.forEntity(req.params, req.query, requireUser(req)));
});

export default router;
