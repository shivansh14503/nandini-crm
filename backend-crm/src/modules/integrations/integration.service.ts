import { StatusCodes } from 'http-status-codes';
import { ENV } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { prisma } from '../../config/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { auditService } from '../../services/audit.service.js';
import { secretBox, SecretBoxError } from '../../services/secretBox.js';
import type { AuthUser } from '../../types/user.types.js';
import { HttpError } from '../../utils/httpError.js';
import { FOLLOWUP_TYPE_CATEGORY_KEY } from '../form-configs/formConfig.defaults.js';
import { formConfigService, invalidateFormConfigCaches, type FormConfigsPayload } from '../form-configs/formConfig.service.js';
import { isActivityOnlyFollowupType } from '../shared/followupTypes.js';
import { acquireLocks, runInTransaction } from '../shared/transactions.js';
import { duplicateEmailsAmong, emailIssueFor, userEmailService, type UserEmailIssue, type UserEmailRow } from '../users/userEmail.service.js';
import { connectionCountsByProvider, liveConnectionsByUsername, type ConnectionCounts, type PersonConnectionDto } from '../calendar-sync/connection.queries.js';
import { CALENDAR_SYNC_META_KEY, calendarSyncFromMeta, type CalendarSyncSettings } from './calendarSyncSettings.js';
import {
    ENABLEABLE_PROVIDERS,
    INTEGRATION_PROVIDERS,
    PROVIDER_KINDS,
    PROVIDER_LABELS,
    PROVIDERS_WITH_SECRET_EXPIRY,
    PROVIDERS_WITH_WEBHOOK_SECRET,
    SECRET_EXPIRY_WARNING_DAYS,
    redirectUriFor,
    webhookUrlsFor,
    type IntegrationProviderKey,
} from './integration.constants.js';
import { calendarSettingsFrom, loadCalendarSettings } from './integration.settings.js';
import { probeProvider, type FetchLike, type TestResult } from './integration.test-connection.js';
import {
    PROVIDER_SETTINGS_DEFAULTS,
    peopleQuerySchema,
    providerSettingsSchemas,
    saveProviderSchema,
    syncTypesBodySchema,
    type PeopleQuery,
} from './integration.validator.js';

/**
 * Admin › API Integrations (Calendar Phase 2, P2-1): the company's OAuth apps for Google Workspace, Microsoft 365 and
 * Zoom (client id, sealed secrets, settings, "Test connection"), the calendar-sync settings, which Followup Types go
 * to calendars, and the People list with company emails. Secrets are write-only: no DTO, log line or audit entry
 * carries one (audits say `secretChanged: true`). Everything is off until an admin switches a provider on.
 */

type ProviderRow = Prisma.IntegrationProviderGetPayload<object>;

