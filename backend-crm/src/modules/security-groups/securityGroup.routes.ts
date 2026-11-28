import { Router, type Request, type Response } from 'express';
import { authenticate, requireAdmin } from '../../middlewares/authMiddleware.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import { sendCreated, sendSuccess } from '../../utils/apiResponse.js';
import { requireUser } from '../../utils/requestContext.js';
import { securityGroupService } from './securityGroup.service.js';
import {
    createSecurityGroupSchema,
    securityGroupIdParamSchema,
    setSecurityGroupMembersSchema,
    updateSecurityGroupSchema,
    type CreateSecurityGroupInput,
    type SetSecurityGroupMembersInput,
    type UpdateSecurityGroupInput,
} from './securityGroup.validator.js';

/**
 * /api/admin/security-groups (Admin › Security Groups; roles with the admin panel only). Bodies are strict.
 *   GET    /             → SecurityGroupDto[]  (by name, with members)
 *   GET    /users        → SecurityGroupUserOptionDto[]  (member picker: every user, active first, with their groups)
 *   GET    /:id          → SecurityGroupDto   404
 *   POST   /             { name, description?, parentId?, memberIds? } → 201 SecurityGroupDto   409 DUPLICATE_RECORD · 400
 *   PATCH  /:id          { name?, description?, parentId?, isActive? } → SecurityGroupDto   400 GROUP_CYCLE · 409 · 404
 *   PUT    /:id/members  { memberIds } → SecurityGroupDto (replaces the list)   400 · 404
 *   DELETE /:id          → { id }   400 HAS_SUB_GROUPS · 404
 * A role's "Group" access level (Admin › Roles) reads these groups.
 */
const router = Router();
router.use(authenticate, requireAdmin);

const idOf = (req: Request) => Number(req.params.id);

router.get('/', async (_req: Request, res: Response) => {
    sendSuccess(res, await securityGroupService.list());
});

router.get('/users', async (_req: Request, res: Response) => {
    sendSuccess(res, await securityGroupService.userOptions());
});

router.get('/:id', validateRequest({ params: securityGroupIdParamSchema }), async (req: Request, res: Response) => {
    sendSuccess(res, await securityGroupService.get(idOf(req)));
});

router.post('/', validateRequest({ body: createSecurityGroupSchema }), async (req: Request, res: Response) => {
    sendCreated(res, await securityGroupService.create(requireUser(req), req.body as CreateSecurityGroupInput), 'Group created');
});

router.patch('/:id', validateRequest({ params: securityGroupIdParamSchema, body: updateSecurityGroupSchema }), async (req: Request, res: Response) => {
    sendSuccess(res, await securityGroupService.update(requireUser(req), idOf(req), req.body as UpdateSecurityGroupInput), 'Group saved');
});

router.put(
    '/:id/members',
    validateRequest({ params: securityGroupIdParamSchema, body: setSecurityGroupMembersSchema }),
    async (req: Request, res: Response) => {
        sendSuccess(res, await securityGroupService.setMembers(requireUser(req), idOf(req), req.body as SetSecurityGroupMembersInput), 'Members saved');
    },
);

router.delete('/:id', validateRequest({ params: securityGroupIdParamSchema }), async (req: Request, res: Response) => {
    sendSuccess(res, await securityGroupService.remove(requireUser(req), idOf(req)), 'Group deleted');
});

export default router;
