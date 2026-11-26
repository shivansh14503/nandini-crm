import { createHash, randomUUID } from 'node:crypto';
import { ENV } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { prisma } from '../../config/prisma.js';
import { calendarSyncQueue, tryEnqueue } from '../../jobs/queues.js';
import { ProviderError } from '../calendar-sync/providers/http.js';
import { isFakeProviderEnabled, loadProviderAccess } from '../calendar-sync/providers/registry.js';
import { tokenSource } from '../calendar-sync/tokenSource.js';
import { ADMIN_INTEGRATIONS_ENTITY_MODULE } from '../calendar-sync/connection.constants.js';
import { adminRecipients, businessDateOf } from '../calendar-sync/syncIssue.notifications.js';
import { formConfigService } from '../form-configs/formConfig.service.js';
import { GRAPH_DEFAULT_SCOPE } from '../integrations/integration.constants.js';
import { calendarSettingsFrom } from '../integrations/integration.settings.js';
import { notify, type NotificationInput } from '../notifications/notification.producer.js';
import {
    APP_PAUSE_MS,
    EMAIL_LOG_JOB,
    ERROR_BACKOFF_MS,
    FULL_SYNC_DAYS,
    GMAIL_SCOPE,
    MAILBOX_LEASE_MS,
    MAILBOXES_PER_TICK,
    MESSAGES_PER_RUN,
    PROVIDER_MESSAGE_ID_MAX,
    THREAD_ID_MAX,
    WEB_LINK_MAX,
    type MailAppErrorCode,
} from './emailLog.constants.js';
import { classifyMailError, mailAdminMessage, type MailFailure } from './emailLog.errors.js';
import {
    boundRecipients,
    cleanSnippet,
    cleanSubject,
    directionOf,
    externalAddresses,
    messageIdHash,
    planMessage,
    preFilter,
    type LinkPlan,
    type SkipReason,
} from './emailLog.match.js';
import { EMAIL_LOGGING_SETTING_KEY, effectiveMode, readEmailLoggingSettings, type EmailLoggingSettings } from './emailLog.settings.js';
import { prismaEmailLogStore, type EmailLogStore, type MailboxRow, type RunUpdate } from './emailLog.store.js';
import { getMailAdapter, isMailProvider } from './providers/registry.js';
import type { MailAdapter, MailCtx, MailCursor, MailMessage, MailProviderKey } from './providers/types.js';

/**
 * Email logging ingestion (design note EL1–EL7; docs/system-design.md §5.6). One run reads one employee's new mail
 * through the company credentials (calendar-sync/tokenSource.ts, minted with the mail scope only), keeps the messages
 * exchanged with live CRM contacts / leads and logs each once per Message-ID with a copy per mailbox and links to the
 * records.
 *
 *   - Runs come from the calendar poll tick (inside CALENDAR_SYNC_HOURS): up to 25 due mailboxes queued as `email-log`
 *     jobs on the calendar sync queue; a mailbox is due every EMAIL_LOG_POLL_MINUTES, at once again when its last run
 *     stopped at the 200-message limit, and after an error by backoff (15 min → 1 h → 6 h → 24 h). Redis down: the
 *     fallback tick runs one due mailbox in-process.
 *   - A per-mailbox lease (LoggedEmailMailbox.leaseId / leaseUntil) keeps two runs of one mailbox apart. Runs of two
 *     mailboxes holding the same message race on UX_LoggedEmail_messageIdHash; the store resolves it (D45).
 *   - The cursor is saved only after the run's messages are stored, so a crash re-reads (idempotent: copies are unique
 *     per mailbox message).
 *   - Failures are classified (emailLog.errors.ts) and kept on the mailbox row; nothing here touches calendar state.
 */

export interface EmailLogContext {
    settings: EmailLoggingSettings;
    companyDomains: string[];
}

export type IngestStatus = 'done' | 'off' | 'not_ready' | 'busy' | 'paused' | 'error' | 'transient';

