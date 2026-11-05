import { ENV } from '../config/env';
import type { ApiError, PaginationParams } from '../types/api.types';

export interface RequestOptions extends RequestInit {
    params?: PaginationParams;
}

export type RequestInterceptor = (
    url: string,
    options: RequestInit
) => Promise<{ url: string; options: RequestInit }> | { url: string; options: RequestInit };

export type ResponseInterceptor = (response: Response) => Promise<Response> | Response;

export type ErrorInterceptor = (error: ApiClientError) => Promise<never> | never;

export class ApiClientError extends Error {
    public readonly status?: number;
    public readonly details?: ApiError;

    constructor(message: string, status?: number, details?: ApiError) {
        super(message);
        this.name = 'ApiClientError';
        this.status = status;
        this.details = details;
    }
}

export function normalizeApiError(error: unknown, fallbackStatus?: number): ApiClientError {
    if (error instanceof ApiClientError) {
        return error;
    }
    if (error instanceof Error) {
        return new ApiClientError(error.message || 'Network or client error occurred.', fallbackStatus, {
            message: error.message || 'Network or client error occurred.',
            status: fallbackStatus,
        });
    }
    return new ApiClientError('An unexpected error occurred.', fallbackStatus, {
        message: 'An unexpected error occurred.',
        status: fallbackStatus,
    });
}

const requestInterceptors: RequestInterceptor[] = [
    (url, options) => {
        const headers = new Headers(options.headers);
        if (!headers.has('Accept')) {
            headers.set('Accept', 'application/json');
        }
        if (!headers.has('Content-Type') && options.body && !(options.body instanceof FormData)) {
            headers.set('Content-Type', 'application/json');
        }
        return {
            url,
            options: {
                ...options,
                headers,
                credentials: options.credentials ?? 'include',
            },
        };
    },
];

const responseInterceptors: ResponseInterceptor[] = [];
const errorInterceptors: ErrorInterceptor[] = [];

function buildUrl(endpoint: string, params?: PaginationParams): string {
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const base = `${ENV.API_URL}${cleanEndpoint}`;
    if (!params) return base;

    const qs = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
            qs.set(key, String(value));
        }
    });
    const queryString = qs.toString();
    if (!queryString) return base;
    return base.includes('?') ? `${base}&${queryString}` : `${base}?${queryString}`;
}

/** Long enough to cover the backend reconnecting to a cold database (its own connect timeout is 30s). */
const REQUEST_TIMEOUT_MS = 30_000;
const TIMEOUT_MESSAGE = 'The server is taking too long to respond. Please try again in a moment.';

function isTimeoutError(err: unknown): boolean {
    return err instanceof DOMException && err.name === 'TimeoutError';
}

/**
 * Applies the default timeout when the caller passed no signal of its own. A timed-out GET is retried once,
 * because the first request after a long idle period can be the one that wakes the backend's database.
 */
async function fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
    const canTimeout = !options.signal && typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function';
    if (!canTimeout) return fetch(url, options);

    const attempts = (options.method ?? 'GET').toUpperCase() === 'GET' ? 2 : 1;
    for (let attempt = 1; ; attempt++) {
        try {
            return await fetch(url, { ...options, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
        } catch (err) {
            if (!isTimeoutError(err) || attempt >= attempts) throw err;
        }
    }
}

async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const { params, ...fetchInit } = options;
    let currentUrl = buildUrl(endpoint, params);
    let currentOptions: RequestInit = fetchInit;

    try {
        for (const interceptor of requestInterceptors) {
            const next = await interceptor(currentUrl, currentOptions);
            currentUrl = next.url;
            currentOptions = next.options;
        }

        let response = await fetchWithTimeout(currentUrl, currentOptions);

        for (const interceptor of responseInterceptors) {
            response = await interceptor(response);
        }

        if (!response.ok) {
            let errorData: ApiError;
            try {
                errorData = await response.json();
            } catch {
                errorData = {
                    message: `HTTP ${response.status}: ${response.statusText}`,
                    status: response.status,
                };
            }
            throw new ApiClientError(
                errorData.message || 'An unexpected error occurred.',
                response.status,
                { ...errorData, status: response.status }
            );
        }

        if (response.status === 204) {
            return undefined as T;
        }

        return (await response.json()) as T;
    } catch (err: unknown) {
        const normalized = isTimeoutError(err)
            ? new ApiClientError(TIMEOUT_MESSAGE, 408, { message: TIMEOUT_MESSAGE, status: 408 })
            : normalizeApiError(err);
        for (const onError of errorInterceptors) {
            await onError(normalized);
        }
        throw normalized;
    }
}

export const apiClient = {
    interceptors: {
        request: {
            use: (fn: RequestInterceptor) => {
                requestInterceptors.push(fn);
            },
        },
        response: {
            use: (onFulfilled: ResponseInterceptor, onRejected?: ErrorInterceptor) => {
                responseInterceptors.push(onFulfilled);
                if (onRejected) {
                    errorInterceptors.push(onRejected);
                }
            },
        },
    },

    get: <T>(endpoint: string, options?: RequestOptions) =>
        request<T>(endpoint, { ...options, method: 'GET' }),

    post: <T>(endpoint: string, body?: unknown, options?: RequestOptions) =>
        request<T>(endpoint, {
            ...options,
            method: 'POST',
            body: body !== undefined ? JSON.stringify(body) : undefined,
        }),

    put: <T>(endpoint: string, body?: unknown, options?: RequestOptions) =>
        request<T>(endpoint, {
            ...options,
            method: 'PUT',
            body: body !== undefined ? JSON.stringify(body) : undefined,
        }),

    patch: <T>(endpoint: string, body?: unknown, options?: RequestOptions) =>
        request<T>(endpoint, {
            ...options,
            method: 'PATCH',
            body: body !== undefined ? JSON.stringify(body) : undefined,
        }),

    delete: <T>(endpoint: string, options?: RequestOptions) =>
        request<T>(endpoint, { ...options, method: 'DELETE' }),
};
