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

/**
 * Tells the API a request comes from this web app, and from which screen, for the admin audit log
 * (backend-crm/src/services/auditContext.ts: entries get source "UI" and the page path). Only the path is sent,
 * never the query string.
 */
export function setAuditHeaders(headers: Headers): void {
    headers.set('X-CRM-Client', 'web');
    if (typeof window !== 'undefined') headers.set('X-CRM-Page', window.location.pathname);
}

const requestInterceptors: RequestInterceptor[] = [
    (url, options) => {
        const headers = new Headers(options.headers);
        setAuditHeaders(headers);
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

/** Notified of every failed request (after the error interceptors); the error is still thrown to the caller. */
export type ApiErrorListener = (error: ApiClientError) => void;
const errorListeners = new Set<ApiErrorListener>();

/**
 * Watches every failed API request app-wide, e.g. a 403 PASSWORD_CHANGE_REQUIRED (AuthContext). Returns the
 * unsubscribe function. A listener that throws is ignored, so it can never change the caller's error.
 */
export function subscribeApiErrors(listener: ApiErrorListener): () => void {
    errorListeners.add(listener);
    return () => {
        errorListeners.delete(listener);
    };
}

/** Tells every listener about a failed request; a listener that throws is ignored. */
export function notifyApiError(error: ApiClientError): void {
    for (const listener of errorListeners) {
        try {
            listener(error);
        } catch {
            // A listener's own failure must not replace the request's error.
        }
    }
}

/**
 * Session hold: set by AuthContext while the session-expired dialog is up (`sessionExpired`). The browser's session
 * cookie is shared by every tab, so someone else may have signed in elsewhere in the meantime; until the user signs in
 * again here, every request except the sign-in itself (POST /api/auth/login) and the session check (GET /api/auth/me)
 * is refused locally with a 401, before it reaches the network. No background read can then load another account's
 * data into this tab's cache, and no Save can write this user's draft under another account.
 */
let sessionOnHold = false;
const HOLD_ALLOWED = new Set(['POST /api/auth/login', 'GET /api/auth/me']);
const SESSION_HOLD_MESSAGE = 'Your session has ended. Sign in again to continue.';

export function setSessionOnHold(onHold: boolean): void {
    sessionOnHold = onHold;
}

/** The local 401 for a request refused by the session hold, or null when it may go out. */
function sessionHoldError(method: string, endpoint?: string): ApiClientError | null {
    if (!sessionOnHold) return null;
    if (endpoint && HOLD_ALLOWED.has(`${method.toUpperCase()} ${endpoint.split('?')[0]}`)) return null;
    return new ApiClientError(SESSION_HOLD_MESSAGE, 401, { message: SESSION_HOLD_MESSAGE, status: 401, code: 'SESSION_ON_HOLD' });
}

/**
 * For the few callers that need `fetch` itself (files, PDFs): throws the session hold's 401 (and tells the error
 * listeners, like apiClient does) while the session is on hold.
 */
export function assertSessionNotOnHold(): void {
    const held = sessionHoldError('GET');
    if (!held) return;
    notifyApiError(held);
    throw held;
}

/**
 * `fetch` with the session cookie for a non-JSON response (a file download or preview): refused while the session is
 * on hold, and a 401 answer is reported to the error listeners, so it ends the session like any API call. The caller
 * still checks `response.ok`.
 */
export async function fetchWithSession(url: string, init: RequestInit = {}): Promise<Response> {
    assertSessionNotOnHold();
    const response = await fetch(url, { ...init, credentials: 'include' });
    if (response.status === 401) {
        notifyApiError(new ApiClientError(SESSION_HOLD_MESSAGE, 401, { message: SESSION_HOLD_MESSAGE, status: 401 }));
    }
    return response;
}

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
        const held = sessionHoldError(fetchInit.method ?? 'GET', endpoint);
        if (held) throw held;

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
        notifyApiError(normalized);
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
