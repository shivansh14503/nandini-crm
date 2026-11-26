/**
 * Calendar provider adapters (Calendar Phase 2 spec §7.2). Thin `fetch` clients behind one interface, no SDKs (D1).
 * P2-2 ships the OAuth part (authorize URL, code exchange, identity, refresh, revoke, credential test); the event
 * operations (create / patch / cancel / list changes / free-busy / watch) join this interface with the sync engine
 * (P2-3 onward). The engine and the connect flow never import an adapter directly: they go through
 * `getAdapter()` (providers/registry.ts), which tests replace with the in-memory fake (providers/fake.ts).
 *
 * Nothing here is ever logged with its values: tokens, codes, verifiers and id_tokens stay inside these objects.
 */

/** Providers with a calendar adapter. `fake` is the dev-only test provider (CALENDAR_FAKE_PROVIDER, never production). */
export type CalendarProviderKey = 'google' | 'microsoft' | 'fake';

/** The company OAuth app of a provider (Admin › API Integrations), decrypted for one call. */
export interface ProviderCredentials {
    clientId: string;
    clientSecret: string;
    /** google { scopeProfile, pkce }; microsoft { tenantId } (see integration.validator.ts). */
    settings: Record<string, unknown>;
}

/** A token endpoint answer. */
export interface TokenSet {
    accessToken: string;
    expiresAt: Date;
    /** Microsoft rotates it on every refresh; Google usually sends none on refresh (keep the old one). */
    refreshToken?: string;
    /** Google time-limited grants (`refresh_token_expires_in`, set when the user granted time-based access). */
    refreshTokenExpiresAt?: Date;
    /** Raw `scope` field of the token response (null = not returned); compare only via normalizeGrantedScopes. */
    scope: string | null;
    idToken?: string;
}

/** Who signed in, from verified id_token claims (plus Graph /me for Microsoft's address). */
export interface AccountIdentity {
    /** Google `sub`, Entra `oid`. */
    accountId: string;
    /** Lower-cased. */
    email: string;
    /** Google `hd` (the Workspace domain; missing for consumer accounts), Entra `tid`. */
    tenantId?: string;
    emailVerified: boolean;
}

export interface AuthorizeUrlInput {
    creds: ProviderCredentials;
    redirectUri: string;
    state: string;
    /** b64url(sha256(verifier)); omitted when the provider setting turns PKCE off (Google only). */
    codeChallenge?: string;
    nonce: string;
    /** The CRM user's company email, if known. */
    loginHint?: string;
    /** First company domain (Google `hd`, Microsoft `domain_hint`). */
    domainHint?: string;
}

/** Injected `fetch` (tests replay documented provider answers; production uses the global one). */
export type FetchImpl = (input: string, init?: RequestInit) => Promise<Response>;

export interface CalendarProviderAuth {
    readonly key: CalendarProviderKey;
    /** Scopes requested on Connect (D7). */
    requestedScopes(creds: ProviderCredentials): readonly string[];
    authorizeUrl(i: AuthorizeUrlInput): string;
    exchangeCode(i: { creds: ProviderCredentials; code: string; codeVerifier?: string; redirectUri: string }): Promise<TokenSet>;
    /** Checks the id_token (iss, aud, exp, nonce; Google email_verified, Microsoft tid) and returns the account. */
    identity(tokens: TokenSet, creds: ProviderCredentials, nonce: string, now?: Date): Promise<AccountIdentity>;
    /** Microsoft: includes the rotated refresh token. */
    refresh(i: { creds: ProviderCredentials; refreshToken: string }): Promise<TokenSet>;
    /** Ends the grant at the provider. Microsoft: no per-app revoke for delegated tokens, so a no-op (spec §3.5). */
    revoke(i: { creds: ProviderCredentials; token: string }): Promise<void>;
    /** Whether `revoke` really ends the grant at the provider (false = we only drop our copy). */
    readonly canRevoke: boolean;
    /**
     * Required calendar scopes the token response did not grant (empty = all granted), compared through
     * `normalizeGrantedScopes` (spec §3.3 step 5): an unticked box on the consent screen shows up here.
     */
    missingScopes(tokens: TokenSet, creds: ProviderCredentials): string[];
}

/** The adapter interface. P2-3+ add the event operations of spec §7.2 here. */
export type CalendarProviderAdapter = CalendarProviderAuth;
