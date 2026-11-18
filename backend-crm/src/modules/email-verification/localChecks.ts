import { promises as dns } from 'node:dns';
import mailchecker from 'mailchecker';
import { cacheService } from '../../services/cache.service.js';

/**
 * Verification outcome of one address.
 * - `valid`: the mailbox was confirmed by the verification provider.
 * - `risky`: deliverable but doubtful (disposable domain, catch-all domain, no MX record, provider unsure).
 * - `invalid`: mail to it can't be delivered (bad syntax, domain doesn't exist or takes no mail, mailbox rejected).
 */
export type EmailVerificationStatus = 'valid' | 'risky' | 'invalid';

export interface EmailCheckResult {
    email: string;
    /** `null` when the free checks found nothing wrong (the mailbox itself is not checked here). */
    status: EmailVerificationStatus | null;
    /** Machine-readable reason, e.g. `domain_not_found`, `disposable`, `typo`. */
    reason: string | null;
    /** Sentence for the form, or `null` when there is nothing to say. */
    message: string | null;
    /** Corrected address when the domain looks like a typo of a common provider. */
    suggestion: string | null;
}

// Deliberately simpler than RFC 5322: the shapes people actually type, ASCII local part, dotted domain with a TLD.
const EMAIL_SHAPE = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** Providers people commonly mistype; a domain within edit distance 1–2 of one of these gets a suggestion. */
const COMMON_DOMAINS = [
    'gmail.com',
    'googlemail.com',
    'yahoo.com',
    'yahoo.co.in',
    'yahoo.in',
    'ymail.com',
    'rocketmail.com',
    'hotmail.com',
    'outlook.com',
    'outlook.in',
    'live.com',
    'msn.com',
    'icloud.com',
    'me.com',
    'aol.com',
    'rediffmail.com',
    'protonmail.com',
    'proton.me',
    'zoho.com',
    'zohomail.in',
];

/** Second-level labels that are fine as they are and must never be "corrected" (e.g. `mail.com` is real). */
const KNOWN_REAL_DOMAINS = new Set([...COMMON_DOMAINS, 'mail.com', 'gmx.com', 'yandex.com', 'live.in', 'hotmail.co.uk']);

/** Optimal string alignment distance (Levenshtein plus adjacent transpositions, so `gmial` → `gmail` is 1). */
export function editDistance(a: string, b: string): number {
    const rows = a.length + 1;
    const cols = b.length + 1;
    const d: number[][] = Array.from({ length: rows }, (_, i) => Array.from({ length: cols }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
    for (let i = 1; i < rows; i++) {
        for (let j = 1; j < cols; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
            if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
                d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
            }
        }
    }
    return d[rows - 1][cols - 1];
}

/** Returns the common provider domain this one is probably a typo of, or `null`. */
export function suggestDomain(domain: string): string | null {
    if (KNOWN_REAL_DOMAINS.has(domain)) return null;
    let best: string | null = null;
    let bestDistance = Infinity;
    for (const candidate of COMMON_DOMAINS) {
        const distance = editDistance(domain, candidate);
        if (distance < bestDistance) {
            best = candidate;
            bestDistance = distance;
        }
    }
    // Two edits only for longer domains, so short company domains (e.g. `abc.com`) aren't pulled to `aol.com`.
    const allowed = domain.length >= 9 ? 2 : 1;
    return best && bestDistance > 0 && bestDistance <= allowed ? best : null;
}

/** True when the domain (or a parent domain) is a known disposable / throwaway provider. */
export function isDisposableDomain(domain: string): boolean {
    const list = mailchecker.blacklist();
    let current = domain;
    for (;;) {
        if (list.has(current)) return true;
        const dot = current.indexOf('.');
        if (dot === -1) return false;
        current = current.slice(dot + 1);
    }
}

/** How a domain receives mail, from DNS. `unknown` = DNS failed or timed out (never held against the address). */
export type DomainMailStatus = 'mx' | 'a_only' | 'null_mx' | 'not_found' | 'unknown';

const DNS_TIMEOUT_MS = 4_000;
const DOMAIN_CACHE_TTL_SECONDS = 24 * 60 * 60;

function withTimeout<T>(promise: Promise<T>): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) => setTimeout(() => reject(Object.assign(new Error('DNS timeout'), { code: 'ETIMEOUT' })), DNS_TIMEOUT_MS)),
    ]);
}

