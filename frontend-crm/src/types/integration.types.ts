/**
 * Admin › API Integrations. Mirrors backend-crm/src/modules/integrations (integration.service.ts DTOs,
 * calendarSyncSettings.ts, integration.constants.ts) and users/userEmail.service.ts; contractSync.test.ts checks the
 * constants below against the backend.
 */
import type { ActivityReminder } from './activity.types';

export const INTEGRATION_PROVIDERS = ['google', 'microsoft', 'zoom'] as const;
export type IntegrationProviderKey = (typeof INTEGRATION_PROVIDERS)[number];

export const BACKFILL_DAY_CHOICES = [30, 60, 90] as const;
export type BackfillDays = (typeof BACKFILL_DAY_CHOICES)[number];

export const EVENT_VISIBILITIES = ['private', 'default'] as const;
export type EventVisibility = (typeof EVENT_VISIBILITIES)[number];

export const GOOGLE_SCOPE_PROFILES = ['narrow', 'broad'] as const;
export type GoogleScopeProfile = (typeof GOOGLE_SCOPE_PROFILES)[number];

export const USER_EMAIL_ISSUES = ['missing', 'duplicate', 'not_company'] as const;
export type UserEmailIssue = (typeof USER_EMAIL_ISSUES)[number];

/** Days before a client secret's expiry when its card warns. */
export const SECRET_EXPIRY_WARNING_DAYS = 30;
export const MAX_COMPANY_DOMAINS = 10;
export const USER_EMAIL_MAX_LENGTH = 120;

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

export interface GoogleProviderSettings {
    scopeProfile: GoogleScopeProfile;
    pkce: boolean;
}

export interface MicrosoftProviderSettings {
    tenantId: string | null;
}

export interface ProviderAdmin {
    provider: IntegrationProviderKey;
    label: string;
    kind: 'calendar' | 'video';
    /** False for Zoom until video meetings ship (credentials can be stored, the switch stays off). */
    available: boolean;
    enabled: boolean;
    configured: boolean;
    clientId: string | null;
    secret: SecretSummary;
    webhookSecret: SecretSummary | null;
    settings: Partial<GoogleProviderSettings & MicrosoftProviderSettings>;
    redirectUri: string | null;
    webhookUrls: string[] | null;
    lastTest: { at: string; ok: boolean; message: string | null } | null;
    clientVersion: number;
    counts: { active: number; reauth: number; error: number };
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
    locked: boolean;
    lockReason?: string;
}

export type KeyStatus = 'ok' | 'missing' | 'unreadable';

export interface IntegrationsAdmin {
    ready: { ok: boolean; reason: 'key_missing' | 'public_url_missing' | null };
    keyStatus: KeyStatus;
    activeKeyId: string | null;
    publicApiUrl: string | null;
    publicApiUrlConfigured: boolean;
    webhooksActive: boolean;
    worker: { lastSeenAt: string } | null;
    providers: ProviderAdmin[];
    settings: CalendarSyncSettings;
    syncTypes: SyncType[];
}

export interface SaveProviderPayload {
    enabled?: boolean;
    clientId?: string | null;
    /** Write-only; omit to keep the stored secret. */
    clientSecret?: string;
    webhookSecret?: string;
    clientSecretExpiresOn?: string | null;
    settings?: Partial<GoogleProviderSettings & MicrosoftProviderSettings>;
}

export type TestCode =
    | 'credentials_ok'
    | 'invalid_client'
    | 'redirect_uri_mismatch'
    | 'secret_expired'
    | 'app_not_in_tenant'
    | 'tenant_not_found'
    | 'not_configured'
    | 'not_available'
    | 'network'
    | 'provider_error'
    /** The saved credentials changed while the test ran; the result was not stored. */
    | 'credentials_changed';

export interface TestConnectionResult {
    ok: boolean;
    code: TestCode;
    message: string;
    testedAt: string;
}

export interface Person {
    username: string;
    fullName: string;
    department: string | null;
    role: string;
    email: string | null;
    emailIssue: UserEmailIssue | null;
    /** The person's calendar connection (arrives with Connected calendars); null until then. */
    connection: { id: string; provider: string; status: string } | null;
}

export interface PersonEmailPayload {
    email: string;
    allowOtherDomain?: boolean;
}
