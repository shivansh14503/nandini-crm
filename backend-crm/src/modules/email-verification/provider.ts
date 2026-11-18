import { ENV } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import type { EmailVerificationStatus } from './localChecks.js';

/** Mailbox-level answer from the provider; `null` status = provider couldn't decide (not charged, retried later). */
export interface ProviderResult {
    status: EmailVerificationStatus | null;
    reason: string;
}

const API_URL = 'https://api.quickemailverification.com/v1/verify';
const REQUEST_TIMEOUT_MS = 15_000;
/** After "out of credits" (402) or "rate limited" (429), stop calling for this long. */
const PAUSE_AFTER_LIMIT_MS = 60 * 60 * 1000;

let pausedUntil = 0;

export function isProviderAvailable(): boolean {
    return Boolean(ENV.EMAIL_VERIFICATION.QEV_API_KEY) && Date.now() >= pausedUntil;
}

interface QevResponse {
    result?: 'valid' | 'invalid' | 'unknown';
    reason?: string;
    disposable?: string;
    accept_all?: string;
    safe_to_send?: string;
    success?: string;
    message?: string;
}

/**
 * Asks QuickEmailVerification whether the mailbox exists. Returns `undefined` when the call could not be made
 * (no key, paused, network / API error); the address then stays unverified and is retried on a later save.
 */
export async function verifyWithProvider(email: string): Promise<ProviderResult | undefined> {
    const apiKey = ENV.EMAIL_VERIFICATION.QEV_API_KEY;
    if (!apiKey || !isProviderAvailable()) return undefined;

    const url = new URL(API_URL);
    url.searchParams.set('email', email);
    url.searchParams.set('apikey', apiKey);

    let response: Response;
    try {
        response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch (err) {
        logger.warn({ err: (err as Error).message }, 'Email verification provider unreachable');
        return undefined;
    }

    if (response.status === 402 || response.status === 429) {
        pausedUntil = Date.now() + PAUSE_AFTER_LIMIT_MS;
        logger.warn({ status: response.status }, 'Email verification provider out of credits or rate limited; pausing for an hour');
        return undefined;
    }
    if (!response.ok) {
        logger.warn({ status: response.status }, 'Email verification provider returned an error');
        return undefined;
    }

    const body = (await response.json().catch(() => ({}))) as QevResponse;
    if (body.success !== 'true') {
        logger.warn({ message: body.message }, 'Email verification provider rejected the request');
        return undefined;
    }

    const reason = body.reason ?? body.result ?? 'unknown';
    if (body.result === 'invalid') return { status: 'invalid', reason };
    if (body.result === 'valid') {
        const confirmed = body.safe_to_send === 'true' && body.accept_all !== 'true' && body.disposable !== 'true';
        return { status: confirmed ? 'valid' : 'risky', reason: body.accept_all === 'true' ? 'accept_all' : reason };
    }
    return { status: null, reason };
}
