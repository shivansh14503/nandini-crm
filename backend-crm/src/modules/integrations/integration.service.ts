import { StatusCodes } from 'http-status-codes';
import { ENV, type WebhooksOffReason } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { prisma } from '../../config/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { auditService } from '../../services/audit.service.js';
import { secretBox, SecretBoxError } from '../../services/secretBox.js';
import type { AuthUser } from '../../types/user.types.js';
import { HttpError } from '../../utils/httpError.js';
import { checkConnection, type CheckOutcome } from '../calendar-sync/calendarAccess.js';
import type { PullRequestResult } from '../calendar-sync/pull.requests.js';
import { calendarConnectionUserLockKey, isCalendarProvider, type CalendarProvider, type NotSyncedReason } from '../calendar-sync/connection.constants.js';
import {
    calendarChoicesByUsername,
    connectionCountsByProvider,
    liveConnectionsByUsername,
    webhookCountsByProvider,
    type ConnectionCounts,
    type WebhookCounts,
    type PersonCalendarChoiceDto,
    type PersonConnectionDto,
} from '../calendar-sync/connection.queries.js';
import {
    loadEnrolmentContext,
    NOT_SYNCED_REASON_FOR,
    providerServing,
    reconcileAllQuietly,
    reconcileUser,
    resolveTarget,
    type EnrolmentContext,
    type TargetChoice,
    type TargetProvider,
    type TargetUser,
} from '../calendar-sync/enrolment.js';
import { isFakeProviderEnabled } from '../calendar-sync/providers/fakeSwitch.js';
import { parseServiceAccountKey, ServiceAccountKeyError, type ServiceAccountKey } from '../calendar-sync/providers/googleServiceAccount.js';
import type { FetchImpl } from '../calendar-sync/providers/types.js';
import { ADMIN_ERROR_MESSAGES, type TokenErrorCode } from '../calendar-sync/syncErrors.js';
import { startImportPulls } from '../calendar-sync/sync.wake.js';
import { pollMinutes } from '../calendar-sync/syncHours.js';
import { tokenSource } from '../calendar-sync/tokenSource.js';
import { isHeartbeatRedisReady, readWorkerHeartbeat, workerStatusOf, type WorkerStatus } from '../calendar-sync/workerHeartbeat.js';
import { FOLLOWUP_TYPE_CATEGORY_KEY } from '../form-configs/formConfig.defaults.js';
import { formConfigService, invalidateFormConfigCaches, type FormConfigsPayload } from '../form-configs/formConfig.service.js';
import { isActivityOnlyFollowupType } from '../shared/followupTypes.js';
import { acquireLocks, runInTransaction } from '../shared/transactions.js';
import {
    duplicateEmailsAmong,
    emailDomainOf,
    emailIssueFor,
    isCompanyEmail,
    normalizeUserEmail,
    userEmailService,
    type UserEmailIssue,
    type UserEmailRow,
} from '../users/userEmail.service.js';
import { CALENDAR_SYNC_META_KEY, calendarSyncFromMeta, type CalendarSyncSettings } from './calendarSyncSettings.js';
import {
    DOMAIN_PROVIDERS,
    ENABLEABLE_PROVIDERS,
    GOOGLE_DWD_SCOPES,
    GOOGLE_DWD_SCOPES_ADMIN_CONSOLE,
    INTEGRATION_PROVIDERS,
    PROVIDER_KINDS,
    PROVIDER_LABELS,
    PROVIDERS_WITH_CLIENT_SECRET,
    PROVIDERS_WITH_SECRET_EXPIRY,
    PROVIDERS_WITH_WEBHOOK_SECRET,
    SECRET_EXPIRY_WARNING_DAYS,
    webhookUrlsFor,
    type IntegrationProviderKey,
} from './integration.constants.js';
import { calendarSettingsFrom, loadCalendarSettings } from './integration.settings.js';
import { notAvailable, notConfigured, testGoogle, testMicrosoft, type TestResult } from './integration.test-connection.js';
import {
    PROVIDER_SETTINGS_DEFAULTS,
    PROVIDER_SETTINGS_KEYS,
    peopleQuerySchema,
    personCalendarBodySchema,
    providerSettingsSchemas,
    saveProviderSchema,
    syncTypesBodySchema,
    testProviderBodySchema,
    type PeopleQuery,
} from './integration.validator.js';

/**
 * Admin › API Integrations (Calendar Phase 2, P2-1; admin-managed calendar connections P2-2b): the company's
 * credentials for Google Workspace (a service account key with domain-wide delegation), Microsoft 365 (an Entra app with
 * application permissions) and Zoom (sealed secrets, settings, the two-step "Test connection"), the email domains each
 * calendar provider serves, the calendar-sync settings, which Followup Types go to calendars, and the People list with
 * company emails, each person's calendar sync and the admin's per-person choice. Secrets are write-only: no DTO, log
 * line or audit entry carries one (audits say `secretChanged: true` / `serviceAccountKeyChanged: true`). Everything
 * is off until an admin switches a provider on, which needs a passing app-level test since the last credentials change.
 */

type ProviderRow = Prisma.IntegrationProviderGetPayload<object>;

interface SecretHint {
    last4: string;
    updatedAt: string;
    updatedBy: string;
    expiresOn?: string | null;
}
/** Google: the facts of the uploaded key (none of them secret; the private key id is shown in full). */
interface KeyHint {
    clientEmail: string;
    clientId: string;
    projectId: string | null;
    privateKeyId: string;
    updatedAt: string;
    updatedBy: string;
}
/** A passing app-level test for these credentials (`version` = clientVersion at the time). */
interface AppTestHint {
    ok: boolean;
    version: number;
    at: string;
}
interface SecretHints {
    serviceAccountKey?: KeyHint;
    clientSecret?: SecretHint;
    webhookSecret?: SecretHint;
    appTest?: AppTestHint;
}
interface ProviderSecrets {
    /** Google: the whole key JSON as text. */
    serviceAccountKey?: string;
    clientSecret?: string;
    webhookSecret?: string;
}

export interface SecretSummaryDto {
    set: boolean;
    /** False when a secret is stored but the current key can't open it (key changed or lost). */
    readable: boolean;
    last4: string | null;
    updatedAt: string | null;
    updatedBy: string | null;
    expiresOn: string | null;
    /** Expires within SECRET_EXPIRY_WARNING_DAYS (or already has). */
    expiresSoon: boolean;
}

/** Google's uploaded service account key, as admins see it (to copy into the Admin console). */
export interface ServiceAccountSummaryDto {
    set: boolean;
    readable: boolean;
    clientEmail: string | null;
    /** Numeric client id: paste it into Admin console › Domain-wide delegation. */
    clientId: string | null;
    projectId: string | null;
    privateKeyId: string | null;
    updatedAt: string | null;
    updatedBy: string | null;
}

export interface ProviderHealthDto {
    status: 'unknown' | 'ok' | 'error';
    code: string | null;
    /** The admin sentence for `code`. */
    message: string | null;
    at: string | null;
}

