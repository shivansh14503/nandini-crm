import { z } from 'zod';
import { ENV } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { prisma } from '../../config/prisma.js';
import { Prisma, type EmailValidationRun, type EntityEmail } from '../../generated/prisma/client.js';
import { auditService, type AuditEntityType } from '../../services/audit.service.js';
import { cacheService, type CachedEntity } from '../../services/cache.service.js';
import type { AuthUser } from '../../types/user.types.js';
import { HttpError } from '../../utils/httpError.js';
import { runInTransaction } from '../shared/transactions.js';
import { toEmailDtos, type EmailOwner } from '../shared/entityEmails.js';
import { runLocalChecks, type EmailVerificationStatus } from './localChecks.js';
import { askProviderFresh } from './emailVerification.service.js';
import { decideFromReports, reportDetails, reportEmails, type Decision, type ReportDetail } from './listReports.js';
import {
    ProviderListError,
    deleteListJob,
    downloadListReport,
    getListJobStatus,
    isProviderAvailable,
    uploadEmailList,
    type ListJobStatus,
} from './provider.js';

/**
 * Settings › Email Validation (admin only). Lists every distinct address saved on a live lead / contact /
 * organization with its stored result, lets the admin re-check a chosen set in bulk (one provider credit per
 * address), and decide what happens to risky / invalid ones (accept, mark bounced, or remove from the records).
 * Runs of at least EMAIL_VERIFICATION_LIST_API_MIN addresses use the provider's List API; smaller ones the
 * single-address API.
 */

/** Most addresses one run may check (the provider takes files up to 50 MB; this is far below). */
export const MAX_RUN_SIZE = 50_000;
/** Most explicitly ticked addresses one request may carry (the API's JSON body limit is 1 MB). */
const MAX_EXPLICIT_EMAILS = 10_000;
const MAX_PAGE_SIZE = 100;

// ── Address list ─────────────────────────────────────────────────────────────────

export const ADDRESS_STATUS_FILTERS = ['all', 'unchecked', 'valid', 'risky', 'invalid', 'attention'] as const;
export const ADDRESS_SORTS = ['oldest', 'newest', 'email'] as const;

const addressFilterSchema = z.object({
    status: z.enum(ADDRESS_STATUS_FILTERS).default('all'),
    search: z.string().trim().max(120).optional(),
    sort: z.enum(ADDRESS_SORTS).default('oldest'),
});

export const addressQuerySchema = addressFilterSchema.extend({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(50),
});

type AddressFilter = z.infer<typeof addressFilterSchema>;

/** `unchecked` = never decided (no row has a result yet). */
export type AddressStatus = EmailVerificationStatus | 'unchecked';

export interface EmailAddressDto {
    email: string;
    /** The worst result on any row with this address (they normally agree). */
    status: AddressStatus;
    reason: string | null;
    lastCheckedAt: string | null;
    /** Any record has the address flagged "Invalid Bounce". */
    isBounced: boolean;
    records: { leads: number; contacts: number; organizations: number };
}

interface AddressRow {
    email: string;
    statusRank: number;
    reason: string | null;
    lastCheckedAt: Date | null;
    bounced: number;
    leads: number;
    contacts: number;
    organizations: number;
    totalCount: number;
}

const RANK_STATUS: Record<number, AddressStatus> = { 0: 'unchecked', 1: 'valid', 2: 'risky', 3: 'invalid' };
const STATUS_RANK_SQL = Prisma.sql`CASE e.verificationStatus WHEN 'invalid' THEN 3 WHEN 'risky' THEN 2 WHEN 'valid' THEN 1 ELSE 0 END`;

