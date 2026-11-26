/**
 * The external providers of Admin › API Integrations and their fixed OAuth facts (Calendar Phase 2 spec §3.3, D7).
 * Provider endpoints are constants on purpose: no admin-entered URL is ever fetched (SSRF). Pure.
 * Mirrored by frontend-crm/src/types/integration.types.ts (INTEGRATION_PROVIDERS).
 */

export const INTEGRATION_PROVIDERS = ['google', 'microsoft', 'zoom'] as const;
export type IntegrationProviderKey = (typeof INTEGRATION_PROVIDERS)[number];

export const isIntegrationProvider = (value: unknown): value is IntegrationProviderKey =>
    typeof value === 'string' && (INTEGRATION_PROVIDERS as readonly string[]).includes(value);

export const PROVIDER_LABELS: Readonly<Record<IntegrationProviderKey, string>> = {
    google: 'Google Workspace',
    microsoft: 'Microsoft 365',
    zoom: 'Zoom',
};

/** calendar = Google Calendar / Outlook sync (Phase 2); video = Zoom meetings (Phase 3). */
export const PROVIDER_KINDS: Readonly<Record<IntegrationProviderKey, 'calendar' | 'video'>> = {
    google: 'calendar',
    microsoft: 'calendar',
    zoom: 'video',
};

/**
 * Providers that can be switched on in this release. Zoom's credentials can already be stored, but the provider
 * stays off until video meetings ship (Calendar Phase 3, P3-2): enabling it answers 409 INTEGRATION_NOT_AVAILABLE.
 */
export const ENABLEABLE_PROVIDERS: ReadonlySet<IntegrationProviderKey> = new Set(['google', 'microsoft']);

/** Providers with a webhook secret of their own (Zoom's event-subscription Secret Token). */
export const PROVIDERS_WITH_WEBHOOK_SECRET: ReadonlySet<IntegrationProviderKey> = new Set(['zoom']);

/** Providers whose client secret has an admin-visible expiry (Entra client secrets last at most 24 months). */
export const PROVIDERS_WITH_SECRET_EXPIRY: ReadonlySet<IntegrationProviderKey> = new Set(['microsoft', 'zoom']);

/** Days before a client secret's expiry date when the card warns (and, from P2-3, admins get a notification). */
export const SECRET_EXPIRY_WARNING_DAYS = 30;

// ── OAuth endpoints (constants: never built from admin input except the validated Microsoft tenant) ─────────────

export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
export const microsoftAuthorityUrl = (tenantId: string) => `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0`;
export const ZOOM_TOKEN_URL = 'https://zoom.us/oauth/token';