export interface IngestResult {
    status: IngestStatus;
    /** New logged emails (first copy of a Message-ID). */
    logged: number;
    /** Copies added to emails another mailbox logged first. */
    copies: number;
    skipped: Partial<Record<SkipReason | 'duplicate', number>>;
    complete?: boolean;
    failure?: MailFailure;
}

export interface IngestDeps {
    store: EmailLogStore;
    now: () => Date;
    loadContext: () => Promise<EmailLogContext>;
    providerUsable: (provider: MailProviderKey) => Promise<boolean>;
    token: (provider: MailProviderKey, mailbox: string) => Promise<string>;
    invalidateToken: (provider: MailProviderKey, mailbox: string) => void;
    adapter: (provider: MailProviderKey) => MailAdapter;
    notifyApp: (provider: MailProviderKey, code: MailAppErrorCode, now: Date) => Promise<void>;
    serverEnabled: () => boolean;
    pollMinutes: () => number;
}

/** Scopes of mail tokens (never the calendar's: a missing Gmail scope can't break calendar tokens). */
export const MAIL_SCOPES: Readonly<Record<MailProviderKey, readonly string[]>> = {
    google: [GMAIL_SCOPE],
    microsoft: [GRAPH_DEFAULT_SCOPE],
    fake: ['fake.mail'],
};

export const MAIL_PROVIDER_LABELS: Readonly<Record<MailProviderKey, string>> = {
    google: 'Gmail (Google Workspace)',
    microsoft: 'Outlook (Microsoft 365)',
    fake: 'Test mail (development only)',
};

/** Company email-logging settings and company domains (one cached form-config read). */
export async function loadEmailLogContext(): Promise<EmailLogContext> {
    const configs = await formConfigService.getAllConfigs();
    return {
        settings: readEmailLoggingSettings(configs.moduleSettings.activities?.[EMAIL_LOGGING_SETTING_KEY]),
        companyDomains: calendarSettingsFrom(configs).companyDomains,
    };
}

/** The provider is switched on with readable credentials (the fake: while CALENDAR_FAKE_PROVIDER is on). */
export async function mailProviderUsable(provider: MailProviderKey): Promise<boolean> {
    if (provider === 'fake') return isFakeProviderEnabled();
    const access = await loadProviderAccess(provider);
    return access.enabled && access.configured;
}

/** One `calendar_sync_issue` per provider + code + business day to every admin (the existing system kind). Pure. */
export function mailIssueNotifications(admins: readonly string[], provider: MailProviderKey, code: MailAppErrorCode, now: Date): NotificationInput[] {
    const date = businessDateOf(now);
    return admins.map((username) => ({
        username,
        kind: 'calendar_sync_issue',
        title: `Email logging stopped: ${MAIL_PROVIDER_LABELS[provider]}`,
        body: mailAdminMessage(code),
        entityModule: ADMIN_INTEGRATIONS_ENTITY_MODULE,
        entityId: provider,
        actor: 'system',
        dedupeKey: `email_logging_issue:${provider}:${code}:${date}:${username.toLowerCase()}`,
    }));
}

async function notifyMailIssue(provider: MailProviderKey, code: MailAppErrorCode, now: Date): Promise<void> {
    try {
        await notify(mailIssueNotifications(await adminRecipients(), provider, code, now));
    } catch (err) {
        logger.warn({ provider, code, err: (err as Error).message }, 'Could not notify admins about an email logging problem');
    }
}

