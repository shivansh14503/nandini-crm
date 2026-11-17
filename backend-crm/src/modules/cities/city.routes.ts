import { Router, type Request, type Response } from 'express';
import { authenticate, requireRole } from '../../middlewares/authMiddleware.js';
import { sendCreated, sendSuccess } from '../../utils/apiResponse.js';
import { requireUser } from '../../utils/requestContext.js';
import { FORM_CONFIG_ADMIN_ROLES } from '../form-configs/formConfig.routes.js';
import { cityIdParamSchema } from './city.validator.js';
import { cityService } from './city.service.js';

/**
 * /api/cities — admin management of the city list address forms pick from (the forms read it through
 * GET /api/lookups/cities). Admin only.
 *   GET    /             ?country=IN&state=IN-MH&search&page&limit → { data: AdminCityDto[], total, page, limit }
 *   GET    /:id/usage                                           → CityUsage (live records using it)
 *   POST   /             { countryIso2, subdivisionCode?, cityName } (re-adding a removed seeded city restores it)
 *   PATCH  /:id          { cityName }  rename; written through to every record that uses it
 *   DELETE /:id          { action?: 'move' | 'clear', targetCityId? }  required when records use it (409 CITY_IN_USE)
 */
const router = Router();
router.use(authenticate, requireRole(...FORM_CONFIG_ADMIN_ROLES));

const cityId = (req: Request) => cityIdParamSchema.parse(req.params).id;

router.get('/', async (req: Request, res: Response) => {
    sendSuccess(res, await cityService.list(req.query));
});
router.get('/:id/usage', async (req: Request, res: Response) => {
    sendSuccess(res, await cityService.usage(cityId(req)));
});
router.post('/', async (req: Request, res: Response) => {
    sendCreated(res, await cityService.create(req.body, requireUser(req)), 'City added');
});
router.patch('/:id', async (req: Request, res: Response) => {
    sendSuccess(res, await cityService.rename(cityId(req), req.body, requireUser(req)), 'City renamed');
});
router.delete('/:id', async (req: Request, res: Response) => {
    sendSuccess(res, await cityService.remove(cityId(req), req.body, requireUser(req)), 'City deleted');
});

export default router;
