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

// ── List API (bulk) ──────────────────────────────────────────────────────────────
// https://docs.quickemailverification.com/email-verification-api/verify-email-list
// Upload a CSV (credits for the whole list are taken at upload; "unknown" results are refunded), poll the job
// status, download the reports, then delete the job. No callback URL: the API may not be reachable from outside.

const BULK_URL = 'https://api.quickemailverification.com/v1/bulk-verify';
const BULK_HOST = 'api.quickemailverification.com';
const BULK_TIMEOUT_MS = 120_000;

/** A List API call that failed; `outOfCredits` = 402 (not enough credits for the list). Never contains the key. */
export class ProviderListError extends Error {
    readonly outOfCredits: boolean;

    constructor(message: string, outOfCredits = false) {
        super(message);
        this.outOfCredits = outOfCredits;
    }
}

function requireKey(): string {
    const apiKey = ENV.EMAIL_VERIFICATION.QEV_API_KEY;
    if (!apiKey) throw new ProviderListError('No QUICKEMAILVERIFICATION_API_KEY is set.');
    return apiKey;
}

async function readJson<T>(response: Response): Promise<T & { success?: string | boolean; message?: string }> {
    return (await response.json().catch(() => ({}))) as T & { success?: string | boolean; message?: string };
}

const succeeded = (body: { success?: string | boolean }) => body.success === true || body.success === 'true';

/** Uploads addresses (one per row, with an `email` header) as a new list job; returns the job id. */
export async function uploadEmailList(emails: readonly string[], filename: string): Promise<string> {
    const apiKey = requireKey();
    const form = new FormData();
    form.append('upload', new Blob([`email\n${emails.join('\n')}\n`], { type: 'text/csv' }), filename);
    let response: Response;
    try {
        response = await fetch(BULK_URL, {
            method: 'POST',
            headers: { Authorization: `token ${apiKey}`, 'X-QEV-Filename': filename },
            body: form,
            signal: AbortSignal.timeout(BULK_TIMEOUT_MS),
        });
    } catch (err) {
        throw new ProviderListError(`Could not reach the verification provider (${(err as Error).message}).`);
    }
    const body = await readJson<{ id?: string }>(response);
    if (response.status === 402) throw new ProviderListError('The verification provider account doesn’t have enough credits for this list.', true);
    if (!response.ok || !succeeded(body) || !body.id) {
        throw new ProviderListError(`The verification provider rejected the list (${response.status}${body.message ? `: ${body.message}` : ''}).`);
    }
    return body.id;
}

export type ListReport = 'safetosend' | 'valid' | 'invalid' | 'unknown' | 'fullreport';

export interface ListJobStatus {
    /** running | completed | failed | ready (waiting for credits) — as the provider reports it. */
    status: string;
    /** 0–100. */
    progress: number;
    message: string;
    downloadUrls: Partial<Record<ListReport, string>>;
}

/** Current state of a list job. Throws only when the provider can't be reached or answers with an error. */
export async function getListJobStatus(jobId: string): Promise<ListJobStatus> {
    const url = new URL(`${BULK_URL}/status/${encodeURIComponent(jobId)}`);
    url.searchParams.set('apikey', requireKey());
    let response: Response;
    try {
        response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch (err) {
        throw new ProviderListError(`Could not reach the verification provider (${(err as Error).message}).`);
    }
    const body = await readJson<{ status?: string; stats?: { progress?: string }; download_urls?: Partial<Record<ListReport, string>> }>(response);
    if (!response.ok || !succeeded(body)) {
        throw new ProviderListError(`The verification provider couldn’t report the list’s status (${response.status}${body.message ? `: ${body.message}` : ''}).`);
    }
    const progress = Number.parseFloat(String(body.stats?.progress ?? '0'));
    return {
        status: String(body.status ?? 'running').toLowerCase(),
        progress: Number.isFinite(progress) ? Math.max(0, Math.min(100, Math.round(progress))) : 0,
        message: body.message ?? '',
        downloadUrls: body.download_urls ?? {},
    };
}

/**
 * Downloads one report of a completed job as CSV text (duplicates removed). Only URLs on the provider's API host
 * are fetched, since they carry the API key.
 */
export async function downloadListReport(downloadUrl: string): Promise<string> {
    const url = new URL(downloadUrl);
    if (url.protocol !== 'https:' || url.hostname !== BULK_HOST) throw new ProviderListError('Unexpected report download address from the provider.');
    url.searchParams.set('removeDuplicate', '1');
    let response: Response;
    try {
        response = await fetch(url, { signal: AbortSignal.timeout(BULK_TIMEOUT_MS) });
    } catch (err) {
        throw new ProviderListError(`Could not download the verification report (${(err as Error).message}).`);
    }
    if (!response.ok) throw new ProviderListError(`Could not download the verification report (${response.status}).`);
    return response.text();
}

/** Deletes a finished job at the provider (its copy of the addresses). Failures are only logged. */
export async function deleteListJob(jobId: string): Promise<void> {
    try {
        const url = new URL(`${BULK_URL}/delete/${encodeURIComponent(jobId)}`);
        url.searchParams.set('apikey', requireKey());
        const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
        if (!response.ok) logger.warn({ status: response.status }, 'Could not delete the email list job at the provider');
    } catch (err) {
        logger.warn({ err: (err as Error).message }, 'Could not delete the email list job at the provider');
    }
}