const isNoRecord = (err: unknown) => ['ENOTFOUND', 'ENODATA', 'ENONAME'].includes((err as { code?: string }).code ?? '');

async function lookupDomain(domain: string): Promise<DomainMailStatus> {
    try {
        const records = await withTimeout(dns.resolveMx(domain));
        if (records.length === 0) return 'not_found';
        // RFC 7505 "null MX": the domain explicitly accepts no mail.
        if (records.every((record) => record.exchange === '' || record.exchange === '.')) return 'null_mx';
        return 'mx';
    } catch (err) {
        if (!isNoRecord(err)) return 'unknown';
    }
    // No MX record: mail falls back to the domain's A / AAAA record (RFC 5321 §5.1).
    try {
        const [v4, v6] = await Promise.allSettled([withTimeout(dns.resolve4(domain)), withTimeout(dns.resolve6(domain))]);
        if ((v4.status === 'fulfilled' && v4.value.length > 0) || (v6.status === 'fulfilled' && v6.value.length > 0)) return 'a_only';
        const failures = [v4, v6].filter((r): r is PromiseRejectedResult => r.status === 'rejected');
        return failures.every((r) => isNoRecord(r.reason)) ? 'not_found' : 'unknown';
    } catch {
        return 'unknown';
    }
}

/** DNS answer for a domain, cached in Redis for a day (unknown answers are retried, not cached). */
export async function domainMailStatus(domain: string): Promise<DomainMailStatus> {
    const key = `cache:email-domain:${domain}`;
    const status = await cacheService.getOrSet(key, DOMAIN_CACHE_TTL_SECONDS, () => lookupDomain(domain));
    if (status === 'unknown') await cacheService.invalidate(key);
    return status;
}

const result = (email: string, status: EmailVerificationStatus | null, reason: string | null, message: string | null, suggestion: string | null = null): EmailCheckResult => ({
    email,
    status,
    reason,
    message,
    suggestion,
});

/**
 * The free checks, in order: syntax → typo of a common provider → disposable domain → DNS (domain exists and
 * accepts mail). They catch most data-entry mistakes; whether the mailbox itself exists is left to the provider.
 */
export async function runLocalChecks(rawEmail: string): Promise<EmailCheckResult> {
    const email = rawEmail.trim().toLowerCase();
    if (!EMAIL_SHAPE.test(email) || email.includes('..') || email.startsWith('.') || email.split('@')[0].endsWith('.')) {
        return result(email, 'invalid', 'syntax', 'This doesn’t look like a valid email address.');
    }
    const [local, domain] = email.split('@');

    const typo = suggestDomain(domain);
    if (typo) {
        const suggestion = `${local}@${typo}`;
        return result(email, 'risky', 'typo', `Did you mean ${suggestion}?`, suggestion);
    }

    if (isDisposableDomain(domain)) {
        return result(email, 'risky', 'disposable', 'This is a disposable (temporary) email provider.');
    }

    switch (await domainMailStatus(domain)) {
        case 'not_found':
            return result(email, 'invalid', 'domain_not_found', `The domain “${domain}” doesn’t exist.`);
        case 'null_mx':
            return result(email, 'invalid', 'domain_no_mail', `The domain “${domain}” doesn’t accept email.`);
        case 'a_only':
            return result(email, 'risky', 'no_mx_record', `The domain “${domain}” has no mail server set up.`);
        default:
            return result(email, null, null, null);
    }
}
