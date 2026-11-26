/**
 * Admin › API Integrations. Mirrors backend-crm/src/modules/integrations (integration.service.ts DTOs,
 * calendarSyncSettings.ts, integration.constants.ts, integration.validator.ts) and users/userEmail.service.ts;
 * contractSync.test.ts checks the constants below against the backend.
 *
 * Calendar sync is admin-managed (Calendar Phase 2, P2-2b): Google Workspace with a service account and domain-wide
 * delegation, Microsoft 365 with one Entra app (application permissions). Admins connect the company once; everyone
 * with a company email on a provider's domains is enrolled automatically. Secrets (the key file, the client secret) are
 * write-only: no response ever carries one.
 */
import type { ActivityReminder } from './activity.types';

export const INTEGRATION_PROVIDERS = ['google', 'microsoft', 'zoom'] as const;
export type IntegrationProviderKey = (typeof INTEGRATION_PROVIDERS)[number];

export const BACKFILL_DAY_CHOICES = [30, 60, 90] as const;
export type BackfillDays = (typeof BACKFILL_DAY_CHOICES)[number];

export const EVENT_VISIBILITIES = ['private', 'default'] as const;
export type EventVisibility = (typeof EVENT_VISIBILITIES)[number];

export const USER_EMAIL_ISSUES = ['missing', 'duplicate', 'not_company'] as const;
export type UserEmailIssue = (typeof USER_EMAIL_ISSUES)[number];

/** `?issue=` filters of the People list (`calendar_problem` = calendar sync in error). */
export const PEOPLE_ISSUE_FILTERS = ['any', 'missing', 'duplicate', 'not_company', 'calendar_problem'] as const;
export type PeopleIssueFilter = (typeof PEOPLE_ISSUE_FILTERS)[number];

/** A calendar sync row: pending (enrolled, not checked yet) | ok | error (one person's problem) | stopped. */
export const CONNECTION_STATUSES = ['pending', 'ok', 'error', 'stopped'] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

/** How a person's provider was chosen: the email domain's provider, or the admin's override. */
export const ENROLMENT_SOURCES = ['domain', 'override'] as const;
export type EnrolmentSource = (typeof ENROLMENT_SOURCES)[number];

/** Days before a client secret's expiry when its card warns. */
export const SECRET_EXPIRY_WARNING_DAYS = 30;
export const MAX_COMPANY_DOMAINS = 10;
export const USER_EMAIL_MAX_LENGTH = 120;
/** Largest service account key file accepted (a real one is ~2.3 KB). */
export const SERVICE_ACCOUNT_KEY_MAX_BYTES = 10 * 1024;
/** Longest admin note on a person's calendar choice. */
export const PERSON_CALENDAR_NOTE_MAX = 200;

export interface SecretSummary {
    set: boolean;
    /** False when the stored secret can't be opened with the server's current key. */
    readable: boolean;
    last4: string | null;
    updatedAt: string | null;
    updatedBy: string | null;
    expiresOn: string | null;
    expiresSoon: boolean;
}

/** Google's uploaded service account key as admins see it (nothing secret: the key itself is never returned). */
export interface ServiceAccountSummary {
    set: boolean;
    readable: boolean;
    clientEmail: string | null;
    /** Numeric client ID: what the Admin console's domain-wide delegation entry needs. */
    clientId: string | null;
    projectId: string | null;
    privateKeyId: string | null;
    updatedAt: string | null;
    updatedBy: string | null;
}

export interface ProviderHealth {
    status: 'unknown' | 'ok' | 'error';
    code: string | null;
    /** The admin sentence for `code`. */
    message: string | null;
    at: string | null;
}

export interface ProviderCounts {
    ok: number;
    pending: number;
    error: number;
    excluded: number;
}

export interface ProviderSettings {
    /** Company email domains this provider serves. */
    domains?: string[];
    /** Microsoft only. */
    tenantId?: string | null;
}

export interface ProviderAdmin {
    provider: IntegrationProviderKey;
    label: string;
    kind: 'calendar' | 'video';
    /** False for Zoom until video meetings ship (credentials can be stored, the switch stays off). */
    available: boolean;
    enabled: boolean;
    configured: boolean;
    /** Google: the service account's numeric client ID (from the key); Microsoft / Zoom: the app's client ID. */
    clientId: string | null;
    /** Microsoft / Zoom client secret (Google: never set). */
    secret: SecretSummary;
    webhookSecret: SecretSummary | null;
    /** Google only. */
    serviceAccount: ServiceAccountSummary | null;
    /** Google only: the delegated scopes and the exact text for the Admin console. */
    scopes: string[] | null;
    scopesAdminConsole: string | null;
    settings: ProviderSettings;
    domains: string[];
    webhookUrls: string[] | null;
    lastTest: { at: string; ok: boolean; message: string | null } | null;
    /** A passing app-level test since the last credentials change (needed to switch on). */
    appTested: boolean;
    clientVersion: number;
    health: ProviderHealth;
    counts: ProviderCounts;
    updatedAt: string | null;
    updatedBy: string | null;
}

