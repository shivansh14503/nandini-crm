import { ENV } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { prisma } from '../../config/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { auditService } from '../../services/audit.service.js';
import { runWithAuditOrigin } from '../../services/auditContext.js';
import type { EmailOwner } from '../shared/entityEmails.js';
import { runInTransaction } from '../shared/transactions.js';
import { HttpError } from '../../utils/httpError.js';
import { CHECKED_ROW_SELECT, emailCheckEntries } from './emailCheckAudit.js';
import { runLocalChecks, type EmailCheckResult, type EmailVerificationStatus } from './localChecks.js';
import { verifyWithProvider, type ProviderResult } from './provider.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface StoredVerification {
    verificationStatus: EmailVerificationStatus | null;
    verificationReason: string | null;
    verifiedAt: Date | null;
}

// ── Known addresses ──────────────────────────────────────────────────────────────
// The database is the record of checked addresses: once an address is saved on any lead / contact / organization
// with a result, that result is final and the provider is never asked about it again from a form or a save. Only
// an admin's bulk check (emailValidation.admin.service.ts) asks again. Invalid addresses are never saved (the
// form and the save both block them), so they are never "known".

/** Stored result of an address saved on any record, or `undefined` when no record has a decided result for it. */
export async function findKnownVerification(email: string): Promise<StoredVerification | undefined> {
    const row = await prisma.entityEmail.findFirst({
        where: { email, verificationStatus: { not: null } },
        orderBy: { verifiedAt: 'desc' },
        select: { verificationStatus: true, verificationReason: true, verifiedAt: true },
    });
    if (!row) return undefined;
    return { verificationStatus: row.verificationStatus as EmailVerificationStatus, verificationReason: row.verificationReason, verifiedAt: row.verifiedAt };
}

// ── Recent provider answers (in memory) ──────────────────────────────────────────
// One new address is looked at up to three times in a few minutes: when the user leaves the field, on save, and by
// the background check that writes the result onto the saved row. This short in-process memory makes those one
// provider credit. It is not a cache of results (the database is): it forgets after 30 minutes or on restart.

const RECENT_ANSWER_TTL_MS = 30 * 60 * 1000;
const MAX_RECENT_ANSWERS = 5_000;
const recentAnswers = new Map<string, { result: ProviderResult; expiresAt: number }>();

function rememberAnswer(email: string, result: ProviderResult): void {
    if (!result.status) return; // Undecided answers aren't kept: the next check really retries.
    recentAnswers.delete(email);
    recentAnswers.set(email, { result, expiresAt: Date.now() + RECENT_ANSWER_TTL_MS });
    if (recentAnswers.size > MAX_RECENT_ANSWERS) recentAnswers.delete(recentAnswers.keys().next().value as string);
}

function recentAnswer(email: string): ProviderResult | undefined {
    const entry = recentAnswers.get(email);
    if (!entry) return undefined;
    if (entry.expiresAt > Date.now()) return entry.result;
    recentAnswers.delete(email);
    return undefined;
}

/** Provider answer for an address, reusing one from the last few minutes (see above). */
async function askProvider(email: string): Promise<ProviderResult | undefined> {
    const recent = recentAnswer(email);
    if (recent) return recent;
    return askProviderFresh(email);
}

/** Always calls the provider (admin bulk check); the answer is remembered for the save / background check. */
export async function askProviderFresh(email: string): Promise<ProviderResult | undefined> {
    const result = await verifyWithProvider(email);
    if (result) rememberAnswer(email, result);
    return result;
}

// ── Checks ───────────────────────────────────────────────────────────────────────

/**
 * Full check of one address for the background job: an earlier result for the address on any record, else the
 * free local checks, then (only if they pass) the paid provider. `undefined` = nothing could be decided right now.
 */
