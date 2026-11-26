import { createHash } from 'node:crypto';
import { GOOGLE_DWD_SCOPES, GRAPH_DEFAULT_SCOPE } from '../integrations/integration.constants.js';
import { mintFakeToken } from './providers/fake.js';
import { mintGoogleToken } from './providers/googleServiceAccount.js';
import { mintGraphToken } from './providers/microsoftAppToken.js';
import { loadProviderAccess, type ProviderAccess, type ProviderAppCredentials } from './providers/registry.js';
import type { AccessGrant, FetchImpl, SyncProvider } from './providers/types.js';
import { TokenError } from './syncErrors.js';

/**
 * Access tokens for admin-managed calendar sync (addendum AC7, §2.1). Replaces P2-2's sealed per-user tokens.
 *
 *   - **Never persisted**: not in the database, not in Redis. Each process (API, worker) keeps its own in-memory cache
 *     (LRU, 5,000 entries) keyed by `provider : credentialsVersion : subject : scopeHash` (Microsoft's subject is `*`:
 *     one tenant token serves every mailbox). A grant is reused until 5 minutes before it expires; concurrent misses
 *     for one key share one in-flight call.
 *   - `credentialsVersion` = IntegrationProvider.clientVersion (read through the 60 s credentials cache), bumped by every
 *     key / client / secret / tenant change, so every process stops using old grants within 60 s.
 *   - **Negative cache**, so a broken user or app doesn't hammer the token endpoint: a user-level error is remembered
 *     for 10 minutes per subject, an app-level error for 5 minutes per provider. Transient errors are not cached.
 *   - Nothing here logs a token, an assertion, a key or a secret.
 */

export const REUSE_LEEWAY_MS = 5 * 60 * 1000;
export const USER_NEGATIVE_TTL_MS = 10 * 60 * 1000;
export const APP_NEGATIVE_TTL_MS = 5 * 60 * 1000;
export const TOKEN_CACHE_MAX = 5_000;

/** Default scopes per provider. */
export const DEFAULT_SCOPES: Readonly<Record<SyncProvider, readonly string[]>> = {
    google: GOOGLE_DWD_SCOPES,
    microsoft: [GRAPH_DEFAULT_SCOPE],
    fake: ['fake.calendar'],
};

export interface CalendarTokenSource {
    /**
     * `userEmail`: lower-cased company email (Google `sub`). Microsoft ignores it for minting (one tenant token) but
     * callers still pass it so errors carry the subject. `scopes` default to the provider constant. Throws TokenError.
     */
    getAccessToken(provider: SyncProvider, userEmail: string, scopes?: readonly string[]): Promise<AccessGrant>;
    /** Drops cached grants and remembered errors: one subject, or the whole provider (credentials saved / 401 seen). */
    invalidate(provider: SyncProvider, userEmail?: string): void;
    /** The provider failed app-level within the last 5 minutes (with these credentials). */
    appBlocked(provider: SyncProvider, credentialsVersion: number): TokenError | null;
}

export interface TokenSourceOptions {
    fetchImpl?: FetchImpl;
    now?: () => Date;
    loadAccess?: (provider: SyncProvider) => Promise<ProviderAccess>;
}

const scopeHash = (scopes: readonly string[]) => createHash('sha256').update([...scopes].sort().join(' ')).digest('hex').slice(0, 16);

/** Mints one grant with explicit credentials, no cache (Test connection, and the cache's own misses). */
export async function mintWith(creds: ProviderAppCredentials, subject: string | null, scopes: readonly string[], fetchImpl: FetchImpl, now: Date): Promise<AccessGrant> {
    if (creds.kind === 'google') return mintGoogleToken(creds.key, subject, scopes, fetchImpl, now);
    if (creds.kind === 'microsoft') return mintGraphToken(creds, fetchImpl, now);
    return mintFakeToken(subject ?? '', now);
}

