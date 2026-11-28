import { z } from 'zod';
import { ENV } from '../../config/env.js';
import { prisma } from '../../config/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { auditService, diffRecords } from '../../services/audit.service.js';
import { countSentToday, EMAIL_STATUSES, MailRetryError, MAX_SEND_ATTEMPTS, retryEmailNow, sendMail } from '../../services/mail.service.js';
import type { AuthUser } from '../../types/user.types.js';
import { HttpError } from '../../utils/httpError.js';
import { inviteService } from '../auth/invite.service.js';
import { checkGmailAccess, MailSendError } from './gmail.sender.js';
import {
    GMAIL_SEND_SCOPE,
    getMailConfig,
    loadMailConfig,
    MAX_DAILY_LIMIT,
    outboundSettingsPatchSchema,
    readinessOf,
    recordOutboundTest,
    saveOutboundSettings,
    SETTINGS_FIELDS,
    type OutboundSettings,
} from './email.settings.js';
import { invalidateTemplateCache, loadTemplateOverride, personVars, renderTemplate } from './email.templateStore.js';
import { EMAIL_TEMPLATES, EMAIL_TEMPLATE_KEYS, isEmailTemplateKey, sampleVars, unknownMergeTags, type EmailTemplateKey, type TemplateContent } from './email.templates.js';

/**
 * Admin › Email (docs/api-plan.md › Admin email): Outbound Email settings and checks, the templates, and the email
 * queue / log. Credentials are never returned: the Google key is shown by its service account email and client ID
 * only, SMTP by its host only.
 */

const SETTINGS_ENTITY = 'outbound-email';

export interface OutboundEmailDto {
    provider: OutboundSettings['provider'];
    enabled: boolean;
    senderEmail: string | null;
    senderName: string | null;
    replyTo: string | null;
    dailyLimit: number;
    maxDailyLimit: number;
    updatedBy: string | null;
    updatedAt: string | null;
    status: {
        ready: boolean;
        /** Why nothing can be sent, when not ready. */
        reason: string | null;
        lastTestAt: string | null;
        lastTestOk: boolean | null;
        lastTestMessage: string | null;
        sentToday: number;
        queued: number;
        failed: number;
    };
    gmail: {
        keyConfigured: boolean;
        serviceAccountEmail: string | null;
        clientId: string | null;
        scope: string;
    };
    smtp: {
        configured: boolean;
        host: string | null;
        port: number;
        from: string;
    };
}

async function toDto(): Promise<OutboundEmailDto> {
    const config = await loadMailConfig();
    const { settings, googleKey } = config;
    const readiness = readinessOf(config);
    const [sentToday, queued, failed] = await Promise.all([
        countSentToday(),
        prisma.emailLog.count({ where: { status: 'queued' } }),
        prisma.emailLog.count({ where: { status: 'failed', createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } }),
    ]);
    return {
        provider: settings.provider,
        enabled: settings.enabled,
        senderEmail: settings.senderEmail,
        senderName: settings.senderName,
        replyTo: settings.replyTo,
        dailyLimit: settings.dailyLimit,
        maxDailyLimit: MAX_DAILY_LIMIT,
        updatedBy: settings.updatedBy,
        updatedAt: settings.updatedAt?.toISOString() ?? null,
        status: {
            ready: readiness.ready,
            reason: readiness.ready ? null : readiness.reason,
            lastTestAt: settings.lastTestAt?.toISOString() ?? null,
            lastTestOk: settings.lastTestOk,
            lastTestMessage: settings.lastTestMessage,
            sentToday,
            queued,
            failed,
        },
        gmail: { keyConfigured: googleKey.configured, serviceAccountEmail: googleKey.clientEmail, clientId: googleKey.clientId, scope: GMAIL_SEND_SCOPE },
        smtp: { configured: ENV.MAIL.ENABLED && Boolean(ENV.MAIL.SMTP_HOST), host: ENV.MAIL.SMTP_HOST ?? null, port: ENV.MAIL.SMTP_PORT, from: ENV.MAIL.FROM },
    };
}