export const defaultIngestDeps = (): IngestDeps => ({
    store: prismaEmailLogStore,
    now: () => new Date(),
    loadContext: loadEmailLogContext,
    providerUsable: mailProviderUsable,
    token: async (provider, mailbox) => (await tokenSource.getAccessToken(provider, mailbox, MAIL_SCOPES[provider])).accessToken,
    invalidateToken: (provider, mailbox) => tokenSource.invalidate(provider, provider === 'microsoft' ? undefined : mailbox),
    adapter: getMailAdapter,
    notifyApp: notifyMailIssue,
    serverEnabled: () => ENV.INTEGRATIONS.EMAIL_LOG_ENABLED,
    pollMinutes: () => ENV.INTEGRATIONS.EMAIL_LOG_POLL_MINUTES,
});

// ── App-level pause (per process) ─────────────────────────────────────────────────────────────────────────────

const pausedUntil = new Map<MailProviderKey, number>();
export function resetMailPausesForTests(): void {
    pausedUntil.clear();
}

/** Backoff after `failures` consecutive failures (1-based). Pure. */
export const errorBackoffMs = (failures: number): number => ERROR_BACKOFF_MS[Math.min(Math.max(failures, 1), ERROR_BACKOFF_MS.length) - 1];

/** The stored cursor of this mailbox, when it belongs to the same provider and address. Pure. */
export function cursorOf(row: Pick<MailboxRow, 'provider' | 'accountEmail' | 'cursorJson'> | null, provider: MailProviderKey, mailbox: string): MailCursor | null {
    if (!row?.cursorJson || row.provider !== provider || (row.accountEmail ?? '').toLowerCase() !== mailbox) return null;
    try {
        const parsed = JSON.parse(row.cursorJson) as MailCursor;
        if (provider === 'google' && parsed.kind === 'gmail' && typeof parsed.historyId === 'string') return parsed;
        if (provider === 'microsoft' && parsed.kind === 'graph') return { kind: 'graph', inbox: parsed.inbox ?? null, sent: parsed.sent ?? null };
        if (provider === 'fake' && parsed.kind === 'fake' && typeof parsed.position === 'number') return parsed;
    } catch {
        // unreadable: start over (bounded full sync)
    }
    return null;
}

const isUnauthorized = (err: unknown) => err instanceof ProviderError && err.status === 401;

/**
 * Stores one message's plan: the email (once per Message-ID), this mailbox's copy and the record links. Returns
 * 'logged' (new email), 'copy' (email logged by another mailbox), or 'duplicate' (this mailbox had it already).
 */
async function storeMessage(
    store: EmailLogStore,
    msg: MailMessage,
    links: readonly LinkPlan[],
    ctx: { username: string; provider: MailProviderKey; mailbox: string; adapter: MailAdapter; context: EmailLogContext },
): Promise<'logged' | 'copy' | 'duplicate'> {
    const providerMessageId = msg.providerMessageId.slice(0, PROVIDER_MESSAGE_ID_MAX);
    const addLinks = async (emailId: string) => {
        for (const link of links) await store.addLink({ emailId, module: link.module, recordId: link.recordId, matchedEmail: link.matchedEmail.slice(0, 120), sentAt: msg.sentAt });
    };
    const existing = await store.findCopy(ctx.username, providerMessageId);
    if (existing) {
        // Re-read (a crash before the cursor was saved): make sure its links exist, nothing else.
        await addLinks(existing.emailId);
        return 'duplicate';
    }
    const to = boundRecipients(msg.to);
    const cc = boundRecipients(msg.cc);
    const email = await store.upsertEmail({
        messageIdHash: messageIdHash(msg.internetMessageId),
        threadId: msg.providerThreadId?.slice(0, THREAD_ID_MAX) ?? null,
        subject: cleanSubject(msg.subject),
        fromEmail: msg.from?.email ?? '',
        fromName: msg.from?.name ?? null,
        toJson: to.json,
        ccJson: cc.json,
        moreRecipients: to.more + cc.more,
        sentAt: msg.sentAt,
        direction: directionOf(msg.from, ctx.context.companyDomains),
        snippet: ctx.context.settings.storeSnippets ? cleanSnippet(msg.snippet) : null,
        hasAttachments: msg.hasAttachments,
        provider: ctx.provider,
        ownerUsername: ctx.username,
    });
    const link = ctx.adapter.webLinkOf(ctx.mailbox, msg);
    const added = await store.addCopy({
        emailId: email.id,
        username: ctx.username,
        provider: ctx.provider,
        providerMessageId,
        providerThreadId: msg.providerThreadId?.slice(0, THREAD_ID_MAX) ?? null,
        webLink: link && link.length <= WEB_LINK_MAX ? link : null,
        direction: msg.sentByMailbox || (msg.from?.email ?? '') === ctx.mailbox ? 'out' : 'in',
    });
    await addLinks(email.id);
    if (!added) return 'duplicate';
    return email.created ? 'logged' : 'copy';
}

