import type { Response, CookieOptions } from 'express';
import { ENV } from '../config/env.js';

export function getAuthCookieOptions(): CookieOptions {
    return {
        httpOnly: true,
        secure: ENV.IS_PRODUCTION,
        sameSite: ENV.IS_PRODUCTION ? 'none' : 'lax',
        maxAge: ENV.COOKIE.MAX_AGE_MS,
        path: '/',
    };
}

export function setAuthCookie(res: Response, token: string): void {
    res.cookie(ENV.COOKIE.NAME, token, getAuthCookieOptions());
}

export function clearAuthCookie(res: Response): void {
    res.clearCookie(ENV.COOKIE.NAME, {
        httpOnly: true,
        secure: ENV.IS_PRODUCTION,
        sameSite: ENV.IS_PRODUCTION ? 'none' : 'lax',
        path: '/',
    });
}
