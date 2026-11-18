import { ENV } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { prisma } from '../../config/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { EmailOwner } from '../shared/entityEmails.js';
import { isRedisReady, redis } from '../../config/redis.js';
import { HttpError } from '../../utils/httpError.js';
import { runLocalChecks, type EmailCheckResult, type EmailVerificationStatus } from './localChecks.js';
import { verifyWithProvider, type ProviderResult } from './provider.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface StoredVerification {
    verificationStatus: EmailVerificationStatus | null;
    verificationReason: string | null;
    verifiedAt: Date | null;
}

const DAY_SECONDS = 24 * 60 * 60;

/**
 * How long a provider answer is reused, so re-typing or saving an address doesn't spend another credit. Shorter
 * the more harm a stale answer does: "valid" going stale is harmless (30 days is the industry norm, ~2% of
 * addresses die per month); "risky" is only a warning; "invalid" blocks the save, so a wrong one must clear fast.
 */
const PROVIDER_CACHE_TTL_SECONDS: Record<EmailVerificationStatus, number> = {
    valid: 30 * DAY_SECONDS,
    risky: 7 * DAY_SECONDS,
    invalid: DAY_SECONDS,
};

const providerCacheKey = (email: string) => `cache:email-verify:${email}`;

async function readCachedProviderResult(email: string): Promise<ProviderResult | undefined> {
    if (!isRedisReady()) return undefined;
    try {
        const cached = await redis.get(providerCacheKey(email));
        const parsed = cached ? (JSON.parse(cached) as ProviderResult) : undefined;
        return parsed?.status ? parsed : undefined;
    } catch (err) {
        logger.warn({ err: (err as Error).message }, 'Email verification cache read failed');
        return undefined;
    }
}

function cacheProviderResult(email: string, result: ProviderResult): void {
    // Undecided answers are never cached: the next check really retries.
    if (!result.status || !isRedisReady()) return;
    redis.set(providerCacheKey(email), JSON.stringify(result), 'EX', PROVIDER_CACHE_TTL_SECONDS[result.status]).catch((err: Error) => {
        logger.warn({ err: err.message }, 'Email verification cache write failed');
    });
}

/** Provider answer for an address, cached in Redis per address for a time that depends on the answer. */
async function verifyWithProviderCached(email: string): Promise<ProviderResult | undefined> {
    const cached = await readCachedProviderResult(email);
    if (cached) return cached;
    const result = await verifyWithProvider(email);
    if (result) cacheProviderResult(email, result);
    return result;
}

/**
 * Full check of one address: the free local checks first, then (only if they pass) the paid provider.
 * Returns `undefined` when nothing could be decided right now and the address should be retried on the next save.
 */
export async function verifyEmail(email: string, now = new Date()): Promise<StoredVerification | undefined> {
    const local = await runLocalChecks(email);
    if (local.status) return { verificationStatus: local.status, verificationReason: local.reason, verifiedAt: now };

    if (!ENV.EMAIL_VERIFICATION.QEV_API_KEY) {
        // Local-only mode: the domain is fine, the mailbox is unchecked. Re-run the cheap checks after a day.
        return { verificationStatus: null, verificationReason: 'domain_ok', verifiedAt: now };
    }
    const provider = await verifyWithProviderCached(local.email);
    if (!provider) return undefined;
    return { verificationStatus: provider.status, verificationReason: provider.reason, verifiedAt: now };
}

/** Form wording for the provider's answer (null message = nothing to warn about). */
function providerMessage(provider: ProviderResult): string | null {
    if (provider.status === 'invalid') {
        return provider.reason === 'rejected_email'
            ? 'This mailbox doesn’t exist.'
            : 'This address can’t receive email.';
    }
    if (provider.status === 'risky') {
        return provider.reason === 'accept_all'
            ? 'This domain accepts any address, so the mailbox can’t be confirmed.'
            : 'This mailbox couldn’t be confirmed.';
    }
    return null;
}

/**
 * The check a form runs when the user leaves an email field: free checks, then the mailbox check (cached, so each
 * distinct address costs at most one provider credit). `status: 'valid'` only when the mailbox was confirmed.
 */