/** Runs `fn` with a mail token; on a 401 drops the cached token and retries once. */
async function withMailToken<T>(deps: IngestDeps, provider: MailProviderKey, mailbox: string, fn: (ctx: MailCtx) => Promise<T>): Promise<T> {
    try {
        return await fn({ accessToken: await deps.token(provider, mailbox), mailbox });
    } catch (err) {
        if (!isUnauthorized(err)) throw err;
        deps.invalidateToken(provider, mailbox);
        return fn({ accessToken: await deps.token(provider, mailbox), mailbox });
    }
}

/** One mailbox run (see the file header). Never throws for provider failures; database errors propagate (job retry). */
export async function ingestMailbox(username: string, deps: IngestDeps = defaultIngestDeps()): Promise<IngestResult> {
    const result: IngestResult = { status: 'off', logged: 0, copies: 0, skipped: {} };
    const context = await deps.loadContext();
    if (!deps.serverEnabled() || !context.settings.enabled) return result;
    const target = await deps.store.loadTarget(username);
    if (!target.userActive) return result;
    if (effectiveMode(target.mailbox?.mode, context.settings) !== 'on') return result;
    const provider = target.connection?.provider;
    if (!target.connection || !isMailProvider(provider) || !(await deps.providerUsable(provider))) return { ...result, status: 'not_ready' };
    const now = deps.now();
    if ((pausedUntil.get(provider) ?? 0) > now.getTime()) return { ...result, status: 'paused' };

    const leaseId = randomUUID();
    if (!(await deps.store.claimLease(username, leaseId, now, new Date(now.getTime() + MAILBOX_LEASE_MS)))) return { ...result, status: 'busy' };

    const mailbox = target.connection.accountEmail.trim().toLowerCase();
    const adapter = deps.adapter(provider);
    const mailboxRow = target.mailbox;
    let update: RunUpdate | null = null;
    try {
        const cursor = cursorOf(mailboxRow, provider, mailbox);
        const since = new Date(now.getTime() - FULL_SYNC_DAYS * 24 * 60 * 60_000);
        const page = await withMailToken(deps, provider, mailbox, (ctx) => adapter.listNew(ctx, cursor, { since, limit: MESSAGES_PER_RUN }));

        const count = (key: SkipReason | 'duplicate') => {
            result.skipped[key] = (result.skipped[key] ?? 0) + 1;
        };
        const candidates: MailMessage[] = [];
        for (const msg of page.messages) {
            const skip = preFilter(msg, context.companyDomains);
            if (skip) count(skip);
            else candidates.push(msg);
        }
        const addresses = candidates.length ? await deps.store.lookupAddresses(candidates.flatMap((m) => externalAddresses(m, context.companyDomains))) : new Map();
        const contactIds = [...addresses.values()].flatMap((m) => m.contacts);
        const opportunities = contactIds.length ? await deps.store.opportunitiesOfContacts(contactIds) : new Map<string, string[]>();
        const storeCtx = { username, provider, mailbox, adapter, context };

        for (const msg of candidates) {
            let plan = planMessage(msg, context.companyDomains, addresses, opportunities);
            if (plan.action === 'log' && plan.needsAutomationCheck) {
                const automated = await withMailToken(deps, provider, mailbox, (ctx) => adapter.automatedOf(ctx, msg.providerMessageId));
                plan = planMessage({ ...msg, automated }, context.companyDomains, addresses, opportunities);
            }
            if (plan.action === 'skip') {
                count(plan.reason);
                continue;
            }
            const outcome = await storeMessage(deps.store, msg, plan.links, storeCtx);
            if (outcome === 'logged') result.logged += 1;
            else if (outcome === 'copy') result.copies += 1;
            else count('duplicate');
        }

        const done = deps.now();
        update = {
            provider,
            accountEmail: mailbox,
            cursorJson: JSON.stringify(page.cursor),
            status: 'ok',
            errorLevel: null,
            lastErrorCode: null,
            lastErrorMessage: null,
            consecutiveFailures: 0,
            lastRunAt: done,
            lastSuccessAt: done,
            // Stopped at the limit: due again at once (the next tick); else after the poll interval.
            nextRunAt: page.complete ? new Date(done.getTime() + deps.pollMinutes() * 60_000) : done,
            loggedDelta: result.logged + result.copies,
        };
        result.status = 'done';
        result.complete = page.complete;
        if (result.logged + result.copies > 0 || page.resynced) logger.info({ username, provider, logged: result.logged, copies: result.copies, resynced: page.resynced }, 'Email logging run');
        return result;
    } catch (err) {
        const anyMailboxOk = provider === 'microsoft' ? await deps.store.anyMailboxOk(provider).catch(() => true) : false;
        const failure = classifyMailError(provider, err, { anyMailboxOk });
        const at = deps.now();
        if (!failure) {
            update = { lastRunAt: at };
            throw err;
        }
        result.failure = failure;
        if (failure.level === 'transient') {
            const wait = Math.max(failure.retryAfterMs ?? 0, 5 * 60_000);
            update = { lastRunAt: at, nextRunAt: new Date(at.getTime() + wait) };
            result.status = 'transient';
            return result;
        }
        const failures = (mailboxRow?.consecutiveFailures ?? 0) + 1;
        update = {
            provider,
            accountEmail: mailbox,
            status: 'error',
            errorLevel: failure.level,
            lastErrorCode: failure.code,
            lastErrorMessage: mailAdminMessage(failure.code, failure.providerText),
            lastErrorAt: at,
            consecutiveFailures: failures,
            lastRunAt: at,
            nextRunAt: new Date(at.getTime() + errorBackoffMs(failures)),
        };
        result.status = 'error';
        logger.info({ username, provider, level: failure.level, code: failure.code }, 'Email logging problem');
        if (failure.level === 'app') {
            pausedUntil.set(provider, at.getTime() + APP_PAUSE_MS);
            await deps.notifyApp(provider, failure.code, at);
        }
        return result;
    } finally {
        await deps.store.finishRun(username, leaseId, update ?? { lastRunAt: deps.now() }).catch((e: Error) => logger.warn({ username, err: e.message }, 'Could not save the email logging run'));
    }
}

