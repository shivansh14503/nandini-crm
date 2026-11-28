import { randomUUID } from 'node:crypto';
import nodemailer, { type Transporter } from 'nodemailer';
import { ENV } from '../config/env.js';
import { logger } from '../config/logger.js';
import { prisma, type TransactionClient } from '../config/prisma.js';
import { mailQueue, tryEnqueue } from '../jobs/queues.js';
import { currentMailConfig, getMailConfig, readinessOf, type MailConfig, type MailReadiness } from '../modules/email/email.settings.js';
import { MailSendError, sendViaGmail, type OutgoingMessage } from '../modules/email/gmail.sender.js';
import { isUniqueViolation } from '../utils/prismaErrors.js';
import { zonedDayOf, zonedStartOfDay, addDays } from '../utils/zonedTime.js';
import { secretBox } from './secretBox.js';

/**
 * Outgoing email: the one mail service (docs/system-design.md › Email). Every email of the CRM goes through
 * `sendMail` (or `queueMail`), which:
 *   - sends through the way chosen on Admin › Email › Outbound Email: the Gmail API as the sender mailbox (Google
 *     Workspace service account, domain-wide delegation, scope gmail.send) or SMTP from the SMTP_* environment
 *     settings (a lazily created nodemailer transport; STARTTLS required on 587);
 *   - records every email in EmailLog (the email log and queue), claimed first by its dedupe key, so a retried job or
 *     a second worker process never mails twice;
 *   - keeps the message sealed (secretBox, AAD `EmailLog:<dedupeKey>:body`) until it is sent, so a failed send is
 *     retried in the background with backoff (1 min, 5 min, 30 min, 2 h; MAX_SEND_ATTEMPTS in all) and an admin can
 *     retry it from Admin › Email › Email Queue. Set-password links are never kept (`retainBody: false`);
 *   - holds to the daily send limit: past it, non-essential emails wait in the queue for the next business day;
 *     essential ones (set-password links, test emails, security notices) still go out.
 * While mail is off (switched off, no sender, no key, or SMTP off) nothing is sent and nothing throws: the email is
 * logged as `skipped` with the reason. Logs name the kind, the recipient's username / domain and the outcome, never
 * credentials, links or message bodies.
 */

export const EMAIL_STATUSES = ['queued', 'sending', 'sent', 'failed', 'skipped'] as const;
export type EmailStatus = (typeof EMAIL_STATUSES)[number];
/** A failed send is retried (in the background, or by a job's own retry) while its attempts are below this. */
export const MAX_SEND_ATTEMPTS = 5;
/** Wait after attempt n (index n − 1) before the next one. */
export const RETRY_DELAYS_MS: readonly number[] = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000];
/** A row still `sending` this long after its attempt started was interrupted (process stopped mid-send). */
export const STUCK_SENDING_MS = 15 * 60_000;
/** Connection, greeting and socket timeouts: a blocked port fails fast instead of hanging a worker. */
const SMTP_TIMEOUT_MS = 20_000;

const SUBJECT_MAX = 200;
const ERROR_MAX = 500;
const KEY_MAX = 200;
const MESSAGE_ID_MAX = 250;

/** True when outgoing mail can be sent now (from this process's settings snapshot, refreshed every 30 s). */
export const isMailConfigured = (): boolean => readinessOf(currentMailConfig()).ready;

/** The same, read fresh. */
export async function isMailReady(): Promise<boolean> {
    return readinessOf(await getMailConfig()).ready;
}

/** Why mail is off, for messages (the snapshot's reason). */
export const mailDisabledReason = (): string => {
    const readiness = readinessOf(currentMailConfig());
    return readiness.ready ? '' : readiness.reason;
};

export const MAIL_DISABLED_MESSAGE = 'Outgoing email is not set up yet, so nothing can be sent. An admin can set it up on Admin › Email › Outbound Email.';

let transport: Transporter | undefined;

type MailSettings = Pick<typeof ENV.MAIL, 'SMTP_HOST' | 'SMTP_PORT' | 'SMTP_SECURE' | 'SMTP_USER' | 'SMTP_PASS' | 'SMTP_EHLO_NAME'>;

/**
 * The nodemailer SMTP options for these settings. Never plaintext: `secure` = TLS from the first byte (465); otherwise
 * `requireTLS`, so on 587 the connection fails unless the STARTTLS upgrade succeeds (without it nodemailer carries on
 * unencrypted, AUTH included, when a server or a man in the middle leaves STARTTLS out of the EHLO reply).
 */
