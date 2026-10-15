import type { Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';
import { ENV } from '../config/env.js';
import { tokenService } from '../services/token.service.js';
import { HttpError } from './errorHandler.js';
import type { AuthenticatedRequest } from '../types/user.types.js';

export function authenticate(
    req: AuthenticatedRequest,
    _res: Response,
    next: NextFunction,
): void {
    const token =
        req.cookies?.[ENV.COOKIE.NAME] ||
        req.headers.authorization?.replace(/^Bearer\s+/i, '');

    if (!token) {
        return next(new HttpError('Authentication required', StatusCodes.UNAUTHORIZED));
    }

    try {
        const decoded = tokenService.verifyToken(token);
        req.user = decoded;
        next();
    } catch {
        next(new HttpError('Invalid or expired session token', StatusCodes.UNAUTHORIZED));
    }
}
