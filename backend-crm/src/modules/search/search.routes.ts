import { Router, type Request, type Response } from 'express';
import { authenticate } from '../../middlewares/authMiddleware.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { searchService } from './search.service.js';

/**
 * /api/search?q=…&limit=5 → `GlobalSearchResults` (organizations, contacts, leads, opportunities), the shape
 * of frontend-crm/src/services/globalSearch.service.ts.
 */
const router = Router();
router.use(authenticate);

router.get('/', async (req: Request, res: Response) => {
    sendSuccess(res, await searchService.search(req.query));
});

export default router;