/** A Microsoft tenant: a directory GUID or a verified domain (e.g. nandiniinfosys.onmicrosoft.com). */
export const MICROSOFT_TENANT_PATTERN = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|(?=.{3,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+)$/i;

// ── Scopes (D7) ───────────────────────────────────────────────────────────────────────────────────────────────

export const GOOGLE_SCOPE_PROFILES = ['narrow', 'broad'] as const;
export type GoogleScopeProfile = (typeof GOOGLE_SCOPE_PROFILES)[number];

const GOOGLE_API = 'https://www.googleapis.com/auth/';

/**
 * Scopes requested on Connect. `narrow` = events the user owns + free/busy of calendars they can see; `broad` (one
 * switch on the Google card, if the first real run needs it) = all events + the same free/busy scope. Never
 * `calendar.freebusy`, which only covers the user's own calendars.
 */
export const GOOGLE_REQUESTED_SCOPES: Readonly<Record<GoogleScopeProfile, readonly string[]>> = {
    narrow: ['openid', 'email', `${GOOGLE_API}calendar.events.owned`, `${GOOGLE_API}calendar.events.freebusy`],
    broad: ['openid', 'email', `${GOOGLE_API}calendar.events`, `${GOOGLE_API}calendar.events.freebusy`],
};

export const MICROSOFT_REQUESTED_SCOPES: readonly string[] = ['openid', 'email', 'profile', 'offline_access', 'User.Read', 'Calendars.ReadWrite'];

/** What a token response must have granted (compared after `normalizeGrantedScopes`). OIDC scopes are never required. */
export const REQUIRED_GRANTED_SCOPES = {
    google: {
        narrow: [`${GOOGLE_API}calendar.events.owned`, `${GOOGLE_API}calendar.events.freebusy`],
        broad: [`${GOOGLE_API}calendar.events`, `${GOOGLE_API}calendar.events.freebusy`],
    },
    microsoft: ['calendars.readwrite', 'user.read'],
} as const;

const MICROSOFT_GRAPH_PREFIX = 'https://graph.microsoft.com/';

/**
 * The token response's `scope` field as a set to compare with REQUIRED_GRANTED_SCOPES (spec §3.3 step 5):
 * - Google: space-separated, case-sensitive full scope URLs; kept as they are.
 * - Microsoft: optional and sometimes percent-encoded; decoded, split, the `https://graph.microsoft.com/` prefix
 *   stripped and lower-cased. A missing field means the requested scopes were granted ("if omitted, the token is for
 *   the scopes requested"), so the requested Graph scopes are returned.
 */
export function normalizeGrantedScopes(provider: 'google' | 'microsoft', scope: string | null | undefined): Set<string> {
    if (provider === 'google') return new Set((scope ?? '').split(/\s+/).filter(Boolean));
    let text = scope ?? '';
    if (!text.trim()) return new Set(MICROSOFT_REQUESTED_SCOPES.map((s) => s.toLowerCase()));
    if (/%[0-9a-f]{2}/i.test(text)) {
        try {
            text = decodeURIComponent(text.replace(/\+/g, ' '));
        } catch {
            // Not valid percent-encoding: compare it as it is.
        }
    }
    return new Set(
        text
            .split(/\s+/)
            .filter(Boolean)
            .map((s) => (s.toLowerCase().startsWith(MICROSOFT_GRAPH_PREFIX) ? s.slice(MICROSOFT_GRAPH_PREFIX.length) : s).toLowerCase()),
    );
}

/** Required scopes missing from a grant (empty = all granted). */
export function missingGrantedScopes(provider: 'google' | 'microsoft', scope: string | null | undefined, profile: GoogleScopeProfile = 'narrow'): string[] {
    const granted = normalizeGrantedScopes(provider, scope);
    const required = provider === 'google' ? REQUIRED_GRANTED_SCOPES.google[profile] : REQUIRED_GRANTED_SCOPES.microsoft;
    return required.filter((s) => !granted.has(s));
}

// ── Redirect and webhook URLs (built from PUBLIC_API_URL) ─────────────────────────────────────────────────────

/** OAuth redirect URI to register with the provider (one path per provider: blocks mix-up attacks). */
export function redirectUriFor(provider: IntegrationProviderKey, publicApiUrl: string | null): string | null {
    if (!publicApiUrl) return null;
    return `${publicApiUrl.replace(/\/+$/, '')}/api/calendar-connections/oauth/${provider}/callback`;
}

const WEBHOOK_PATHS: Readonly<Record<IntegrationProviderKey, readonly string[]>> = {
    google: ['/api/webhooks/google/calendar'],
    microsoft: ['/api/webhooks/microsoft/calendar', '/api/webhooks/microsoft/lifecycle'],
    zoom: ['/api/webhooks/zoom'],
};

/**
 * Webhook URLs of a provider. Google and Microsoft register them through the API (nothing to paste); Zoom's goes into
 * its app's event subscription. Null without a public API address. They only work over https (P2-7 / P3-2).
 */
export function webhookUrlsFor(provider: IntegrationProviderKey, publicApiUrl: string | null): string[] | null {
    if (!publicApiUrl) return null;
    const base = publicApiUrl.replace(/\/+$/, '');
    return WEBHOOK_PATHS[provider].map((path) => `${base}${path}`);
}
