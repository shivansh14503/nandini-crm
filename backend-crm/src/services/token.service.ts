import jwt, { type SignOptions } from 'jsonwebtoken';
import { ENV } from '../config/env.js';
import type { AuthUser } from '../types/user.types.js';

export const tokenService = {
    generateToken(user: AuthUser, expiresIn: SignOptions['expiresIn'] = '8h'): string {
        return jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            ENV.JWT_SECRET,
            { expiresIn },
        );
    },

    verifyToken(token: string): AuthUser {
        return jwt.verify(token, ENV.JWT_SECRET) as AuthUser;
    },
};