export function smtpTransportOptions(mail: MailSettings = ENV.MAIL) {
    return {
        host: mail.SMTP_HOST,
        port: mail.SMTP_PORT,
        secure: mail.SMTP_SECURE,
        requireTLS: !mail.SMTP_SECURE,
        // Google's relay refuses a bare `localhost` greeting.
        ...(mail.SMTP_EHLO_NAME ? { name: mail.SMTP_EHLO_NAME } : {}),
        ...(mail.SMTP_USER ? { auth: { user: mail.SMTP_USER, pass: mail.SMTP_PASS ?? '' } } : {}),
        connectionTimeout: SMTP_TIMEOUT_MS,
        greetingTimeout: SMTP_TIMEOUT_MS,
        socketTimeout: SMTP_TIMEOUT_MS,
    };
}

function getTransport(): Transporter {
    transport ??= nodemailer.createTransport(smtpTransportOptions());
    return transport;
}

/** Closes the SMTP transport (process shutdown). */
export function closeMail(): void {
    transport?.close();
    transport = undefined;
}

/** What the logs say about a recipient: their username and the address's domain, not the address. */
export function recipientForLog(email: string, username?: string | null): { toUsername?: string; toDomain: string } {
    const domain = email.includes('@') ? email.slice(email.lastIndexOf('@') + 1).toLowerCase() : '';
    return { ...(username ? { toUsername: username } : {}), toDomain: domain };
}

export interface MailInput {
    to: string;
    /** The CRM user the email goes to, when it is one. */
    toUsername?: string | null;
    subject: string;
    html: string;
    text: string;
    /** What the email is (EmailLog.kind), e.g. `morning_summary`. */
    kind: string;
    /** The template it was rendered from (Admin › Email › Templates), when it was. */
    templateKey?: string | null;
    /** One send per key (e.g. `morning_summary:2026-11-25:palak`). Leave out for one-off sends (a unique key is used). */
    dedupeKey?: string;
    /** Keep the message (sealed) until sent, so it can be retried. Default true; false for emails carrying a credential. */
    retainBody?: boolean;
    /** Sent even past the daily limit (set-password links, test emails, security notices). */
    essential?: boolean;
}

export interface MailResult {
    /**
     * `queued`: waiting in the queue (queueMail, or past the daily limit); `duplicate`: the key was already sent (or is
     * being sent) by another run; nothing was sent now.
     */
    status: 'sent' | 'failed' | 'skipped' | 'duplicate' | 'queued';
    logId?: string;
    messageId?: string;
    error?: string;
}

/** What the claim needs from Prisma (the root client, or a test double). */
export type EmailLogDb = Pick<TransactionClient, 'emailLog'>;

export interface EmailLogRow {
    kind: string;
    toUsername: string | null;
    toEmail: string;
    subject: string;
    dedupeKey: string;
    templateKey?: string | null;
    bodyEnc?: string | null;
}

export type EmailClaim = { claimed: true; id: string; attempts: number } | { claimed: false; reason: string };

/** A send that may run again later: turned off at the time, or failed fewer than MAX_SEND_ATTEMPTS times. */
export const isRetryableEmail = (row: { status: string; attempts: number }): boolean =>
    row.status === 'skipped' || (row.status === 'failed' && row.attempts < MAX_SEND_ATTEMPTS);

/** When the attempt after `attempts` failed ones may run; null once they are used up. Pure. */
export function nextAttemptAfter(attempts: number, now: Date): Date | null {
    if (attempts >= MAX_SEND_ATTEMPTS) return null;
    const delay = RETRY_DELAYS_MS[Math.min(Math.max(attempts, 1), RETRY_DELAYS_MS.length) - 1];
    return new Date(now.getTime() + delay);
}

/**
 * Claims the right to send `row.dedupeKey`: inserts its EmailLog row as `sending`. When the key exists (P2002), the
 * send is someone else's unless that row is retryable (`failed` with attempts < MAX, or `skipped`); then it is taken
 * over by a conditional update on the status and attempts read, so two runs can't both retry it.
 */
