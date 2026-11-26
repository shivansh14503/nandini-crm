import { GRAPH_DEFAULT_SCOPE, microsoftAuthorityUrl } from '../../integrations/integration.constants.js';
import { classifyMicrosoftTokenError, TokenError } from '../syncErrors.js';
import { postTokenForm, readGrant } from './googleServiceAccount.js';
import type { AccessGrant, FetchImpl } from './types.js';

/**
 * Microsoft 365: one Entra app with application permissions (addendum AC2, AC4). Client-credentials grant at the
 * tenant's v2 token endpoint for `https://graph.microsoft.com/.default`; there is no refresh token, and one token
 * serves every mailbox the app may reach (`/users/{email}/…`). Pure apart from `fetch`. Never logged.
 */

export interface GraphAppCredentials {
    clientId: string;
    clientSecret: string;
    tenantId: string;
}

/** Mints the tenant-wide app token. Throws TokenError (every non-transient failure is app-level). */
export async function mintGraphToken(creds: GraphAppCredentials, fetchImpl: FetchImpl, now: Date = new Date()): Promise<AccessGrant> {
    const answer = await postTokenForm(fetchImpl, `${microsoftAuthorityUrl(creds.tenantId)}/token`, {
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        scope: GRAPH_DEFAULT_SCOPE,
        grant_type: 'client_credentials',
    });
    if (answer.status === 200) {
        const grant = readGrant(answer.body, now);
        if (grant) return grant;
        throw new TokenError('microsoft', { level: 'transient', code: 'provider_unavailable' });
    }
    throw new TokenError('microsoft', classifyMicrosoftTokenError(answer.status, answer.body, { timedOut: answer.timedOut }));
}

/**
 * The `roles` claim of an app token (the Graph application permissions granted in Entra), read without verifying the
 * signature: the token came over TLS straight from the tenant's token endpoint, and the result is informational only
 * ("Entra grants: …" on Test connection). Empty when absent (expected with RBAC for Applications) or unreadable. Pure.
 */
export function appTokenRoles(accessToken: string): string[] {
    const payload = accessToken.split('.')[1];
    if (!payload) return [];
    try {
        const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>;
        return Array.isArray(claims.roles) ? claims.roles.filter((r): r is string => typeof r === 'string').slice(0, 50) : [];
    } catch {
        return [];
    }
}