export interface CheckResult {
    ok: boolean;
    message: string;
}

export const testEmailBodySchema = z.object({ to: z.email('Enter a valid email address.').trim().toLowerCase() }).strict();

// ── Templates ─────────────────────────────────────────────────────────────────────────────────────────────────

const requiredShort = (label: string, max: number) =>
    z
        .string({ error: `${label} is required.` })
        .transform((v) => v.replace(/\s+/g, ' ').trim())
        .refine((v) => v.length > 0, { message: `${label} is required.` })
        .refine((v) => v.length <= max, { message: `${label} can be at most ${max} characters.` });
const optionalLong = z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => (typeof v === 'string' && v.trim() ? v.replace(/\r\n?/g, '\n').trim() : null));

/** PUT /templates/:key and POST /templates/:key/preview. Long parts (body, text below the button, footer) have no limit. */
export const templateBodySchema = z
    .object({
        subject: requiredShort('Subject', 200),
        heading: requiredShort('Heading', 200),
        body: z
            .string({ error: 'Message is required.' })
            .transform((v) => v.replace(/\r\n?/g, '\n').trim())
            .refine((v) => v.length > 0, { message: 'Message is required.' }),
        buttonLabel: z
            .union([z.string(), z.null()])
            .optional()
            .transform((v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() || null : null))
            .refine((v) => !v || v.length <= 80, { message: 'Button label can be at most 80 characters.' }),
        afterButton: optionalLong,
        footer: optionalLong,
    })
    .strict();

export type TemplateBody = z.infer<typeof templateBodySchema>;

export interface TemplateDto {
    key: EmailTemplateKey;
    name: string;
    description: string;
    status: 'active' | 'reserved';
    hasLink: boolean;
    mergeFields: { key: string; label: string; sample: string }[];
    content: TemplateContent;
    defaults: TemplateContent;
    customised: boolean;
    updatedBy: string | null;
    updatedAt: string | null;
}

/** Field errors for merge tags a template doesn't offer, and a missing button label on a link template. */
function templateIssues(key: EmailTemplateKey, body: TemplateBody): { message: string; path: string[] }[] {
    const def = EMAIL_TEMPLATES[key];
    const issues: { message: string; path: string[] }[] = [];
    for (const field of ['subject', 'heading', 'body', 'buttonLabel', 'afterButton', 'footer'] as const) {
        const unknown = unknownMergeTags(def, body[field]);
        if (unknown.length) {
            issues.push({
                path: [field],
                message: `${unknown.map((t) => `{{${t}}}`).join(', ')} ${unknown.length === 1 ? 'is not a merge field' : 'are not merge fields'} of this template. Use: ${def.mergeFields.map((f) => `{{${f.key}}}`).join(', ')}.`,
            });
        }
    }
    if (def.hasLink && !body.buttonLabel) issues.push({ path: ['buttonLabel'], message: 'Button label is required: this email carries a link.' });
    return issues;
}

function assertKey(key: string): EmailTemplateKey {
    if (!isEmailTemplateKey(key)) throw HttpError.notFound('Email template not found.');
    return key;
}

async function templateDto(key: EmailTemplateKey): Promise<TemplateDto> {
    const def = EMAIL_TEMPLATES[key];
    const row = await prisma.emailTemplate.findUnique({ where: { key } });
    const content: TemplateContent = row
        ? { subject: row.subject, heading: row.heading, body: row.body, buttonLabel: row.buttonLabel, afterButton: row.afterButton, footer: row.footer }
        : { ...def.defaults };
    return {
        key,
        name: def.name,
        description: def.description,
        status: def.status,
        hasLink: def.hasLink,
        mergeFields: def.mergeFields.map((f) => ({ ...f })),
        content,
        defaults: { ...def.defaults },
        customised: Boolean(row),
        updatedBy: row?.updatedBy ?? null,
        updatedAt: row?.updatedAt.toISOString() ?? null,
    };
}