export async function claimEmailLog(db: EmailLogDb, row: EmailLogRow, now = new Date()): Promise<EmailClaim> {
    try {
        const created = await db.emailLog.create({ data: { ...row, status: 'sending', attempts: 1, createdAt: now, lastAttemptAt: now }, select: { id: true } });
        return { claimed: true, id: created.id, attempts: 1 };
    } catch (err) {
        if (!isUniqueViolation(err)) throw err;
    }
    const existing = await db.emailLog.findUnique({ where: { dedupeKey: row.dedupeKey }, select: { id: true, status: true, attempts: true } });
    if (!existing) return { claimed: false, reason: 'race' };
    if (!isRetryableEmail(existing)) return { claimed: false, reason: existing.status };
    const attempts = existing.attempts + 1;
    const { count } = await db.emailLog.updateMany({
        where: { id: existing.id, status: existing.status, attempts: existing.attempts },
        data: {
            status: 'sending',
            attempts,
            error: null,
            toEmail: row.toEmail,
            toUsername: row.toUsername,
            subject: row.subject,
            lastAttemptAt: now,
            nextAttemptAt: null,
            ...(row.bodyEnc !== undefined ? { bodyEnc: row.bodyEnc } : {}),
            ...(row.templateKey !== undefined ? { templateKey: row.templateKey } : {}),
        },
    });
    return count === 1 ? { claimed: true, id: existing.id, attempts } : { claimed: false, reason: 'race' };
}

/** Records an email that wasn't sent because mail is off (kept retryable for when it is turned on). */
async function recordSkipped(db: EmailLogDb, row: EmailLogRow, now: Date, reason: string): Promise<string | undefined> {
    try {
        const created = await db.emailLog.create({
            data: { ...row, bodyEnc: null, status: 'skipped', attempts: 0, createdAt: now, error: reason.slice(0, ERROR_MAX) },
            select: { id: true },
        });
        return created.id;
    } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        return undefined;
    }
}

/** Adds the email to the queue (sent by the background worker from `nextAttemptAt`). Null when its key exists. */
async function recordQueued(db: EmailLogDb, row: EmailLogRow, now: Date, nextAttemptAt: Date, note: string | null): Promise<string | null> {
    try {
        const created = await db.emailLog.create({
            data: { ...row, status: 'queued', attempts: 0, createdAt: now, nextAttemptAt, error: note },
            select: { id: true },
        });
        return created.id;
    } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        return null;
    }
}

let loggedDisabled = false;

/** The error as stored and returned: the provider / connection message, cut to the column width. */
function errorText(err: unknown): string {
    const message = err instanceof Error ? err.message : String(err);
    return (message || 'Unknown error').replace(/\s+/g, ' ').trim().slice(0, ERROR_MAX);
}

/** SMTP: 4xx replies and connection errors may pass; 5xx replies won't. */
function smtpRetryable(err: unknown): boolean {
    const code = (err as { responseCode?: unknown })?.responseCode;
    return typeof code === 'number' ? code < 500 : true;
}

const bodyAad = (dedupeKey: string) => `EmailLog:${dedupeKey}:body`;

/** The sealed message, or null when it isn't kept (credential inside, or no encryption key on the server). */
export function sealBody(dedupeKey: string, html: string, text: string, retain = true): string | null {
    if (!retain || !secretBox.ready()) return null;
    try {
        return secretBox.seal(JSON.stringify({ html, text }), bodyAad(dedupeKey));
    } catch (err) {
        logger.warn({ err: (err as Error).message }, 'Email body could not be sealed; it will not be retried');
        return null;
    }
}

export function openBody(dedupeKey: string, sealed: string): { html: string; text: string } {
    const parsed = JSON.parse(secretBox.open(sealed, bodyAad(dedupeKey))) as { html?: unknown; text?: unknown };
    return { html: String(parsed.html ?? ''), text: String(parsed.text ?? '') };
}

/** The send itself, through the configured provider. Throws MailSendError (or a transport error). */
export const mailTransport = {
    async deliver(readiness: Extract<MailReadiness, { ready: true }>, config: MailConfig, message: Omit<OutgoingMessage, 'from' | 'replyTo'>): Promise<{ messageId: string | null }> {
        const from = { email: readiness.fromEmail, name: readiness.fromName };
        const replyTo = config.settings.replyTo;
        if (readiness.provider === 'gmail') {
            return sendViaGmail({ ...message, from, replyTo }, { clientId: config.googleKey.clientId });
        }
        try {
            const info = await getTransport().sendMail({
                from: from.name ? { name: from.name, address: from.email } : from.email,
                ...(replyTo ? { replyTo } : {}),
                to: message.to,
                subject: message.subject,
                html: message.html,
                text: message.text,
            });
            return { messageId: typeof info.messageId === 'string' ? info.messageId : null };
        } catch (err) {
            throw new MailSendError('smtp', errorText(err), smtpRetryable(err));
        }
    },
};

