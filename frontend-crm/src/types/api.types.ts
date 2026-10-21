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
    status?: number;
    code?: string;
    errors?: ApiFieldError[];
}

export interface ApiResponse<T> {
    success: boolean;
    data: T;
    message?: string;
}

export interface PaginatedResponse<T> {
    success: boolean;
    data: T[];
    total: number;
    page: number;
    limit: number;
}

export interface PaginationParams {
    page?: number;
    limit?: number;
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    [key: string]: string | number | boolean | undefined;
}