// ── Queue / log ───────────────────────────────────────────────────────────────────────────────────────────────

export const queueQuerySchema = z.object({
    status: z.enum(EMAIL_STATUSES).optional(),
    kind: z.string().trim().max(40).optional(),
    q: z.string().trim().max(120).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(25),
});

export type QueueQuery = z.infer<typeof queueQuerySchema>;

/** Kinds sent by inviteService: Retry sends a fresh link (the old one was dropped and its message never kept). */
const LINK_KINDS: Readonly<Record<string, 'invite' | 'reset'>> = { user_invite: 'invite', password_reset_link: 'reset' };

export const KIND_LABELS: Readonly<Record<string, string>> = {
    user_invite: 'New user invite',
    password_reset_link: 'Password reset',
    morning_summary: 'Morning email',
    morning_summary_test: 'Morning email (test)',
    outbound_test: 'Test email',
    account_locked: 'Account locked',
};

export interface EmailLogDto {
    id: string;
    kind: string;
    kindLabel: string;
    templateKey: string | null;
    toEmail: string;
    toUsername: string | null;
    fromEmail: string | null;
    subject: string;
    status: string;
    provider: string | null;
    error: string | null;
    attempts: number;
    maxAttempts: number;
    createdAt: string;
    sentAt: string | null;
    lastAttemptAt: string | null;
    nextAttemptAt: string | null;
    /** What Retry does: `send` (the kept message), `resend_link` (a fresh set-password link), or null (nothing to retry). */
    retry: 'send' | 'resend_link' | null;
}

type LogRow = Prisma.EmailLogGetPayload<{ select: typeof LOG_SELECT }>;

const LOG_SELECT = {
    id: true,
    kind: true,
    templateKey: true,
    toEmail: true,
    toUsername: true,
    fromEmail: true,
    subject: true,
    status: true,
    provider: true,
    error: true,
    attempts: true,
    createdAt: true,
    sentAt: true,
    lastAttemptAt: true,
    nextAttemptAt: true,
    bodyEnc: true,
} as const;

/** What Retry can do for a row. Pure. */
export function retryActionOf(row: { status: string; kind: string; bodyEnc: string | null; toUsername: string | null }): EmailLogDto['retry'] {
    if (!['failed', 'skipped', 'queued'].includes(row.status)) return null;
    if (row.bodyEnc) return 'send';
    if (LINK_KINDS[row.kind] && row.toUsername && row.status !== 'queued') return 'resend_link';
    return null;
}

const logDto = (row: LogRow): EmailLogDto => ({
    id: row.id,
    kind: row.kind,
    kindLabel: KIND_LABELS[row.kind] ?? row.kind.replace(/_/g, ' '),
    templateKey: row.templateKey,
    toEmail: row.toEmail,
    toUsername: row.toUsername,
    fromEmail: row.fromEmail,
    subject: row.subject,
    status: row.status,
    provider: row.provider,
    error: row.error,
    attempts: row.attempts,
    maxAttempts: MAX_SEND_ATTEMPTS,
    createdAt: row.createdAt.toISOString(),
    sentAt: row.sentAt?.toISOString() ?? null,
    lastAttemptAt: row.lastAttemptAt?.toISOString() ?? null,
    nextAttemptAt: row.nextAttemptAt?.toISOString() ?? null,
    retry: retryActionOf(row),
});