/** Start of the next business day (when a daily limit resets). */
export function nextBusinessDayStart(now: Date, timeZone = ENV.BUSINESS_TIMEZONE): Date {
    return zonedStartOfDay(addDays(zonedDayOf(now, timeZone), 1), timeZone);
}

/** Emails sent since the start of the business day. */
export async function countSentToday(db: EmailLogDb = prisma, now = new Date()): Promise<number> {
    const since = zonedStartOfDay(zonedDayOf(now, ENV.BUSINESS_TIMEZONE), ENV.BUSINESS_TIMEZONE);
    return db.emailLog.count({ where: { status: 'sent', sentAt: { gte: since } } });
}

interface Attempt {
    id: string;
    attempts: number;
    row: EmailLogRow;
    html: string;
    text: string;
    /** The message is kept, so a failure can be retried later. */
    kept: boolean;
}

/** Sends a claimed row and records the outcome. Never throws. */
async function attemptSend(db: EmailLogDb, attempt: Attempt, readiness: Extract<MailReadiness, { ready: true }>, config: MailConfig): Promise<MailResult> {
    const who = recipientForLog(attempt.row.toEmail, attempt.row.toUsername);
    try {
        const info = await mailTransport.deliver(readiness, config, { to: attempt.row.toEmail, subject: attempt.row.subject, html: attempt.html, text: attempt.text });
        const messageId = info.messageId ? info.messageId.slice(0, MESSAGE_ID_MAX) : null;
        await db.emailLog
            .update({
                where: { id: attempt.id },
                data: { status: 'sent', messageId, sentAt: new Date(), error: null, bodyEnc: null, nextAttemptAt: null, provider: readiness.provider, fromEmail: readiness.fromEmail },
            })
            .catch((err: Error) => logger.warn({ err: err.message, kind: attempt.row.kind, ...who }, 'Email sent but its log row could not be updated'));
        logger.info({ kind: attempt.row.kind, ...who, attempt: attempt.attempts, provider: readiness.provider }, 'Email sent');
        return { status: 'sent', logId: attempt.id, ...(messageId ? { messageId } : {}) };
    } catch (err) {
        const error = errorText(err);
        const retryable = err instanceof MailSendError ? err.retryable : true;
        const nextAttemptAt = attempt.kept && retryable ? nextAttemptAfter(attempt.attempts, new Date()) : null;
        await db.emailLog
            .update({ where: { id: attempt.id }, data: { status: 'failed', error, nextAttemptAt, provider: readiness.provider, fromEmail: readiness.fromEmail } })
            .catch((updateErr: Error) => logger.warn({ err: updateErr.message, kind: attempt.row.kind, ...who }, 'Email log row could not be updated'));
        logger.warn({ kind: attempt.row.kind, ...who, attempt: attempt.attempts, provider: readiness.provider, err: error, retryAt: nextAttemptAt?.toISOString() }, 'Email could not be sent');
        return { status: 'failed', logId: attempt.id, error };
    }
}

function rowOf(input: MailInput, now: Date): EmailLogRow {
    return {
        kind: input.kind,
        templateKey: input.templateKey ?? null,
        toUsername: input.toUsername ?? null,
        toEmail: input.to.trim(),
        subject: input.subject.replace(/\s+/g, ' ').trim().slice(0, SUBJECT_MAX),
        dedupeKey: (input.dedupeKey ?? `${input.kind}:${now.toISOString()}:${randomUUID()}`).slice(0, KEY_MAX),
    };
}

/** Wakes the queue worker (best effort; the one-minute scheduler picks the email up anyway). */
function wakeQueue(): void {
    void tryEnqueue(mailQueue, 'deliver', {}).catch(() => undefined);
}