export interface ProviderAdminDto {
    provider: IntegrationProviderKey;
    label: string;
    kind: 'calendar' | 'video';
    /** False for Zoom until video meetings ship: credentials can be stored, the switch stays off. */
    available: boolean;
    enabled: boolean;
    /** Google: a readable key; Microsoft: client id, readable secret and tenant; Zoom: client id and secret. */
    configured: boolean;
    clientId: string | null;
    /** Microsoft / Zoom client secret (Google: never set). */
    secret: SecretSummaryDto;
    /** Zoom only. */
    webhookSecret: SecretSummaryDto | null;
    /** Google only. */
    serviceAccount: ServiceAccountSummaryDto | null;
    /** Google only: the delegated scopes, and the exact text for the Admin console's comma-delimited box. */
    scopes: string[] | null;
    scopesAdminConsole: string | null;
    /** Non-secret settings (google { domains }, microsoft { tenantId, domains }). */
    settings: Record<string, unknown>;
    /** Company email domains this provider serves (calendar providers; [] otherwise). */
    domains: string[];
    webhookUrls: string[] | null;
    /** Calendar webhooks of this provider (P2-7); null for Zoom. */
    webhook: ProviderWebhookDto | null;
    lastTest: { at: string; ok: boolean; message: string | null } | null;
    /** A passing app-level test since the last credentials change (needed to switch the provider on). */
    appTested: boolean;
    clientVersion: number;
    /** App-level health found while syncing. */
    health: ProviderHealthDto;
    /** People's live rows by status, and people excluded from this provider. */
    counts: ConnectionCounts;
    updatedAt: string | null;
    updatedBy: string | null;
}

/**
 * Webhooks of a calendar provider on its card (P2-7): `unavailable` while webhooks are off server-wide (`reason` says
 * why), `off` while the provider is switched off, `errors` when some people's channel was refused, `starting` while
 * some synced people have none yet (created within minutes), else `live`.
 */
export const PROVIDER_WEBHOOK_STATUSES = ['live', 'starting', 'errors', 'off', 'unavailable'] as const;
export type ProviderWebhookStatus = (typeof PROVIDER_WEBHOOK_STATUSES)[number];

export interface ProviderWebhookDto extends WebhookCounts {
    status: ProviderWebhookStatus;
    reason: WebhooksOffReason | null;
}

/** The card's webhook line (pure). Null for providers without calendar webhooks (Zoom). */
export function providerWebhookOf(provider: IntegrationProviderKey, enabled: boolean, counts: WebhookCounts | undefined): ProviderWebhookDto | null {
    if (!isCalendarProvider(provider)) return null;
    const c = counts ?? { active: 0, failed: 0, waiting: 0 };
    const reason = ENV.INTEGRATIONS.WEBHOOKS_OFF_REASON;
    const status: ProviderWebhookStatus = reason ? 'unavailable' : !enabled ? 'off' : c.failed > 0 ? 'errors' : c.waiting > 0 ? 'starting' : 'live';
    return { status, reason, ...c };
}

export interface SyncTypeDto {
    value: string;
    label: string;
    calendarSync: boolean;
    locked: boolean;
    lockReason?: string;
}

export type KeyStatus = 'ok' | 'missing' | 'unreadable';

export interface IntegrationsAdminDto {
    ready: { ok: boolean; reason: 'key_missing' | null };
    keyStatus: KeyStatus;
    activeKeyId: string | null;
    publicApiUrl: string | null;
    /** PUBLIC_API_URL was set in the environment (false = the localhost default outside production). */
    publicApiUrlConfigured: boolean;
    /** Calendar webhooks are live (Calendar Phase 2 P2-7, needs https); false until then. */
    webhooksActive: boolean;
    /** Why they aren't (null while live): no_public_url | needs_https | disabled | sync_disabled | key_missing. */
    webhooksOffReason: WebhooksOffReason | null;
    /**
     * Safety-net poll interval of people with a healthy channel, as the scheduler uses it: the larger of
     * CALENDAR_POLL_MINUTES_WITH_WEBHOOKS and CALENDAR_POLL_MINUTES (pollIntervalMinutes in sync.channels.ts).
     */
    pollMinutesWithWebhooks: number;
    /** The dev-only test calendar provider is on (CALENDAR_FAKE_PROVIDER): People may pick "Test (dev)". */
    fakeProvider: boolean;
    /** The calendar sync worker's last heartbeat (Redis key, P2-3b); null when no worker wrote it in the last 2 minutes or Redis is down. */
    worker: { lastSeenAt: string } | null;
    /** The same as one word (P2-3c): running | not_seen (Redis up, no heartbeat) | no_redis (nothing to read). */
    workerStatus: WorkerStatus;
    /** CALENDAR_SYNC_ENABLED on this API (false = the push engine is switched off server-wide). */
    syncEnabled: boolean;
    providers: ProviderAdminDto[];
    settings: CalendarSyncSettings;
    syncTypes: SyncTypeDto[];
}

/** A person's calendar sync on the People table. */
export interface PersonCalendarDto {
    /** The provider and mailbox the rules pick now (null = not synced, see `reason`). */
    target: { provider: CalendarProvider; email: string; source: 'domain' | 'override' } | null;
    reason: NotSyncedReason | null;
    /** The live row (pending / ok / error); null until enrolment ran, or when not synced. */
    connection: PersonConnectionDto | null;
    /** The admin's choice (CalendarSyncUser); null = all defaults. */
    choice: PersonCalendarChoiceDto | null;
}

export interface PersonDto {
    username: string;
    fullName: string;
    department: string | null;
    role: string;
    email: string | null;
    emailIssue: UserEmailIssue | null;
    calendar: PersonCalendarDto;
}

export interface TestConnectionDto extends TestResult {
    testedAt: string;
}

const SECRETS_AAD = (provider: IntegrationProviderKey) => `IntegrationProvider:${provider}:secrets`;
const TASK_NOTE_LOCK_REASON = 'Tasks and notes never go to calendars.';
/** Serializes provider saves that touch domain lists (a domain may belong to only one provider). */
const DOMAINS_LOCK = 'integration-provider:domains';

const notReady = () =>
    new HttpError(
        'INTEGRATIONS_ENCRYPTION_KEY is not set on the server, so secrets can\'t be stored yet. Ask the server admin to add it (API and worker) and restart.',
        StatusCodes.SERVICE_UNAVAILABLE,
        { code: 'INTEGRATIONS_NOT_READY' },
    );

const parseJson = <T>(text: string | null | undefined, fallback: T): T => {
    if (!text) return fallback;
    try {
        const value = JSON.parse(text) as unknown;
        return value && typeof value === 'object' && !Array.isArray(value) ? (value as T) : fallback;
    } catch {
        return fallback;
    }
};

/** Opens a row's sealed secrets; null when there are none or the key can't open them (never throws). */
function openSecrets(row: Pick<ProviderRow, 'provider' | 'secretsEnc'> | null): { secrets: ProviderSecrets; readable: boolean } {
    if (!row?.secretsEnc) return { secrets: {}, readable: true };
    if (!secretBox.ready()) return { secrets: {}, readable: false };
    try {
        return { secrets: parseJson<ProviderSecrets>(secretBox.open(row.secretsEnc, SECRETS_AAD(row.provider as IntegrationProviderKey)), {}), readable: true };
    } catch (err) {
        logger.warn({ provider: row.provider, code: err instanceof SecretBoxError ? err.code : 'unknown' }, 'Stored integration secret cannot be opened');
        return { secrets: {}, readable: false };
    }
}

/** Defaults + the stored keys this provider still uses (P2-2's scopeProfile / pkce are dropped). */
const providerSettings = (provider: IntegrationProviderKey, row: Pick<ProviderRow, 'settingsJson'> | null): Record<string, unknown> => {
    const stored = parseJson<Record<string, unknown>>(row?.settingsJson, {});
    const kept = Object.fromEntries(Object.entries(stored).filter(([key]) => PROVIDER_SETTINGS_KEYS[provider].includes(key)));
    return { ...PROVIDER_SETTINGS_DEFAULTS[provider], ...kept };
};

