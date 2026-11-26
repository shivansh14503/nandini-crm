import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { authService } from './auth.service.js';
import { readToken, tryVerifyToken } from '../../middlewares/authMiddleware.js';
import { setAuthCookie, clearAuthCookie } from './cookie.util.js';
import type { ChangePasswordInput, LoginInput } from './auth.validator.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { HttpError } from '../../utils/httpError.js';
import { requireUser } from '../../utils/requestContext.js';
import { logger } from '../../config/logger.js';
import type { AuthMeDto } from '../profile/profile.dto.js';

// Responses keep the existing `AuthResponse` / `LogoutResponse` shapes the frontend's AuthContext reads.

/** POST /api/auth/login — body already validated by `validateRequest({ body: loginSchema })`. */
export async function login(req: Request, res: Response): Promise<void> {
    const { user, token } = await authService.loginUser(req.body as LoginInput, {
        ip: req.ip,
        userAgent: req.get('user-agent'),
    });

    setAuthCookie(res, token);
    res.status(StatusCodes.OK).json({ status: 'ok', message: 'Login successful', user });
}

/** POST /api/auth/logout — always clears the cookie; revokes the session too when the token is still valid. */
export async function logout(req: Request, res: Response): Promise<void> {
    const verified = tryVerifyToken(readToken(req));
    if (verified) await authService.logout(verified, verified);

    clearAuthCookie(res);
    res.status(StatusCodes.OK).json({ status: 'ok', message: 'Logged out successfully' });
}

/**
 * GET /api/auth/me — requires `authenticate`. Read from the database (not the JWT) so a name or photo change shows at
 * once: `{ id, username, role, fullName, firstName, lastName, photoUrl }`. 401 when the account no longer exists.
 * When the database can't answer (outage, a paused Azure SQL resuming), it falls back to the verified JWT's claims
 * with no name or photo, so a database blip never signs the user out.
 */
export async function getMe(req: Request, res: Response): Promise<void> {
    const authUser = requireUser(req);
    let user: AuthMeDto;
    try {
        user = await authService.me(authUser.id);
    } catch (err) {
        if (err instanceof HttpError) throw err;
        logger.warn({ err: (err as Error).message, userId: authUser.id }, 'GET /api/auth/me: database unavailable; answering from the token');
        user = { id: authUser.id, username: authUser.username, role: authUser.role, fullName: '', firstName: null, lastName: null, photoUrl: null };
    }
    res.status(StatusCodes.OK).json({ status: 'ok', user });
}

/** POST /api/auth/change-password — requires `authenticate`; body validated by `changePasswordSchema`. */
export async function changePassword(req: Request, res: Response): Promise<void> {
    if (!req.auth) throw HttpError.unauthorized();
    const result = await authService.changePassword(requireUser(req), req.auth, req.body as ChangePasswordInput);
    sendSuccess(res, result, 'Password changed');
}
