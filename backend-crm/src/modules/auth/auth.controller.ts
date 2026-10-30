import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { authService } from './auth.service.js';
import { readToken, tryVerifyToken } from '../../middlewares/authMiddleware.js';
import { setAuthCookie, clearAuthCookie } from './cookie.util.js';
import type { LoginInput } from './auth.validator.js';

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

/** GET /api/auth/me — requires `authenticate`. */
export function getMe(req: Request, res: Response): void {
    res.status(StatusCodes.OK).json({ status: 'ok', user: req.user });
}