const domainsIn = (settings: Record<string, unknown>): string[] =>
    Array.isArray(settings.domains) ? settings.domains.filter((d): d is string => typeof d === 'string').map((d) => d.toLowerCase()) : [];

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whether `YYYY-MM-DD` is within the warning window of `now` (or past). */
export function expiresSoon(expiresOn: string | null | undefined, now: Date = new Date()): boolean {
    if (!expiresOn) return false;
    const at = Date.parse(`${expiresOn}T00:00:00Z`);
    return Number.isFinite(at) && at - now.getTime() <= SECRET_EXPIRY_WARNING_DAYS * DAY_MS;
}

function secretSummary(hint: SecretHint | undefined, stored: boolean, readable: boolean, now: Date): SecretSummaryDto {
    return {
        set: stored && Boolean(hint),
        readable: !stored || readable,
        last4: hint?.last4 ?? null,
        updatedAt: hint?.updatedAt ?? null,
        updatedBy: hint?.updatedBy ?? null,
        expiresOn: hint?.expiresOn ?? null,
        expiresSoon: stored && expiresSoon(hint?.expiresOn, now),
    };
}

function serviceAccountSummary(hint: KeyHint | undefined, stored: boolean, readable: boolean): ServiceAccountSummaryDto {
    return {
        set: stored && Boolean(hint),
        readable: !stored || readable,
        clientEmail: hint?.clientEmail ?? null,
        clientId: hint?.clientId ?? null,
        projectId: hint?.projectId ?? null,
        privateKeyId: hint?.privateKeyId ?? null,
        updatedAt: hint?.updatedAt ?? null,
        updatedBy: hint?.updatedBy ?? null,
    };
}

/** Whether a provider's credentials are complete and readable. */
function isConfigured(provider: IntegrationProviderKey, clientId: string | null, secrets: ProviderSecrets, readable: boolean, settings: Record<string, unknown>): boolean {
    if (!clientId || !readable) return false;
    if (provider === 'google') return Boolean(secrets.serviceAccountKey);
    if (!secrets.clientSecret) return false;
    if (provider === 'microsoft' && !settings.tenantId) return false;
    return true;
}

const appTestedFor = (hints: SecretHints, clientVersion: number) => Boolean(hints.appTest?.ok && hints.appTest.version === clientVersion);

const healthOf = (row: ProviderRow | null): ProviderHealthDto => {
    const status = row?.healthStatus === 'ok' || row?.healthStatus === 'error' ? row.healthStatus : 'unknown';
    const code = status === 'error' ? (row?.healthCode ?? null) : null;
    return {
        status,
        code,
        message: code ? (ADMIN_ERROR_MESSAGES[code as TokenErrorCode] ?? ADMIN_ERROR_MESSAGES.provider_error) : null,
        at: row?.healthAt ? row.healthAt.toISOString() : null,
    };
};

const EMPTY_COUNTS: ConnectionCounts = { ok: 0, pending: 0, error: 0, excluded: 0 };

export function toProviderDto(provider: IntegrationProviderKey, row: ProviderRow | null, now: Date = new Date(), counts?: ConnectionCounts, webhookCounts?: WebhookCounts): ProviderAdminDto {
    const { secrets, readable } = openSecrets(row);
    const hints = parseJson<SecretHints>(row?.secretHintsJson, {});
    const settings = providerSettings(provider, row);
    const stored = Boolean(row?.secretsEnc);
    const clientVersion = row?.clientVersion ?? 1;
    return {
        provider,
        label: PROVIDER_LABELS[provider],
        kind: PROVIDER_KINDS[provider],
        available: ENABLEABLE_PROVIDERS.has(provider),
        enabled: Boolean(row?.enabled),
        configured: isConfigured(provider, row?.clientId ?? null, secrets, readable, settings),
        clientId: row?.clientId ?? null,
        secret: secretSummary(PROVIDERS_WITH_CLIENT_SECRET.has(provider) ? hints.clientSecret : undefined, stored, readable, now),
        webhookSecret: PROVIDERS_WITH_WEBHOOK_SECRET.has(provider) ? secretSummary(hints.webhookSecret, stored && Boolean(hints.webhookSecret), readable, now) : null,
        serviceAccount: provider === 'google' ? serviceAccountSummary(hints.serviceAccountKey, stored, readable) : null,
        scopes: provider === 'google' ? [...GOOGLE_DWD_SCOPES] : null,
        scopesAdminConsole: provider === 'google' ? GOOGLE_DWD_SCOPES_ADMIN_CONSOLE : null,
        settings,
        domains: DOMAIN_PROVIDERS.has(provider) ? domainsIn(settings) : [],
        webhookUrls: webhookUrlsFor(provider, ENV.INTEGRATIONS.PUBLIC_API_URL),
        webhook: providerWebhookOf(provider, Boolean(row?.enabled), webhookCounts),
        lastTest: row?.lastTestAt ? { at: row.lastTestAt.toISOString(), ok: Boolean(row.lastTestOk), message: row.lastTestMessage } : null,
        appTested: appTestedFor(hints, clientVersion),
        clientVersion,
        health: healthOf(row),
        counts: counts ?? { ...EMPTY_COUNTS },
        updatedAt: row ? row.updatedAt.toISOString() : null,
        updatedBy: row?.updatedBy ?? null,
    };
}

/** Followup Types and whether each goes to calendars (active options of shared_followup_type, in their order). */
export function syncTypesFrom(configs: Pick<FormConfigsPayload, 'categories'>): SyncTypeDto[] {
    const category = configs.categories.find((c) => c.key === FOLLOWUP_TYPE_CATEGORY_KEY);
    return (category?.options ?? [])
        .filter((o) => o.isActive)
        .map((o) => {
            const locked = isActivityOnlyFollowupType(o.value);
            return { value: o.value, label: o.label, calendarSync: calendarSyncFromMeta(o.meta, locked), locked, ...(locked ? { lockReason: TASK_NOTE_LOCK_REASON } : {}) };
        });
}

// ── Credentials for calendar sync (tokenSource.ts): in-process cache, dropped on every save ────────────────────

export interface ProviderCredentials {
    provider: IntegrationProviderKey;
    enabled: boolean;
    configured: boolean;
    clientId: string | null;
    clientSecret: string | null;
    webhookSecret: string | null;
    /** Google: the service account key JSON text (parsed by calendar-sync/providers/registry.ts). */
    serviceAccountKey: string | null;
    settings: Record<string, unknown>;
    clientVersion: number;
    healthStatus: 'unknown' | 'ok' | 'error';
    healthCode: string | null;
}

const CREDENTIALS_TTL_MS = 60_000;
const credentialsCache = new Map<IntegrationProviderKey, { at: number; value: ProviderCredentials }>();

/** Forgets cached credentials (a save in this process; other processes see it within 60 s). */
export function dropProviderCredentialsCache(provider?: IntegrationProviderKey | string): void {
    if (provider) credentialsCache.delete(provider as IntegrationProviderKey);
    else credentialsCache.clear();
}

