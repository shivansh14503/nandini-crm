import { StatusCodes } from 'http-status-codes';
import { ENV } from '../../config/env.js';
import { prisma } from '../../config/prisma.js';
import { auditService } from '../../services/audit.service.js';
import type { AuthUser } from '../../types/user.types.js';
import { HttpError } from '../../utils/httpError.js';
import { formConfigService } from '../form-configs/formConfig.service.js';
import { assertRecordAccess, hasGlobalAccess } from '../shared/accessControl.js';
import { runInTransaction } from '../shared/transactions.js';
import {
    GMAIL_SCOPE,
    GMAIL_SCOPES_FOR_ADMIN_CONSOLE,
    MAILBOX_AUDIT_ENTITY,
    MICROSOFT_MAIL_PERMISSION,
    MAIL_ERROR_MESSAGES,
    RETENTION_MAX_BATCHES,
    type EmailLogModule,
    type EmailVisibility,
    type MailErrorCode,
    type MailboxMode,
    type NotLoggedReason,
} from './emailLog.constants.js';
import { loadEmailLogContext, mailProviderUsable, MAIL_PROVIDER_LABELS, requestEmailLogRun, type EmailLogContext, type IngestResult } from './emailLog.ingest.js';
import { beginPurge, clearSnippets, endPurge, purgeMailboxCopies } from './emailLog.maintenance.js';
import { EMAIL_LOGGING_SETTING_KEY, effectiveMode, emailLoggingSettingsPatchSchema, emailLoggingSettingsSchema, stampSettings, type EmailLoggingSettings } from './emailLog.settings.js';
import { prismaEmailLogStore, type MailTarget } from './emailLog.store.js';
import { personModeBodySchema, recordEmailsQuerySchema } from './emailLog.validator.js';
import { getMailAdapter, isMailProvider } from './providers/registry.js';
import type { MailAddress, MailProviderKey } from './providers/types.js';
import { isFakeProviderEnabled } from '../calendar-sync/providers/registry.js';

/**
 * Email logging: the record lists, the employee's own status and the admin side (design note EL9–EL14;
 * docs/api-plan.md › Email logging). Routes: emailLog.routes.ts (/api/email-logs) and emailLogAdmin.routes.ts
 * (/api/admin/email-logging).
 */

// ── Visibility (pure) ─────────────────────────────────────────────────────────────────────────────────────────

const sameUser = (a: string | null | undefined, b: string) => typeof a === 'string' && a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Whether `user` sees every email logged on a record they can open (else only the ones they took part in): always
 * with `visibility = record`; with `restricted` the record's owner and global-access roles (managers, admins). Pure.
 */
export function seesAllRecordEmails(user: AuthUser, module: EmailLogModule, record: { assignedTo?: string | null }, visibility: EmailVisibility): boolean {
    if (visibility === 'record') return true;
    return hasGlobalAccess(user, module, 'view') || sameUser(record.assignedTo, user.username);
}

// ── DTOs ──────────────────────────────────────────────────────────────────────────────────────────────────────

export interface LoggedEmailDto {
    id: string;
    subject: string;
    from: MailAddress;
    to: MailAddress[];
    cc: MailAddress[];
    moreRecipients: number;
    sentAt: string;
    direction: 'in' | 'out';
    snippet: string | null;
    hasAttachments: boolean;
    provider: string;
    /**
     * Employees whose mailboxes hold it and who are the sender or in To / Cc. A copy received as Bcc or through a list
     * is listed only to its own employee (never reveals a Bcc to other viewers).
     */
    participants: { username: string; name: string }[];
    /** "Open in Gmail / Outlook": only the caller's own copy. */
    openLink: { provider: string; url: string } | null;
}

export interface RecordEmailsDto {
    enabled: boolean;
    visibility: EmailVisibility;
    /** False when the caller sees only the emails they took part in (restricted visibility). */
    seesAll: boolean;
    total: number;
    page: number;
    limit: number;
    items: LoggedEmailDto[];
}