export const emailAdminService = {
    // ── Outbound Email ──
    getOutbound: (): Promise<OutboundEmailDto> => toDto(),

    async saveOutbound(body: unknown, actor: AuthUser): Promise<OutboundEmailDto> {
        const patch = outboundSettingsPatchSchema.parse(body);
        const { before, after } = await saveOutboundSettings(patch, actor.username);
        const pickFields = (s: OutboundSettings) => Object.fromEntries(SETTINGS_FIELDS.map((f) => [f, s[f]]));
        const changes = diffRecords(pickFields(before), pickFields(after));
        if (Object.keys(changes).length) {
            void auditService.enqueue({ entityType: 'EmailSettings', entityId: SETTINGS_ENTITY, action: 'UPDATE', changedBy: actor.username, changes });
        }
        return toDto();
    },

    /**
     * Check connection: Gmail mints an access token as the sender with gmail.send (proves the key, the delegation and
     * the scope without sending); SMTP opens a connection and logs in (nodemailer `verify`).
     */
    async checkConnection(): Promise<CheckResult & { outbound: OutboundEmailDto }> {
        const config = await loadMailConfig();
        const { settings, googleKey } = config;
        let result: CheckResult;
        if (settings.provider === 'gmail') {
            if (!settings.senderEmail) result = { ok: false, message: 'Enter the sender address first.' };
            else if (!googleKey.configured) result = { ok: false, message: 'Upload the Google Workspace service account key on Admin › API Integrations first.' };
            else {
                try {
                    await checkGmailAccess(settings.senderEmail, { clientId: googleKey.clientId });
                    result = { ok: true, message: `Connected: the service account may send as ${settings.senderEmail}.` };
                } catch (err) {
                    result = { ok: false, message: err instanceof MailSendError ? err.message : 'The check failed. Try again in a minute.' };
                }
            }
        } else if (!ENV.MAIL.ENABLED || !ENV.MAIL.SMTP_HOST) {
            result = { ok: false, message: 'SMTP is turned off on the server (MAIL_ENABLED / SMTP_HOST).' };
        } else {
            try {
                const nodemailer = (await import('nodemailer')).default;
                const { smtpTransportOptions } = await import('../../services/mail.service.js');
                const probe = nodemailer.createTransport(smtpTransportOptions());
                await probe.verify();
                probe.close();
                result = { ok: true, message: `Connected to ${ENV.MAIL.SMTP_HOST}.` };
            } catch (err) {
                result = { ok: false, message: `SMTP check failed: ${(err as Error).message}`.replace(/\s+/g, ' ').slice(0, 300) };
            }
        }
        await recordOutboundTest(result.ok, result.message);
        return { ...result, outbound: await toDto() };
    },

    /** Send test email: a short email to `to` through the mail service (logged as `outbound_test`). */
    async sendTest(body: unknown, actor: AuthUser): Promise<CheckResult & { outbound: OutboundEmailDto }> {
        const { to } = testEmailBodySchema.parse(body);
        const config = await getMailConfig();
        const readiness = readinessOf(config);
        if (!readiness.ready) throw HttpError.badRequest(readiness.reason);
        const sender = await prisma.user.findUnique({ where: { id: actor.id }, select: { fullName: true } }).catch(() => null);
        const when = new Intl.DateTimeFormat('en-GB', { timeZone: ENV.BUSINESS_TIMEZONE, dateStyle: 'medium', timeStyle: 'short' }).format(new Date());
        const result = await sendMail({
            to,
            toUsername: null,
            subject: 'Test email from Nandini CRM',
            html: [
                '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"></head>',
                '<body style="margin:0;padding:24px;background-color:#EEF2F7;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;">',
                '<div style="max-width:560px;margin:0 auto;background-color:#FFFFFF;border:1px solid #E2E8F0;border-radius:12px;padding:24px;">',
                '<h1 style="margin:0 0 12px 0;font-size:20px;line-height:28px;color:#0F172A;">Outgoing email works</h1>',
                `<p style="margin:0 0 12px 0;font-size:15px;line-height:23px;color:#475569;">This test was sent from Admin › Email › Outbound Email by ${escape(sender?.fullName?.trim() || actor.username)} on ${escape(when)}.</p>`,
                `<p style="margin:0;font-size:13px;line-height:19px;color:#64748B;">Sent with ${readiness.provider === 'gmail' ? 'the Gmail API' : 'SMTP'} as ${escape(readiness.fromEmail)}.</p>`,
                '</div></body></html>',
            ].join(''),
            text: `Outgoing email works.\n\nThis test was sent from Admin › Email › Outbound Email by ${sender?.fullName?.trim() || actor.username} on ${when}.\nSent with ${readiness.provider === 'gmail' ? 'the Gmail API' : 'SMTP'} as ${readiness.fromEmail}.`,
            kind: 'outbound_test',
            essential: true,
            retainBody: false,
        });
        const outcome: CheckResult =
            result.status === 'sent'
                ? { ok: true, message: `Test email sent to ${to}.` }
                : { ok: false, message: result.status === 'failed' ? `The test email could not be sent: ${result.error ?? 'unknown error'}` : 'The test email was not sent.' };
        await recordOutboundTest(outcome.ok, outcome.message);
        return { ...outcome, outbound: await toDto() };
    },

    // ── Templates ──
    async listTemplates(): Promise<TemplateDto[]> {
        return Promise.all(EMAIL_TEMPLATE_KEYS.map((key) => templateDto(key)));
    },

    getTemplate: (key: string): Promise<TemplateDto> => templateDto(assertKey(key)),

    async saveTemplate(rawKey: string, body: unknown, actor: AuthUser): Promise<TemplateDto> {
        const key = assertKey(rawKey);
        const data = templateBodySchema.parse(body);
        const issues = templateIssues(key, data);
        if (issues.length) throw HttpError.badRequest(issues[0].message, issues);
        const before = await templateDto(key);
        await prisma.emailTemplate.upsert({ where: { key }, create: { key, ...data, updatedBy: actor.username }, update: { ...data, updatedBy: actor.username } });
        invalidateTemplateCache();
        const changes = diffRecords(before.content, data);
        if (Object.keys(changes).length) {
            void auditService.enqueue({ entityType: 'EmailTemplate', entityId: key, action: 'UPDATE', changedBy: actor.username, changes: { name: EMAIL_TEMPLATES[key].name, ...changes } });
        }
        return templateDto(key);
    },

    async resetTemplate(rawKey: string, actor: AuthUser): Promise<TemplateDto> {
        const key = assertKey(rawKey);
        const { count } = await prisma.emailTemplate.deleteMany({ where: { key } });
        invalidateTemplateCache();
        if (count) void auditService.enqueue({ entityType: 'EmailTemplate', entityId: key, action: 'DELETE', changedBy: actor.username, changes: { name: EMAIL_TEMPLATES[key].name, resetToDefault: true } });
        return templateDto(key);
    },

    /** The email as it would look with sample values (unsaved wording, or the saved one when no body is sent). */
    async previewTemplate(rawKey: string, body: unknown): Promise<{ subject: string; html: string; text: string }> {
        const key = assertKey(rawKey);
        const def = EMAIL_TEMPLATES[key];
        const content = body && typeof body === 'object' && Object.keys(body).length ? templateBodySchema.parse(body) : ((await loadTemplateOverride(key)) ?? def.defaults);
        return renderTemplate(key, sampleVars(def), content);
    },

    /** Sends the template, with sample values, to the admin's own address (essential: not held by the daily limit). */
    async sendTemplateTest(rawKey: string, actor: AuthUser): Promise<CheckResult> {
        const key = assertKey(rawKey);
        const me = await prisma.user.findUnique({ where: { id: actor.id }, select: { email: true, firstName: true, fullName: true, username: true } });
        const to = me?.email?.trim();
        if (!to) throw HttpError.badRequest('Your user has no email address to send the test to.');
        const email = await renderTemplate(key, { ...sampleVars(EMAIL_TEMPLATES[key]), ...personVars(me ?? {}) });
        const result = await sendMail({
            to,
            toUsername: actor.username,
            subject: `[Test] ${email.subject}`,
            html: email.html,
            text: email.text,
            kind: 'template_test',
            templateKey: key,
            essential: true,
            retainBody: false,
        });
        if (result.status === 'sent') return { ok: true, message: `Test email sent to ${to}.` };
        if (result.status === 'skipped') return { ok: false, message: 'Outgoing email is not set up yet (Outbound Email).' };
        return { ok: false, message: `The test email could not be sent: ${result.error ?? 'unknown error'}` };
    },

    // ── Queue / log ──
    async listQueue(rawQuery: unknown) {
        const query = queueQuerySchema.parse(rawQuery ?? {});
        const where: Prisma.EmailLogWhereInput = {
            ...(query.status ? { status: query.status } : {}),
            ...(query.kind ? { kind: query.kind } : {}),
            ...(query.q ? { OR: [{ toEmail: { contains: query.q } }, { toUsername: { contains: query.q } }, { subject: { contains: query.q } }] } : {}),
        };
        const [rows, total, grouped, sentToday] = await Promise.all([
            prisma.emailLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.limit, take: query.limit, select: LOG_SELECT }),
            prisma.emailLog.count({ where }),
            prisma.emailLog.groupBy({ by: ['status'], _count: { _all: true } }),
            countSentToday(),
        ]);
        const counts = Object.fromEntries(EMAIL_STATUSES.map((s) => [s, 0])) as Record<(typeof EMAIL_STATUSES)[number], number>;
        for (const g of grouped) if (g.status in counts) counts[g.status as keyof typeof counts] = g._count._all;
        const config = await getMailConfig();
        return {
            data: rows.map(logDto),
            total,
            page: query.page,
            limit: query.limit,
            summary: { counts, sentToday, dailyLimit: config.settings.dailyLimit, kinds: Object.entries(KIND_LABELS).map(([value, label]) => ({ value, label })) },
        };
    },

    /** Retry: sends the kept message now, or (set-password emails) sends the user a fresh link. */
    async retry(id: string, actor: AuthUser): Promise<{ ok: boolean; message: string; email: EmailLogDto | null }> {
        const row = await prisma.emailLog.findUnique({ where: { id }, select: LOG_SELECT });
        if (!row) throw HttpError.notFound('Email not found.');
        const action = retryActionOf(row);
        if (action === 'resend_link') {
            const user = await prisma.user.findUnique({
                where: { username: row.toUsername! },
                select: { id: true, username: true, email: true, firstName: true, fullName: true, isActive: true },
            });
            if (!user || !user.isActive || !user.email) throw HttpError.conflict('This user is no longer active or has no email address, so no new link can be sent.');
            const outcome = await inviteService.send(actor, { id: user.id, username: user.username, email: user.email, firstName: user.firstName, fullName: user.fullName }, LINK_KINDS[row.kind]);
            await prisma.emailLog.update({ where: { id }, data: { nextAttemptAt: null, error: `${row.error ?? ''} (a new link was sent from the Email Queue)`.trim().slice(0, 500) } }).catch(() => undefined);
            return outcome.status === 'sent'
                ? { ok: true, message: `A new link was sent to ${outcome.sentTo}.`, email: null }
                : { ok: false, message: outcome.error, email: null };
        }
        if (action !== 'send') throw HttpError.conflict('This email can’t be retried: it was sent, or its message was not kept.');
        try {
            const result = await retryEmailNow(id);
            const updated = await prisma.emailLog.findUnique({ where: { id }, select: LOG_SELECT });
            const email = updated ? logDto(updated) : null;
            if (result.status === 'sent') return { ok: true, message: `Sent to ${row.toEmail}.`, email };
            return { ok: false, message: result.error ?? 'The email could not be sent.', email };
        } catch (err) {
            if (err instanceof MailRetryError) {
                if (err.code === 'busy') throw HttpError.conflict('This email is being sent right now. Refresh in a moment.');
                if (err.code === 'not_found') throw HttpError.notFound('Email not found.');
                throw HttpError.conflict('This email can’t be retried: it was sent, or its message was not kept.');
            }
            throw err;
        }
    },
};

const escape = (value: string) => value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