/** A provider's decrypted credentials for token calls, cached for 60 s in this process. Never logged. */
export async function loadProviderCredentials(provider: IntegrationProviderKey, now: number = Date.now()): Promise<ProviderCredentials> {
    const cached = credentialsCache.get(provider);
    if (cached && now - cached.at < CREDENTIALS_TTL_MS) return cached.value;
    const row = await prisma.integrationProvider.findUnique({ where: { provider } });
    const { secrets, readable } = openSecrets(row);
    const settings = providerSettings(provider, row);
    const health = healthOf(row);
    const value: ProviderCredentials = {
        provider,
        enabled: Boolean(row?.enabled) && ENABLEABLE_PROVIDERS.has(provider),
        configured: isConfigured(provider, row?.clientId ?? null, secrets, readable, settings),
        clientId: row?.clientId ?? null,
        clientSecret: secrets.clientSecret ?? null,
        webhookSecret: secrets.webhookSecret ?? null,
        serviceAccountKey: secrets.serviceAccountKey ?? null,
        settings,
        clientVersion: row?.clientVersion ?? 1,
        healthStatus: health.status,
        healthCode: health.code,
    };
    credentialsCache.set(provider, { at: now, value });
    return value;
}

// ── Service ───────────────────────────────────────────────────────────────────────────────────────────────────

const auditSnapshot = (provider: IntegrationProviderKey, row: ProviderRow | null) => {
    const hints = parseJson<SecretHints>(row?.secretHintsJson, {});
    return {
        enabled: Boolean(row?.enabled),
        clientId: row?.clientId ?? null,
        settings: providerSettings(provider, row),
        clientSecretExpiresOn: hints.clientSecret?.expiresOn ?? null,
        // Google: which key is in use (the id is not secret; the key itself never reaches an audit entry).
        serviceAccountKeyId: hints.serviceAccountKey?.privateKeyId ?? null,
        clientVersion: row?.clientVersion ?? 1,
    };
};

const hintFor = (secret: string, user: AuthUser, now: Date, expiresOn: string | null = null): SecretHint => ({
    last4: secret.slice(-4),
    updatedAt: now.toISOString(),
    updatedBy: user.username,
    expiresOn,
});

const keyHintFor = (key: ServiceAccountKey, user: AuthUser, now: Date): KeyHint => ({
    clientEmail: key.clientEmail,
    clientId: key.clientId,
    projectId: key.projectId,
    privateKeyId: key.privateKeyId,
    updatedAt: now.toISOString(),
    updatedBy: user.username,
});

const conflict = (message: string, code: string, path?: string[]) =>
    new HttpError(message, StatusCodes.CONFLICT, { code, errors: path ? [{ message, path }] : undefined });

export type TestSubjectRefusal = 'inactive' | 'group' | 'excluded' | 'not_company' | 'other_provider';

/**
 * Whether "Test connection" may act as this person on `provider`: only someone the provider would sync (the
 * impersonation is the same one sync uses, so it never reaches people sync leaves alone). A person with no email
 * passes here and the user step answers `no_email` without calling the provider. A domain no provider claims yet is
 * allowed, so an admin can test before saving the domains. Pure.
 */
export function testSubjectRefusal(
    provider: CalendarProvider,
    user: TargetUser,
    choice: TargetChoice | null,
    providers: readonly TargetProvider[],
    companyDomains: readonly string[],
): TestSubjectRefusal | null {
    if (!user.isActive) return 'inactive';
    if (user.isGroupUser) return 'group';
    if (choice?.excluded) return 'excluded';
    const email = normalizeUserEmail(user.email);
    if (!email) return null;
    if (!isCompanyEmail(email, companyDomains)) return 'not_company';
    const override = choice?.provider && isCalendarProvider(choice.provider) ? choice.provider : null;
    if (override) return override === provider ? null : 'other_provider';
    const domain = emailDomainOf(email);
    const owner = providers.find((p) => p.key !== 'fake' && p.domains.some((d) => d.toLowerCase() === domain));
    return owner && owner.key !== provider ? 'other_provider' : null;
}

const TEST_SUBJECT_REFUSALS: Readonly<Record<TestSubjectRefusal, (username: string, provider: CalendarProvider) => string>> = {
    inactive: (u) => `${u} is not active, so the CRM doesn't use their calendar.`,
    group: (u) => `${u} is a group login, so the CRM doesn't use its calendar.`,
    excluded: (u) => `${u} is excluded from calendar sync, so the CRM never acts on their calendar.`,
    not_company: (u) => `${u}'s email is not on a company domain.`,
    other_provider: (u, p) => `${u}'s calendar is not synced through ${p === 'fake' ? 'the test calendar' : PROVIDER_LABELS[p]}.`,
};

/** Health codes the app step alone proves fixed (the key / client credentials); every other one needs the user step. */
const APP_STEP_PROVES: Readonly<Partial<Record<IntegrationProviderKey, ReadonlySet<string>>>> = {
    google: new Set(['key_invalid', 'clock_skew', 'not_configured']),
    microsoft: new Set(['invalid_client', 'secret_expired', 'tenant_not_found', 'app_not_in_tenant', 'not_configured']),
};

/**
 * Whether a test's steps prove the provider's stored health problem fixed. A passing user step (impersonation or the
 * mailbox, plus one read) proves everything; a passing app step only the key / client codes. Google's app step mints
 * for the service account itself, so it says nothing about delegation, scopes or policies. Pure.
 */
export function healthClearedBy(provider: IntegrationProviderKey, healthCode: string | null, steps: readonly { step: string; ok: boolean }[]): boolean {
    if (steps.some((s) => s.step === 'user' && s.ok)) return true;
    const appOk = steps.some((s) => s.step === 'app' && s.ok);
    return appOk && healthCode !== null && Boolean(APP_STEP_PROVES[provider]?.has(healthCode));
}

const badField = (message: string, path: string[]) => new HttpError(message, StatusCodes.BAD_REQUEST, { code: 'VALIDATION_ERROR', errors: [{ message, path }] });

/**
 * The domains rule (addendum §3.2): each provider domain must be a company domain (400), and no domain may be in two
 * providers' lists (409 DOMAIN_IN_USE). Pure.
 */
export function assertProviderDomains(provider: IntegrationProviderKey, domains: readonly string[], companyDomains: readonly string[], others: { provider: IntegrationProviderKey; domains: readonly string[] }[]): void {
    const company = new Set(companyDomains.map((d) => d.toLowerCase()));
    for (const domain of domains) {
        if (!company.has(domain)) throw badField(`Add ${domain} to the company domains first.`, ['settings', 'domains']);
        const owner = others.find((o) => o.provider !== provider && o.domains.includes(domain));
        if (owner) throw conflict(`${domain} is already served by ${PROVIDER_LABELS[owner.provider]}. Remove it there first.`, 'DOMAIN_IN_USE', ['settings', 'domains']);
    }
}

/** Every provider row's domain list (for the domains rule). */
async function providerDomainLists(client: Pick<typeof prisma, 'integrationProvider'>): Promise<{ provider: IntegrationProviderKey; domains: string[] }[]> {
    const rows = await client.integrationProvider.findMany();
    return rows
        .filter((row) => DOMAIN_PROVIDERS.has(row.provider as IntegrationProviderKey))
        .map((row) => ({ provider: row.provider as IntegrationProviderKey, domains: domainsIn(providerSettings(row.provider as IntegrationProviderKey, row)) }));
}

/** After a provider changed: drop its grants everywhere in this process and enrol / stop people accordingly. */
/** Provider card counts: live rows by status, and excluded people on the provider their address belongs to. */
async function providerCounts(): Promise<Map<string, ConnectionCounts>> {
    const context = await loadEnrolmentContext();
    return connectionCountsByProvider((person) => providerServing(person.email, person.provider, context));
}

/** Webhook channel counts per provider (P2-7); nothing is read while webhooks are off. */
async function providerWebhookCounts(now: Date): Promise<Map<string, WebhookCounts>> {
    return ENV.INTEGRATIONS.WEBHOOKS_ACTIVE ? webhookCountsByProvider(now) : new Map();
}

