import type { Request } from 'express';

export interface UserRow {
    Id: number;
    Username: string;
    Password: string;
    Role: string;
}

export interface AuthUser {
    id: number;
    username: string;
    role: string;
}

export interface AuthenticatedRequest extends Request {
    user?: AuthUser;
}
