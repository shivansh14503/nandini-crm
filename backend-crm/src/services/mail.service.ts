import { randomUUID } from 'node:crypto';
import nodemailer, { type Transporter } from 'nodemailer';
import { ENV } from '../config/env.js';
import { logger } from '../config/logger.js';
import { prisma, type TransactionClient } from '../config/prisma.js';
import { isUniqueViolation } from '../utils/prismaErrors.js';

/**
 * Outgoing email (docs/system-design.md › Email). One lazily created SMTP transport from the MAIL_* / SMTP_*
 * settings: the Google Workspace SMTP relay (smtp-relay.gmail.com:587, STARTTLS, the server allowed by its IP, so no
 * user / password) or a mailbox with an app password (smtp.gmail.com). Every send is recorded in EmailLog and claimed
 * first by its dedupe key, so a retried job or a second worker process never mails twice. While mail is turned off
 * (MAIL_ENABLED false or SMTP_HOST empty) nothing is sent and nothing throws: the send is logged as `skipped`.
 * Logs name the kind, the recipient's username / domain and the outcome, never credentials or message bodies.
 * Reusable by later features (quotation emails): `sendMail({ to, subject, html, text, kind, dedupeKey })`.
 */

export const EMAIL_STATUSES = ['sending', 'sent', 'failed', 'skipped'] as const;
export type EmailStatus = (typeof EMAIL_STATUSES)[number];
/** A failed send is retried by a later run while its attempts are below this. */
export const MAX_SEND_ATTEMPTS = 3;
/** Connection, greeting and socket timeouts: a blocked port fails fast instead of hanging a worker. */
const SMTP_TIMEOUT_MS = 20_000;

const SUBJECT_MAX = 200;
const ERROR_MAX = 500;
const KEY_MAX = 200;
const MESSAGE_ID_MAX = 250;

/** True when outgoing mail is turned on and has a server. */
export const isMailConfigured = (): boolean => ENV.MAIL.ENABLED && Boolean(ENV.MAIL.SMTP_HOST);

export const MAIL_DISABLED_MESSAGE =
    'Email is turned off on the server (MAIL_ENABLED is false or SMTP_HOST is empty), so nothing can be sent yet.';

let transport: Transporter | undefined;

function getTransport(): Transporter {
    transport ??= nodemailer.createTransport({
        host: ENV.MAIL.SMTP_HOST,
        port: ENV.MAIL.SMTP_PORT,
        // false = plain connect then STARTTLS (587); true = TLS from the first byte (465).
        secure: ENV.MAIL.SMTP_SECURE,
        // Google's relay refuses a bare `localhost` greeting.
        ...(ENV.MAIL.SMTP_EHLO_NAME ? { name: ENV.MAIL.SMTP_EHLO_NAME } : {}),
        ...(ENV.MAIL.SMTP_USER ? { auth: { user: ENV.MAIL.SMTP_USER, pass: ENV.MAIL.SMTP_PASS ?? '' } } : {}),
        connectionTimeout: SMTP_TIMEOUT_MS,
        greetingTimeout: SMTP_TIMEOUT_MS,
        socketTimeout: SMTP_TIMEOUT_MS,
    });
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
    /** One send per key (e.g. `morning_summary:2026-11-25:palak`). Leave out for one-off sends (a unique key is used). */
    dedupeKey?: string;
}

export interface MailResult {
    /** `duplicate`: the key was already sent (or is being sent) by another run; nothing was sent now. */
    status: 'sent' | 'failed' | 'skipped' | 'duplicate';
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
}

export type EmailClaim = { claimed: true; id: string; attempts: number } | { claimed: false; reason: string };

/** A send that may run again later: turned off at the time, or failed fewer than MAX_SEND_ATTEMPTS times. */
export const isRetryableEmail = (row: { status: string; attempts: number }): boolean =>
    row.status === 'skipped' || (row.status === 'failed' && row.attempts < MAX_SEND_ATTEMPTS);

/**
 * Claims the right to send `row.dedupeKey`: inserts its EmailLog row as `sending`. When the key exists (P2002), the
 * send is someone else's unless that row is retryable (`failed` with attempts < 3, or `skipped`); then it is taken
 * over by a conditional update on the status and attempts read, so two runs can't both retry it.
 */
