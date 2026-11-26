import { createHash, randomBytes } from 'node:crypto';
import { ProviderAuthError } from './http.js';
import { IdentityError } from './idToken.js';
import type { AccountIdentity, AuthorizeUrlInput, CalendarProviderAdapter, ProviderCredentials, TokenSet } from './types.js';

/**
 * In-memory calendar provider `fake` (spec §6.1, §15.1). Two uses:
 *   - tests: the whole connect → callback → refresh → disconnect flow without Google or Microsoft;
 *   - development: with CALENDAR_FAKE_PROVIDER=true (never in production, never on the shared server) the Connected
 *     calendars card offers "Test calendar", whose "consent screen" is an immediate redirect back to the callback.
 * The account is always the CRM user's existing company email (passed as `loginHint`): the connect flow refuses a
 * user without one, and the fake never causes `User.email` to be written.
 * It honours PKCE (the verifier must match the challenge) and the nonce, so the real checks run against it.
 */

export const FAKE_SCOPE = 'fake.calendar';
const ACCESS_TTL_MS = 60 * 60 * 1000;

interface FakeGrant {
    email: string;
    nonce: string;
    codeChallenge?: string;
    used: boolean;
}

interface FakeRefresh {
    email: string;
    revoked: boolean;
}

const b64url = (buf: Buffer) => buf.toString('base64url');
const token = (prefix: string) => `${prefix}-${b64url(randomBytes(18))}`;

/** Test controls and the in-memory state (one per process). */
export interface FakeProviderState {
    codes: Map<string, FakeGrant>;
    refreshTokens: Map<string, FakeRefresh>;
    accessTokens: Map<string, { email: string; nonce: string; expiresAt: Date }>;
    /** Revoke calls received (tokens), newest last. */
    revoked: string[];
    /** The next refresh answers with this OAuth error (then clears). */
    failNextRefresh: string | null;
    /** The next token exchange grants this scope string instead of FAKE_SCOPE (then clears). */
    nextScope: string | null;
    /** Override of the account email returned by identity (tests: mismatch). */
    identityEmail: string | null;
    refreshCalls: number;
}

export const fakeProviderState: FakeProviderState = {
    codes: new Map(),
    refreshTokens: new Map(),
    accessTokens: new Map(),
    revoked: [],
    failNextRefresh: null,
    nextScope: null,
    identityEmail: null,
    refreshCalls: 0,
};

export function resetFakeProvider(): void {
    fakeProviderState.codes.clear();
    fakeProviderState.refreshTokens.clear();
    fakeProviderState.accessTokens.clear();
    fakeProviderState.revoked = [];
    fakeProviderState.failNextRefresh = null;
    fakeProviderState.nextScope = null;
    fakeProviderState.identityEmail = null;
    fakeProviderState.refreshCalls = 0;
}

/** Credentials of the fake (it has no company app to set up). */
export const FAKE_CREDENTIALS: ProviderCredentials = { clientId: 'fake-client', clientSecret: 'fake-secret', settings: {} };

const authError = (operation: string, code: string) => new ProviderAuthError({ provider: 'fake', operation, status: 400, code });

export function createFakeAdapter(options: { now?: () => Date } = {}): CalendarProviderAdapter {
    const now = options.now ?? (() => new Date());

    const issueAccess = (email: string, nonce: string, scope: string | null, refreshToken?: string, at: Date = now()): TokenSet => {
        const accessToken = token('fake-at');
        const expiresAt = new Date(at.getTime() + ACCESS_TTL_MS);
        fakeProviderState.accessTokens.set(accessToken, { email, nonce, expiresAt });
        return { accessToken, expiresAt, scope, ...(refreshToken ? { refreshToken } : {}), idToken: accessToken };
    };

    return {
        key: 'fake',
        canRevoke: true,

        requestedScopes: () => [FAKE_SCOPE],

        authorizeUrl(i: AuthorizeUrlInput): string {
            const code = token('fake-code');
            fakeProviderState.codes.set(code, { email: (i.loginHint ?? '').toLowerCase(), nonce: i.nonce, codeChallenge: i.codeChallenge, used: false });
            const params = new URLSearchParams({ code, state: i.state });
            return `${i.redirectUri}?${params.toString()}`;
        },

        async exchangeCode({ code, codeVerifier }): Promise<TokenSet> {
            const grant = fakeProviderState.codes.get(code);
            if (!grant || grant.used) throw authError('token', 'invalid_grant');
            grant.used = true;
            if (grant.codeChallenge) {
                const challenge = b64url(createHash('sha256').update(codeVerifier ?? '').digest());
                if (challenge !== grant.codeChallenge) throw authError('token', 'invalid_grant');
            }
            const refreshToken = token('fake-rt');
            fakeProviderState.refreshTokens.set(refreshToken, { email: grant.email, revoked: false });
            const scope = fakeProviderState.nextScope ?? FAKE_SCOPE;
            fakeProviderState.nextScope = null;
            return issueAccess(grant.email, grant.nonce, scope, refreshToken);
        },

        async identity(tokens: TokenSet, _creds, nonce: string): Promise<AccountIdentity> {
            const access = fakeProviderState.accessTokens.get(tokens.idToken ?? '');
            if (!access) throw new IdentityError('provider_error', 'id_token_unreadable');
            if (access.nonce !== nonce) throw new IdentityError('invalid', 'nonce');
            const email = (fakeProviderState.identityEmail ?? access.email).toLowerCase();
            if (!email) throw new IdentityError('provider_error', 'email_missing');
            return { accountId: `fake:${email}`, email, tenantId: 'fake', emailVerified: true };
        },

        async refresh({ refreshToken }): Promise<TokenSet> {
            fakeProviderState.refreshCalls += 1;
            const failure = fakeProviderState.failNextRefresh;
            fakeProviderState.failNextRefresh = null;
            if (failure) throw authError('refresh', failure);
            const known = fakeProviderState.refreshTokens.get(refreshToken);
            if (!known || known.revoked) throw authError('refresh', 'invalid_grant');
            // Rotates like Microsoft: the old refresh token stops working, the new one must replace it.
            known.revoked = true;
            const next = token('fake-rt');
            fakeProviderState.refreshTokens.set(next, { email: known.email, revoked: false });
            return issueAccess(known.email, '', FAKE_SCOPE, next);
        },

        async revoke({ token: value }): Promise<void> {
            fakeProviderState.revoked.push(value);
            const known = fakeProviderState.refreshTokens.get(value);
            if (known) known.revoked = true;
        },

        missingScopes: (tokens) => ((tokens.scope ?? '').split(/\s+/).includes(FAKE_SCOPE) ? [] : [FAKE_SCOPE]),
    };
}