/**
 * Sends one email now and records it in EmailLog. Never throws for a send that fails or is turned off: the result says
 * what happened (`sent`, `failed` with the error, `skipped` while mail is off, `queued` past the daily limit,
 * `duplicate` when the key was taken). A failed send whose message is kept is retried by the queue with backoff.
 */
export async function sendMail(input: MailInput, db: EmailLogDb = prisma): Promise<MailResult> {
    return dispatch(input, db, 'now');
}

/**
 * Adds one email to the queue: the background worker sends it within a minute (bulk and scheduled emails). Falls back
 * to sending now when the message can't be kept (no encryption key on the server).
 */
export async function queueMail(input: MailInput, db: EmailLogDb = prisma): Promise<MailResult> {
    return dispatch(input, db, 'queue');
}

async function dispatch(input: MailInput, db: EmailLogDb, mode: 'now' | 'queue'): Promise<MailResult> {
    const now = new Date();
    const row = rowOf(input, now);
    const who = recipientForLog(row.toEmail, row.toUsername);
    const config = await getMailConfig();
    const readiness = readinessOf(config);

    if (!readiness.ready) {
        if (!loggedDisabled) {
            loggedDisabled = true;
            logger.warn({ reason: readiness.reason }, 'Outgoing email is turned off: emails are recorded as skipped, not sent');
        }
        const logId = await recordSkipped(db, row, now, readiness.reason);
        logger.debug({ kind: row.kind, ...who }, 'Email skipped: mail is turned off');
        return { status: 'skipped', ...(logId ? { logId } : {}) };
    }

    const bodyEnc = sealBody(row.dedupeKey, input.html, input.text, input.retainBody !== false);
    const kept = bodyEnc !== null;

    if (!input.essential && kept) {
        const sent = await countSentToday(db, now).catch(() => 0);
        if (sent >= config.settings.dailyLimit) {
            const logId = await recordQueued(db, { ...row, bodyEnc }, now, nextBusinessDayStart(now), `Daily send limit (${config.settings.dailyLimit}) reached: waiting for tomorrow.`);
            if (!logId) return { status: 'duplicate' };
            logger.info({ kind: row.kind, ...who }, 'Email queued for tomorrow: daily send limit reached');
            return { status: 'queued', logId };
        }
    }

    if (mode === 'queue' && kept) {
        const logId = await recordQueued(db, { ...row, bodyEnc }, now, now, null);
        if (!logId) return { status: 'duplicate' };
        wakeQueue();
        return { status: 'queued', logId };
    }

    const claim = await claimEmailLog(db, { ...row, bodyEnc }, now);
    if (!claim.claimed) {
        logger.debug({ kind: row.kind, ...who, reason: claim.reason }, 'Email already sent or being sent');
        return { status: 'duplicate' };
    }
    return attemptSend(db, { id: claim.id, attempts: claim.attempts, row, html: input.html, text: input.text, kept }, readiness, config);
}

export interface QueueRunResult {
    sent: number;
    failed: number;
    /** Rows a stopped process left `sending`, marked failed. */
    interrupted: number;
    /** Not sent because mail is off or the daily limit is reached. */
    held: 'mail_off' | 'daily_limit' | null;
}

type QueueRow = { id: string; kind: string; templateKey: string | null; toUsername: string | null; toEmail: string; subject: string; dedupeKey: string; status: string; attempts: number; bodyEnc: string | null };

const QUEUE_SELECT = { id: true, kind: true, templateKey: true, toUsername: true, toEmail: true, subject: true, dedupeKey: true, status: true, attempts: true, bodyEnc: true } as const;

/** Takes a queued / failed row by a conditional update on the status and attempts read. */
async function claimRow(db: EmailLogDb, row: Pick<QueueRow, 'id' | 'status' | 'attempts'>, now: Date): Promise<number | null> {
    const attempts = row.attempts + 1;
    const { count } = await db.emailLog.updateMany({
        where: { id: row.id, status: row.status, attempts: row.attempts },
        data: { status: 'sending', attempts, lastAttemptAt: now, nextAttemptAt: null, error: null },
    });
    return count === 1 ? attempts : null;
}

