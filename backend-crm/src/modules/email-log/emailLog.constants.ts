/**
 * Fixed vocabulary and limits of email logging (Calendar Phase 4; design note p4-email-design.md, docs/system-design.md
 * §5.6). Pure. Mirrored by frontend-crm/src/types/emailLog.types.ts (contractSync.test.ts checks).
 */

const GOOGLE_API = 'https://www.googleapis.com/auth/';

/**
 * The one Gmail scope a mail token is minted with (OWNER STEP: added to the CRM's domain-wide delegation entry next to
 * the two calendar scopes). `gmail.readonly` rather than `gmail.metadata`: the snippet and the `q` filter of the bounded
 * resync need it. The CRM only ever asks for `format=metadata` (headers, labels, snippet): never a body or attachment.
 * Calendar tokens never include it, so a missing Gmail scope can't break calendar sync.
 */
export const GMAIL_SCOPE = `${GOOGLE_API}gmail.readonly`;
/** What the admin pastes into the Admin console entry once email logging is wanted (calendar scopes + Gmail). */
export const GMAIL_SCOPES_FOR_ADMIN_CONSOLE = [`${GOOGLE_API}calendar.events.owned`, `${GOOGLE_API}calendar.events.freebusy`, GMAIL_SCOPE].join(',');
/** The Graph application permission (or Exchange RBAC for Applications role `Application Mail.Read`) email logging needs. */
export const MICROSOFT_MAIL_PERMISSION = 'Mail.Read';

/** Records a logged email can show on (CRM module keys). */
export const EMAIL_LOG_MODULES = ['contacts', 'leads', 'opportunities'] as const;
export type EmailLogModule = (typeof EMAIL_LOG_MODULES)[number];

/** `LoggedEmail.direction` / `LoggedEmailCopy.direction`. */
export const EMAIL_DIRECTIONS = ['in', 'out'] as const;
export type EmailDirection = (typeof EMAIL_DIRECTIONS)[number];

/** `LoggedEmailMailbox.mode`: the admin's per-person switch (null = the company default). */
export const MAILBOX_MODES = ['on', 'off'] as const;
export type MailboxMode = (typeof MAILBOX_MODES)[number];

/** `LoggedEmailMailbox.status`. */
export const MAILBOX_STATUSES = ['idle', 'ok', 'error'] as const;
export type MailboxStatus = (typeof MAILBOX_STATUSES)[number];

/** Company setting `visibility`: who sees an email logged on a record (beyond the record's own access rule). */
export const EMAIL_VISIBILITIES = ['restricted', 'record'] as const;
export type EmailVisibility = (typeof EMAIL_VISIBILITIES)[number];

/** Company setting `retentionMonths`. */
export const RETENTION_MONTH_CHOICES = [6, 12, 24, 36] as const;
export type RetentionMonths = (typeof RETENTION_MONTH_CHOICES)[number];

/** Why a person's mail isn't logged (own status, People dialog). */
export const NOT_LOGGED_REASONS = ['company_off', 'server_off', 'person_off', 'not_synced', 'user_inactive'] as const;
export type NotLoggedReason = (typeof NOT_LOGGED_REASONS)[number];

/** User-level problems (one person's mailbox). */
export const MAIL_USER_ERROR_CODES = ['user_not_found', 'user_unavailable', 'mail_unavailable', 'mailbox_out_of_scope', 'no_mailbox'] as const;
/** App-level problems (the whole provider's mail access). */
export const MAIL_APP_ERROR_CODES = [
    'mail_scope_missing',
    'mail_permission_missing',
    'delegation_wrong_id',
    'admin_policy',
    'key_invalid',
    'clock_skew',
    'invalid_client',
    'secret_expired',
    'app_not_in_tenant',
    'tenant_not_found',
    'not_configured',
    'provider_error',
] as const;
export type MailUserErrorCode = (typeof MAIL_USER_ERROR_CODES)[number];
export type MailAppErrorCode = (typeof MAIL_APP_ERROR_CODES)[number];
export type MailErrorCode = MailUserErrorCode | MailAppErrorCode;

