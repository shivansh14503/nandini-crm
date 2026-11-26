import { z } from 'zod';
import { MICROSOFT_REQUESTED_SCOPES, microsoftAuthorityUrl, missingGrantedScopes } from '../../integrations/integration.constants.js';
import type { AdapterOptions } from './google.js';
import { providerFetch } from './http.js';
import { checkStandardClaims, claimString, decodeIdToken, IdentityError } from './idToken.js';
import { toTokenSet, tokenResponseSchema } from './tokenResponse.js';
import type { AccountIdentity, AuthorizeUrlInput, CalendarProviderAdapter, ProviderCredentials, TokenSet } from './types.js';

/**
 * Microsoft Entra ID (single tenant) OAuth for Microsoft 365 calendars (spec §3.3, §7.5): auth-code flow with PKCE,
 * `state`, `nonce`, `response_mode=query` (form_post would be a cross-site POST that a Lax cookie never reaches) and
 * `offline_access` for a refresh token, which Entra rotates on every refresh (the new one always replaces the stored
 * one). Identity: id_token `iss` / `aud` / `exp` / `nonce` and `tid` = the configured tenant, then Graph
 * `GET /me?$select=mail,userPrincipalName` for the address (`mail`, else the UPN). There is no per-app revoke for a
 * delegated grant (`revokeSignInSessions` would sign the user out everywhere), so `revoke` is a no-op: disconnect drops
 * our copy and the page tells the user how to remove the app at myapps.microsoft.com.
 * Graph event operations join this adapter with the sync engine (P2-3).
 */

export const GRAPH_ME_URL = 'https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName';

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const microsoftTenantOf = (creds: ProviderCredentials): string => (typeof creds.settings.tenantId === 'string' ? creds.settings.tenantId.trim().toLowerCase() : '');

const meSchema = z.object({ mail: z.string().nullish(), userPrincipalName: z.string().nullish() });

export function createMicrosoftAdapter(options: AdapterOptions = {}): CalendarProviderAdapter {
    const now = options.now ?? (() => new Date());
    const fetchImpl = options.fetchImpl;

    const authority = (creds: ProviderCredentials) => {
        const tenant = microsoftTenantOf(creds);
        // Never `common` / `organizations`: the app is single tenant and the tenant is validated on save.
        if (!tenant) throw new IdentityError('provider_error', 'tenant_missing');
        return microsoftAuthorityUrl(tenant);
    };

    const tokenCall = async (creds: ProviderCredentials, operation: string, form: Record<string, string>): Promise<TokenSet> => {
        const at = now();
        const { json } = await providerFetch(
            { method: 'POST', url: `${authority(creds)}/token`, body: new URLSearchParams(form), provider: 'microsoft', operation },
            { fetchImpl, schema: tokenResponseSchema },
        );
        return toTokenSet(json, at);
    };

    return {
        key: 'microsoft',
        canRevoke: false,

        requestedScopes: () => MICROSOFT_REQUESTED_SCOPES,

        authorizeUrl(i: AuthorizeUrlInput): string {
            const params = new URLSearchParams({
                client_id: i.creds.clientId,
                response_type: 'code',
                redirect_uri: i.redirectUri,
                response_mode: 'query',
                scope: MICROSOFT_REQUESTED_SCOPES.join(' '),
                state: i.state,
                nonce: i.nonce,
                prompt: 'select_account',
            });
            if (i.codeChallenge) {
                params.set('code_challenge', i.codeChallenge);
                params.set('code_challenge_method', 'S256');
            }
            if (i.loginHint) params.set('login_hint', i.loginHint);
            if (i.domainHint) params.set('domain_hint', i.domainHint);
            return `${authority(i.creds)}/authorize?${params.toString()}`;
        },

        exchangeCode: ({ creds, code, codeVerifier, redirectUri }) =>
            tokenCall(creds, 'token', {
                client_id: creds.clientId,
                client_secret: creds.clientSecret,
                grant_type: 'authorization_code',
                code,
                redirect_uri: redirectUri,
                scope: MICROSOFT_REQUESTED_SCOPES.join(' '),
                ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
            }),

        async identity(tokens: TokenSet, creds: ProviderCredentials, nonce: string, at?: Date): Promise<AccountIdentity> {
            const claims = decodeIdToken(tokens.idToken);
            const tid = claimString(claims, 'tid').toLowerCase();
            if (!tid) throw new IdentityError('invalid', 'tid_missing');
            checkStandardClaims(claims, { issuers: [`https://login.microsoftonline.com/${tid}/v2.0`], audience: creds.clientId, nonce, now: at ?? now() });
            // A GUID tenant is compared directly. A domain tenant (nandiniinfosys.onmicrosoft.com) can't be compared with
            // `tid`, but the token came from that tenant's own token endpoint, which only signs in its own directory.
            const configured = microsoftTenantOf(creds);
            if (GUID.test(configured) && configured !== tid) throw new IdentityError('domain_not_allowed', 'tid');
            const oid = claimString(claims, 'oid');
            if (!oid) throw new IdentityError('provider_error', 'oid_missing');

            const { json } = await providerFetch(
                { method: 'GET', url: GRAPH_ME_URL, headers: { Authorization: `Bearer ${tokens.accessToken}` }, provider: 'microsoft', operation: 'me' },
                { fetchImpl, schema: meSchema },
            );
            const email = (json.mail || json.userPrincipalName || '').trim().toLowerCase();
            if (!email) throw new IdentityError('provider_error', 'email_missing');
            return { accountId: oid, email, tenantId: tid, emailVerified: true };
        },

        refresh: ({ creds, refreshToken }) =>
            tokenCall(creds, 'refresh', {
                client_id: creds.clientId,
                client_secret: creds.clientSecret,
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
                scope: MICROSOFT_REQUESTED_SCOPES.join(' '),
            }),

        // No per-app revoke for delegated tokens (see above).
        revoke: async () => undefined,

        missingScopes: (tokens) => missingGrantedScopes('microsoft', tokens.scope),
    };
}
