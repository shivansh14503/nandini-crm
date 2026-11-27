import { Router, type Request, type Response } from 'express';
import { authenticate, requireAdmin } from '../../middlewares/authMiddleware.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import { sendCreated, sendSuccess } from '../../utils/apiResponse.js';
import { requireUser } from '../../utils/requestContext.js';
import { roleService } from './role.service.js';
import {
    createRoleSchema,
    deleteRoleSchema,
    roleIdParamSchema,
    updateRoleSchema,
    type CreateRoleInput,
    type DeleteRoleInput,
    type UpdateRoleInput,
} from './role.validator.js';

/**
 * /api/admin/roles (Admin › Roles; roles with the admin panel only). Bodies are strict (an unknown key → 400).
 *   GET    /           → RoleDto[]  (Super Admin first, then by name; with active / inactive user counts)
 *   GET    /:id        → RoleDto   404
 *   POST   /           { name, description?, adminPanel?, permissions } → 201 RoleDto   409 DUPLICATE_RECORD (name)
 *   PATCH  /:id        { name?, description?, adminPanel?, permissions? } → RoleDto (a rename renames it on its users)
 *                      400 SYSTEM_ROLE · 400 SELF_LOCKOUT · 400 LAST_ADMIN · 409 DUPLICATE_RECORD · 404
 *   DELETE /:id        ?reassignTo=<role id> → { id, movedUsers }   400 ROLE_IN_USE (has users, no reassignTo) · 400 SYSTEM_ROLE
 *                      · 400 SELF_LOCKOUT · 400 LAST_ADMIN · 403 SUPER_ADMIN_ONLY (moving users to Super Admin) · 404
 * Permissions are normalized (roles/permissions.ts): a missing value is None, Edit / Delete never exceed View.
 */
const router = Router();
router.use(authenticate, requireAdmin);

const idOf = (req: Request) => Number(req.params.id);

router.get('/', async (_req: Request, res: Response) => {
    sendSuccess(res, await roleService.list());
});

router.get('/:id', validateRequest({ params: roleIdParamSchema }), async (req: Request, res: Response) => {
    sendSuccess(res, await roleService.get(idOf(req)));
});

router.post('/', validateRequest({ body: createRoleSchema }), async (req: Request, res: Response) => {
    sendCreated(res, await roleService.create(requireUser(req), req.body as CreateRoleInput), 'Role created');
});

router.patch('/:id', validateRequest({ params: roleIdParamSchema, body: updateRoleSchema }), async (req: Request, res: Response) => {
    sendSuccess(res, await roleService.update(requireUser(req), idOf(req), req.body as UpdateRoleInput), 'Role saved');
});

router.delete('/:id', validateRequest({ params: roleIdParamSchema, query: deleteRoleSchema }), async (req: Request, res: Response) => {
    sendSuccess(res, await roleService.remove(requireUser(req), idOf(req), req.query as DeleteRoleInput), 'Role deleted');
});

export default router;