// ── Scheduling ────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Mailboxes due a run, longest-waiting first: people with a live calendar connection (`ok`) whose effective switch is
 * on, not leased, with `nextRunAt` passed (or never run). Three small reads.
 */
export async function dueMailboxes(now: Date, settings: EmailLoggingSettings, limit: number = MAILBOXES_PER_TICK): Promise<string[]> {
    const connections = await prisma.calendarConnection.findMany({ where: { status: 'ok' }, select: { username: true, provider: true } });
    const candidates = connections.filter((c) => isMailProvider(c.provider));
    if (candidates.length === 0) return [];
    const rows: { username: string; mode: string | null; nextRunAt: Date | null; lastRunAt: Date | null; leaseUntil: Date | null }[] = [];
    const usernames = candidates.map((c) => c.username);
    for (let i = 0; i < usernames.length; i += 1000) {
        rows.push(
            ...(await prisma.loggedEmailMailbox.findMany({
                where: { username: { in: usernames.slice(i, i + 1000) } },
                select: { username: true, mode: true, nextRunAt: true, lastRunAt: true, leaseUntil: true },
            })),
        );
    }
    const byUser = new Map(rows.map((r) => [r.username.toLowerCase(), r]));
    return candidates
        .map((c) => ({ username: c.username, row: byUser.get(c.username.toLowerCase()) ?? null }))
        .filter(({ row }) => effectiveMode(row?.mode, settings) === 'on')
        .filter(({ row }) => !row || ((!row.nextRunAt || row.nextRunAt <= now) && (!row.leaseUntil || row.leaseUntil < now)))
        .sort((a, b) => (a.row?.lastRunAt?.getTime() ?? 0) - (b.row?.lastRunAt?.getTime() ?? 0))
        .slice(0, limit)
        .map(({ username }) => username);
}

