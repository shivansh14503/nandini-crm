import {
    GOOGLE_AUTH_URL,
    GOOGLE_REQUESTED_SCOPES,
    GOOGLE_REVOKE_URL,
    GOOGLE_TOKEN_URL,
    missingGrantedScopes,
    type GoogleScopeProfile,
} from '../../integrations/integration.constants.js';
import { DISCONNECT_CALL_TIMEOUT_MS } from '../connection.constants.js';
import { ProviderError, providerFetch } from './http.js';
import { checkStandardClaims, claimString, decodeIdToken, IdentityError } from './idToken.js';
import { toTokenSet, tokenResponseSchema } from './tokenResponse.js';
import type { AccountIdentity, AuthorizeUrlInput, CalendarProviderAdapter, FetchImpl, ProviderCredentials, TokenSet } from './types.js';

/**
 * Google OAuth for Calendar (spec §3.3, §7.4): web-server flow with PKCE S256, `state` and an OIDC `nonce`;
 * `access_type=offline` + `prompt=consent` so every connect returns a refresh token. Identity from the id_token:
 * `iss`, `aud`, `exp`, `nonce`, `email_verified`, and `hd` (the Workspace domain) which must be present: a token
 * without `hd` is a consumer or unmanaged account (the policy check in oauth.ts compares it with the company domains).
 * The Calendar v3 event operations join this adapter with the sync engine (P2-3).
 */

export const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'] as const;

export const googleScopeProfile = (creds: ProviderCredentials): GoogleScopeProfile => (creds.settings.scopeProfile === 'broad' ? 'broad' : 'narrow');
/** PKCE is on unless an admin switched it off on the Google card (provider setting `pkce`, default on). */
export const googlePkceEnabled = (creds: ProviderCredentials): boolean => creds.settings.pkce !== false;

export interface AdapterOptions {
    fetchImpl?: FetchImpl;
    now?: () => Date;
}

export function createGoogleAdapter(options: AdapterOptions = {}): CalendarProviderAdapter {
    const now = options.now ?? (() => new Date());
    const fetchImpl = options.fetchImpl;

    const tokenCall = async (operation: string, form: Record<string, string>): Promise<TokenSet> => {
        const at = now();
        const { json } = await providerFetch(
            { method: 'POST', url: GOOGLE_TOKEN_URL, body: new URLSearchParams(form), provider: 'google', operation },
            { fetchImpl, schema: tokenResponseSchema },
        );
        return toTokenSet(json, at);
    };

    return {
        key: 'google',
        canRevoke: true,

        requestedScopes: (creds) => GOOGLE_REQUESTED_SCOPES[googleScopeProfile(creds)],

        authorizeUrl(i: AuthorizeUrlInput): string {
            const params = new URLSearchParams({
                response_type: 'code',
                client_id: i.creds.clientId,
                redirect_uri: i.redirectUri,
                scope: GOOGLE_REQUESTED_SCOPES[googleScopeProfile(i.creds)].join(' '),
                access_type: 'offline',
                // Google returns a refresh token only on the first consent; forcing the screen guarantees one.
                prompt: 'consent',
                include_granted_scopes: 'true',
                state: i.state,
                nonce: i.nonce,
            });
            if (i.codeChallenge) {
                params.set('code_challenge', i.codeChallenge);
                params.set('code_challenge_method', 'S256');
            }
            if (i.loginHint) params.set('login_hint', i.loginHint);
            if (i.domainHint) params.set('hd', i.domainHint);
            return `${GOOGLE_AUTH_URL}?${params.toString()}`;
        },

        exchangeCode: ({ creds, code, codeVerifier, redirectUri }) =>
            tokenCall('token', {
                grant_type: 'authorization_code',
                code,
                client_id: creds.clientId,
                client_secret: creds.clientSecret,
                redirect_uri: redirectUri,
                ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
            }),

        async identity(tokens: TokenSet, creds: ProviderCredentials, nonce: string, at?: Date): Promise<AccountIdentity> {
            const claims = decodeIdToken(tokens.idToken);
            checkStandardClaims(claims, { issuers: GOOGLE_ISSUERS, audience: creds.clientId, nonce, now: at ?? now() });
            const emailVerified = claims.email_verified === true || claims.email_verified === 'true';
            const sub = claimString(claims, 'sub');
            const email = claimString(claims, 'email').trim().toLowerCase();
            const hd = claimString(claims, 'hd').trim().toLowerCase();
            if (!sub || !email) throw new IdentityError('provider_error', 'sub_or_email_missing');
            if (!emailVerified) throw new IdentityError('domain_not_allowed', 'email_unverified');
            // No `hd` = a consumer Gmail / unmanaged account: refused even if the client were ever made External.
            if (!hd) throw new IdentityError('domain_not_allowed', 'hd_missing');
            return { accountId: sub, email, tenantId: hd, emailVerified };
        },

        refresh: ({ creds, refreshToken }) =>
            tokenCall('refresh', { grant_type: 'refresh_token', refresh_token: refreshToken, client_id: creds.clientId, client_secret: creds.clientSecret }),

        async revoke({ token }) {
            try {
                await providerFetch(
                    { method: 'POST', url: GOOGLE_REVOKE_URL, body: new URLSearchParams({ token }), provider: 'google', operation: 'revoke' },
                    { fetchImpl, attempts: 1, timeoutMs: DISCONNECT_CALL_TIMEOUT_MS },
                );
            } catch (err) {
                // 400 invalid_token: already revoked or expired. That is the outcome we want.
                if (err instanceof ProviderError && err.status === 400 && err.code === 'invalid_token') return;
                throw err;
            }
        },

        missingScopes: (tokens, creds) => missingGrantedScopes('google', tokens.scope, googleScopeProfile(creds)),
    };
}
