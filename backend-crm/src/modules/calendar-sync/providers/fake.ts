import { randomBytes } from 'node:crypto';
import { TokenError, type SyncFailure } from '../syncErrors.js';
import { ProviderAuthError, ProviderBadRequestError } from './http.js';
import type { AccessGrant, CalendarProviderAdapter, CallCtx } from './types.js';

/**
 * In-memory calendar provider `fake` in admin mode (addendum AC12). Two uses:
 *   - tests: the whole enrol → check → (later) push path without Google or Microsoft;
 *   - development: with CALENDAR_FAKE_PROVIDER=true (never in production, never on the shared server) `fake` serves
 *     every company domain no enabled real provider claims, and admins may set it as a per-person override.
 * Its token source mints `fake-at-…` tokens. Test controls make a given user fail with a user-level code, or the whole
 * app fail with an app-level code.
 */

const ACCESS_TTL_MS = 60 * 60 * 1000;

export interface FakeProviderState {
    /** Lower-cased email → user-level failure of the token call (e.g. user_not_found). */
    userFailures: Map<string, SyncFailure>;
    /** App-level failure of every token call (e.g. delegation_missing); null = works. */
    appFailure: SyncFailure | null;
    /** Lower-cased email → HTTP status the probe answers with (e.g. 403 calendar off). */
    probeFailures: Map<string, number>;
    /** Lower-cased emails whose tokens the provider stops accepting once (next API call answers 401). */
    revokeOnce: Set<string>;
    /** Token calls made, newest last (subjects only). */
    mints: string[];
    /** Probe calls made, newest last (mailboxes). */
    probes: string[];
    /** Live tokens → subject. */
    tokens: Map<string, string>;
}

export const fakeProviderState: FakeProviderState = {
    userFailures: new Map(),
    appFailure: null,
    probeFailures: new Map(),
    revokeOnce: new Set(),
    mints: [],
    probes: [],
    tokens: new Map(),
};

export function resetFakeProvider(): void {
    fakeProviderState.userFailures.clear();
    fakeProviderState.appFailure = null;
    fakeProviderState.probeFailures.clear();
    fakeProviderState.revokeOnce.clear();
    fakeProviderState.mints = [];
    fakeProviderState.probes = [];
    fakeProviderState.tokens.clear();
}

/** The fake's token "endpoint": one token per subject, an hour long. Throws TokenError per the test controls. */
export async function mintFakeToken(subject: string, now: Date = new Date()): Promise<AccessGrant> {
    const email = subject.toLowerCase();
    fakeProviderState.mints.push(email);
    if (fakeProviderState.appFailure) throw new TokenError('fake', fakeProviderState.appFailure);
    const userFailure = fakeProviderState.userFailures.get(email);
    if (userFailure) throw new TokenError('fake', userFailure);
    const accessToken = `fake-at-${randomBytes(12).toString('base64url')}`;
    fakeProviderState.tokens.set(accessToken, email);
    return { accessToken, expiresAt: new Date(now.getTime() + ACCESS_TTL_MS) };
}

export function createFakeAdapter(): CalendarProviderAdapter {
    return {
        key: 'fake',

        async probeCalendar(ctx: CallCtx): Promise<void> {
            const mailbox = ctx.mailbox.toLowerCase();
            fakeProviderState.probes.push(mailbox);
            if (fakeProviderState.revokeOnce.delete(mailbox) || fakeProviderState.tokens.get(ctx.accessToken) !== mailbox) {
                fakeProviderState.tokens.delete(ctx.accessToken);
                throw new ProviderAuthError({ provider: 'fake', operation: 'probe', status: 401, code: 'http_401' });
            }
            const status = fakeProviderState.probeFailures.get(mailbox);
            if (status) throw new ProviderBadRequestError({ provider: 'fake', operation: 'probe', status, code: `http_${status}`, providerMessage: 'Calendar unavailable (fake).' });
        },
    };
}
