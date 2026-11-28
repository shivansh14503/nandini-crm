import { Router, type Request, type Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { authenticate, requireAdmin } from '../../middlewares/authMiddleware.js';
import { createRateLimiter } from '../../middlewares/rateLimiter.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { requireUser } from '../../utils/requestContext.js';
import { userAdminService } from './userAdmin.service.js';
import {
    createUserSchema,
    listUsersQuerySchema,
    updateUserSchema,
    userIdParamSchema,
    type CreateUserInput,
    type ListUsersQuery,
    type UpdateUserInput,
} from './userAdmin.validator.js';

/**
 * /api/admin/users (Admin › Users; admin roles only). Bodies are strict (an unknown key → 400). Every write is audited
 * as the acting admin (User CREATE / UPDATE / STATUS_CHANGE / INVITE_SENT) and drops the user lookup caches. Admins
 * never see or set a password: users set their own from a one-time emailed link (auth/invite.service.ts).
 *
 *   GET    /                    ?search&status=active|inactive|all (active)&role&department&page&pageSize (≤ 100, 25)
 *                                → { success, data: AdminUserDto[], meta: { total, page, pageSize } }  by fullName, username
 *   GET    /meta                → { roles: [{ name, access, adminPanel, allRecords, userCount }], departments: [{ name, userCount }],
 *                                   managers: [{ id, name, username, photoUrl }] (active, non-group), companyDomains }
 *   GET    /:id                 → AdminUserDto   404
 *   POST   /                    { username, firstName, lastName?, email, allowOtherDomain?, role, department?, jobTitle?,
 *                                 reportsToId?, mobile?, officePhone?, isGroupUser? }   (email required: the invite goes there)
 *                                → 201 { user: AdminUserDto (invitePending: true), invite: { status: sent | failed |
 *                                  mail_disabled, purpose, sentTo, expiresAt? , error? } }   (added even when the email failed)
 *                                409 DUPLICATE_RECORD (username | email) · 400 VALIDATION_ERROR · 400 INVALID_MANAGER
 *   PATCH  /:id                 { firstName?, lastName?, email?, allowOtherDomain?, role?, department?, jobTitle?, reportsToId?,
 *                                 mobile?, officePhone?, isGroupUser?, onLeave? } → AdminUserDto (+ signedOutSessions when the
 *                                 role changed: the user is signed out so the new role applies)
 *                                400 INVALID_MANAGER · 400 SELF_LOCKOUT · 400 LAST_ADMIN · 409 DUPLICATE_RECORD (email) · 404
 *   POST   /:id/deactivate      → AdminUserDto + { signedOutSessions }   400 SELF_LOCKOUT · 400 LAST_ADMIN · 404
 *   POST   /:id/activate        → AdminUserDto + { signedOutSessions: null }   409 DUPLICATE_RECORD (email) · 404
 *   POST   /:id/unlock          ("Unlock account") ends a lock after too many wrong passwords and resets the count
 *                                → AdminUserDto (lockedUntil: null) + { unlocked } (false: nothing to clear)   404
 *                                Audited as ACCOUNT_UNLOCKED.
 *   Super Admin users (and the Super Admin role) can only be added, edited, deactivated, activated, unlocked or sent a link by a
 *   Super Admin: 403 SUPER_ADMIN_ONLY otherwise.
 *   POST   /:id/send-invite     (no body) emails a new set-password link (72 h, single use) and stops the older ones:
 *                                the invite again for an Invited user ("Resend invite"), a password reset link otherwise
 *                                → { user: AdminUserDto, purpose: invite | reset, sentTo, expiresAt }
 *                                400 (own account: use My Profile) · 400 USER_INACTIVE · 400 NO_EMAIL · 404
 *                                502 INVITE_EMAIL_FAILED · 503 MAIL_DISABLED (message says why) · 429 after 20 / 10 min per admin
 */
const router = Router();
router.use(authenticate, requireAdmin);

const sendInviteLimiter = createRateLimiter({
    keyPrefix: 'ratelimit:admin-send-invite',
    max: 20,
    windowSeconds: 10 * 60,
    keyGenerator: (req: Request) => `user:${req.user?.id ?? 'unknown'}`,
    message: 'Too many emails sent. Please wait a few minutes.',
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

router.post('/:id/unlock', validateRequest({ params: userIdParamSchema }), async (req: Request, res: Response) => {
    const result = await userAdminService.unlock(requireUser(req), idOf(req));
    sendSuccess(res, result, result.unlocked ? 'Account unlocked' : 'Account was not locked');
});

router.post('/:id/send-invite', sendInviteLimiter, validateRequest({ params: userIdParamSchema }), async (req: Request, res: Response) => {
    const result = await userAdminService.sendInvite(requireUser(req), idOf(req));
    sendSuccess(res, result, result.purpose === 'invite' ? 'Invite sent' : 'Password reset link sent');
});

export default router;