/** Distinct addresses of live (not soft-deleted) records, one row per address, filtered. */
function addressesCte(filter: AddressFilter): Prisma.Sql {
    const rankFilter: Record<AddressFilter['status'], Prisma.Sql> = {
        all: Prisma.sql`1 = 1`,
        unchecked: Prisma.sql`a.statusRank = 0`,
        valid: Prisma.sql`a.statusRank = 1`,
        risky: Prisma.sql`a.statusRank = 2`,
        invalid: Prisma.sql`a.statusRank = 3`,
        attention: Prisma.sql`a.statusRank >= 2`,
    };
    const search = filter.search ? Prisma.sql`AND a.email LIKE ${`%${filter.search.toLowerCase().replace(/[[%_]/g, '[$&]')}%`}` : Prisma.empty;
    return Prisma.sql`
        WITH live AS (
            SELECT e.email, e.verificationReason, e.verifiedAt, e.isInvalidBounce, e.leadId, e.contactId, e.organizationId,
                   ${STATUS_RANK_SQL} AS statusRank
            FROM [dbo].[EntityEmail] e
            LEFT JOIN [dbo].[Lead] l ON l.id = e.leadId
            LEFT JOIN [dbo].[Contact] c ON c.id = e.contactId
            LEFT JOIN [dbo].[Organization] o ON o.id = e.organizationId
            WHERE COALESCE(l.isDeleted, c.isDeleted, o.isDeleted) = 0
        ),
        a AS (
            SELECT email,
                   MAX(statusRank) AS statusRank,
                   MAX(verifiedAt) AS lastCheckedAt,
                   MAX(CAST(isInvalidBounce AS INT)) AS bounced,
                   SUM(CASE WHEN leadId IS NOT NULL THEN 1 ELSE 0 END) AS leads,
                   SUM(CASE WHEN contactId IS NOT NULL THEN 1 ELSE 0 END) AS contacts,
                   SUM(CASE WHEN organizationId IS NOT NULL THEN 1 ELSE 0 END) AS organizations
            FROM live GROUP BY email
        ),
        f AS (SELECT a.* FROM a WHERE ${rankFilter[filter.status]} ${search})`;
}

/** "Oldest first" puts never-checked addresses first, then the longest-unchecked: the natural "next N to check". */
function addressOrder(sort: AddressFilter['sort']): Prisma.Sql {
    if (sort === 'newest') return Prisma.sql`ORDER BY f.lastCheckedAt DESC, f.email ASC`;
    if (sort === 'email') return Prisma.sql`ORDER BY f.email ASC`;
    return Prisma.sql`ORDER BY CASE WHEN f.lastCheckedAt IS NULL THEN 0 ELSE 1 END, f.lastCheckedAt ASC, f.email ASC`;
}

/** First `limit` addresses of a filtered, sorted list (for "check the top N"). */
async function pickAddresses(filter: AddressFilter, limit: number): Promise<string[]> {
    const rows = await prisma.$queryRaw<{ email: string }[]>`
        ${addressesCte(filter)}
        SELECT TOP (${limit}) f.email FROM f ${addressOrder(filter.sort)}`;
    return rows.map((row) => row.email);
}

/** Reason shown per address: from the row that decided its (worst) status. */
async function reasonsFor(emails: string[]): Promise<Map<string, string | null>> {
    if (emails.length === 0) return new Map();
    const rows = await prisma.entityEmail.findMany({
        where: { email: { in: emails }, verificationStatus: { not: null } },
        orderBy: { verifiedAt: 'desc' },
        select: { email: true, verificationStatus: true, verificationReason: true },
    });
    const rank = (status: string | null) => (status === 'invalid' ? 3 : status === 'risky' ? 2 : status === 'valid' ? 1 : 0);
    const best = new Map<string, { rank: number; reason: string | null }>();
    for (const row of rows) {
        const current = best.get(row.email);
        if (!current || rank(row.verificationStatus) > current.rank) best.set(row.email, { rank: rank(row.verificationStatus), reason: row.verificationReason });
    }
    return new Map([...best].map(([email, value]) => [email, value.reason]));
}

// ── Runs ─────────────────────────────────────────────────────────────────────────

export const startRunSchema = z
    .object({
        /** Explicit addresses (the rows the admin ticked). Capped below the 1 MB request body limit. */
        emails: z.array(z.string().trim().toLowerCase().min(3).max(120)).max(MAX_EXPLICIT_EMAILS).optional(),
        /** Or: the first `limit` addresses of this filter (the "top 10 / 50 / 100 / any number" buttons). */
        filter: addressFilterSchema.optional(),
        limit: z.coerce.number().int().min(1).max(MAX_RUN_SIZE).optional(),
    })
    .refine((body) => (body.emails?.length ?? 0) > 0 || (body.filter && body.limit), {
        message: 'Choose the addresses to check.',
    });

export const runIdParamSchema = z.object({ id: z.uuid({ error: 'Invalid run id.' }) });

export interface EmailValidationRunDto {
    id: string;
    status: string;
    /** single = one provider call per address; list = the provider's List API. */
    mode: string;
    /** list mode: local_checks | uploading | provider_running | provider_waiting | importing; null otherwise / when done. */
    phase: string | null;
    /** list mode: the provider's progress, 0–100. */
    providerProgress: number | null;
    /** Addresses sent to the provider (list mode, after the free checks). */
    providerTotal: number | null;
    total: number;
    processed: number;
    validCount: number;
    riskyCount: number;
    invalidCount: number;
    undecidedCount: number;
    message: string | null;
    startedBy: string;
    createdAt: string;
    finishedAt: string | null;
    lastPolledAt: string | null;
}

const ACTIVE_STATUSES = ['queued', 'running'];

function toRunDto(run: EmailValidationRun): EmailValidationRunDto {
    return {
        id: run.id,
        status: run.status,
        mode: run.mode,
        phase: run.phase,
        providerProgress: run.providerProgress,
        providerTotal: run.providerEmailsJson ? (JSON.parse(run.providerEmailsJson) as string[]).length : null,
        total: run.total,
        processed: run.processed,
        validCount: run.validCount,
        riskyCount: run.riskyCount,
        invalidCount: run.invalidCount,
        undecidedCount: run.undecidedCount,
        message: run.message,
        startedBy: run.startedBy,
        createdAt: run.createdAt.toISOString(),
        finishedAt: run.finishedAt?.toISOString() ?? null,
        lastPolledAt: run.lastPolledAt?.toISOString() ?? null,
    };
}

const AFFECTED_CACHES: CachedEntity[] = ['leads', 'contacts', 'organizations'];
const invalidateRecordCaches = () => Promise.all(AFFECTED_CACHES.map((entity) => cacheService.invalidateEntityCaches(entity)));

async function isRunActive(runId: string): Promise<boolean> {
    const current = await prisma.emailValidationRun.findUnique({ where: { id: runId }, select: { status: true } });
    return current?.status === 'running';
}

async function stopRun(runId: string, message: string): Promise<void> {
    await prisma.emailValidationRun.update({ where: { id: runId }, data: { status: 'stopped', phase: null, finishedAt: new Date(), message } });
    await invalidateRecordCaches();
}

async function completeRun(runId: string, total: number): Promise<void> {
    await prisma.emailValidationRun.update({ where: { id: runId }, data: { status: 'completed', phase: null, processed: total, finishedAt: new Date() } });
    await invalidateRecordCaches();
}


/** SQL Server allows about 2,100 parameters per statement. */
const MAX_SQL_LIST = 1_000;

/** Writes decided results grouped by (status, reason), in chunks, plus the run's counters, in one transaction. */
async function writeDecisions(runId: string, decisions: Map<string, Decision>, extra: Prisma.EmailValidationRunUpdateInput): Promise<void> {
    const groups = new Map<string, { decision: Decision; emails: string[] }>();
    const counts = { valid: 0, risky: 0, invalid: 0 };
    for (const [email, decision] of decisions) {
        const key = `${decision.status}|${decision.reason}`;
        const group = groups.get(key) ?? { decision, emails: [] };
        group.emails.push(email);
        groups.set(key, group);
        counts[decision.status] += 1;
    }
    const now = new Date();
    const writes: Prisma.PrismaPromise<unknown>[] = [];
    for (const { decision, emails } of groups.values()) {
        for (let i = 0; i < emails.length; i += MAX_SQL_LIST) {
            writes.push(
                prisma.entityEmail.updateMany({
                    where: { email: { in: emails.slice(i, i + MAX_SQL_LIST) } },
                    data: { verificationStatus: decision.status, verificationReason: decision.reason, verifiedAt: now },
                }),
            );
        }
    }
    writes.push(
        prisma.emailValidationRun.update({
            where: { id: runId },
            data: {
                ...extra,
                validCount: { increment: counts.valid },
                riskyCount: { increment: counts.risky },
                invalidCount: { increment: counts.invalid },
            },
        }),
    );
    await prisma.$transaction(writes);
}

// ── Single mode: one provider call per address ──────────────────────────────────

type CheckOutcome = { status: EmailVerificationStatus | null; reason: string } | 'provider_unavailable';

/** One address, always asked again (this is the admin's explicit re-check). */
async function checkAddress(email: string): Promise<CheckOutcome> {
    const local = await runLocalChecks(email);
    if (local.status) return { status: local.status, reason: local.reason ?? local.status };
    if (!ENV.EMAIL_VERIFICATION.QEV_API_KEY) return { status: null, reason: 'domain_ok' };
    const provider = await askProviderFresh(local.email);
    if (provider) return provider;
    // No answer: out of credits / rate limited (the provider pauses itself) stops the run; a one-off error doesn't.
    return isProviderAvailable() ? { status: null, reason: 'unexpected_error' } : 'provider_unavailable';
}

/** Checks the run's remaining addresses one by one, saving progress after each so a restart resumes. */
async function processSingleRun(run: EmailValidationRun): Promise<void> {
    const emails = JSON.parse(run.emailsJson) as string[];
    for (let index = run.processed; index < emails.length; index++) {
        // Re-read so a cancel from the admin stops the run before the next credit is spent.
        if (!(await isRunActive(run.id))) return;

        const email = emails[index];
        let outcome: CheckOutcome;
        try {
            outcome = await checkAddress(email);
        } catch (err) {
            logger.warn({ err: (err as Error).message }, 'Bulk email check failed for an address');
            outcome = { status: null, reason: 'unexpected_error' };
        }
        if (outcome === 'provider_unavailable') {
            await stopRun(run.id, 'The email verification provider is out of credits or rate limited. Start a new check later for the rest.');
            return;
        }
        if (outcome.status) {
            await writeDecisions(run.id, new Map([[email, { status: outcome.status, reason: outcome.reason }]]), { processed: index + 1 });
        } else {
            await prisma.emailValidationRun.update({ where: { id: run.id }, data: { processed: index + 1, undecidedCount: { increment: 1 } } });
        }
    }
    await completeRun(run.id, emails.length);
}

// ── List mode: the provider's List API ──────────────────────────────────────────
// 1. local_checks: the free checks for every address (concurrently); failures are decided here and cost nothing.
// 2. uploading: the rest go to the provider as one CSV (credits for the whole list are taken at upload).
// 3. provider_running / provider_waiting: the job is polled (no callback URL needed); "ready" = not enough credits.
// 4. importing: the per-result reports are downloaded and written onto the records; the job is then deleted.
// Each phase is saved, so a restart resumes: the free checks start over (they're free), polling picks up the job.

const LOCAL_CHECK_CONCURRENCY = 8;
const LOCAL_CHECK_BATCH = 200;
const MAX_POLL_FAILURES = 6;

/** Gap between status polls, by list size (the provider asks for minutes, more for very large lists). */
function pollIntervalMs(size: number, firstPoll: boolean): number {
    if (firstPoll) return 30_000;
    if (size < 10_000) return 2 * 60_000;
    if (size < 100_000) return 5 * 60_000;
    return 15 * 60_000;
}

/** Waits, but returns false early when the admin cancels the run. */
async function waitWhileActive(runId: string, ms: number): Promise<boolean> {
    const until = Date.now() + ms;
    while (Date.now() < until) {
        await new Promise((resolve) => setTimeout(resolve, Math.min(10_000, until - Date.now())));
        if (!(await isRunActive(runId))) return false;
    }
    return true;
}

async function mapWithConcurrency<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
    const results = new Array<R>(items.length);
    let next = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (next < items.length) {
            const index = next++;
            results[index] = await fn(items[index]);
        }
    });
    await Promise.all(workers);
    return results;
}

