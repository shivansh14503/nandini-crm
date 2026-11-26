import { loadProviderCredentials } from '../../integrations/integration.service.js';
import type { CalendarProvider } from '../connection.constants.js';
import { createFakeAdapter } from './fake.js';
import { isFakeProviderEnabled, setFakeProviderEnabledForTests } from './fakeSwitch.js';
import { createGoogleAdapter } from './google.js';
import { parseServiceAccountKey, type ServiceAccountKey } from './googleServiceAccount.js';
import { createMicrosoftAdapter } from './microsoft.js';
import type { CalendarProviderAdapter } from './types.js';

/**
 * The one way calendar sync reaches a provider: `getAdapter(key)` for API calls and `loadProviderAccess(key)` for the
 * company credentials. Nothing else imports an adapter directly, so tests swap any provider for a fake
 * (`setAdapterForTests`).
 */

const defaults: Record<CalendarProvider, () => CalendarProviderAdapter> = {
    google: () => createGoogleAdapter(),
    microsoft: () => createMicrosoftAdapter(),
    fake: () => createFakeAdapter(),
};

const cache = new Map<CalendarProvider, CalendarProviderAdapter>();
const overrides = new Map<CalendarProvider, CalendarProviderAdapter>();

export function getAdapter(key: CalendarProvider): CalendarProviderAdapter {
    const override = overrides.get(key);
    if (override) return override;
    let adapter = cache.get(key);
    if (!adapter) {
        adapter = defaults[key]();
        cache.set(key, adapter);
    }
    return adapter;
}

/** Tests: replace a provider's adapter (null puts the real one back). */
export function setAdapterForTests(key: CalendarProvider, adapter: CalendarProviderAdapter | null): void {
    if (adapter) overrides.set(key, adapter);
    else overrides.delete(key);
}

/** The dev-only `fake` provider is on: CALENDAR_FAKE_PROVIDER=true and NODE_ENV ≠ production (providers/fakeSwitch.ts). */
export { isFakeProviderEnabled, setFakeProviderEnabledForTests };

/** The decrypted company credentials. Only tokenSource.ts reads them; never logged, never returned by the API. */
export type ProviderAppCredentials =
    | { kind: 'google'; key: ServiceAccountKey }
    | { kind: 'microsoft'; clientId: string; clientSecret: string; tenantId: string }
    | { kind: 'fake' };

export type ProviderHealth = 'unknown' | 'ok' | 'error';

/** What enrolment, `withCalendarAccess` and the token source need to know about a provider. */
export interface ProviderAccess {
    provider: CalendarProvider;
    /** Switched on by an admin (the fake: CALENDAR_FAKE_PROVIDER) … */
    enabled: boolean;
    /** … with readable credentials (Google: a valid key; Microsoft: client id, secret and tenant). */
    configured: boolean;
    /** IntegrationProvider.clientVersion: part of the token cache key. */
    credentialsVersion: number;
    /** Company email domains this provider serves (lower-cased). The fake lists none (it takes unclaimed ones). */
    domains: string[];
    healthStatus: ProviderHealth;
    healthCode: string | null;
    /** Null while not configured. */
    creds: ProviderAppCredentials | null;
}

/** The parsed key of the stored text (createPrivateKey is not free), per credentials version. */
const parsedKeys = new Map<string, ServiceAccountKey | null>();
function parsedKey(text: string, version: number): ServiceAccountKey | null {
    const cacheKey = `${version}:${text.length}:${text.slice(-24)}`;
    if (parsedKeys.has(cacheKey)) return parsedKeys.get(cacheKey) ?? null;
    let key: ServiceAccountKey | null = null;
    try {
        key = parseServiceAccountKey(text);
    } catch {
        key = null;
    }
    if (parsedKeys.size > 20) parsedKeys.clear();
    parsedKeys.set(cacheKey, key);
    return key;
}

/** The fake's health lives in memory (it has no IntegrationProvider row). */
let fakeHealth: { status: ProviderHealth; code: string | null } = { status: 'unknown', code: null };
export function setFakeHealth(status: ProviderHealth, code: string | null): void {
    fakeHealth = { status, code };
}

const domainsOf = (settings: Record<string, unknown>): string[] =>
    Array.isArray(settings.domains) ? settings.domains.filter((d): d is string => typeof d === 'string').map((d) => d.trim().toLowerCase()).filter(Boolean) : [];

/** A provider's access facts (cached 60 s in-process by integration.service, dropped on every save in this process). */
export async function loadProviderAccess(provider: CalendarProvider): Promise<ProviderAccess> {
    if (provider === 'fake') {
        const enabled = isFakeProviderEnabled();
        return { provider, enabled, configured: enabled, credentialsVersion: 1, domains: [], healthStatus: fakeHealth.status, healthCode: fakeHealth.code, creds: enabled ? { kind: 'fake' } : null };
    }
    const loaded = await loadProviderCredentials(provider);
    const base = {
        provider,
        enabled: loaded.enabled,
        credentialsVersion: loaded.clientVersion,
        domains: domainsOf(loaded.settings),
        healthStatus: loaded.healthStatus,
        healthCode: loaded.healthCode,
    };
    if (provider === 'google') {
        const key = loaded.configured && loaded.serviceAccountKey ? parsedKey(loaded.serviceAccountKey, loaded.clientVersion) : null;
        return { ...base, configured: Boolean(key), creds: key ? { kind: 'google', key } : null };
    }
    const tenantId = typeof loaded.settings.tenantId === 'string' ? loaded.settings.tenantId : '';
    const usable = loaded.configured && loaded.clientId && loaded.clientSecret && tenantId;
    return {
        ...base,
        configured: Boolean(usable),
        creds: usable ? { kind: 'microsoft', clientId: loaded.clientId!, clientSecret: loaded.clientSecret!, tenantId } : null,
    };
}
