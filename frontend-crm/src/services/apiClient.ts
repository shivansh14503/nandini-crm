import { ENV } from '../config/env';
import type { ApiError } from '../types/api.types';

export class ApiClientError extends Error {
    constructor(
        message: string,
        public status?: number,
        public details?: ApiError
    ) {
        super(message);
        this.name = 'ApiClientError';
    }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${ENV.API_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

    const headers = new Headers(options.headers);
    if (!headers.has('Content-Type') && options.body && !(options.body instanceof FormData)) {
        headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(url, {
        ...options,
        headers,
        credentials: 'include', // Automatically sends and receives httpOnly cookies
    });

    if (!response.ok) {
        let errorData: ApiError;
        try {
            errorData = await response.json();
        } catch {
            errorData = { message: `HTTP ${response.status}: ${response.statusText}` };
        }
        throw new ApiClientError(
            errorData.message || 'An unexpected error occurred.',
            response.status,
            errorData
        );
    }

    return response.json() as Promise<T>;
}

export const apiClient = {
    get: <T>(endpoint: string, options?: RequestInit) =>
        request<T>(endpoint, { ...options, method: 'GET' }),

    post: <T>(endpoint: string, body?: unknown, options?: RequestInit) =>
        request<T>(endpoint, {
            ...options,
            method: 'POST',
            body: body ? JSON.stringify(body) : undefined,
        }),

    put: <T>(endpoint: string, body?: unknown, options?: RequestInit) =>
        request<T>(endpoint, {
            ...options,
            method: 'PUT',
            body: body ? JSON.stringify(body) : undefined,
        }),

    delete: <T>(endpoint: string, options?: RequestInit) =>
        request<T>(endpoint, { ...options, method: 'DELETE' }),
};