/** Free checks for every address; returns the ones left for the provider (null = cancelled). */
async function runLocalPhase(run: EmailValidationRun): Promise<string[] | null> {
    const emails = JSON.parse(run.emailsJson) as string[];
    // Restarted mid-phase: start the free checks over (they're free and the writes are idempotent).
    await prisma.emailValidationRun.update({
        where: { id: run.id },
        data: { phase: 'local_checks', processed: 0, validCount: 0, riskyCount: 0, invalidCount: 0, undecidedCount: 0 },
    });
    const toProvider: string[] = [];
    for (let start = 0; start < emails.length; start += LOCAL_CHECK_BATCH) {
        if (!(await isRunActive(run.id))) return null;
        const batch = emails.slice(start, start + LOCAL_CHECK_BATCH);
        const results = await mapWithConcurrency(batch, LOCAL_CHECK_CONCURRENCY, async (email) => {
            try {
                return await runLocalChecks(email);
            } catch {
                return null; // DNS trouble etc.: let the provider decide.
            }
        });
        const decisions = new Map<string, Decision>();
        batch.forEach((email, i) => {
            const local = results[i];
            if (local?.status) decisions.set(email, { status: local.status, reason: local.reason ?? local.status });
            else toProvider.push(email);
        });
        await writeDecisions(run.id, decisions, { processed: start + batch.length });
    }
    await prisma.emailValidationRun.update({ where: { id: run.id }, data: { phase: 'uploading', providerEmailsJson: JSON.stringify(toProvider) } });
    return toProvider;
}

