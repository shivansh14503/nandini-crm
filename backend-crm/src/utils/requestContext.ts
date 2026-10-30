import type { Request } from 'express';
import { HttpError } from './httpError.js';
import type { AuthUser } from '../types/user.types.js';

/** The signed-in user for a route behind `authenticate` (throws 401 if the middleware was skipped). */
export function requireUser(req: Request): AuthUser {
    if (!req.user) throw HttpError.unauthorized();
    return req.user;
}