export function createTokenSource(options: TokenSourceOptions = {}): CalendarTokenSource {
    const fetchImpl: FetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
    const now = options.now ?? (() => new Date());
    const loadAccess = options.loadAccess ?? loadProviderAccess;

    const grants = new Map<string, AccessGrant>();
    const inFlight = new Map<string, Promise<AccessGrant>>();
    const userErrors = new Map<string, { error: TokenError; until: number }>();
    const appErrors = new Map<string, { error: TokenError; until: number }>();

    const remember = (key: string, grant: AccessGrant) => {
        grants.delete(key);
        grants.set(key, grant);
        while (grants.size > TOKEN_CACHE_MAX) grants.delete(grants.keys().next().value as string);
    };

    const appBlocked = (provider: SyncProvider, version: number): TokenError | null => {
        const hit = appErrors.get(`${provider}:${version}`);
        if (!hit) return null;
        if (hit.until > now().getTime()) return hit.error;
        appErrors.delete(`${provider}:${version}`);
        return null;
    };

    return {
        async getAccessToken(provider, userEmail, scopes = DEFAULT_SCOPES[provider]) {
            const access = await loadAccess(provider);
            if (!access.creds) throw new TokenError(provider, { level: 'app', code: 'not_configured' });
            const email = userEmail.trim().toLowerCase();
            const version = access.credentialsVersion;
            const subjectKey = `${provider}:${version}:${provider === 'microsoft' ? '*' : email}`;
            const key = `${subjectKey}:${scopeHash(scopes)}`;
            const at = now();

            const blocked = appBlocked(provider, version);
            if (blocked) throw blocked;
            const userHit = userErrors.get(`${provider}:${version}:${email}`);
            if (userHit && userHit.until > at.getTime()) throw userHit.error;

            const cached = grants.get(key);
            if (cached && cached.expiresAt.getTime() - at.getTime() > REUSE_LEEWAY_MS) {
                remember(key, cached);
                return cached;
            }
            const pending = inFlight.get(key);
            if (pending) return pending;

            const creds = access.creds;
            const call = (async () => {
                try {
                    const grant = await mintWith(creds, provider === 'microsoft' ? null : email, scopes, fetchImpl, at);
                    remember(key, grant);
                    return grant;
                } catch (err) {
                    if (err instanceof TokenError) {
                        const t = now().getTime();
                        if (err.level === 'user') userErrors.set(`${provider}:${version}:${email}`, { error: err, until: t + USER_NEGATIVE_TTL_MS });
                        if (err.level === 'app') appErrors.set(`${provider}:${version}`, { error: err, until: t + APP_NEGATIVE_TTL_MS });
                        if (userErrors.size > TOKEN_CACHE_MAX) userErrors.clear();
                    }
                    throw err;
                } finally {
                    inFlight.delete(key);
                }
            })();
            inFlight.set(key, call);
            return call;
        },

        invalidate(provider, userEmail) {
            const email = userEmail?.trim().toLowerCase();
            const matches = (key: string) => {
                const [p, , subject] = key.split(':');
                return p === provider && (email === undefined || subject === email || subject === '*');
            };
            for (const key of [...grants.keys()]) if (matches(key)) grants.delete(key);
            for (const key of [...userErrors.keys()]) if (matches(key)) userErrors.delete(key);
            if (email === undefined) for (const key of [...appErrors.keys()]) if (key.startsWith(`${provider}:`)) appErrors.delete(key);
        },

        appBlocked,
    };
}

/** The process-wide token source (tests build their own with createTokenSource and swap it in). */
let current: CalendarTokenSource = createTokenSource();

export const tokenSource: CalendarTokenSource = {
    getAccessToken: (...args) => current.getAccessToken(...args),
    invalidate: (...args) => current.invalidate(...args),
    appBlocked: (...args) => current.appBlocked(...args),
};

/** Tests: use another token source (null = a fresh default one). */
export function setTokenSourceForTests(source: CalendarTokenSource | null): void {
    current = source ?? createTokenSource();
}
