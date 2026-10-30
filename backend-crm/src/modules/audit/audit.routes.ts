import { Router, type Request, type Response } from 'express';
import { authenticate } from '../../middlewares/authMiddleware.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { auditLogService } from './audit.service.js';

/**
 * /api/audit-logs/:entityType/:entityId?limit=100
 *   entityType: organizations | contacts | leads | opportunities | quotations | products | tickets | users
 *   → { entityType, entityId, entries: [...], revisions: AuditRevisionItem[] } (newest first)
 */
const router = Router();
router.use(authenticate);

router.get('/:entityType/:entityId', async (req: Request, res: Response) => {
    sendSuccess(res, await auditLogService.forEntity(req.params, req.query));
});

export default router;