export async function claimEmailLog(db: EmailLogDb, row: EmailLogRow, now = new Date()): Promise<EmailClaim> {
    try {
        const created = await db.emailLog.create({ data: { ...row, status: 'sending', attempts: 1, createdAt: now }, select: { id: true } });
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
        data: { status: 'sending', attempts, error: null, toEmail: row.toEmail, toUsername: row.toUsername, subject: row.subject },
    });
    return count === 1 ? { claimed: true, id: existing.id, attempts } : { claimed: false, reason: 'race' };
}

/** Records a send that didn't happen because mail is off (kept retryable for when it is turned on). */
async function recordSkipped(db: EmailLogDb, row: EmailLogRow, now: Date): Promise<string | undefined> {
    try {
        const created = await db.emailLog.create({ data: { ...row, status: 'skipped', attempts: 0, createdAt: now }, select: { id: true } });
        return created.id;
    } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        return undefined;
    }
}

let loggedDisabled = false;

/** The error as stored and returned: the SMTP / connection message, cut to the column width. */
function errorText(err: unknown): string {
    const message = err instanceof Error ? err.message : String(err);
    return (message || 'Unknown error').replace(/\s+/g, ' ').trim().slice(0, ERROR_MAX);
}

/**
 * Sends one email and records it in EmailLog. Never throws for a send that fails or is turned off: the result says
 * what happened (`sent`, `failed` with the error, `skipped` while mail is off, `duplicate` when the key was taken).
 */
export async function sendMail(input: MailInput, db: EmailLogDb = prisma): Promise<MailResult> {
    const now = new Date();
    const row: EmailLogRow = {
        kind: input.kind,
        toUsername: input.toUsername ?? null,
        toEmail: input.to.trim(),
        subject: input.subject.slice(0, SUBJECT_MAX),
        dedupeKey: (input.dedupeKey ?? `${input.kind}:${now.toISOString()}:${randomUUID()}`).slice(0, KEY_MAX),
    };
    const who = recipientForLog(row.toEmail, row.toUsername);

    if (!isMailConfigured()) {
        if (!loggedDisabled) {
            loggedDisabled = true;
            logger.warn('Outgoing email is turned off (MAIL_ENABLED / SMTP_HOST): emails are recorded as skipped, not sent');
        }
        const logId = await recordSkipped(db, row, now);
        logger.debug({ kind: row.kind, ...who }, 'Email skipped: mail is turned off');
        return { status: 'skipped', ...(logId ? { logId } : {}) };
    }

    const claim = await claimEmailLog(db, row, now);
    if (!claim.claimed) {
        logger.debug({ kind: row.kind, ...who, reason: claim.reason }, 'Email already sent or being sent');
        return { status: 'duplicate' };
    }

    try {
        const info = await getTransport().sendMail({ from: ENV.MAIL.FROM, to: row.toEmail, subject: row.subject, html: input.html, text: input.text });
        const messageId = typeof info.messageId === 'string' ? info.messageId.slice(0, MESSAGE_ID_MAX) : null;
        await db.emailLog
            .update({ where: { id: claim.id }, data: { status: 'sent', messageId, sentAt: new Date(), error: null } })
            .catch((err: Error) => logger.warn({ err: err.message, kind: row.kind, ...who }, 'Email sent but its log row could not be updated'));
        logger.info({ kind: row.kind, ...who, attempt: claim.attempts }, 'Email sent');
        return { status: 'sent', logId: claim.id, ...(messageId ? { messageId } : {}) };
    } catch (err) {
        const error = errorText(err);
        await db.emailLog
            .update({ where: { id: claim.id }, data: { status: 'failed', error } })
            .catch((updateErr: Error) => logger.warn({ err: updateErr.message, kind: row.kind, ...who }, 'Email log row could not be updated'));
        logger.warn({ kind: row.kind, ...who, attempt: claim.attempts, err: error }, 'Email could not be sent');
        return { status: 'failed', logId: claim.id, error };
    }
}
