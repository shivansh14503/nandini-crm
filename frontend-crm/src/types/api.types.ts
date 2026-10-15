import type { User } from './auth.types';

export interface AuthResponse {
    status: string;
    message?: string;
    user: User;
}

export interface LogoutResponse {
    status: string;
    message: string;
}

export interface ApiFieldError {
    message: string;
    path: string[];
}

export interface ApiError {
    message: string;
    errors?: ApiFieldError[];
}
