import { Router, type Request, type Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { authenticate, requireRole } from '../../middlewares/authMiddleware.js';
import { createRateLimiter } from '../../middlewares/rateLimiter.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { requireUser } from '../../utils/requestContext.js';
import { FORM_CONFIG_ADMIN_ROLES } from '../form-configs/formConfig.routes.js';
import { userAdminService } from './userAdmin.service.js';
import {
    createUserSchema,
    listUsersQuerySchema,
    resetPasswordSchema,
    updateUserSchema,
    userIdParamSchema,
    type CreateUserInput,
    type ListUsersQuery,
    type ResetPasswordInput,
    type UpdateUserInput,
} from './userAdmin.validator.js';

/**
 * /api/admin/users (Admin › Users; admin roles only). Bodies are strict (an unknown key → 400). Every write is audited
 * as the acting admin (User CREATE / UPDATE / STATUS_CHANGE / PASSWORD_RESET) and drops the user lookup caches.
 * Temporary passwords are returned once and never logged or audited.
 *
 *   GET    /                    ?search&status=active|inactive|all (active)&role&department&page&pageSize (≤ 100, 25)
 *                                → { success, data: AdminUserDto[], meta: { total, page, pageSize } }  by fullName, username
 *   GET    /meta                → { roles: [{ name, access, adminPanel, allRecords, userCount }], departments: [{ name, userCount }],
 *                                   managers: [{ id, name, username, photoUrl }] (active, non-group), companyDomains }
 *   GET    /:id                 → AdminUserDto   404
 *   POST   /                    { username, firstName, lastName?, email?, allowOtherDomain?, role, department?, jobTitle?,
 *                                 reportsToId?, mobile?, officePhone?, isGroupUser?, password? }
 *                                → 201 { user: AdminUserDto, temporaryPassword: string | null }   (always mustChangePassword)
 *                                409 DUPLICATE_RECORD (username | email) · 400 VALIDATION_ERROR · 400 INVALID_MANAGER · 400 WEAK_PASSWORD
 *   PATCH  /:id                 { firstName?, lastName?, email?, allowOtherDomain?, role?, department?, jobTitle?, reportsToId?,
 *                                 mobile?, officePhone?, isGroupUser?, onLeave? } → AdminUserDto (+ signedOutSessions when the
 *                                 role changed: the user is signed out so the new role applies)
 *                                400 INVALID_MANAGER · 400 SELF_LOCKOUT · 400 LAST_ADMIN · 409 DUPLICATE_RECORD (email) · 404
 *   POST   /:id/deactivate      → AdminUserDto + { signedOutSessions }   400 SELF_LOCKOUT · 400 LAST_ADMIN · 404
 *   POST   /:id/activate        → AdminUserDto + { signedOutSessions: null }   409 DUPLICATE_RECORD (email) · 404
 *   Super Admin users (and the Super Admin role) can only be added, edited, deactivated, activated or reset by a Super
 *   Admin: 403 SUPER_ADMIN_ONLY otherwise.
 *   POST   /:id/reset-password  { password? } → { temporaryPassword: string | null, signedOutSessions }
 *                                400 (own account: use My Profile) · 400 WEAK_PASSWORD · 404 · 429 after 20 / 10 min per admin
 */
const router = Router();
router.use(authenticate, requireRole(...FORM_CONFIG_ADMIN_ROLES));

const resetPasswordLimiter = createRateLimiter({
    keyPrefix: 'ratelimit:admin-password-reset',
    max: 20,
    windowSeconds: 10 * 60,
    keyGenerator: (req: Request) => `user:${req.user?.id ?? 'unknown'}`,
    message: 'Too many password resets. Please wait a few minutes.',
});

const idOf = (req: Request) => Number(req.params.id);

router.get('/', validateRequest({ query: listUsersQuerySchema }), async (req: Request, res: Response) => {
    const { data, meta } = await userAdminService.list(req.query as unknown as ListUsersQuery);
    res.status(StatusCodes.OK).json({ success: true, data, meta });
});

router.get('/meta', async (_req: Request, res: Response) => {
    sendSuccess(res, await userAdminService.meta());
});

router.get('/:id', validateRequest({ params: userIdParamSchema }), async (req: Request, res: Response) => {
    sendSuccess(res, await userAdminService.get(idOf(req)));
});

router.post('/', validateRequest({ body: createUserSchema }), async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    sendSuccess(res, await userAdminService.create(requireUser(req), req.body as CreateUserInput), 'User added', StatusCodes.CREATED);
});

router.patch('/:id', validateRequest({ params: userIdParamSchema, body: updateUserSchema }), async (req: Request, res: Response) => {
    sendSuccess(res, await userAdminService.update(requireUser(req), idOf(req), req.body as UpdateUserInput), 'User updated');
});

router.post('/:id/deactivate', validateRequest({ params: userIdParamSchema }), async (req: Request, res: Response) => {
    sendSuccess(res, await userAdminService.deactivate(requireUser(req), idOf(req)), 'User deactivated');
});

router.post('/:id/activate', validateRequest({ params: userIdParamSchema }), async (req: Request, res: Response) => {
    sendSuccess(res, await userAdminService.activate(requireUser(req), idOf(req)), 'User activated');
});

router.post(
    '/:id/reset-password',
    resetPasswordLimiter,
    validateRequest({ params: userIdParamSchema, body: resetPasswordSchema }),
    async (req: Request, res: Response) => {
        res.setHeader('Cache-Control', 'no-store');
        sendSuccess(res, await userAdminService.resetPassword(requireUser(req), idOf(req), req.body as ResetPasswordInput), 'Password reset');
    },
);

export default router;