async function processListRun(initial: EmailValidationRun): Promise<void> {
    let run = initial;
    const total = (JSON.parse(run.emailsJson) as string[]).length;

    let toProvider: string[] | null = run.providerEmailsJson ? (JSON.parse(run.providerEmailsJson) as string[]) : null;
    if (!run.phase || run.phase === 'local_checks' || !toProvider) {
        toProvider = await runLocalPhase(run);
        if (!toProvider) return; // cancelled
    }
    if (toProvider.length === 0) return completeRun(run.id, total);
    // From here `processed` counts addresses decided so far: the free-check failures, then everything on import.
    const decidedLocally = total - toProvider.length;

    run = (await prisma.emailValidationRun.findUnique({ where: { id: run.id } }))!;
    if (!run.providerJobId) {
        if (!(await isRunActive(run.id))) return;
        // A restart between the upload and saving its id would upload (and pay for) the list again; the window is
        // one request long.
        try {
            const jobId = await uploadEmailList(toProvider, `crm-email-check-${run.id}.csv`);
            run = await prisma.emailValidationRun.update({
                where: { id: run.id },
                data: { providerJobId: jobId, phase: 'provider_running', providerProgress: 0, processed: decidedLocally },
            });
        } catch (err) {
            const message = err instanceof ProviderListError ? err.message : 'The list could not be sent to the verification provider.';
            logger.warn({ err: (err as Error).message, runId: run.id }, 'Email list upload failed');
            return stopRun(run.id, `${message} Addresses that failed the free checks were saved; start a new check later for the rest.`);
        }
    }
    const jobId = run.providerJobId!;

    // Poll until the provider finishes.
    let status: ListJobStatus | null = null;
    let failures = 0;
    let firstPoll = true;
    while (run.phase !== 'importing') {
        if (!(await waitWhileActive(run.id, pollIntervalMs(toProvider.length, firstPoll)))) return;
        firstPoll = false;
        try {
            status = await getListJobStatus(jobId);
            failures = 0;
        } catch (err) {
            failures += 1;
            logger.warn({ err: (err as Error).message, runId: run.id, failures }, 'Email list status check failed');
            if (failures >= MAX_POLL_FAILURES) {
                return stopRun(run.id, `Lost contact with the verification provider. The list (job ${jobId}) may still finish in the QuickEmailVerification dashboard.`);
            }
            continue;
        }
        if (status.status === 'failed') {
            return stopRun(run.id, `The verification provider couldn’t process the list${status.message ? `: ${status.message}` : '.'}`);
        }
        const phase = status.status === 'completed' ? 'importing' : status.status === 'ready' ? 'provider_waiting' : 'provider_running';
        run = await prisma.emailValidationRun.update({
            where: { id: run.id },
            data: {
                phase,
                providerProgress: status.status === 'completed' ? 100 : status.progress,
                lastPolledAt: new Date(),
                message:
                    phase === 'provider_waiting'
                        ? 'Waiting for credits: the provider account doesn’t have enough credits for this list. Add credits and start the list in the QuickEmailVerification dashboard; this check carries on by itself.'
                        : null,
            },
        });
    }

    // Import the reports.
    if (!(await isRunActive(run.id))) return;
    try {
        status ??= await getListJobStatus(jobId);
        const urls = status.downloadUrls;
        if (!urls.safetosend || !urls.valid || !urls.invalid) throw new ProviderListError('The provider’s report links are missing.');
        const [safetosend, valid, invalid] = await Promise.all(
            [urls.safetosend, urls.valid, urls.invalid].map((url) => downloadListReport(url).then(reportEmails)),
        );
        const details = urls.fullreport ? reportDetails(await downloadListReport(urls.fullreport).catch(() => '')) : new Map<string, ReportDetail>();
        const { decisions, undecided } = decideFromReports(toProvider, { safetosend, valid, invalid }, details);
        await writeDecisions(run.id, decisions, { processed: total, undecidedCount: { increment: undecided } });
    } catch (err) {
        logger.warn({ err: (err as Error).message, runId: run.id }, 'Email list import failed');
        const message = err instanceof ProviderListError ? err.message : 'The results could not be read.';
        return stopRun(run.id, `${message} The list (job ${jobId}) is finished in the QuickEmailVerification dashboard; start a new check to retry.`);
    }
    await completeRun(run.id, total);
    await deleteListJob(jobId);
}