const parseRecipients = (json: string): MailAddress[] => {
    try {
        const value = JSON.parse(json) as unknown;
        return Array.isArray(value)
            ? value.filter((v): v is MailAddress => Boolean(v) && typeof (v as MailAddress).email === 'string').map((v) => (v.name ? { email: v.email, name: String(v.name) } : { email: v.email }))
            : [];
    } catch {
        return [];
    }
};

async function namesOf(usernames: readonly string[]): Promise<Map<string, string>> {
    if (usernames.length === 0) return new Map();
    const rows = await prisma.user.findMany({ where: { username: { in: [...new Set(usernames)] } }, select: { username: true, fullName: true } });
    return new Map(rows.map((r) => [r.username.toLowerCase(), (r.fullName || '').trim() || r.username]));
}

async function recordOf(module: EmailLogModule, id: string): Promise<{ assignedTo: string; createdBy: string; isDeleted: boolean } | null> {
    const select = { assignedTo: true, createdBy: true, isDeleted: true } as const;
    if (module === 'contacts') return prisma.contact.findUnique({ where: { id }, select });
    if (module === 'leads') return prisma.lead.findUnique({ where: { id }, select });
    return prisma.opportunity.findUnique({ where: { id }, select });
}

// ── Own status / reasons ──────────────────────────────────────────────────────────────────────────────────────

export interface OwnEmailLoggingDto {
    companyEnabled: boolean;
    logging: boolean;
    reason: NotLoggedReason | null;
    provider: string | null;
    accountEmail: string | null;
    /** idle | ok | error (no admin text: the employee can't fix anything). */
    status: string | null;
    lastSuccessAt: string | null;
    storeSnippets: boolean;
    retentionMonths: number;
    visibility: EmailVisibility;
}