const userTag = (username: string) => createHash('sha256').update(username.toLowerCase()).digest('hex').slice(0, 12);

/** Job id of a mailbox run: one per mailbox and poll bucket (an admin's run gets its own minute). Pure. */
export function emailLogJobId(username: string, now: Date, pollMinutes: number, manual = false): string {
    const minute = Math.floor(now.getTime() / 60_000);
    return manual ? `email-log-${userTag(username)}-m${minute}` : `email-log-${userTag(username)}-${Math.floor(minute / Math.max(1, pollMinutes))}`;
}

export interface EmailLogJobData {
    username: string;
}

/**
 * The calendar poll tick's step (inside CALENDAR_SYNC_HOURS only; the caller checks): one `email-log` job per due
 * mailbox, at most 25. Returns how many were queued. Nothing when the switch is off.
 */
export async function enqueueEmailLogRuns(now: Date = new Date(), deps: Pick<IngestDeps, 'loadContext' | 'serverEnabled' | 'pollMinutes'> = defaultIngestDeps()): Promise<number> {
    if (!deps.serverEnabled()) return 0;
    const { settings } = await deps.loadContext();
    if (!settings.enabled) return 0;
    let queued = 0;
    for (const username of await dueMailboxes(now, settings)) {
        const id = await tryEnqueue(calendarSyncQueue, EMAIL_LOG_JOB, { username } satisfies EmailLogJobData, { jobId: emailLogJobId(username, now, deps.pollMinutes()), attempts: 2 });
        if (id !== null) queued += 1;
    }
    return queued;
}

/** Redis down (the calendar fallback tick, inside the sync hours): one due mailbox in-process. */
export async function runEmailLogInline(now: Date = new Date(), deps: IngestDeps = defaultIngestDeps()): Promise<number> {
    if (!deps.serverEnabled()) return 0;
    const { settings } = await deps.loadContext();
    if (!settings.enabled) return 0;
    const [username] = await dueMailboxes(now, settings, 1);
    if (!username) return 0;
    const run = await ingestMailbox(username, deps);
    return run.logged + run.copies;
}

/** The `email-log` job body. */
export async function runEmailLogJob(data: unknown): Promise<IngestResult | null> {
    const username = (data as Partial<EmailLogJobData> | null)?.username;
    return typeof username === 'string' && username ? ingestMailbox(username) : null;
}

/** Admin "Log now": queues the person's run (inline when Redis is down). */
export async function requestEmailLogRun(username: string, now: Date = new Date()): Promise<{ status: 'queued' } | IngestResult> {
    const id = await tryEnqueue(calendarSyncQueue, EMAIL_LOG_JOB, { username } satisfies EmailLogJobData, { jobId: emailLogJobId(username, now, ENV.INTEGRATIONS.EMAIL_LOG_POLL_MINUTES, true), attempts: 1 });
    if (id !== null) return { status: 'queued' };
    return ingestMailbox(username);
}