export interface CalendarSyncSettings {
    companyDomains: string[];
    followUpReminder: ActivityReminder | null;
    backfillDays: BackfillDays;
    eventVisibility: EventVisibility;
    followUpActivities: boolean;
    allowMeetingImport: boolean;
    importFollowupType: string;
}

export interface SyncType {
    value: string;
    label: string;
    calendarSync: boolean;
    /** Offers a Video meeting on the activity form (option meta `videoMeeting`; Calendar Phase 3). */
    videoMeeting: boolean;
    locked: boolean;
    lockReason?: string;
}

export type KeyStatus = 'ok' | 'missing' | 'unreadable';

export interface IntegrationsAdmin {
    ready: { ok: boolean; reason: 'key_missing' | null };
    keyStatus: KeyStatus;
    activeKeyId: string | null;
    publicApiUrl: string | null;
    publicApiUrlConfigured: boolean;
    webhooksActive: boolean;
    /** The dev-only test calendar provider is on: People may pick "Test calendar". */
    fakeProvider: boolean;
    worker: { lastSeenAt: string } | null;
    providers: ProviderAdmin[];
    settings: CalendarSyncSettings;
    syncTypes: SyncType[];
}

export interface SaveProviderPayload {
    enabled?: boolean;
    /** Microsoft / Zoom only (Google's comes from the key). */
    clientId?: string | null;
    /** Write-only; omit to keep the stored secret. Microsoft / Zoom. */
    clientSecret?: string;
    /** Write-only: the Google key file's text. */
    serviceAccountKey?: string;
    webhookSecret?: string;
    clientSecretExpiresOn?: string | null;
    settings?: ProviderSettings;
}

export type TestStepName = 'app' | 'user';

export interface TestStep {
    step: TestStepName;
    ok: boolean;
    code: string;
    message: string;
}

export interface TestConnectionResult {
    /** Every step that ran passed. */
    ok: boolean;
    /** The first failing step's code, else the last step's (key_ok, credentials_ok, delegation_ok, mailbox_ok, …). */
    code: string;
    message: string;
    steps: TestStep[];
    testedAt: string;
}

export interface TestConnectionPayload {
    /** Also try this person's calendar as them. */
    asUsername?: string;
}

/** Why a person isn't synced. */
export type NotSyncedReason = 'no_email' | 'not_company' | 'no_provider' | 'excluded' | 'inactive' | 'group';

export interface PersonConnection {
    id: string;
    /** `google` | `microsoft` | `fake` (development only). */
    provider: string;
    status: ConnectionStatus | (string & {});
    /** error: the user-level code. */
    statusReason: string | null;
    source: EnrolmentSource | (string & {});
    accountEmail: string;
    enrolledAt: string;
    lastSuccessAt: string | null;
    lastCheckedAt: string | null;
    nextCheckAt: string | null;
    /** The admin sentence (+ provider words) of the last problem; null when fine. */
    lastErrorMessage: string | null;
}

export interface PersonCalendarChoice {
    /** null = by email domain. */
    provider: string | null;
    excluded: boolean;
    note: string | null;
    importMeetings: boolean;
}

export interface PersonCalendar {
    target: { provider: string; email: string; source: EnrolmentSource } | null;
    reason: NotSyncedReason | null;
    connection: PersonConnection | null;
    choice: PersonCalendarChoice | null;
}

export interface Person {
    username: string;
    fullName: string;
    department: string | null;
    role: string;
    email: string | null;
    emailIssue: UserEmailIssue | null;
    calendar: PersonCalendar;
}

export interface PersonEmailPayload {
    email: string;
    allowOtherDomain?: boolean;
}

/** `PUT /people/:username/calendar` (any subset). */
export interface PersonCalendarPayload {
    /** null = by email domain. */
    provider?: string | null;
    excluded?: boolean;
    note?: string | null;
}

export type CalendarCheckOutcome = 'ok' | 'user_error' | 'provider_unhealthy' | 'transient' | 'skipped';
