/**
 * The external providers of Admin › API Integrations and their fixed facts (Calendar Phase 2 spec §3.3; admin-managed
 * calendar connections: addendum phase2-admin-connect AC1–AC4).
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

/** Providers authenticated by a client id + client secret. Google uses a service account key instead (addendum AC1). */
export const PROVIDERS_WITH_CLIENT_SECRET: ReadonlySet<IntegrationProviderKey> = new Set(['microsoft', 'zoom']);

/** Calendar providers that serve company email domains (`settings.domains`; a domain belongs to at most one). */
export const DOMAIN_PROVIDERS: ReadonlySet<IntegrationProviderKey> = new Set(['google', 'microsoft']);

/** Providers with a webhook secret of their own (Zoom's event-subscription Secret Token). */
export const PROVIDERS_WITH_WEBHOOK_SECRET: ReadonlySet<IntegrationProviderKey> = new Set(['zoom']);

/** Providers whose client secret has an admin-visible expiry (Entra client secrets last at most 24 months). */
export const PROVIDERS_WITH_SECRET_EXPIRY: ReadonlySet<IntegrationProviderKey> = new Set(['microsoft', 'zoom']);

/** Days before a client secret's expiry date when the card warns (and, from P2-3, admins get a notification). */
export const SECRET_EXPIRY_WARNING_DAYS = 30;

// ── Token and API endpoints (constants: never built from admin input except the validated Microsoft tenant) ──
// The `token_uri` inside an uploaded Google key file is ignored on purpose: a key file can't point the server elsewhere.

export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
export const microsoftAuthorityUrl = (tenantId: string) => `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0`;
export const GRAPH_API = 'https://graph.microsoft.com/v1.0';
/** Client-credentials scope: every application permission (or RBAC for Applications role) the app holds. */
export const GRAPH_DEFAULT_SCOPE = 'https://graph.microsoft.com/.default';
export const ZOOM_TOKEN_URL = 'https://zoom.us/oauth/token';

/** A Microsoft tenant: a directory GUID or a verified domain (e.g. nandiniinfosys.onmicrosoft.com). */
export const MICROSOFT_TENANT_PATTERN = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|(?=.{3,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+)$/i;

// ── Scopes (addendum AC3 / AC4) ───────────────────────────────────────────────────────────────────────────────

const GOOGLE_API = 'https://www.googleapis.com/auth/';

/**
 * The two scopes the Google service account is authorised for in the Admin console (Security › Access and data control
 * › API controls › Domain-wide delegation) and requests for each employee: events on the user's own calendars
 * (insert, delete, list with sync tokens, watch) and free/busy. Fixed: changing them means changing the Admin console
 * entry, so it can't be a CRM-only switch.
 */
export const GOOGLE_DWD_SCOPES: readonly string[] = [`${GOOGLE_API}calendar.events.owned`, `${GOOGLE_API}calendar.events.freebusy`];
/** Exactly what the admin pastes into the Admin console's "OAuth scopes (comma-delimited)" box. */
export const GOOGLE_DWD_SCOPES_ADMIN_CONSOLE = GOOGLE_DWD_SCOPES.join(',');
/** The app-level step of "Test connection" mints a token without `sub` for this one scope (proves the key only). */
export const GOOGLE_KEY_CHECK_SCOPE = `${GOOGLE_API}calendar.events.owned`;

/** The Graph application permission (or Exchange RBAC for Applications role) calendar sync needs. */
export const MICROSOFT_APP_PERMISSION = 'Calendars.ReadWrite';

// ── Webhook URLs (built from PUBLIC_API_URL; P2-7) ────────────────────────────────────────────────────────────

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