/** Why a person's mail isn't logged (null = it is). */
export async function notLoggedReason(target: MailTarget, context: EmailLogContext): Promise<NotLoggedReason | null> {
    if (!ENV.INTEGRATIONS.EMAIL_LOG_ENABLED) return 'server_off';
    if (!context.settings.enabled) return 'company_off';
    if (!target.userActive) return 'user_inactive';
    if (effectiveMode(target.mailbox?.mode, context.settings) !== 'on') return 'person_off';
    const provider = target.connection?.provider;
    if (!target.connection || !isMailProvider(provider) || !(await mailProviderUsable(provider))) return 'not_synced';
    return null;
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const conflict = (message: string, code: string) => new HttpError(message, StatusCodes.CONFLICT, { code });

export const emailLogService = {
    /** GET /api/email-logs: the emails logged on one record (see the routes header). */
    async listForRecord(query: unknown, user: AuthUser): Promise<RecordEmailsDto> {
        const { module, recordId, page, limit } = recordEmailsQuerySchema.parse(query ?? {});
        const record = await recordOf(module, recordId);
        if (!record || record.isDeleted) throw HttpError.notFound('Record not found.');
        assertRecordAccess(user, record, module, 'view');
        const { settings } = await loadEmailLogContext();
        const seesAll = seesAllRecordEmails(user, module, record, settings.visibility);
        const empty: RecordEmailsDto = { enabled: false, visibility: settings.visibility, seesAll, total: 0, page, limit, items: [] };
        // Off means off: nothing is shown while the company switch is off (rows age out or are purged).
        if (!settings.enabled) return empty;

        const where = { module, recordId, ...(seesAll ? {} : { email: { copies: { some: { username: user.username } } } }) };
        const [total, links] = await Promise.all([
            prisma.loggedEmailLink.count({ where }),
            prisma.loggedEmailLink.findMany({
                where,
                orderBy: [{ sentAt: 'desc' }, { id: 'asc' }],
                skip: (page - 1) * limit,
                take: limit,
                select: {
                    email: {
                        select: {
                            id: true,
                            subject: true,
                            fromEmail: true,
                            fromName: true,
                            toJson: true,
                            ccJson: true,
                            moreRecipients: true,
                            sentAt: true,
                            direction: true,
                            snippet: true,
                            hasAttachments: true,
                            provider: true,
                            copies: { select: { username: true, provider: true, providerMessageId: true, webLink: true, addressed: true }, take: 20 },
                        },
                    },
                },
            }),
        ]);
        // Bcc / list copies are shown only to their own employee.
        const shown = (c: { username: string; addressed: boolean }) => c.addressed || sameUser(c.username, user.username);
        const names = await namesOf(links.flatMap((l) => l.email.copies.filter(shown).map((c) => c.username)));
        const ownMailbox = await prisma.loggedEmailMailbox.findUnique({ where: { username: user.username }, select: { accountEmail: true } });
        const items = links.map(({ email }): LoggedEmailDto => {
            const own = email.copies.find((c) => sameUser(c.username, user.username));
            const url = own && isMailProvider(own.provider) ? getMailAdapter(own.provider).webLinkOf(ownMailbox?.accountEmail ?? '', own) : null;
            return {
                id: email.id,
                subject: email.subject,
                from: email.fromName ? { email: email.fromEmail, name: email.fromName } : { email: email.fromEmail },
                to: parseRecipients(email.toJson),
                cc: parseRecipients(email.ccJson),
                moreRecipients: email.moreRecipients,
                sentAt: email.sentAt.toISOString(),
                direction: email.direction === 'out' ? 'out' : 'in',
                // Snippets switched off: none is shown, even one kept from before (the nightly clears them).
                snippet: settings.storeSnippets ? email.snippet : null,
                hasAttachments: email.hasAttachments,
                provider: email.provider,
                participants: email.copies.filter(shown).map((c) => ({ username: c.username, name: names.get(c.username.toLowerCase()) ?? c.username })),
                openLink: own && url ? { provider: own.provider, url } : null,
            };
        });
        return { enabled: true, visibility: settings.visibility, seesAll, total, page, limit, items };
    },

    /** GET /api/email-logs/me: whether the signed-in employee's mail is logged (read-only; admins decide). */
    async ownStatus(user: AuthUser): Promise<OwnEmailLoggingDto> {
        const [context, target] = await Promise.all([loadEmailLogContext(), prismaEmailLogStore.loadTarget(user.username)]);
        const reason = await notLoggedReason(target, context);
        return {
            companyEnabled: context.settings.enabled,
            logging: reason === null,
            reason,
            provider: target.connection?.provider ?? null,
            accountEmail: target.connection?.accountEmail ?? null,
            status: reason === null ? (target.mailbox?.status ?? 'idle') : null,
            lastSuccessAt: reason === null ? iso(target.mailbox?.lastSuccessAt) : null,
            storeSnippets: context.settings.storeSnippets,
            retentionMonths: context.settings.retentionMonths,
            visibility: context.settings.visibility,
        };
    },

    // ── Admin ─────────────────────────────────────────────────────────────────────────────────────────────────

    async settings(): Promise<EmailLoggingSettings> {
        return (await loadEmailLogContext()).settings;
    },

    /**
     * PUT /api/admin/email-logging/settings. Stamps when the switch / the default for people turns on (nothing from
     * before is logged); turning either off clears the affected cursors (switching on again starts from a fresh
     * baseline, not from where the off period began); turning snippets off clears the stored ones (bounded here, the
     * nightly finishes a large backlog). Each step is its own short statement, outside a transaction.
     */
    async saveSettings(patch: unknown, admin: AuthUser): Promise<EmailLoggingSettings> {
        const changes = emailLoggingSettingsPatchSchema.parse(patch);
        const before = (await loadEmailLogContext()).settings;
        const merged = stampSettings(before, emailLoggingSettingsSchema.parse({ ...before, ...changes }), new Date());
        await formConfigService.updateModuleSetting('activities', EMAIL_LOGGING_SETTING_KEY, { value: merged }, admin);
        if (before.enabled && !merged.enabled) {
            await prisma.loggedEmailMailbox.updateMany({ where: { cursorJson: { not: null } }, data: { cursorJson: null } });
        } else if (before.defaultForPeople === 'on' && merged.defaultForPeople !== 'on') {
            await prisma.loggedEmailMailbox.updateMany({ where: { mode: null, cursorJson: { not: null } }, data: { cursorJson: null } });
        }
        if (before.storeSnippets && !merged.storeSnippets) await clearSnippets(RETENTION_MAX_BATCHES);
        return merged;
    },

    /** GET /api/admin/email-logging: settings, scopes to add, each provider's mail health, counts. */
    async overview() {
        const context = await loadEmailLogContext();
        const [mailboxes, emails, liveConnections] = await Promise.all([
            prisma.loggedEmailMailbox.findMany({ select: { username: true, mode: true, provider: true, status: true, errorLevel: true, lastErrorCode: true, lastErrorAt: true, lastSuccessAt: true } }),
            prisma.loggedEmail.count(),
            prisma.calendarConnection.findMany({ where: { status: 'ok' }, select: { username: true, provider: true } }),
        ]);
        const byUser = new Map(mailboxes.map((m) => [m.username.toLowerCase(), m]));
        const loggedPeople = liveConnections.filter((c) => isMailProvider(c.provider) && effectiveMode(byUser.get(c.username.toLowerCase())?.mode, context.settings) === 'on');
        const providers = (['google', 'microsoft', ...(isFakeProviderEnabled() ? ['fake'] : [])] as MailProviderKey[]).map((provider) => {
            const rows = mailboxes.filter((m) => m.provider === provider);
            const lastSuccess = Math.max(0, ...rows.map((r) => r.lastSuccessAt?.getTime() ?? 0));
            const appErrors = rows.filter((r) => r.status === 'error' && r.errorLevel === 'app' && (r.lastErrorAt?.getTime() ?? 0) > lastSuccess);
            appErrors.sort((a, b) => (b.lastErrorAt?.getTime() ?? 0) - (a.lastErrorAt?.getTime() ?? 0));
            const latest = appErrors[0];
            const code = latest?.lastErrorCode as MailErrorCode | undefined;
            return {
                provider,
                label: MAIL_PROVIDER_LABELS[provider],
                problem: latest && code ? { code, message: MAIL_ERROR_MESSAGES[code] ?? MAIL_ERROR_MESSAGES.provider_error, at: iso(latest.lastErrorAt) } : null,
                people: loggedPeople.filter((c) => c.provider === provider).length,
                mailboxes: { ok: rows.filter((r) => r.status === 'ok').length, error: rows.filter((r) => r.status === 'error').length },
            };
        });
        return {
            settings: context.settings,
            serverEnabled: ENV.INTEGRATIONS.EMAIL_LOG_ENABLED,
            pollMinutes: ENV.INTEGRATIONS.EMAIL_LOG_POLL_MINUTES,
            scopes: { google: GMAIL_SCOPE, googleAdminConsole: GMAIL_SCOPES_FOR_ADMIN_CONSOLE, microsoft: MICROSOFT_MAIL_PERMISSION },
            providers,
            counts: { people: loggedPeople.length, emails },
        };
    },

    /** GET /api/admin/email-logging/people/:username */
    async person(username: string) {
        const user = await prisma.user.findUnique({ where: { username }, select: { username: true, fullName: true } });
        const [context, target, copies] = await Promise.all([loadEmailLogContext(), prismaEmailLogStore.loadTarget(user?.username ?? username), prisma.loggedEmailCopy.count({ where: { username: user?.username ?? username } })]);
        if (!user && !target.mailbox && copies === 0) throw HttpError.notFound(`User '${username}' not found.`);
        const full = target.mailbox ? await prisma.loggedEmailMailbox.findUnique({ where: { username: target.mailbox.username } }) : null;
        const reason = await notLoggedReason(target, context);
        return {
            username: user?.username ?? username,
            fullName: user ? (user.fullName || '').trim() || user.username : username,
            mode: (full?.mode as MailboxMode | null) ?? null,
            effective: effectiveMode(full?.mode, context.settings),
            companyDefault: context.settings.defaultForPeople,
            logging: reason === null,
            reason,
            mailbox: full
                ? {
                      provider: full.provider,
                      accountEmail: full.accountEmail,
                      status: full.status,
                      errorLevel: full.errorLevel,
                      lastErrorCode: full.lastErrorCode,
                      lastErrorMessage: full.lastErrorMessage,
                      lastRunAt: iso(full.lastRunAt),
                      lastSuccessAt: iso(full.lastSuccessAt),
                      nextRunAt: iso(full.nextRunAt),
                      loggedCount: full.loggedCount,
                      purgedAt: iso(full.purgedAt),
                  }
                : null,
            copies,
        };
    },

    /**
     * PUT /api/admin/email-logging/people/:username { mode } (audited LoggedEmailMailbox CREATE / UPDATE). When the
     * person's effective switch turns on, `loggingSince` = now (nothing from before is logged) and the mailbox is due at
     * once; when it turns off, the cursor is cleared (switching on later starts from a fresh baseline).
     */
    async setPersonMode(username: string, body: unknown, admin: AuthUser) {
        const { mode } = personModeBodySchema.parse(body);
        const user = await prisma.user.findUnique({ where: { username }, select: { username: true } });
        if (!user) throw HttpError.notFound(`User '${username}' not found.`);
        const owner = user.username;
        const { settings } = await loadEmailLogContext();
        await runInTransaction(async (tx) => {
            const before = await tx.loggedEmailMailbox.findUnique({ where: { username: owner }, select: { mode: true } });
            const from = before?.mode ?? null;
            if (from === mode) return;
            const now = new Date();
            const wasOn = effectiveMode(from, settings) === 'on';
            const isOn = effectiveMode(mode, settings) === 'on';
            const data = {
                mode,
                modeUpdatedBy: admin.username,
                modeUpdatedAt: now,
                ...(isOn && !wasOn ? { loggingSince: now, nextRunAt: null } : {}),
                ...(!isOn && wasOn ? { cursorJson: null } : {}),
            };
            await tx.loggedEmailMailbox.upsert({ where: { username: owner }, create: { username: owner, ...data }, update: data });
            await auditService.record(tx, {
                entityType: MAILBOX_AUDIT_ENTITY,
                entityId: owner,
                action: before ? 'UPDATE' : 'CREATE',
                changedBy: admin.username,
                changes: { username: owner, mode: { from, to: mode } },
            });
        });
        return emailLogService.person(owner);
    },

    /** POST /api/admin/email-logging/people/:username/run: "Log now". 409 EMAIL_LOGGING_OFF while not logged. */
    async runPerson(username: string): Promise<{ run: { status: 'queued' } | Pick<IngestResult, 'status' | 'logged' | 'copies'> }> {
        const [context, target] = await Promise.all([loadEmailLogContext(), prismaEmailLogStore.loadTarget(username)]);
        const reason = await notLoggedReason(target, context);
        if (reason) throw conflict("This person's email isn't being logged, so there is nothing to run.", 'EMAIL_LOGGING_OFF');
        const run = await requestEmailLogRun(username);
        return { run: 'logged' in run ? { status: run.status, logged: run.logged, copies: run.copies } : run };
    },

    /**
     * DELETE /api/admin/email-logging/people/:username/emails: takes the person's mailbox lease and stamps `purgedAt`
     * (clearing the cursor), deletes this person's copies and every email left without one (bounded batches, outside a
     * transaction), frees the lease, then audits `LoggedEmailMailbox PURGE`. A run that was working removes what it
     * stored; mail from before the purge is never logged again for this person.
     */
    async purgePerson(username: string, admin: AuthUser): Promise<{ copies: number; emails: number }> {
        const user = await prisma.user.findUnique({ where: { username }, select: { username: true } });
        const owner = user?.username ?? username;
        const leaseId = await beginPurge(owner, admin.username, new Date());
        let result: { copies: number; emails: number };
        try {
            result = await purgeMailboxCopies(owner);
        } finally {
            await endPurge(owner, leaseId);
        }
        await runInTransaction(async (tx) => {
            await auditService.record(tx, {
                entityType: MAILBOX_AUDIT_ENTITY,
                entityId: owner,
                action: 'PURGE',
                changedBy: admin.username,
                changes: { username: owner, copies: result.copies, emails: result.emails },
            });
        });
        return result;
    },
};
