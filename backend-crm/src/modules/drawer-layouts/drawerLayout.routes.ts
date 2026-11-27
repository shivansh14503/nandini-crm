import { Router, type Request, type Response } from 'express';
import { authenticate, requireAdmin } from '../../middlewares/authMiddleware.js';
import { sendCreated, sendSuccess } from '../../utils/apiResponse.js';
import { requireUser } from '../../utils/requestContext.js';
import { drawerLayoutService, drawerPieceService } from './drawerLayout.service.js';

const admin = requireAdmin;

/**
 * /api/drawer-layouts   (record side drawer layouts, Admin › Form Customization › Drawer Layout)
 *   GET    /           { [module]: { module, layout, version, updatedBy, updatedAt } } for saved layouts (any signed-in user)
 *   ── Admin only ──
 *   PUT    /:module    { layout, version }   version = the one edited (null for none yet); 409 when someone saved since
 *   DELETE /:module    back to the built-in drawer
 */
export const drawerLayoutRouter = Router();
drawerLayoutRouter.use(authenticate);

drawerLayoutRouter.get('/', async (_req: Request, res: Response) => {
    sendSuccess(res, await drawerLayoutService.listAll());
});

drawerLayoutRouter.put('/:module', admin, async (req: Request, res: Response) => {
    sendSuccess(res, await drawerLayoutService.save(req.params, req.body, requireUser(req)), 'Drawer layout saved');
});

drawerLayoutRouter.delete('/:module', admin, async (req: Request, res: Response) => {
    sendSuccess(res, await drawerLayoutService.reset(req.params, requireUser(req)), 'Drawer layout reset');
});

/**
 * /api/drawer-pieces   (the builder's library of saved sections; admin only)
 *   GET    /?module=   newest first
 *   POST   /           { module, name, section }
 *   DELETE /:id
 */
export const drawerPieceRouter = Router();
drawerPieceRouter.use(authenticate, admin);

drawerPieceRouter.get('/', async (req: Request, res: Response) => {
    sendSuccess(res, await drawerPieceService.list(req.query));
});

drawerPieceRouter.post('/', async (req: Request, res: Response) => {
    sendCreated(res, await drawerPieceService.create(req.body, requireUser(req)), 'Piece saved');
});

drawerPieceRouter.delete('/:id', async (req: Request, res: Response) => {
    sendSuccess(res, await drawerPieceService.remove(req.params, requireUser(req)), 'Piece deleted');
});
