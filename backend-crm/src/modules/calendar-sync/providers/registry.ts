import { ENV } from '../../../config/env.js';
import { loadProviderCredentials } from '../../integrations/integration.service.js';
import type { CalendarProvider } from '../connection.constants.js';
import { createFakeAdapter, FAKE_CREDENTIALS } from './fake.js';
import { createGoogleAdapter } from './google.js';
import { createMicrosoftAdapter } from './microsoft.js';
import type { CalendarProviderAdapter, ProviderCredentials } from './types.js';

/**
 * The one way the connect flow, token refresh and (from P2-3) the sync engine reach a provider: `getAdapter(key)`.
 * Nothing else imports an adapter directly, so tests swap any provider for a fake (`setAdapterForTests`).
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

let fakeEnabledOverride: boolean | null = null;

/** The dev-only `fake` provider is offered: CALENDAR_FAKE_PROVIDER=true and NODE_ENV ≠ production. */
export function isFakeProviderEnabled(): boolean {
    return fakeEnabledOverride ?? ENV.INTEGRATIONS.FAKE_PROVIDER;
}

/** Tests: force the fake provider on / off (null = back to the environment). */
export function setFakeProviderEnabledForTests(enabled: boolean | null): void {
    fakeEnabledOverride = enabled;
}

/** What the connect flow and token refresh need to know about a provider's company app. Never logged. */
export interface ConnectCredentials {
    provider: CalendarProvider;
    /** Switched on by an admin (the fake: CALENDAR_FAKE_PROVIDER) … */
    enabled: boolean;
    /** … with a client id, a readable secret and (Microsoft) a tenant. */
    configured: boolean;
    clientVersion: number;
    /** Null while not configured. */
    creds: ProviderCredentials | null;
}

/** A provider's company app (Admin › API Integrations; cached 60 s in-process by integration.service). */
export async function loadConnectCredentials(provider: CalendarProvider): Promise<ConnectCredentials> {
    if (provider === 'fake') {
        const enabled = isFakeProviderEnabled();
        return { provider, enabled, configured: enabled, clientVersion: 1, creds: enabled ? FAKE_CREDENTIALS : null };
    }
    const loaded = await loadProviderCredentials(provider);
    const usable = loaded.configured && loaded.clientId && loaded.clientSecret;
    return {
        provider,
        enabled: loaded.enabled,
        configured: Boolean(usable),
        clientVersion: loaded.clientVersion,
        creds: usable ? { clientId: loaded.clientId!, clientSecret: loaded.clientSecret!, settings: loaded.settings } : null,
    };
}