async function afterProviderChange(provider: IntegrationProviderKey, user: AuthUser): Promise<void> {
    dropProviderCredentialsCache(provider);
    if (isCalendarProvider(provider)) tokenSource.invalidate(provider);
    if (DOMAIN_PROVIDERS.has(provider)) await reconcileAllQuietly('provider_saved', { actor: user.username });
}

export const integrationService = {
    async getAdmin(now: Date = new Date()): Promise<IntegrationsAdminDto> {
        const [rows, configs, counts, worker, webhooks] = await Promise.all([
            prisma.integrationProvider.findMany(),
            formConfigService.getAllConfigs(),
            providerCounts(),
            readWorkerHeartbeat(),
            providerWebhookCounts(now),
        ]);
        const byProvider = new Map(rows.map((row) => [row.provider, row]));
        const providers = INTEGRATION_PROVIDERS.map((p) => toProviderDto(p, byProvider.get(p) ?? null, now, counts.get(p), webhooks.get(p)));
        const anyUnreadable = providers.some((p) => !p.secret.readable || (p.serviceAccount && !p.serviceAccount.readable));
        const { KEY_CONFIGURED, ACTIVE_KEY_ID, PUBLIC_API_URL, PUBLIC_API_URL_CONFIGURED } = ENV.INTEGRATIONS;
        return {
            ready: { ok: KEY_CONFIGURED, reason: KEY_CONFIGURED ? null : 'key_missing' },
            keyStatus: !secretBox.ready() ? 'missing' : anyUnreadable ? 'unreadable' : 'ok',
            activeKeyId: ACTIVE_KEY_ID,
            publicApiUrl: PUBLIC_API_URL,
            publicApiUrlConfigured: PUBLIC_API_URL_CONFIGURED,
            webhooksActive: ENV.INTEGRATIONS.WEBHOOKS_ACTIVE,
            webhooksOffReason: ENV.INTEGRATIONS.WEBHOOKS_OFF_REASON,
            pollMinutesWithWebhooks: Math.max(pollMinutes(), ENV.INTEGRATIONS.POLL_MINUTES_WITH_WEBHOOKS),
            fakeProvider: isFakeProviderEnabled(),
            worker,
            workerStatus: workerStatusOf(isHeartbeatRedisReady(), worker),
            syncEnabled: ENV.INTEGRATIONS.SYNC_ENABLED,
            providers,
            settings: calendarSettingsFrom(configs),
            syncTypes: syncTypesFrom(configs),
        };
    },

    async getProvider(provider: IntegrationProviderKey): Promise<ProviderAdminDto> {
        const now = new Date();
        const [row, counts, webhooks] = await Promise.all([prisma.integrationProvider.findUnique({ where: { provider } }), providerCounts(), providerWebhookCounts(now)]);
        return toProviderDto(provider, row, now, counts.get(provider), webhooks.get(provider));
    },

    /**
     * Saves a provider (partial). Secrets are write-only: an omitted one is kept, a new one needs the encryption key
     * (503 INTEGRATIONS_NOT_READY).
     *   - Google: `serviceAccountKey` (the key file's text; 400 VALIDATION_ERROR when it isn't a usable service account
     *     key). Its numeric client id becomes `clientId` (a typed client id is refused).
     *   - Microsoft: `clientId`, `clientSecret`, `clientSecretExpiresOn`, `settings.tenantId` (required to enable).
     *   - `settings.domains` (calendar providers): each a company domain (400) and served by one provider only (409
     *     DOMAIN_IN_USE).
     * Any credentials change (key, client id, secret, tenant) bumps `clientVersion` (cached tokens of the old
     * credentials are never used again) and clears the last test and the health. Switching on needs complete
     * credentials (409 INTEGRATION_NOT_CONFIGURED) and a passing app-level test since the last credentials change (409
     * INTEGRATION_NOT_TESTED); Zoom can't be switched on yet (409 INTEGRATION_NOT_AVAILABLE). Audited
     * `IntegrationProvider CREATE / UPDATE` with `secretChanged` / `serviceAccountKeyChanged: true`, never a value.
     * After the commit, people are enrolled or stopped to match (reconcileAll).
     */
    async saveProvider(provider: IntegrationProviderKey, body: unknown, user: AuthUser, now: Date = new Date()): Promise<ProviderAdminDto> {
        const input = saveProviderSchema.parse(body);
        const settingsPatch: Record<string, unknown> = input.settings === undefined ? {} : providerSettingsSchemas[provider].parse(input.settings);
        if (input.webhookSecret !== undefined && !PROVIDERS_WITH_WEBHOOK_SECRET.has(provider)) {
            throw HttpError.badRequest(`${PROVIDER_LABELS[provider]} has no webhook secret.`, [{ message: 'Not used by this provider.', path: ['webhookSecret'] }]);
        }
        if (input.clientSecretExpiresOn !== undefined && !PROVIDERS_WITH_SECRET_EXPIRY.has(provider)) {
            throw HttpError.badRequest(`${PROVIDER_LABELS[provider]} secrets have no expiry date.`, [{ message: 'Not used by this provider.', path: ['clientSecretExpiresOn'] }]);
        }
        if (input.clientSecret !== undefined && !PROVIDERS_WITH_CLIENT_SECRET.has(provider)) {
            throw HttpError.badRequest(`${PROVIDER_LABELS[provider]} uses a service account key, not a client secret.`, [{ message: 'Upload the service account key instead.', path: ['clientSecret'] }]);
        }
        if (input.serviceAccountKey !== undefined && provider !== 'google') {
            throw HttpError.badRequest(`${PROVIDER_LABELS[provider]} has no service account key.`, [{ message: 'Not used by this provider.', path: ['serviceAccountKey'] }]);
        }
        if (input.clientId !== undefined && provider === 'google') {
            throw HttpError.badRequest("Google's client ID comes from the service account key.", [{ message: 'Upload the key instead.', path: ['clientId'] }]);
        }
        let newKey: ServiceAccountKey | null = null;
        if (input.serviceAccountKey !== undefined) {
            try {
                newKey = parseServiceAccountKey(input.serviceAccountKey);
            } catch (err) {
                if (err instanceof ServiceAccountKeyError) throw badField(err.message, ['serviceAccountKey']);
                throw err;
            }
        }
        const newSecret = input.clientSecret !== undefined || input.webhookSecret !== undefined || newKey !== null;
        if (newSecret && !secretBox.ready()) throw notReady();
        const domainsTouched = settingsPatch.domains !== undefined;
        const companyDomains = domainsTouched ? (await loadCalendarSettings()).companyDomains : [];

        const { before, after } = await runInTransaction(async (tx) => {
            await acquireLocks(tx, [`integration-provider:${provider}`, domainsTouched ? DOMAINS_LOCK : null]);
            const before = await tx.integrationProvider.findUnique({ where: { provider } });
            const opened = openSecrets(before);
            const hints = parseJson<SecretHints>(before?.secretHintsJson, {});
            const beforeSettings = providerSettings(provider, before);
            const settings: Record<string, unknown> = { ...beforeSettings, ...settingsPatch };
            if (domainsTouched) assertProviderDomains(provider, domainsIn(settings), companyDomains, await providerDomainLists(tx));
            const clientId = newKey ? newKey.clientId : input.clientId !== undefined ? input.clientId : (before?.clientId ?? null);

            // Secrets that can't be opened any more stay as they are until a new one is entered (a key mix-up between
            // processes must not wipe them); a new secret then replaces the whole sealed set.
            const replaceUnreadable = !opened.readable && newSecret;
            const secrets: ProviderSecrets = opened.readable ? { ...opened.secrets } : {};
            const nextHints: SecretHints = replaceUnreadable ? {} : { ...hints };
            if (newKey) {
                secrets.serviceAccountKey = input.serviceAccountKey;
                nextHints.serviceAccountKey = keyHintFor(newKey, user, now);
            }
            if (input.clientSecret !== undefined) {
                secrets.clientSecret = input.clientSecret;
                nextHints.clientSecret = hintFor(input.clientSecret, user, now, input.clientSecretExpiresOn ?? null);
            } else if (input.clientSecretExpiresOn !== undefined && nextHints.clientSecret) {
                nextHints.clientSecret = { ...nextHints.clientSecret, expiresOn: input.clientSecretExpiresOn };
            }
            if (input.webhookSecret !== undefined) {
                secrets.webhookSecret = input.webhookSecret;
                nextHints.webhookSecret = hintFor(input.webhookSecret, user, now);
            }

            const credentialsChanged =
                newKey !== null || input.clientSecret !== undefined || clientId !== (before?.clientId ?? null) || (settings.tenantId ?? null) !== (beforeSettings.tenantId ?? null);
            const clientVersion = (before?.clientVersion ?? 1) + (credentialsChanged && before ? 1 : 0);
            if (credentialsChanged) delete nextHints.appTest;

            const enabled = input.enabled ?? Boolean(before?.enabled);
            if (enabled && !before?.enabled && !ENABLEABLE_PROVIDERS.has(provider)) {
                throw conflict(`${PROVIDER_LABELS[provider]} can be switched on when video meetings arrive (Phase 3). Its credentials are stored.`, 'INTEGRATION_NOT_AVAILABLE', ['enabled']);
            }
            if (enabled) {
                const readable = opened.readable || newSecret;
                if (!isConfigured(provider, clientId, secrets, readable, settings)) {
                    if (provider === 'microsoft' && clientId && secrets.clientSecret && readable && !settings.tenantId) {
                        throw badField('Enter the Tenant ID before switching Microsoft 365 on.', ['settings', 'tenantId']);
                    }
                    const unreadable = !readable || (hints.clientSecret && !secrets.clientSecret) || (hints.serviceAccountKey && !secrets.serviceAccountKey);
                    throw conflict(
                        unreadable
                            ? "The stored credentials can't be read with the current key. Enter them again, then switch the provider on."
                            : provider === 'google'
                              ? 'Upload the service account key before switching Google Workspace on.'
                              : 'Enter the client ID and client secret before switching the provider on.',
                        'INTEGRATION_NOT_CONFIGURED',
                        ['enabled'],
                    );
                }
                if (!before?.enabled && ENABLEABLE_PROVIDERS.has(provider) && !appTestedFor(nextHints, clientVersion)) {
                    throw conflict('Run "Test connection" with these credentials first. The provider can be switched on once the app check passes.', 'INTEGRATION_NOT_TESTED', ['enabled']);
                }
            }

            const secretsEnc = newSecret ? secretBox.seal(JSON.stringify(secrets), SECRETS_AAD(provider)) : (before?.secretsEnc ?? null);
            const data = {
                enabled,
                clientId,
                secretsEnc,
                keyId: secretsEnc === (before?.secretsEnc ?? null) ? (before?.keyId ?? null) : secretsEnc ? secretBox.activeKid() : null,
                secretHintsJson: Object.keys(nextHints).length > 0 ? JSON.stringify(nextHints) : null,
                settingsJson: JSON.stringify(settings),
                clientVersion,
                ...(credentialsChanged ? { lastTestAt: null, lastTestOk: null, lastTestMessage: null, healthStatus: 'unknown', healthCode: null, healthAt: null } : {}),
                updatedBy: user.username,
            };
            const row = await tx.integrationProvider.upsert({ where: { provider }, create: { provider, ...data }, update: data });

            const changes: Record<string, unknown> = {};
            const from = auditSnapshot(provider, before);
            const to = auditSnapshot(provider, row);
            for (const key of Object.keys(to) as (keyof typeof to)[]) {
                if (JSON.stringify(from[key]) !== JSON.stringify(to[key])) changes[key] = { from: from[key], to: to[key] };
            }
            if (input.clientSecret !== undefined) changes.secretChanged = true;
            if (input.webhookSecret !== undefined) changes.webhookSecretChanged = true;
            if (newKey) changes.serviceAccountKeyChanged = true;
            if (Object.keys(changes).length > 0) {
                await auditService.record(tx, { entityType: 'IntegrationProvider', entityId: provider, action: before ? 'UPDATE' : 'CREATE', changedBy: user.username, changes });
            }
            return { before, after: row };
        });
        const wasLive = Boolean(before?.enabled);
        const affectsPeople = wasLive !== after.enabled || domainsTouched || (after.enabled && after.clientVersion !== (before?.clientVersion ?? 1));
        if (affectsPeople) await afterProviderChange(provider, user);
        else dropProviderCredentialsCache(provider);
        return integrationService.getProvider(provider);
    },

    /** Removes the stored secrets (Google: the key) and switches the provider off; live rows stop (`provider_removed`). */
    async clearSecret(provider: IntegrationProviderKey, user: AuthUser): Promise<ProviderAdminDto> {
        await runInTransaction(async (tx) => {
            await acquireLocks(tx, [`integration-provider:${provider}`]);
            const before = await tx.integrationProvider.findUnique({ where: { provider } });
            if (!before || (!before.secretsEnc && !before.secretHintsJson && !before.enabled)) return before;
            const row = await tx.integrationProvider.update({
                where: { provider },
                data: {
                    enabled: false,
                    secretsEnc: null,
                    keyId: null,
                    secretHintsJson: null,
                    ...(provider === 'google' ? { clientId: null } : {}),
                    clientVersion: before.clientVersion + 1,
                    lastTestAt: null,
                    lastTestOk: null,
                    lastTestMessage: null,
                    healthStatus: 'unknown',
                    healthCode: null,
                    healthAt: null,
                    updatedBy: user.username,
                },
            });
            await auditService.record(tx, {
                entityType: 'IntegrationProvider',
                entityId: provider,
                action: 'UPDATE',
                changedBy: user.username,
                changes: { secretCleared: true, ...(before.enabled ? { enabled: { from: true, to: false } } : {}) },
            });
            return row;
        });
        await afterProviderChange(provider, user);
        return integrationService.getProvider(provider);
    },

    /**
     * "Test connection" with the saved credentials (two steps, see integration.test-connection.ts). `asUsername`
     * also tries that person's calendar as them: only someone the provider would sync (active, not a group login, not
     * excluded, a company email not served by the other provider; else 409 CALENDAR_TEST_NOT_ALLOWED), and every such
     * run is audited (`IntegrationProvider TEST_AS_USER`: who acted as whom, the result code, never a token). The result
     * is stored on the row, and a passing app-level step is remembered for these credentials (needed to switch on),
     * unless the credentials changed while the probe ran, which answers `credentials_changed` instead. Provider health
     * goes back to ok only for a problem the test proved fixed (`healthClearedBy`).
     */
    async testProvider(
        provider: IntegrationProviderKey,
        body: unknown,
        actor: AuthUser,
        fetchImpl: FetchImpl = (input, init) => fetch(input, init),
        now: Date = new Date(),
    ): Promise<TestConnectionDto> {
        const { asUsername } = testProviderBodySchema.parse(body ?? {});
        const row = await prisma.integrationProvider.findUnique({ where: { provider } });
        if (row?.secretsEnc && !secretBox.ready()) throw notReady();
        const { secrets, readable } = openSecrets(row);
        const settings = providerSettings(provider, row);
        let subject: { username: string; email: string | null } | null = null;
        if (asUsername) {
            const [person, choice] = await Promise.all([
                prisma.user.findUnique({ where: { username: asUsername }, select: { username: true, email: true, isActive: true, isGroupUser: true } }),
                prisma.calendarSyncUser.findUnique({ where: { username: asUsername }, select: { provider: true, excluded: true } }),
            ]);
            if (!person) throw HttpError.notFound(`User '${asUsername}' not found.`);
            if (isCalendarProvider(provider)) {
                const context = await loadEnrolmentContext();
                const refusal = testSubjectRefusal(provider, person, choice, context.providers, context.companyDomains);
                if (refusal) throw conflict(TEST_SUBJECT_REFUSALS[refusal](person.username, provider), 'CALENDAR_TEST_NOT_ALLOWED', ['asUsername']);
            }
            subject = { username: person.username, email: person.email };
        }

        let result: TestResult;
        if (!ENABLEABLE_PROVIDERS.has(provider)) {
            result = notAvailable(provider);
        } else if (!readable) {
            result = notConfigured("The stored credentials can't be read with the current key. Enter them again and save.");
        } else if (provider === 'google') {
            let key: ServiceAccountKey | null = null;
            try {
                key = secrets.serviceAccountKey ? parseServiceAccountKey(secrets.serviceAccountKey) : null;
            } catch {
                key = null;
            }
            result = key ? await testGoogle(key, subject, fetchImpl, now) : notConfigured('Upload the service account key and save first.');
        } else if (!row?.clientId || !secrets.clientSecret) {
            result = notConfigured('Save a client ID and client secret first.');
        } else if (typeof settings.tenantId !== 'string' || !settings.tenantId) {
            result = notConfigured('Enter the Tenant ID and save first.');
        } else {
            result = await testMicrosoft({ clientId: row.clientId, clientSecret: secrets.clientSecret, tenantId: settings.tenantId }, subject, fetchImpl, now);
        }

        if (row && result.code !== 'not_available') {
            const appStep = result.steps.find((s) => s.step === 'app');
            const hints = parseJson<SecretHints>(row.secretHintsJson, {});
            const nextHints: SecretHints = { ...hints };
            if (appStep?.ok) nextHints.appTest = { ok: true, version: row.clientVersion, at: now.toISOString() };
            else delete nextHints.appTest;
            const clearHealth = row.healthStatus === 'error' && healthClearedBy(provider, row.healthCode, result.steps);
            // Only stored while the tested credentials are still the saved ones: a save (or secret removal) during the
            // probe clears lastTest*, and this result must not paint a pass / fail on credentials it never tried.
            const { count } = await prisma.integrationProvider.updateMany({
                where: { provider, clientId: row.clientId, secretsEnc: row.secretsEnc, clientVersion: row.clientVersion },
                data: {
                    lastTestAt: now,
                    lastTestOk: result.ok,
                    lastTestMessage: result.message.slice(0, 300),
                    secretHintsJson: Object.keys(nextHints).length > 0 ? JSON.stringify(nextHints) : null,
                    ...(clearHealth ? { healthStatus: 'ok', healthCode: null, healthAt: now } : {}),
                },
            });
            if (count === 0) {
                const message = 'The credentials were changed while this test ran. Run the test again.';
                result = { ok: false, code: 'credentials_changed', message, steps: [{ step: 'app', ok: false, code: 'credentials_changed', message }] };
            } else {
                dropProviderCredentialsCache(provider);
                // The app-level negative cache stays while health keeps a problem this test didn't prove fixed.
                if (appStep?.ok && isCalendarProvider(provider) && (row.healthStatus !== 'error' || clearHealth)) tokenSource.invalidate(provider);
            }
        }
        if (subject) {
            const userStep = result.steps.find((s) => s.step === 'user');
            await runInTransaction(async (tx) => {
                await auditService.record(tx, {
                    entityType: 'IntegrationProvider',
                    entityId: provider,
                    action: 'TEST_AS_USER',
                    changedBy: actor.username,
                    changes: { asUsername: subject.username, ok: result.ok, code: result.code, userStep: userStep ? userStep.code : null },
                });
            });
        }
        logger.info(
            { provider, by: actor.username, asUsername: subject?.username, ok: result.ok, code: result.code, steps: result.steps.map((s) => `${s.step}:${s.code}`) },
            'Integration test connection',
        );
        return { ...result, testedAt: now.toISOString() };
    },

    async getSyncTypes(): Promise<SyncTypeDto[]> {
        return syncTypesFrom(await formConfigService.getAllConfigs());
    },

    /**
     * `{ "<Followup Type>": true | false }` → option meta `calendarSync` on each changed option, through the Form
     * Builder's own option update (validated by metaSchema, audited `DropdownOption UPDATE`, form-config cache dropped).
     * Task / Note can't be switched on (400); unknown types 400.
     */
    async saveSyncTypes(body: unknown, user: AuthUser): Promise<SyncTypeDto[]> {
        const input = syncTypesBodySchema.parse(body);
        const configs = await formConfigService.getAllConfigs(true);
        const options = configs.categories.find((c) => c.key === FOLLOWUP_TYPE_CATEGORY_KEY)?.options ?? [];
        const byValue = new Map(options.map((o) => [o.value.trim().toLowerCase(), o]));
        const issues: { message: string; path: string[] }[] = [];
        const changes: { id: string; meta: Record<string, unknown> }[] = [];
        for (const [value, on] of Object.entries(input)) {
            const option = byValue.get(value.trim().toLowerCase());
            if (!option) {
                issues.push({ message: `"${value}" is not a Followup Type.`, path: [value] });
                continue;
            }
            if (isActivityOnlyFollowupType(option.value)) {
                if (on) issues.push({ message: TASK_NOTE_LOCK_REASON, path: [value] });
                continue;
            }
            // Unchanged in effect (a missing switch already means on).
            if (calendarSyncFromMeta(option.meta, false) === on) continue;
            changes.push({ id: option.id, meta: { ...(option.meta ?? {}), [CALENDAR_SYNC_META_KEY]: on } });
        }
        if (issues.length > 0) throw HttpError.badRequest(issues[0].message, issues);
        for (const change of changes) await formConfigService.updateOption(change.id, { meta: change.meta }, user);
        if (changes.length > 0) await invalidateFormConfigCaches();
        return integrationService.getSyncTypes();
    },

    /** Active, non-group users (the population of the email rule and of calendar sync) with their email issue and calendar. */
    async listPeople(query: unknown = {}): Promise<PersonDto[]> {
        const { search, issue } = peopleQuerySchema.parse(query ?? {}) as PeopleQuery;
        const [users, context, connections, choices] = await Promise.all([userEmailService.listForEmailRule(), loadEnrolmentContext(), liveConnectionsByUsername(), calendarChoicesByUsername()]);
        return peopleFrom(users, context.companyDomains, { search, issue }, { connections, choices, context });
    },

    /** Sets a person's company email through the users email service (the one rule for Users.email; it also moves their calendar sync). */
    async setPersonEmail(username: string, body: unknown, user: AuthUser): Promise<PersonDto> {
        const settings = await loadCalendarSettings();
        await userEmailService.setEmail(username, body, { companyDomains: settings.companyDomains, actor: user });
        return integrationService.getPerson(username);
    },

    /** One People row. */
    async getPerson(username: string): Promise<PersonDto> {
        const [users, context, connections, choices] = await Promise.all([userEmailService.listForEmailRule(), loadEnrolmentContext(), liveConnectionsByUsername(), calendarChoicesByUsername()]);
        const row = users.find((u) => u.username.toLowerCase() === username.toLowerCase());
        if (!row) throw HttpError.notFound(`User '${username}' not found.`);
        return toPerson(row, duplicateEmailsAmong(users), context.companyDomains, { connections, choices, context });
    },

    /**
     * PUT /people/:username/calendar: the admin's calendar choice for one person (provider override, exclusion with a
     * note, P2-8 `importMeetings`). Stored in CalendarSyncUser (a row only while something differs from the default;
     * audited `CalendarSyncUser CREATE / UPDATE / DELETE`), then the person is reconciled at once. Turning
     * `importMeetings` on needs the company switch (409 MEETING_IMPORT_OFF) and starts one full pull of their calendar.
     */
    async setPersonCalendar(username: string, body: unknown, admin: AuthUser): Promise<PersonDto> {
        const input = personCalendarBodySchema.parse(body);
        if (input.provider === 'fake' && !isFakeProviderEnabled()) {
            throw badField('The test calendar is only available while CALENDAR_FAKE_PROVIDER is on (development).', ['provider']);
        }
        const target = await prisma.user.findUnique({ where: { username }, select: { username: true } });
        if (!target) throw HttpError.notFound(`User '${username}' not found.`);
        const owner = target.username;
        if (input.importMeetings === true) {
            // P2-8: the per-person switch needs the company switch (Admin › API Integrations › Calendar sync settings).
            if (!(await loadCalendarSettings()).allowMeetingImport) {
                throw conflict('Turn on "Bring in meetings with customers" in the calendar sync settings first.', 'MEETING_IMPORT_OFF', ['importMeetings']);
            }
        }

        // P2-8: import turned on for this person (and they aren't excluded) → one full pull after the commit.
        let importTurnedOn = false;
        await runInTransaction(async (tx) => {
            await acquireLocks(tx, [calendarConnectionUserLockKey(owner)]);
            const before = await tx.calendarSyncUser.findUnique({ where: { username: owner } });
            const next = {
                provider: input.provider !== undefined ? input.provider : (before?.provider ?? null),
                excluded: input.excluded ?? before?.excluded ?? false,
                note: input.note !== undefined ? input.note : (before?.note ?? null),
                importMeetings: input.importMeetings ?? before?.importMeetings ?? false,
            };
            const snapshot = (v: typeof next | null) => ({ provider: v?.provider ?? null, excluded: v?.excluded ?? false, note: v?.note ?? null, importMeetings: v?.importMeetings ?? false });
            const from = snapshot(before);
            const to = snapshot(next);
            const changes: Record<string, unknown> = {};
            for (const key of Object.keys(to) as (keyof typeof to)[]) if (from[key] !== to[key]) changes[key] = { from: from[key], to: to[key] };
            if (Object.keys(changes).length === 0) return;
            importTurnedOn = to.importMeetings && !to.excluded && !(from.importMeetings && !from.excluded);
            const isDefault = !to.provider && !to.excluded && !to.note && !to.importMeetings;
            if (isDefault) {
                if (before) await tx.calendarSyncUser.delete({ where: { username: owner } });
            } else {
                await tx.calendarSyncUser.upsert({ where: { username: owner }, create: { username: owner, ...to, updatedBy: admin.username }, update: { ...to, updatedBy: admin.username } });
            }
            await auditService.record(tx, {
                entityType: 'CalendarSyncUser',
                entityId: owner,
                action: !before ? 'CREATE' : isDefault ? 'DELETE' : 'UPDATE',
                changedBy: admin.username,
                changes: { username: owner, ...changes },
            });
        });
        await reconcileUser(owner, 'people_choice', { actor: admin.username });
        // Meetings already in their calendar: incremental pulls only see events that change (sync.wake.ts).
        if (importTurnedOn) await startImportPulls([owner]);
        return integrationService.getPerson(owner);
    },

    /** POST /people/:username/calendar/check: "Check now" on the person's live row. 409 CALENDAR_NOT_SYNCED without one. */
    async checkPersonCalendar(username: string): Promise<PersonDto & { check: CheckOutcome }> {
        const live = await prisma.calendarConnection.findFirst({ where: { username, status: { in: ['pending', 'ok', 'error'] } }, select: { id: true } });
        if (!live) throw conflict("This person's calendar isn't synced, so there is nothing to check.", 'CALENDAR_NOT_SYNCED');
        const check = await checkConnection(live.id);
        return { ...(await integrationService.getPerson(username)), check };
    },

    /** Admin "Sync now" (P2-5): the person's calendar changes pulled now (queued when Redis is up). */
    async syncPersonCalendar(username: string): Promise<PersonDto & { sync: PullRequestResult }> {
        const live = await prisma.calendarConnection.findFirst({ where: { username, status: { in: ['pending', 'ok', 'error'] } }, select: { id: true } });
        if (!live) throw conflict("This person's calendar isn't synced, so there is nothing to sync.", 'CALENDAR_NOT_SYNCED');
        // On demand: the pull modules sit on top of the activity services (no import cycle at load time).
        const { requestPull } = await import('../calendar-sync/pull.requests.js');
        const sync = await requestPull(username, 'admin');
        return { ...(await integrationService.getPerson(username)), sync };
    },
};

