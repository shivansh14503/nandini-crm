import type { z } from 'zod';
import type { CalendarProviderKey, FetchImpl } from './types.js';

/**
 * `providerFetch`: every call to Google / Microsoft goes through here (Calendar Phase 2 spec §7.3). Timeouts,
 * in-place retries with `Retry-After` / full-jitter backoff, a per-process pause after a long 429, the answer parsed
 * with a per-operation zod schema, and typed errors.
 *
 * Error messages are `"<provider> <operation> failed: <status> <code>"` and NOTHING else: never a URL (Graph delta
 * links carry `$deltatoken`, Google `syncToken`), a query, a request or response body (customer names, tokens), or a
 * header. `ProviderBadRequestError.providerMessage` keeps the provider's own short text (≤ 300) for the people who may
 * see it; it is never logged by this module.
 */

export class ProviderError extends Error {
    readonly provider: string;
    readonly operation: string;
    /** HTTP status, 0 for network errors and timeouts. */
    readonly status: number;
    /** OAuth `error`, Google `error.errors[0].reason`, Graph `error.code`, AADSTS code, or a fixed code of ours. */
    readonly code: string;
    readonly retryable: boolean;
    readonly retryAfterMs: number | null;

    constructor(init: { provider: string; operation: string; status: number; code: string; retryable?: boolean; retryAfterMs?: number | null }) {
        super(`${init.provider} ${init.operation} failed: ${init.status} ${init.code}`);
        this.name = new.target.name;
        this.provider = init.provider;
        this.operation = init.operation;
        this.status = init.status;
        this.code = init.code;
        this.retryable = init.retryable ?? false;
        this.retryAfterMs = init.retryAfterMs ?? null;
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

/** 401; Google 403 insufficientPermissions; token endpoint invalid_grant; AADSTS700082 / 50173; interaction_required. */
export class ProviderAuthError extends ProviderError {}
/** Token endpoint invalid_client / unauthorized_client: the company app's credentials (an admin problem, not the user's). */
export class ProviderClientError extends ProviderError {}
/** 404, or 410 on a resource. */
export class ProviderNotFoundError extends ProviderError {}
/** 412 (etag mismatch). */
export class ProviderPreconditionError extends ProviderError {}
/** 409. */
export class ProviderConflictError extends ProviderError {}
/** A sync cursor the provider no longer accepts (Google list 410, Graph 410 / syncStateNotFound): full resync. */
export class CursorExpiredError extends ProviderError {}
/** 429 / rate-limit 403 / 503 with Retry-After, after the in-place retries (or a Retry-After too long to wait). */
export class ProviderRateLimitedError extends ProviderError {}
/** 5xx, network errors, timeouts, an answer we couldn't read. */
export class ProviderTransientError extends ProviderError {}
/** Any other 4xx. `providerMessage` = the provider's error text, trimmed to 300 (may name an address: owner only). */
export class ProviderBadRequestError extends ProviderError {
    readonly providerMessage: string;

    constructor(init: ConstructorParameters<typeof ProviderError>[0] & { providerMessage?: string }) {
        super(init);
        this.providerMessage = (init.providerMessage ?? '').slice(0, 300);
    }
}

export const DEFAULT_ATTEMPTS = 3;
export const DEFAULT_TIMEOUT_MS = 15_000;
/** Longest Retry-After waited in place; longer → ProviderRateLimitedError at once (the job reschedules itself). */
export const MAX_IN_PLACE_WAIT_MS = 30_000;
/** A 429 asking for at least this long pauses every call to that provider in this process. */
export const PAUSE_THRESHOLD_MS = 60_000;
const BACKOFF_BASE_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;

/** `Retry-After` in milliseconds: delta seconds or an HTTP date; null when absent or unreadable. Pure. */
export function parseRetryAfter(value: string | null | undefined, now: number = Date.now()): number | null {
    if (value === null || value === undefined) return null;
    const text = value.trim();
    if (!text) return null;
    if (/^\d+(\.\d+)?$/.test(text)) return Math.round(Number(text) * 1000);
    const at = Date.parse(text);
    if (Number.isNaN(at)) return null;
    return Math.max(0, at - now);
}

/** Full-jitter exponential backoff for attempt n (1-based): random in [0, min(max, base · 2^(n-1))]. Pure. */
export function backoffDelay(attempt: number, random: () => number = Math.random, baseMs = BACKOFF_BASE_MS, maxMs = BACKOFF_MAX_MS): number {
    const cap = Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt - 1));
    return Math.floor(random() * cap);
}