async function sendQueuedRow(db: EmailLogDb, row: QueueRow, attempts: number, readiness: Extract<MailReadiness, { ready: true }>, config: MailConfig): Promise<MailResult> {
    let body: { html: string; text: string };
    try {
        body = openBody(row.dedupeKey, row.bodyEnc ?? '');
    } catch (err) {
        const error = `The stored message could not be read (${(err as Error).message}). It can't be retried.`.slice(0, ERROR_MAX);
        await db.emailLog.update({ where: { id: row.id }, data: { status: 'failed', error, bodyEnc: null, nextAttemptAt: null } }).catch(() => undefined);
        return { status: 'failed', logId: row.id, error };
    }
    return attemptSend(
        db,
        { id: row.id, attempts, row: { kind: row.kind, templateKey: row.templateKey, toUsername: row.toUsername, toEmail: row.toEmail, subject: row.subject, dedupeKey: row.dedupeKey }, ...body, kept: true },
        readiness,
        config,
    );
}

let draining = false;

/**
 * The queue worker's run (every minute, and when an email is queued): sends queued emails and retries failed ones
 * whose time has come, oldest first, up to the daily limit. One run per process at a time; rows are claimed by
 * conditional updates, so two processes never send the same row.
 */
export async function deliverDueEmails(options: { batch?: number; now?: Date } = {}, db: EmailLogDb = prisma): Promise<QueueRunResult> {
    const result: QueueRunResult = { sent: 0, failed: 0, interrupted: 0, held: null };
    if (draining) return result;
    draining = true;
    try {
        const now = options.now ?? new Date();
        const { count: interrupted } = await db.emailLog.updateMany({
            where: { status: 'sending', lastAttemptAt: { lt: new Date(now.getTime() - STUCK_SENDING_MS) } },
            data: { status: 'failed', nextAttemptAt: null, error: 'Interrupted while sending (the server stopped). Check with the recipient before retrying.' },
        });
        result.interrupted = interrupted;

        const config = await getMailConfig();
        const readiness = readinessOf(config);
        if (!readiness.ready) {
            result.held = 'mail_off';
            return result;
        }
        const room = config.settings.dailyLimit - (await countSentToday(db, now));
        if (room <= 0) {
            result.held = 'daily_limit';
            return result;
        }
        const due = (await db.emailLog.findMany({
            where: { status: { in: ['queued', 'failed'] }, nextAttemptAt: { lte: now }, bodyEnc: { not: null }, attempts: { lt: MAX_SEND_ATTEMPTS } },
            orderBy: { nextAttemptAt: 'asc' },
            take: Math.min(options.batch ?? 25, room),
            select: QUEUE_SELECT,
        })) as QueueRow[];
        for (const row of due) {
            const attempts = await claimRow(db, row, new Date());
            if (attempts === null) continue;
            const sent = await sendQueuedRow(db, row, attempts, readiness, config);
            if (sent.status === 'sent') result.sent++;
            else result.failed++;
        }
        if (result.sent || result.failed || result.interrupted) logger.info(result, 'Email queue run finished');
        return result;
    } finally {
        draining = false;
    }
}

export type RetryOutcome = MailResult & { status: 'sent' | 'failed' | 'skipped' };

/**
 * Admin › Email › Email Queue › Retry: sends a failed, skipped or queued email now (an explicit admin action: past the
 * attempt cap and the daily limit). Throws 'not_retryable' / 'not_kept' / 'busy' as MailRetryError.
 */
export async function retryEmailNow(id: string, db: EmailLogDb = prisma): Promise<RetryOutcome> {
    const row = (await db.emailLog.findUnique({ where: { id }, select: QUEUE_SELECT })) as QueueRow | null;
    if (!row) throw new MailRetryError('not_found');
    if (!['failed', 'skipped', 'queued'].includes(row.status)) throw new MailRetryError('not_retryable');
    if (!row.bodyEnc) throw new MailRetryError('not_kept');
    const config = await getMailConfig();
    const readiness = readinessOf(config);
    if (!readiness.ready) return { status: 'skipped', logId: row.id, error: readiness.reason };
    const attempts = await claimRow(db, row, new Date());
    if (attempts === null) throw new MailRetryError('busy');
    const sent = await sendQueuedRow(db, row, attempts, readiness, config);
    return sent.status === 'sent' ? { ...sent, status: 'sent' } : { ...sent, status: 'failed' };
}

export class MailRetryError extends Error {
    readonly code: 'not_found' | 'not_retryable' | 'not_kept' | 'busy';

    constructor(code: MailRetryError['code']) {
        super(code);
        this.name = 'MailRetryError';
        this.code = code;
    }
}