async function processRun(runId: string): Promise<void> {
    let run = await prisma.emailValidationRun.findUnique({ where: { id: runId } });
    if (!run || !ACTIVE_STATUSES.includes(run.status)) return;
    if (run.status === 'queued') run = await prisma.emailValidationRun.update({ where: { id: runId }, data: { status: 'running' } });
    if (run.mode === 'list') await processListRun(run);
    else await processSingleRun(run);
}

// One run at a time per API process, oldest first.
let draining = false;

async function drainRuns(): Promise<void> {
    if (draining) return;
    draining = true;
    try {
        for (;;) {
            const next = await prisma.emailValidationRun.findFirst({ where: { status: { in: ACTIVE_STATUSES } }, orderBy: { createdAt: 'asc' } });
            if (!next) return;
            try {
                await processRun(next.id);
            } catch (err) {
                logger.error({ err: (err as Error).message, runId: next.id }, 'Bulk email check failed');
                await prisma.emailValidationRun
                    .update({ where: { id: next.id }, data: { status: 'stopped', finishedAt: new Date(), message: 'The check stopped because of a server error.' } })
                    .catch(() => undefined);
            }
        }
    } finally {
        draining = false;
    }
}

/** Called at API start: picks up runs a restart interrupted. */
export function resumeEmailValidationRuns(): void {
    void drainRuns().catch((err: Error) => logger.warn({ err: err.message }, 'Could not resume bulk email checks'));
}

