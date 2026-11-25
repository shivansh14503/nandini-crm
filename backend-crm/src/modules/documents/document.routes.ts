import { Router, type Request, type Response } from 'express';
import { authenticate } from '../../middlewares/authMiddleware.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import { sendPaginated, sendSuccess } from '../../utils/apiResponse.js';
import { requireUser } from '../../utils/requestContext.js';
import { idParamSchema } from '../../validators/common.js';
import { documentService } from './document.service.js';

/**
 * /api/documents   (read-only: documents are written by the opportunity form's Documentation section)
 *   GET    /       ?page&limit&search&sortBy&sortOrder&opportunityId&organizationId&contactId&assignedTo&mine&createdWithinDays
 *   GET    /:id
 */
const router = Router();
router.use(authenticate);

router.get('/', async (req: Request, res: Response) => {
    sendPaginated(res, await documentService.list(req.query, requireUser(req)));
});

router.get('/:id', validateRequest({ params: idParamSchema }), async (req: Request, res: Response) => {
    sendSuccess(res, await documentService.getById(String(req.params.id), requireUser(req)));
});

export default router;