/** The sentence an admin sees for each code (People dialog, Email logging card, notification). */
export const MAIL_ERROR_MESSAGES: Readonly<Record<MailErrorCode, string>> = {
    user_not_found: 'Google has no account for this email.',
    user_unavailable: 'Google refused this person (suspended or not in the Workspace).',
    mail_unavailable: 'This person has no Gmail (Gmail may be off for their organisational unit).',
    mailbox_out_of_scope: "The Microsoft app can't read this mailbox. Add the person to the app's Mail.Read scope (RBAC for Applications).",
    no_mailbox: 'No Exchange Online mailbox for this email (no licence, or on-premises).',
    mail_scope_missing:
        'The Gmail scope is missing from domain-wide delegation. Add https://www.googleapis.com/auth/gmail.readonly to the CRM client ID in the Admin console (it can take up to 24 h).',
    mail_permission_missing: 'The Microsoft app has no mail permission: grant Mail.Read (application) with admin consent, or add an RBAC for Applications role assignment.',
    delegation_wrong_id: "Delegation was added with the service account's email or a group. Use the numeric Client ID.",
    admin_policy: 'A Workspace policy blocks the Gmail scope.',
    key_invalid: 'Google rejected the service account key (deleted, disabled or wrong). Upload a new key.',
    clock_skew: 'The server clock is off. Fix the time on the server.',
    invalid_client: 'Client secret is wrong (copy the secret Value, not its ID).',
    secret_expired: 'The client secret has expired: create a new one in Entra and paste it here.',
    app_not_in_tenant: 'This client ID is not an app in that tenant: check the Application (client) ID and Tenant ID.',
    tenant_not_found: 'Tenant not found: check the Directory (tenant) ID.',
    not_configured: 'The provider is not set up: save its credentials first.',
    provider_error: 'The provider answered with an unexpected error.',
};

// ── Limits ────────────────────────────────────────────────────────────────────────────────────────────────────

export const SUBJECT_MAX = 300;
export const SNIPPET_MAX = 500;
export const NAME_MAX = 200;
export const EMAIL_MAX = 254;
/** To and Cc recipients kept per email (each); the rest are counted in `moreRecipients`. */
export const RECIPIENTS_KEPT = 25;
/** JSON columns `toJson` / `ccJson` are NVARCHAR(4000). */
export const RECIPIENTS_JSON_MAX = 4000;
export const PROVIDER_MESSAGE_ID_MAX = 300;
export const THREAD_ID_MAX = 200;
export const WEB_LINK_MAX = 1000;
/** Opportunities linked per email for each matched contact (the most recently updated). */
export const OPPORTUNITY_LINKS_PER_CONTACT = 10;

/** First run and the resync after an expired cursor read only this far back. */
export const FULL_SYNC_DAYS = 7;
/** Messages listed by one full sync (Gmail ids / Graph items per folder). */
export const FULL_SYNC_MAX_MESSAGES = 300;
/** New messages handled by one run; the cursor is saved where the run stopped and the next run continues. */
export const MESSAGES_PER_RUN = 200;
/** Pages read by one run (a runaway change stream stops here). */
export const MAX_PAGES_PER_RUN = 20;
/** Due mailboxes queued per calendar poll tick. */
export const MAILBOXES_PER_TICK = 25;
/** A run holds its mailbox this long (lease). */
export const MAILBOX_LEASE_MS = 5 * 60_000;
/** Error backoff (consecutive failures 1, 2, 3, 4+). */
export const ERROR_BACKOFF_MS = [15 * 60_000, 60 * 60_000, 6 * 60 * 60_000, 24 * 60 * 60_000] as const;
/** An app-level failure pauses the provider's mail runs in this process for this long. */
export const APP_PAUSE_MS = 5 * 60_000;
/** Lookups of CRM addresses per query. */
export const ADDRESS_LOOKUP_CHUNK = 500;

/** Nightly retention: emails deleted per batch, batches per night. */
export const RETENTION_BATCH = 500;
export const RETENTION_MAX_BATCHES = 20;
/** Purge: copies deleted per batch (an admin purge loops until done). */
export const PURGE_BATCH = 500;
/** Emails left without any copy (a crashed run) are removed by the nightly after this long. */
export const ORPHAN_GRACE_MS = 24 * 60 * 60_000;

/** Record list page size (default, max). */
export const LIST_DEFAULT_LIMIT = 20;
export const LIST_MAX_LIMIT = 50;

/** BullMQ job on the calendar sync queue (`crm-calendar-sync`): one mailbox's ingestion run. */
export const EMAIL_LOG_JOB = 'email-log';

/** Gmail user labels / Outlook categories that keep a message out of the CRM (case-insensitive). */
export const PRIVATE_MARKERS: readonly string[] = ['private', 'personal', 'no crm'];

/** Audit entity of the per-person switch and purges. */
export const MAILBOX_AUDIT_ENTITY = 'LoggedEmailMailbox';
