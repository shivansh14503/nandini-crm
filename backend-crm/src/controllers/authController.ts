import type { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
import { authService } from '../services/auth.service.js';
import { validateLoginInput } from '../utils/auth.validator.js';
import { setAuthCookie, clearAuthCookie } from '../utils/cookie.util.js';
import type { AuthenticatedRequest } from '../types/user.types.js';

export async function login(
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<Response | void> {
    try {
        // 1. Validate request body with validator utility
        const credentials = validateLoginInput(req.body);

        // 2. Delegate to auth service
        const { user, token } = await authService.loginUser(credentials);

        // 3. Set secure HTTP-only cookie
        setAuthCookie(res, token);

        // 4. Return successful response
        return res.status(StatusCodes.OK).json({
            status: 'ok',
            message: 'Login successful',
            user,
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(StatusCodes.BAD_REQUEST).json({
                status: 'error',
                errors: error.issues,
            });
        }
        return next(error);
    }
}

export function logout(_req: Request, res: Response): Response {
    clearAuthCookie(res);
    return res.status(StatusCodes.OK).json({
        status: 'ok',
        message: 'Logged out successfully',
    });
}