/** Per-process pause after a long 429 (precedent: email-verification/provider.ts). */
const pausedUntil = new Map<string, number>();
export function providerPausedUntil(provider: string): number | null {
    return pausedUntil.get(provider) ?? null;
}
export function resetProviderPauses(): void {
    pausedUntil.clear();
}

export interface ProviderRequest {
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
    url: string;
    headers?: Record<string, string>;
    /** A form body (token endpoints) or a JSON string. */
    body?: URLSearchParams | string;
    provider: CalendarProviderKey | string;
    /** Short fixed name (`token`, `refresh`, `revoke`, `me`, …): it appears in error messages and logs. */
    operation: string;
}

export interface ProviderFetchOptions<T> {
    attempts?: number;
    timeoutMs?: number;
    fetchImpl?: FetchImpl;
    /** Parses a 2xx body; unknown fields are ignored. Omitted = the raw JSON (or null). */
    schema?: z.ZodType<T>;
    /** A 410 / syncStateNotFound means the sync cursor expired (list-changes calls). */
    cursor?: boolean;
    sleep?: (ms: number) => Promise<void>;
    random?: () => number;
    now?: () => number;
}

export interface ProviderResponse<T> {
    status: number;
    headers: Headers;
    json: T;
}

const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
const GOOGLE_RATE_REASONS = new Set(['rateLimitExceeded', 'userRateLimitExceeded']);
const AUTH_OAUTH_ERRORS = new Set(['invalid_grant', 'interaction_required', 'invalid_token']);
const CLIENT_OAUTH_ERRORS = new Set(['invalid_client', 'unauthorized_client']);
/** Entra: refresh token expired (700082) / revoked by a password change or the user (50173), consent needed (65001). */
const AUTH_AADSTS = new Set(['AADSTS700082', 'AADSTS50173', 'AADSTS65001', 'AADSTS50076', 'AADSTS50078', 'AADSTS50079']);

interface ErrorBits {
    code: string;
    message: string;
}

/** The provider's error code and text from a JSON error body (OAuth, Google, Graph shapes). Pure. */
export function errorBitsOf(json: unknown): ErrorBits {
    if (!json || typeof json !== 'object') return { code: '', message: '' };
    const body = json as Record<string, unknown>;
    // OAuth token endpoints: { error: 'invalid_grant', error_description: 'AADSTS700082: …' }
    if (typeof body.error === 'string') {
        const description = typeof body.error_description === 'string' ? body.error_description : '';
        const aadsts = description.match(/\bAADSTS\d+\b/)?.[0] ?? (Array.isArray(body.error_codes) && body.error_codes.length ? `AADSTS${String(body.error_codes[0])}` : '');
        return { code: AUTH_AADSTS.has(aadsts) ? aadsts : body.error, message: description };
    }
    if (body.error && typeof body.error === 'object') {
        const error = body.error as Record<string, unknown>;
        const reasons = Array.isArray(error.errors) ? (error.errors as Record<string, unknown>[]) : [];
        const reason = typeof reasons[0]?.reason === 'string' ? (reasons[0].reason as string) : '';
        // Google: { error: { code: 403, message, errors: [{ reason }], status } }; Graph: { error: { code, message } }
        const code = reason || (typeof error.code === 'string' ? error.code : '') || (typeof error.status === 'string' ? error.status : '');
        return { code, message: typeof error.message === 'string' ? error.message : '' };
    }
    return { code: '', message: '' };
}

/** The error class for a final (non-retried) answer. Pure. */
export function classifyFailure(
    status: number,
    bits: ErrorBits,
    ctx: { provider: string; operation: string; cursor?: boolean; retryAfterMs?: number | null },
): ProviderError {
    const base = { provider: ctx.provider, operation: ctx.operation, status, code: bits.code || `http_${status}` };
    if (CLIENT_OAUTH_ERRORS.has(bits.code)) return new ProviderClientError(base);
    if (AUTH_OAUTH_ERRORS.has(bits.code) || AUTH_AADSTS.has(bits.code)) return new ProviderAuthError(base);
    if (ctx.cursor && (status === 410 || bits.code === 'syncStateNotFound' || bits.code === 'fullSyncRequired')) return new CursorExpiredError(base);
    if (status === 401) return new ProviderAuthError(base);
    if (status === 403 && bits.code === 'insufficientPermissions') return new ProviderAuthError(base);
    if (status === 429 || (status === 403 && GOOGLE_RATE_REASONS.has(bits.code))) {
        return new ProviderRateLimitedError({ ...base, retryable: true, retryAfterMs: ctx.retryAfterMs ?? null });
    }
    if (status === 503 && ctx.retryAfterMs !== null && ctx.retryAfterMs !== undefined) {
        return new ProviderRateLimitedError({ ...base, retryable: true, retryAfterMs: ctx.retryAfterMs });
    }
    if (status >= 500) return new ProviderTransientError({ ...base, retryable: true });
    if (status === 404 || status === 410) return new ProviderNotFoundError(base);
    if (status === 409) return new ProviderConflictError(base);
    if (status === 412) return new ProviderPreconditionError(base);
    return new ProviderBadRequestError({ ...base, providerMessage: bits.message });
}