interface SecretHint {
    last4: string;
    updatedAt: string;
    updatedBy: string;
    expiresOn?: string | null;
}
interface SecretHints {
    clientSecret?: SecretHint;
    webhookSecret?: SecretHint;
}
interface ProviderSecrets {
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

export interface ProviderAdminDto {
    provider: IntegrationProviderKey;
    label: string;
    kind: 'calendar' | 'video';
    /** False for Zoom until video meetings ship: credentials can be stored, the switch stays off. */
    available: boolean;
    enabled: boolean;
    /** Client id and a readable client secret are stored (and, for Microsoft, a tenant). */
    configured: boolean;
    clientId: string | null;
    secret: SecretSummaryDto;
    /** Zoom only. */
    webhookSecret: SecretSummaryDto | null;
    settings: Record<string, unknown>;
    redirectUri: string | null;
    webhookUrls: string[] | null;
    lastTest: { at: string; ok: boolean; message: string | null } | null;
    clientVersion: number;
    /** Employees' live connections by status. */
    counts: { active: number; reauth: number; error: number };
    updatedAt: string | null;
    updatedBy: string | null;
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
    ready: { ok: boolean; reason: 'key_missing' | 'public_url_missing' | null };
    keyStatus: KeyStatus;
    activeKeyId: string | null;
    publicApiUrl: string | null;
    /** PUBLIC_API_URL was set in the environment (false = the localhost default outside production). */
    publicApiUrlConfigured: boolean;
    /** Calendar webhooks are live (Calendar Phase 2 P2-7, needs https); false until then. */
    webhooksActive: boolean;
    /** The calendar sync worker's last heartbeat (P2-3); null until then. */
    worker: { lastSeenAt: string } | null;
    providers: ProviderAdminDto[];
    settings: CalendarSyncSettings;
    syncTypes: SyncTypeDto[];
}

export interface PersonDto {
    username: string;
    fullName: string;
    department: string | null;
    role: string;
    email: string | null;
    emailIssue: UserEmailIssue | null;
    /** The person's live calendar connection (active, reauth_required or error); null when not connected. */
    connection: PersonConnectionDto | null;
}

export interface TestConnectionDto extends TestResult {
    testedAt: string;
}

const SECRETS_AAD = (provider: IntegrationProviderKey) => `IntegrationProvider:${provider}:secrets`;
const TASK_NOTE_LOCK_REASON = 'Tasks and notes never go to calendars.';

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

const providerSettings = (provider: IntegrationProviderKey, row: Pick<ProviderRow, 'settingsJson'> | null): Record<string, unknown> => ({
    ...PROVIDER_SETTINGS_DEFAULTS[provider],
    ...parseJson<Record<string, unknown>>(row?.settingsJson, {}),
});

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

/** Whether a provider has what Connect needs: a client id, a readable client secret, and Microsoft's tenant. */
function isConfigured(provider: IntegrationProviderKey, clientId: string | null, secrets: ProviderSecrets, readable: boolean, settings: Record<string, unknown>): boolean {
    if (!clientId || !readable || !secrets.clientSecret) return false;
    if (provider === 'microsoft' && !settings.tenantId) return false;
    return true;
}

export function toProviderDto(provider: IntegrationProviderKey, row: ProviderRow | null, now: Date = new Date(), counts?: ConnectionCounts): ProviderAdminDto {
    const { secrets, readable } = openSecrets(row);
    const hints = parseJson<SecretHints>(row?.secretHintsJson, {});
    const settings = providerSettings(provider, row);
    const stored = Boolean(row?.secretsEnc);
    const publicApiUrl = ENV.INTEGRATIONS.PUBLIC_API_URL;
    return {
        provider,
        label: PROVIDER_LABELS[provider],
        kind: PROVIDER_KINDS[provider],
        available: ENABLEABLE_PROVIDERS.has(provider),
        enabled: Boolean(row?.enabled),
        configured: isConfigured(provider, row?.clientId ?? null, secrets, readable, settings),
        clientId: row?.clientId ?? null,
        secret: secretSummary(hints.clientSecret, stored, readable, now),
        webhookSecret: PROVIDERS_WITH_WEBHOOK_SECRET.has(provider) ? secretSummary(hints.webhookSecret, stored && Boolean(hints.webhookSecret), readable, now) : null,
        settings,
        redirectUri: redirectUriFor(provider, publicApiUrl),
        webhookUrls: webhookUrlsFor(provider, publicApiUrl),
        lastTest: row?.lastTestAt ? { at: row.lastTestAt.toISOString(), ok: Boolean(row.lastTestOk), message: row.lastTestMessage } : null,
        clientVersion: row?.clientVersion ?? 1,
        counts: counts ?? { active: 0, reauth: 0, error: 0 },
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

// ── Credentials for the calendar connect flow (P2-2): in-process cache, dropped on every save ──────────────────

export interface ProviderCredentials {
    provider: IntegrationProviderKey;
    enabled: boolean;
    configured: boolean;
    clientId: string | null;
    clientSecret: string | null;
    webhookSecret: string | null;
    settings: Record<string, unknown>;
    clientVersion: number;
}

const CREDENTIALS_TTL_MS = 60_000;
const credentialsCache = new Map<IntegrationProviderKey, { at: number; value: ProviderCredentials }>();

/** Forgets cached credentials (a save in this process; other processes see it within 60 s). */
export function dropProviderCredentialsCache(provider?: IntegrationProviderKey): void {
    if (provider) credentialsCache.delete(provider);
    else credentialsCache.clear();
}

/** A provider's decrypted credentials for OAuth / token calls, cached for 60 s in this process. Never logged. */
export async function loadProviderCredentials(provider: IntegrationProviderKey, now: number = Date.now()): Promise<ProviderCredentials> {
    const cached = credentialsCache.get(provider);
    if (cached && now - cached.at < CREDENTIALS_TTL_MS) return cached.value;
    const row = await prisma.integrationProvider.findUnique({ where: { provider } });
    const { secrets, readable } = openSecrets(row);
    const settings = providerSettings(provider, row);
    const value: ProviderCredentials = {
        provider,
        enabled: Boolean(row?.enabled) && ENABLEABLE_PROVIDERS.has(provider),
        configured: isConfigured(provider, row?.clientId ?? null, secrets, readable, settings),
        clientId: row?.clientId ?? null,
        clientSecret: secrets.clientSecret ?? null,
        webhookSecret: secrets.webhookSecret ?? null,
        settings,
        clientVersion: row?.clientVersion ?? 1,
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
        clientVersion: row?.clientVersion ?? 1,
    };
};

const hintFor = (secret: string, user: AuthUser, now: Date, expiresOn: string | null = null): SecretHint => ({
    last4: secret.slice(-4),
    updatedAt: now.toISOString(),
    updatedBy: user.username,
    expiresOn,
});

const conflict = (message: string, code: string, path?: string[]) =>
    new HttpError(message, StatusCodes.CONFLICT, { code, errors: path ? [{ message, path }] : undefined });

export const integrationService = {
    async getAdmin(now: Date = new Date()): Promise<IntegrationsAdminDto> {
        const [rows, configs, counts] = await Promise.all([prisma.integrationProvider.findMany(), formConfigService.getAllConfigs(), connectionCountsByProvider()]);
        const byProvider = new Map(rows.map((row) => [row.provider, row]));
        const providers = INTEGRATION_PROVIDERS.map((p) => toProviderDto(p, byProvider.get(p) ?? null, now, counts.get(p)));
        const anyUnreadable = providers.some((p) => !p.secret.readable);
        const { READY_REASON, ACTIVE_KEY_ID, PUBLIC_API_URL, PUBLIC_API_URL_CONFIGURED } = ENV.INTEGRATIONS;
        return {
            ready: { ok: READY_REASON === null, reason: READY_REASON },
            keyStatus: !secretBox.ready() ? 'missing' : anyUnreadable ? 'unreadable' : 'ok',
            activeKeyId: ACTIVE_KEY_ID,
            publicApiUrl: PUBLIC_API_URL,
            publicApiUrlConfigured: PUBLIC_API_URL_CONFIGURED,
            webhooksActive: false,
            worker: null,
            providers,
            settings: calendarSettingsFrom(configs),
            syncTypes: syncTypesFrom(configs),
        };
    },

    async getProvider(provider: IntegrationProviderKey): Promise<ProviderAdminDto> {
        return toProviderDto(provider, await prisma.integrationProvider.findUnique({ where: { provider } }));
    },

    /**
     * Saves a provider (partial). Secrets: write-only, an omitted one is kept, a new one needs the encryption key
     * (503 INTEGRATIONS_NOT_READY). Enabling needs a client id + readable secret (409 INTEGRATION_NOT_CONFIGURED) and,
     * for Microsoft, a tenant; Zoom can't be enabled yet (409 INTEGRATION_NOT_AVAILABLE). A changed client id or
     * Microsoft tenant bumps `clientVersion` (connections made with the old app must reconnect) and clears the last
     * test result. Audited as `IntegrationProvider CREATE / UPDATE` with `secretChanged: true`, never a value.
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
        const newSecret = input.clientSecret !== undefined || input.webhookSecret !== undefined;
        if (newSecret && !secretBox.ready()) throw notReady();

        const after = await runInTransaction(async (tx) => {
            await acquireLocks(tx, [`integration-provider:${provider}`]);
            const before = await tx.integrationProvider.findUnique({ where: { provider } });
            const opened = openSecrets(before);
            const hints = parseJson<SecretHints>(before?.secretHintsJson, {});
            const beforeSettings = providerSettings(provider, before);
            const settings: Record<string, unknown> = { ...beforeSettings, ...settingsPatch };
            const clientId = input.clientId !== undefined ? input.clientId : (before?.clientId ?? null);

            // Secrets that can't be opened any more stay as they are until a new one is entered (a key mix-up between
            // processes must not wipe them); a new secret then replaces the whole sealed set.
            const replaceUnreadable = !opened.readable && newSecret;
            const secrets: ProviderSecrets = opened.readable ? { ...opened.secrets } : {};
            const nextHints: SecretHints = replaceUnreadable ? {} : { ...hints };
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

            const enabled = input.enabled ?? Boolean(before?.enabled);
            if (enabled && !before?.enabled) {
                if (!ENABLEABLE_PROVIDERS.has(provider)) {
                    throw conflict(`${PROVIDER_LABELS[provider]} can be switched on when video meetings arrive (Phase 3). Its credentials are stored.`, 'INTEGRATION_NOT_AVAILABLE', ['enabled']);
                }
            }
            if (enabled) {
                const readable = opened.readable || newSecret;
                if (!clientId || !secrets.clientSecret || !readable) {
                    throw conflict(
                        !readable || (hints.clientSecret && !secrets.clientSecret)
                            ? 'The stored client secret can\'t be read with the current key. Enter it again, then switch the provider on.'
                            : 'Enter the client ID and client secret before switching the provider on.',
                        'INTEGRATION_NOT_CONFIGURED',
                        ['enabled'],
                    );
                }
                if (provider === 'microsoft' && !settings.tenantId) {
                    const message = 'Enter the Tenant ID before switching Microsoft 365 on.';
                    throw new HttpError(message, StatusCodes.BAD_REQUEST, { code: 'VALIDATION_ERROR', errors: [{ message, path: ['settings', 'tenantId'] }] });
                }
            }

            const appChanged =
                (Boolean(before?.clientId) && clientId !== before?.clientId) ||
                (provider === 'microsoft' && Boolean(beforeSettings.tenantId) && settings.tenantId !== beforeSettings.tenantId);
            const credentialsChanged = appChanged || input.clientSecret !== undefined || clientId !== (before?.clientId ?? null) || settings.tenantId !== beforeSettings.tenantId;
            const secretsEnc = newSecret ? secretBox.seal(JSON.stringify(secrets), SECRETS_AAD(provider)) : (before?.secretsEnc ?? null);
            const data = {
                enabled,
                clientId,
                secretsEnc,
                keyId: secretsEnc === (before?.secretsEnc ?? null) ? (before?.keyId ?? null) : secretsEnc ? secretBox.activeKid() : null,
                secretHintsJson: Object.keys(nextHints).length > 0 ? JSON.stringify(nextHints) : null,
                settingsJson: JSON.stringify(settings),
                clientVersion: (before?.clientVersion ?? 1) + (appChanged ? 1 : 0),
                ...(credentialsChanged ? { lastTestAt: null, lastTestOk: null, lastTestMessage: null } : {}),
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
            if (Object.keys(changes).length > 0) {
                await auditService.record(tx, { entityType: 'IntegrationProvider', entityId: provider, action: before ? 'UPDATE' : 'CREATE', changedBy: user.username, changes });
            }
            return row;
        });
        dropProviderCredentialsCache(provider);
        return toProviderDto(provider, after, now);
    },

    /** Removes the stored secrets and switches the provider off (connections stay; they pause with the provider). */
    async clearSecret(provider: IntegrationProviderKey, user: AuthUser): Promise<ProviderAdminDto> {
        const after = await runInTransaction(async (tx) => {
            await acquireLocks(tx, [`integration-provider:${provider}`]);
            const before = await tx.integrationProvider.findUnique({ where: { provider } });
            if (!before || (!before.secretsEnc && !before.secretHintsJson && !before.enabled)) return before;
            const row = await tx.integrationProvider.update({
                where: { provider },
                data: { enabled: false, secretsEnc: null, keyId: null, secretHintsJson: null, lastTestAt: null, lastTestOk: null, lastTestMessage: null, updatedBy: user.username },
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
        dropProviderCredentialsCache(provider);
        return toProviderDto(provider, after);
    },

    /**
     * "Test connection" with the saved credentials; the result is stored on the row (not audited: no setting changes)
     * unless the credentials changed while the probe ran, which answers `credentials_changed` instead.
     */
    async testProvider(provider: IntegrationProviderKey, fetchImpl: FetchLike = fetch as unknown as FetchLike, now: Date = new Date()): Promise<TestConnectionDto> {
        const row = await prisma.integrationProvider.findUnique({ where: { provider } });
        if (row?.secretsEnc && !secretBox.ready()) throw notReady();
        const { secrets, readable } = openSecrets(row);
        const settings = providerSettings(provider, row);
        let result: TestResult;
        if (!readable) {
            result = { ok: false, code: 'not_configured', message: "The stored client secret can't be read with the current key. Enter it again and save." };
        } else if (!row?.clientId || !secrets.clientSecret) {
            result = { ok: false, code: 'not_configured', message: 'Save a client ID and client secret first.' };
        } else {
            result = await probeProvider(
                provider,
                {
                    clientId: row.clientId,
                    clientSecret: secrets.clientSecret,
                    redirectUri: redirectUriFor(provider, ENV.INTEGRATIONS.PUBLIC_API_URL),
                    tenantId: typeof settings.tenantId === 'string' ? settings.tenantId : null,
                },
                fetchImpl,
            );
        }
        if (row && result.code !== 'not_available') {
            // Only stored while the tested credentials are still the saved ones: a save (or secret removal) during the
            // probe clears lastTest*, and this result must not paint a pass / fail on credentials it never tried.
            const { count } = await prisma.integrationProvider.updateMany({
                where: { provider, clientId: row.clientId, secretsEnc: row.secretsEnc, clientVersion: row.clientVersion },
                data: { lastTestAt: now, lastTestOk: result.ok, lastTestMessage: result.message.slice(0, 300) },
            });
            if (count === 0) {
                result = { ok: false, code: 'credentials_changed', message: 'The credentials were changed while this test ran. Run the test again.' };
            }
        }
        logger.info({ provider, ok: result.ok, code: result.code }, 'Integration test connection');
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

    /** Active, non-group users (the population of the email rule) with their email issue and connection. */
    async listPeople(query: unknown = {}): Promise<PersonDto[]> {
        const { search, issue } = peopleQuerySchema.parse(query ?? {}) as PeopleQuery;
        const [users, settings, connections] = await Promise.all([userEmailService.listForEmailRule(), loadCalendarSettings(), liveConnectionsByUsername()]);
        return peopleFrom(users, settings.companyDomains, { search, issue }, connections);
    },

    /** Sets a person's company email through the users email service (the one rule for Users.email). */
    async setPersonEmail(username: string, body: unknown, user: AuthUser): Promise<PersonDto> {
        const settings = await loadCalendarSettings();
        const row = await userEmailService.setEmail(username, body, { companyDomains: settings.companyDomains, actor: user });
        const [users, connections] = await Promise.all([userEmailService.listForEmailRule(), liveConnectionsByUsername()]);
        return toPerson(row, duplicateEmailsAmong(users), settings.companyDomains, connections);
    },
};

function toPerson(
    user: UserEmailRow,
    duplicates: ReadonlySet<string>,
    companyDomains: readonly string[],
    connections: ReadonlyMap<string, PersonConnectionDto> = new Map(),
): PersonDto {
    return {
        username: user.username,
        fullName: user.fullName || user.username,
        department: user.department,
        role: user.role,
        email: user.email,
        emailIssue: emailIssueFor(user.email, duplicates, companyDomains),
        connection: connections.get(user.username.toLowerCase()) ?? null,
    };
}

/** The People list from every user: active non-group only, filtered by search text and issue. Pure. */
export function peopleFrom(
    users: readonly UserEmailRow[],
    companyDomains: readonly string[],
    filter: PeopleQuery = {},
    connections: ReadonlyMap<string, PersonConnectionDto> = new Map(),
): PersonDto[] {
    const duplicates = duplicateEmailsAmong(users);
    const needle = filter.search?.toLowerCase();
    return users
        .filter((u) => u.isActive && !u.isGroupUser)
        .map((u) => toPerson(u, duplicates, companyDomains, connections))
        .filter((p) => !needle || [p.username, p.fullName, p.email ?? '', p.department ?? ''].some((v) => v.toLowerCase().includes(needle)))
        .filter((p) => !filter.issue || (filter.issue === 'any' ? p.emailIssue !== null : p.emailIssue === filter.issue));
}