export async function verifyEmail(email: string, now = new Date()): Promise<StoredVerification | undefined> {
    const known = await findKnownVerification(email);
    if (known) return known;

    const local = await runLocalChecks(email);
    if (local.status) return { verificationStatus: local.status, verificationReason: local.reason, verifiedAt: now };

    if (!ENV.EMAIL_VERIFICATION.QEV_API_KEY) {
        // Local-only mode: the domain is fine, the mailbox is unchecked. Re-run the cheap checks after a day.
        return { verificationStatus: null, verificationReason: 'domain_ok', verifiedAt: now };
    }
    const provider = await askProvider(local.email);
    if (!provider) return undefined;
    return { verificationStatus: provider.status, verificationReason: provider.reason, verifiedAt: now };
}

/** Form wording for a mailbox-level result (null message = nothing to warn about). */
function providerMessage(status: EmailVerificationStatus | null, reason: string | null): string | null {
    if (status === 'invalid') {
        return reason === 'rejected_email' ? 'This mailbox doesn’t exist.' : 'This address can’t receive email.';
    }
    if (status === 'risky') {
        return reason === 'accept_all'
            ? 'This domain accepts any address, so the mailbox can’t be confirmed.'
            : 'This mailbox couldn’t be confirmed.';
    }
    return null;
}

/**
 * The check a form runs when the user leaves an email field, and the save runs for addresses new to the record:
 * an address already saved on any record keeps its stored result (no provider call); otherwise the free checks,
 * then the mailbox check. `status: 'valid'` only when the mailbox was confirmed.
 */
export async function checkEmailForForm(rawEmail: string): Promise<EmailCheckResult> {
    const email = rawEmail.trim().toLowerCase();
    const known = await findKnownVerification(email);
    if (known?.verificationStatus) {
        return {
            email,
            status: known.verificationStatus,
            reason: known.verificationReason,
            message: providerMessage(known.verificationStatus, known.verificationReason),
            suggestion: null,
        };
    }

    const local = await runLocalChecks(email);
    if (local.status || !ENV.EMAIL_VERIFICATION.QEV_API_KEY) return local;
    const provider = await askProvider(local.email);
    if (!provider?.status) return local;
    return { ...local, status: provider.status, reason: provider.reason, message: providerMessage(provider.status, provider.reason) };
}

/**
 * Rejects a save that adds an address that can't receive email (domain gone / takes no mail, or the provider says
 * the mailbox doesn't exist), naming each row as `<field>.<index>.email` so the form marks it inline. Addresses
 * already on the record are never re-judged here, so old data doesn't block unrelated edits. Doubtful (risky)
 * addresses and checks that fail or time out are allowed through: only a definite "undeliverable" blocks.
 * The form blocks a save itself once the field check said "invalid", so this normally finds nothing new.
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

/**
 * Rows of an owner still without a result: never checked, or undecided (provider unsure, or local-only mode) for
 * a day. Decided results are final; there is no periodic re-check (admins re-check in Settings › Email Validation).
 */
function dueWhere(owner: EmailOwner, now: Date): Prisma.EntityEmailWhereInput {
    return {
        ...owner,
        OR: [{ verifiedAt: null }, { verificationStatus: null, verifiedAt: { lt: new Date(now.getTime() - DAY_MS) } }],
    };
}

async function verifyOwner(owner: EmailOwner): Promise<void> {
    const now = new Date();
    const rows = await prisma.entityEmail.findMany({ where: dueWhere(owner, now), select: { email: true } });
    for (const email of new Set(rows.map((row) => row.email))) {
        const outcome = await verifyEmail(email, now);
        if (!outcome) continue;
        // Matched by address, not id: a save in the meantime replaces the rows (and carries the result over).
        const where = { ...owner, email };
        await runInTransaction(async (tx) => {
            const before = await tx.entityEmail.findMany({ where, select: CHECKED_ROW_SELECT });
            await tx.entityEmail.updateMany({ where, data: outcome });
            const result = { status: outcome.verificationStatus, reason: outcome.verificationReason };
            await auditService.recordMany(tx, emailCheckEntries(before, () => result, { action: 'EMAIL_CHECK', changedBy: 'system' }));
        });
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
                // Its own audit origin (source JOB), not the save request that happened to queue it.
                await runWithAuditOrigin({ source: 'JOB', route: 'job:email-check' }, () => verifyOwner(owner));
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
