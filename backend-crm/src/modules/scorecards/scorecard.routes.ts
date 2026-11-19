import { Router, type Request, type Response } from 'express';
import { authenticate, requireRole } from '../../middlewares/authMiddleware.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { requireUser } from '../../utils/requestContext.js';
import { FORM_CONFIG_ADMIN_ROLES } from '../form-configs/formConfig.routes.js';
import { scorecardService } from './scorecard.service.js';

/**
 * /api/scorecards   (the summary cards above each module's list screen)
 *   GET    /           { [module]: ScorecardDto } for every configured module (any signed-in user)
 *   ── Admin only ──
 *   PUT    /:module    { fieldKey, currencyFieldKey?, options: [{ value, color, hidden? }], listViewColor, detailViewColor }
 *   DELETE /:module    back to the screen's built-in cards
 */
const router = Router();
router.use(authenticate);

router.get('/', async (_req: Request, res: Response) => {
    sendSuccess(res, await scorecardService.listAll());
});

const admin = requireRole(...FORM_CONFIG_ADMIN_ROLES);

router.put('/:module', admin, async (req: Request, res: Response) => {
    sendSuccess(res, await scorecardService.save(req.params, req.body, requireUser(req)), 'Scorecard saved');
});

router.delete('/:module', admin, async (req: Request, res: Response) => {
    sendSuccess(res, await scorecardService.reset(req.params), 'Scorecard reset');
});

export default router;
