import { Router, type Request, type Response } from 'express';
import { authenticate, requireAdmin } from '../../middlewares/authMiddleware.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { requireUser } from '../../utils/requestContext.js';
import { scorecardService } from './scorecard.service.js';

/**
 * /api/scorecards   (the summary cards above each module's list screen)
 *   GET    /           { [module]: ScorecardDto } for every configured module (any signed-in user)
 *   ── Admin only ──
 *   PUT    /:module    { fieldKey, currencyFieldKey?, options: [{ value, color, hidden? }], listViewColor, drawerViewColor,
 *                        enabled, allLabel?, version }
 *                      (currencyFieldKey: an amount / number form field, or a built-in total of the list such as builtin.grandTotal;
 *                       version: the one edited, null for none yet; 409 when someone saved since)
 *   DELETE /:module    back to the screen's built-in cards
 */
const router = Router();
router.use(authenticate);

router.get('/', async (_req: Request, res: Response) => {
    sendSuccess(res, await scorecardService.listAll());
});

const admin = requireAdmin;

router.put('/:module', admin, async (req: Request, res: Response) => {
    sendSuccess(res, await scorecardService.save(req.params, req.body, requireUser(req)), 'Scorecard saved');
});

router.delete('/:module', admin, async (req: Request, res: Response) => {
    sendSuccess(res, await scorecardService.reset(req.params, requireUser(req)), 'Scorecard reset');
});

export default router;