// ── Actions on risky / invalid addresses ────────────────────────────────────────

export const EMAIL_ACTIONS = ['accept', 'markBounced', 'remove'] as const;

export const emailActionSchema = z.object({
    action: z.enum(EMAIL_ACTIONS),
    emails: z.array(z.string().trim().toLowerCase().min(3).max(120)).min(1).max(MAX_PAGE_SIZE * 10),
});

type OwnerKind = 'lead' | 'contact' | 'organization';

const OWNER_INFO: Record<OwnerKind, { entityType: AuditEntityType; field: string }> = {
    lead: { entityType: 'Lead', field: 'emailAddresses' },
    contact: { entityType: 'Contact', field: 'emailAddresses' },
    organization: { entityType: 'Organization', field: 'corporateEmails' },
};

function ownerOf(row: Pick<EntityEmail, 'leadId' | 'contactId' | 'organizationId'>): { kind: OwnerKind; owner: EmailOwner; id: string } | null {
    if (row.leadId) return { kind: 'lead', owner: { leadId: row.leadId }, id: row.leadId };
    if (row.contactId) return { kind: 'contact', owner: { contactId: row.contactId }, id: row.contactId };
    if (row.organizationId) return { kind: 'organization', owner: { organizationId: row.organizationId }, id: row.organizationId };
    return null;
}