export interface PeopleCalendarData {
    connections?: ReadonlyMap<string, PersonConnectionDto>;
    choices?: ReadonlyMap<string, PersonCalendarChoiceDto>;
    context?: EnrolmentContext;
}

function calendarOf(user: UserEmailRow, data: PeopleCalendarData): PersonCalendarDto {
    const key = user.username.toLowerCase();
    const choice = data.choices?.get(key) ?? null;
    const connection = data.connections?.get(key) ?? null;
    if (!data.context) return { target: null, reason: null, connection, choice };
    const target = resolveTarget(user, choice, data.context.providers, data.context.companyDomains, data.context.fakeOn);
    return 'none' in target
        ? { target: null, reason: NOT_SYNCED_REASON_FOR[target.none], connection, choice }
        : { target: { provider: target.provider, email: target.email, source: target.source }, reason: null, connection, choice };
}

function toPerson(user: UserEmailRow, duplicates: ReadonlySet<string>, companyDomains: readonly string[], data: PeopleCalendarData = {}): PersonDto {
    return {
        username: user.username,
        fullName: user.fullName || user.username,
        department: user.department,
        role: user.role,
        email: user.email,
        emailIssue: emailIssueFor(user.email, duplicates, companyDomains),
        calendar: calendarOf(user, data),
    };
}

/** The People list from every user: active non-group only, filtered by search text and issue. Pure. */
export function peopleFrom(users: readonly UserEmailRow[], companyDomains: readonly string[], filter: PeopleQuery = {}, data: PeopleCalendarData = {}): PersonDto[] {
    const duplicates = duplicateEmailsAmong(users);
    const needle = filter.search?.toLowerCase();
    return users
        .filter((u) => u.isActive && !u.isGroupUser)
        .map((u) => toPerson(u, duplicates, companyDomains, data))
        .filter((p) => !needle || [p.username, p.fullName, p.email ?? '', p.department ?? ''].some((v) => v.toLowerCase().includes(needle)))
        .filter((p) => {
            if (!filter.issue) return true;
            if (filter.issue === 'calendar_problem') return p.calendar.connection?.status === 'error';
            return filter.issue === 'any' ? p.emailIssue !== null : p.emailIssue === filter.issue;
        });
}
