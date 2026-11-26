import { Router, type Request, type Response } from 'express';
import { authenticate, requireRole } from '../../middlewares/authMiddleware.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import { sendCreated, sendSuccess } from '../../utils/apiResponse.js';
import { requireUser } from '../../utils/requestContext.js';
import { idParamSchema, patchBodySchema } from '../../validators/common.js';
import { FORM_CONFIG_ADMIN_ROLES } from '../form-configs/formConfig.routes.js';
import { holidayService } from './holiday.service.js';
import {
    holidayBulkSchema,
    holidayCalendarQuerySchema,
    holidayImportSchema,
    holidayListQuerySchema,
    type HolidayImportBody,
    type HolidayListQuery,
} from './holiday.validator.js';

/**
 * /api/holidays (Admin › Holidays)
 *   GET    /calendar   ?from=YYYY-MM-DD&to=YYYY-MM-DD   (any signed-in user) active holidays on those days, inclusive
 *
 *   (admin only)
 *   GET    /           ?page&limit&search&year&status&sortBy&sortOrder  → { data, total, page, limit, years }
 *   GET    /:id
 *   POST   /           { occasion, holidayDate, status? }                     409 DUPLICATE_HOLIDAY when it exists
 *   PUT    /:id        partial; PATCH is an alias                            409 DUPLICATE_HOLIDAY
 *   DELETE /:id
 *   POST   /bulk       { action: activate | deactivate | delete, ids }        → { affected }
 *   POST   /import     { rows: [{ rowNumber, values }], fileName?, dryRun? }  → per-row new / duplicate / error
 */
const router = Router();
router.use(authenticate);

router.get('/calendar', validateRequest({ query: holidayCalendarQuerySchema }), async (req: Request, res: Response) => {
    const { from, to } = req.query as unknown as { from: string; to: string };
    sendSuccess(res, await holidayService.calendar(from, to));
});

router.use(requireRole(...FORM_CONFIG_ADMIN_ROLES));

router.get('/', validateRequest({ query: holidayListQuerySchema }), async (req: Request, res: Response) => {
    const result = await holidayService.list(req.query as unknown as HolidayListQuery);
    res.json({ success: true, ...result });
});

// At most 1,000 short rows: well inside the API's default 1 MB body limit.
router.post('/import', validateRequest({ body: holidayImportSchema }), async (req: Request, res: Response) => {
    const result = await holidayService.import(req.body as HolidayImportBody, requireUser(req));
    const message = result.dryRun ? undefined : `Imported ${result.created} of ${result.total} holidays`;
    sendSuccess(res, result, message);
});

router.post('/bulk', validateRequest({ body: holidayBulkSchema }), async (req: Request, res: Response) => {
    const { action, ids } = req.body as { action: 'activate' | 'deactivate' | 'delete'; ids: string[] };
    sendSuccess(res, await holidayService.bulk(action, ids, requireUser(req)));
});

router.get('/:id', validateRequest({ params: idParamSchema }), async (req: Request, res: Response) => {
    sendSuccess(res, await holidayService.getById(String(req.params.id)));
});

router.post('/', async (req: Request, res: Response) => {
    sendCreated(res, await holidayService.create(req.body, requireUser(req)), 'Holiday added');
});

const update = async (req: Request, res: Response) => {
    sendSuccess(res, await holidayService.update(String(req.params.id), req.body as Record<string, unknown>, requireUser(req)), 'Holiday saved');
};
router.put('/:id', validateRequest({ params: idParamSchema, body: patchBodySchema }), update);
router.patch('/:id', validateRequest({ params: idParamSchema, body: patchBodySchema }), update);

router.delete('/:id', validateRequest({ params: idParamSchema }), async (req: Request, res: Response) => {
    await holidayService.remove(String(req.params.id), requireUser(req));
    sendSuccess(res, null, 'Holiday deleted');
});

export default router;
