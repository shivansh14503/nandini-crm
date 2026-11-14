import { Router, type Request, type Response } from 'express';
import { authenticate } from '../../middlewares/authMiddleware.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { requireUser } from '../../utils/requestContext.js';
import { tableFilterService } from './tableFilter.service.js';

/**
 * /api/table-filters   (the signed-in user's own filters; every response is the module's { recent, saved })
 *   GET    /?module=leads   recent (newest first, max 10) and saved filters
 *   POST   /recent          { module, criteria }        record an applied filter
 *   POST   /saved           { module, name, criteria }  "Save filter as" (same name overwrites)
 *   DELETE /:id             delete one of the user's filters
 */
const router = Router();
router.use(authenticate);

router.get('/', async (req: Request, res: Response) => {
    sendSuccess(res, await tableFilterService.list(req.query, requireUser(req)));
});

router.post('/recent', async (req: Request, res: Response) => {
    sendSuccess(res, await tableFilterService.recordRecent(req.body, requireUser(req)));
});

router.post('/saved', async (req: Request, res: Response) => {
    sendSuccess(res, await tableFilterService.save(req.body, requireUser(req)), 'Filter saved');
});

router.delete('/:id', async (req: Request, res: Response) => {
    sendSuccess(res, await tableFilterService.remove(String(req.params.id), requireUser(req)), 'Filter deleted');
});

export default router;
