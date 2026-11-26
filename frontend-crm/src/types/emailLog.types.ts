/**
 * Email logging (Calendar Phase 4). Mirrors backend-crm/src/modules/email-log (emailLog.constants.ts,
 * emailLog.settings.ts, emailLog.service.ts DTOs); contractSync.test.ts checks the constants.
 */

export const EMAIL_LOG_MODULES = ['contacts', 'leads', 'opportunities'] as const;
export type EmailLogModule = (typeof EMAIL_LOG_MODULES)[number];

export const MAILBOX_MODES = ['on', 'off'] as const;
export type MailboxMode = (typeof MAILBOX_MODES)[number];

export const EMAIL_VISIBILITIES = ['restricted', 'record'] as const;
export type EmailVisibility = (typeof EMAIL_VISIBILITIES)[number];

export const RETENTION_MONTH_CHOICES = [6, 12, 24, 36] as const;
export type RetentionMonths = (typeof RETENTION_MONTH_CHOICES)[number];

export const NOT_LOGGED_REASONS = ['company_off', 'server_off', 'person_off', 'not_synced', 'user_inactive'] as const;
export type NotLoggedReason = (typeof NOT_LOGGED_REASONS)[number];

/** Module setting that holds the company settings (backend EMAIL_LOGGING_SETTING_KEY, module 'activities'). */
export const EMAIL_LOGGING_SETTING_KEY = 'emailLogging';

export const EMAIL_VISIBILITY_LABELS: Record<EmailVisibility, string> = {
    restricted: "Record owner, managers, admins and the employees on the email",
    record: 'Everyone who can open the record',
};

export const NOT_LOGGED_LABELS: Record<NotLoggedReason, string> = {
    company_off: 'Email logging is off for the company',
    server_off: 'Email logging is switched off on the server',
    person_off: 'Not switched on for this person',
    not_synced: "This person's company calendar isn't synced (email logging uses the same connection)",
    user_inactive: 'The user is inactive',
};

export interface EmailLoggingSettings {
    enabled: boolean;
    defaultForPeople: MailboxMode;
    visibility: EmailVisibility;
    retentionMonths: RetentionMonths;
    storeSnippets: boolean;
}

export interface EmailAddress {
    email: string;
    name?: string;
}

export interface LoggedEmail {
    id: string;
    subject: string;
    from: EmailAddress;
    to: EmailAddress[];
    cc: EmailAddress[];
    moreRecipients: number;
    sentAt: string;
    direction: 'in' | 'out';
    /** Plain text: always rendered as text, never as HTML. */
    snippet: string | null;
    hasAttachments: boolean;
    provider: string;
    participants: { username: string; name: string }[];
    openLink: { provider: string; url: string } | null;
}

export interface RecordEmails {
    enabled: boolean;
    visibility: EmailVisibility;
    seesAll: boolean;
    total: number;
    page: number;
    limit: number;
    items: LoggedEmail[];
}

export interface OwnEmailLogging {
    companyEnabled: boolean;
    logging: boolean;
    reason: NotLoggedReason | null;
    provider: string | null;
    accountEmail: string | null;
    status: 'idle' | 'ok' | 'error' | null;
    lastSuccessAt: string | null;
    storeSnippets: boolean;
    retentionMonths: number;
    visibility: EmailVisibility;
}

export interface EmailLoggingProvider {
    provider: string;
    label: string;
    problem: { code: string; message: string; at: string | null } | null;
    people: number;
    mailboxes: { ok: number; error: number };
}

export interface EmailLoggingOverview {
    settings: EmailLoggingSettings;
    serverEnabled: boolean;
    pollMinutes: number;
    scopes: { google: string; googleAdminConsole: string; microsoft: string };
    providers: EmailLoggingProvider[];
    counts: { people: number; emails: number };
}

export interface PersonEmailLogging {
    username: string;
    fullName: string;
    mode: MailboxMode | null;
    effective: MailboxMode;
    companyDefault: MailboxMode;
    logging: boolean;
    reason: NotLoggedReason | null;
    mailbox: {
        provider: string | null;
        accountEmail: string | null;
        status: string;
        errorLevel: string | null;
        lastErrorCode: string | null;
        lastErrorMessage: string | null;
        lastRunAt: string | null;
        lastSuccessAt: string | null;
        nextRunAt: string | null;
        loggedCount: number;
        purgedAt: string | null;
    } | null;
    copies: number;
}

export type EmailLogRun = { status: 'queued' } | { status: string; logged: number; copies: number };