export const emailValidationAdminService = {
    async summary() {
        const rows = await prisma.$queryRaw<{ statusRank: number; count: number }[]>`
            ${addressesCte({ status: 'all', sort: 'oldest' })}
            SELECT f.statusRank, COUNT(*) AS count FROM f GROUP BY f.statusRank`;
        const counts = { total: 0, unchecked: 0, valid: 0, risky: 0, invalid: 0 };
        for (const row of rows) {
            const count = Number(row.count);
            counts[RANK_STATUS[Number(row.statusRank)] ?? 'unchecked'] += count;
            counts.total += count;
        }
        const activeRun = await prisma.emailValidationRun.findFirst({ where: { status: { in: ACTIVE_STATUSES } }, orderBy: { createdAt: 'asc' } });
        return {
            counts,
            enabled: ENV.EMAIL_VERIFICATION.ENABLED,
            /** False = only the free checks run (no QUICKEMAILVERIFICATION_API_KEY). */
            providerConfigured: Boolean(ENV.EMAIL_VERIFICATION.QEV_API_KEY),
            /** False while the provider is paused after running out of credits / being rate limited. */
            providerAvailable: isProviderAvailable(),
            maxRunSize: MAX_RUN_SIZE,
            /** Runs of at least this many addresses use the provider's List API. */
            listApiMin: ENV.EMAIL_VERIFICATION.LIST_API_MIN,
            activeRun: activeRun ? toRunDto(activeRun) : null,
        };
    },

    async listAddresses(query: unknown): Promise<{ items: EmailAddressDto[]; total: number; page: number; pageSize: number }> {
        const { page, pageSize, ...filter } = addressQuerySchema.parse(query ?? {});
        const rows = await prisma.$queryRaw<AddressRow[]>`
            ${addressesCte(filter)}
            SELECT f.*, COUNT(*) OVER () AS totalCount FROM f
            ${addressOrder(filter.sort)}
            OFFSET ${(page - 1) * pageSize} ROWS FETCH NEXT ${pageSize} ROWS ONLY`;
        const reasons = await reasonsFor(rows.filter((row) => Number(row.statusRank) > 0).map((row) => row.email));
        return {
            items: rows.map((row) => ({
                email: row.email,
                status: RANK_STATUS[Number(row.statusRank)] ?? 'unchecked',
                reason: reasons.get(row.email) ?? null,
                lastCheckedAt: row.lastCheckedAt ? new Date(row.lastCheckedAt).toISOString() : null,
                isBounced: Number(row.bounced) === 1,
                records: { leads: Number(row.leads), contacts: Number(row.contacts), organizations: Number(row.organizations) },
            })),
            total: rows.length > 0 ? Number(rows[0].totalCount) : 0,
            page,
            pageSize,
        };
    },

    async listRuns(): Promise<EmailValidationRunDto[]> {
        const runs = await prisma.emailValidationRun.findMany({ orderBy: { createdAt: 'desc' }, take: 10 });
        return runs.map(toRunDto);
    },

    async getRun(id: string): Promise<EmailValidationRunDto> {
        const run = await prisma.emailValidationRun.findUnique({ where: { id } });
        if (!run) throw HttpError.notFound('Check not found');
        return toRunDto(run);
    },

    async startRun(body: unknown, user: AuthUser): Promise<EmailValidationRunDto> {
        if (!ENV.EMAIL_VERIFICATION.ENABLED) throw HttpError.badRequest('Email verification is turned off on the server.');
        const input = startRunSchema.parse(body ?? {});
        const active = await prisma.emailValidationRun.count({ where: { status: { in: ACTIVE_STATUSES } } });
        if (active > 0) throw HttpError.conflict('A check is already running. Wait for it to finish or cancel it.');

        let emails: string[];
        if (input.emails?.length) {
            // Ticked addresses: keep only those actually saved on a record (and each once).
            const requested = [...new Set(input.emails)];
            const saved = new Set<string>();
            for (let i = 0; i < requested.length; i += MAX_SQL_LIST) {
                const rows = await prisma.entityEmail.findMany({
                    where: { email: { in: requested.slice(i, i + MAX_SQL_LIST) } },
                    select: { email: true },
                    distinct: ['email'],
                });
                rows.forEach((row) => saved.add(row.email));
            }
            emails = requested.filter((email) => saved.has(email));
        } else {
            emails = await pickAddresses(input.filter!, input.limit!);
        }
        if (emails.length === 0) throw HttpError.badRequest('None of the chosen addresses are saved on a record.');

        // Large runs go through the provider's List API (only meaningful with a provider key).
        const mode = ENV.EMAIL_VERIFICATION.QEV_API_KEY && emails.length >= ENV.EMAIL_VERIFICATION.LIST_API_MIN ? 'list' : 'single';
        const run = await prisma.emailValidationRun.create({
            data: { status: 'queued', mode, emailsJson: JSON.stringify(emails), total: emails.length, startedBy: user.username },
        });
        void drainRuns().catch((err: Error) => logger.warn({ err: err.message }, 'Bulk email check failed to start'));
        return toRunDto(run);
    },

    async cancelRun(id: string, user: AuthUser): Promise<EmailValidationRunDto> {
        const run = await prisma.emailValidationRun.findUnique({ where: { id } });
        if (!run) throw HttpError.notFound('Check not found');
        if (!ACTIVE_STATUSES.includes(run.status)) return toRunDto(run);
        // Once a list is with the provider its credits are spent; cancelling only stops waiting for (and importing) it.
        const uploaded = Boolean(run.providerJobId);
        const updated = await prisma.emailValidationRun.update({
            where: { id },
            data: {
                status: 'cancelled',
                phase: null,
                finishedAt: new Date(),
                message: uploaded
                    ? `Cancelled by ${user.username}. The list was already with the provider (job ${run.providerJobId}), so its credits were used; its results weren't imported.`
                    : `Cancelled by ${user.username}.`,
            },
        });
        return toRunDto(updated);
    },

    /**
     * What the admin decided for risky / invalid addresses:
     * - `accept`: treat as valid from now on (kept on the records, the warning badge goes away);
     * - `markBounced`: keep, but tick "Invalid Bounce" on every record that has it;
     * - `remove`: delete the address from every record (the next address becomes primary where needed).
     * Record changes are written to each record's audit history.
     */
    async applyAction(body: unknown, user: AuthUser): Promise<{ affectedRecords: number }> {
        const { action, emails } = emailActionSchema.parse(body ?? {});
        const unique = [...new Set(emails)];

        if (action === 'accept') {
            const result = await prisma.entityEmail.updateMany({
                where: { email: { in: unique } },
                data: { verificationStatus: 'valid', verificationReason: 'admin_accepted', verifiedAt: new Date() },
            });
            await invalidateRecordCaches();
            return { affectedRecords: result.count };
        }

        const affectedRecords = await runInTransaction(async (tx) => {
            const rows = await tx.entityEmail.findMany({ where: { email: { in: unique } }, select: { leadId: true, contactId: true, organizationId: true } });
            const owners = new Map<string, NonNullable<ReturnType<typeof ownerOf>>>();
            for (const row of rows) {
                const owner = ownerOf(row);
                if (owner) owners.set(`${owner.kind}:${owner.id}`, owner);
            }

            for (const { kind, owner, id } of owners.values()) {
                const before = toEmailDtos(await tx.entityEmail.findMany({ where: owner }));
                if (action === 'markBounced') {
                    await tx.entityEmail.updateMany({ where: { ...owner, email: { in: unique } }, data: { isInvalidBounce: true } });
                } else {
                    await tx.entityEmail.deleteMany({ where: { ...owner, email: { in: unique } } });
                    const remaining = await tx.entityEmail.findMany({ where: owner, orderBy: { sortOrder: 'asc' }, select: { id: true, isPrimary: true } });
                    if (remaining.length > 0 && !remaining.some((row) => row.isPrimary)) {
                        await tx.entityEmail.update({ where: { id: remaining[0].id }, data: { isPrimary: true } });
                    }
                }
                const after = toEmailDtos(await tx.entityEmail.findMany({ where: owner }));
                const { entityType, field } = OWNER_INFO[kind];
                await auditService.record(tx, { entityType, entityId: id, action: 'UPDATE', changedBy: user.username, changes: { [field]: { from: before, to: after } } });
            }
            return owners.size;
        });
        await invalidateRecordCaches();
        return { affectedRecords };
    },
};