const isRetryableStatus = (status: number, bits: ErrorBits) => RETRY_STATUSES.has(status) || (status === 403 && GOOGLE_RATE_REASONS.has(bits.code));

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function readJson(response: Response): Promise<unknown> {
    const text = await response.text().catch(() => '');
    if (!text) return null;
    try {
        return JSON.parse(text) as unknown;
    } catch {
        return null;
    }
}

/**
 * One provider call with retries. Resolves with the parsed 2xx answer; rejects with a `ProviderError` subclass.
 * Retries in place: 429, 500, 502, 503, 504, Google rate-limit 403s, network errors and timeouts, waiting
 * `Retry-After` when given (≤ 30 s) or a full-jitter backoff.
 */
export async function providerFetch<T = unknown>(req: ProviderRequest, options: ProviderFetchOptions<T> = {}): Promise<ProviderResponse<T>> {
    const attempts = Math.max(1, options.attempts ?? DEFAULT_ATTEMPTS);
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const fetchImpl: FetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
    const sleep = options.sleep ?? defaultSleep;
    const now = options.now ?? Date.now;
    const ctx = { provider: String(req.provider), operation: req.operation, cursor: options.cursor };

    const paused = pausedUntil.get(ctx.provider);
    if (paused && paused > now()) {
        throw new ProviderRateLimitedError({ ...ctx, status: 429, code: 'paused', retryable: true, retryAfterMs: paused - now() });
    }

    const headers: Record<string, string> = { Accept: 'application/json', ...(req.headers ?? {}) };
    let body: string | undefined;
    if (req.body instanceof URLSearchParams) {
        body = req.body.toString();
        headers['Content-Type'] ??= 'application/x-www-form-urlencoded';
    } else if (typeof req.body === 'string') {
        body = req.body;
        headers['Content-Type'] ??= 'application/json';
    }

    let lastError: ProviderError | null = null;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        let response: Response;
        try {
            response = await fetchImpl(req.url, { method: req.method, headers, body, signal: AbortSignal.timeout(timeoutMs), redirect: 'manual' });
        } catch (err) {
            const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
            lastError = new ProviderTransientError({ ...ctx, status: 0, code: timedOut ? 'timeout' : 'network', retryable: true });
            if (attempt < attempts) await sleep(backoffDelay(attempt, options.random));
            continue;
        }

        if (response.status >= 200 && response.status < 300) {
            const json = response.status === 204 ? null : await readJson(response);
            if (!options.schema) return { status: response.status, headers: response.headers, json: json as T };
            const parsed = options.schema.safeParse(json);
            // The zod issues are not passed on: they could quote what the provider sent.
            if (!parsed.success) throw new ProviderTransientError({ ...ctx, status: response.status, code: 'bad_response' });
            return { status: response.status, headers: response.headers, json: parsed.data };
        }

        const json = await readJson(response);
        const bits = errorBitsOf(json);
        const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'), now());
        if (response.status === 429 && retryAfterMs !== null && retryAfterMs >= PAUSE_THRESHOLD_MS) {
            pausedUntil.set(ctx.provider, now() + retryAfterMs);
        }
        const failure = classifyFailure(response.status, bits, { ...ctx, retryAfterMs });
        if (!isRetryableStatus(response.status, bits)) throw failure;
        if (retryAfterMs !== null && retryAfterMs > MAX_IN_PLACE_WAIT_MS) {
            throw new ProviderRateLimitedError({ ...ctx, status: response.status, code: failure.code, retryable: true, retryAfterMs });
        }
        lastError = failure;
        if (attempt < attempts) await sleep(retryAfterMs ?? backoffDelay(attempt, options.random));
    }
    throw lastError ?? new ProviderTransientError({ ...ctx, status: 0, code: 'unknown', retryable: true });
}
