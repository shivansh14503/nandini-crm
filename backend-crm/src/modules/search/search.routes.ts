import { Router, type Request, type Response } from 'express';
import { authenticate } from '../../middlewares/authMiddleware.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { requireUser } from '../../utils/requestContext.js';
import { searchService } from './search.service.js';

/**
 * /api/search?q=…&limit=5[&category=leads&page=2][&totals=true][&ids=true] → `GlobalSearchResponse` (every module), the
 * shape of frontend-crm/src/services/globalSearch.service.ts. Every signed-in user searches every record (no
 * row-level access filter), except modules their role can't view (Admin › Roles), which come back empty.
 */
const router = Router();
router.use(authenticate);

router.get('/', async (req: Request, res: Response) => {
    sendSuccess(res, await searchService.search(req.query, requireUser(req)));
});

/** POST /api/search/records { module, ids } → the list rows of matched records (the results page's tables). */
router.post('/records', async (req: Request, res: Response) => {
    sendSuccess(res, await searchService.records(req.body, requireUser(req)));
});

export default router;