export async function checkEmailForForm(email: string): Promise<EmailCheckResult> {
    const local = await runLocalChecks(email);
    if (local.status || !ENV.EMAIL_VERIFICATION.QEV_API_KEY) return local;
    const provider = await verifyWithProviderCached(local.email);
    if (!provider?.status) return local;
    return { ...local, status: provider.status, reason: provider.reason, message: providerMessage(provider) };
}

/**
 * Rejects a save that adds an address that can't receive email (domain gone / takes no mail, or the provider says
 * the mailbox doesn't exist), naming each row as `<field>.<index>.email` so the form marks it inline. Addresses
 * already on the record are never re-judged here, so old data doesn't block unrelated edits. Doubtful (risky)
 * addresses and checks that fail or time out are allowed through: only a definite "undeliverable" blocks.
 * Runs outside the save transaction; provider answers are cached, so an address checked on blur costs nothing.
 */
export async function assertEmailsDeliverable(rows: unknown, field: string, owner?: EmailOwner): Promise<void> {
    if (!ENV.EMAIL_VERIFICATION.ENABLED || !Array.isArray(rows) || rows.length === 0) return;
    const existing = owner
        ? new Set((await prisma.entityEmail.findMany({ where: owner, select: { email: true } })).map((row) => row.email))
        : new Set<string>();

    const checks = rows.map(async (row: unknown, index) => {
        const raw = row && typeof row === 'object' ? (row as { email?: unknown }).email : undefined;
        const email = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
        if (!email || existing.has(email)) return null;
        try {
            const result = await checkEmailForForm(email);
            return result.status === 'invalid'
                ? { message: result.message ?? 'This email address can’t receive email.', path: [field, String(index), 'email'] }
                : null;
        } catch (err) {
            logger.warn({ err: (err as Error).message }, 'Email check failed during save; allowing the address');
            return null;
        }
    });
    const issues = (await Promise.all(checks)).filter((issue) => issue !== null);
    if (issues.length > 0) {
        throw HttpError.badRequest(issues.length === 1 ? issues[0].message : 'Some email addresses can’t receive email.', issues);
    }
}

/** Rows of an owner whose verification is missing or due: never checked, undecided for a day, or older than the recheck period. */
function dueWhere(owner: EmailOwner, now: Date): Prisma.EntityEmailWhereInput {
    const recheckBefore = new Date(now.getTime() - ENV.EMAIL_VERIFICATION.RECHECK_DAYS * DAY_MS);
    return {
        ...owner,
        OR: [
            { verifiedAt: null },
            { verificationStatus: null, verifiedAt: { lt: new Date(now.getTime() - DAY_MS) } },
            { verifiedAt: { lt: recheckBefore } },
        ],
    };
}

async function verifyOwner(owner: EmailOwner): Promise<void> {
    const now = new Date();
    const rows = await prisma.entityEmail.findMany({ where: dueWhere(owner, now), select: { email: true } });
    for (const email of new Set(rows.map((row) => row.email))) {
        const outcome = await verifyEmail(email, now);
        if (!outcome) continue;
        // Matched by address, not id: a save in the meantime replaces the rows (and carries the result over).
        await prisma.entityEmail.updateMany({ where: { ...owner, email }, data: outcome });
    }
}

// ── Background queue ─────────────────────────────────────────────────────────────
// In-process and sequential: saves never wait for DNS or the provider, and the provider's daily quota is
// spent one address at a time. Owners queued twice before they run are checked once.

const pending = new Map<string, EmailOwner>();
let running = false;

const ownerKey = (owner: EmailOwner) => Object.entries(owner)[0].join(':');

async function drain(): Promise<void> {
    if (running) return;
    running = true;
    try {
        while (pending.size > 0) {
            const [key, owner] = pending.entries().next().value as [string, EmailOwner];
            pending.delete(key);
            try {
                await verifyOwner(owner);
            } catch (err) {
                logger.warn({ err: (err as Error).message, owner }, 'Email verification failed');
            }
        }
    } finally {
        running = false;
    }
}

/** Queues verification of a record's email addresses after it was saved. Never throws, never blocks the request. */
export function queueEmailVerification(owner: EmailOwner): void {
    if (!ENV.EMAIL_VERIFICATION.ENABLED) return;
    pending.set(ownerKey(owner), owner);
    void drain();
}
