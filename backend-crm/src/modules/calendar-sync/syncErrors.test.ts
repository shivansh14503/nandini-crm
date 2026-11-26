import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { APP_ERROR_CODES, TRANSIENT_ERROR_CODES, USER_ERROR_CODES } from './connection.constants.js';
import { ProviderAuthError, ProviderBadRequestError, ProviderNotFoundError, ProviderPreconditionError, ProviderRateLimitedError, ProviderTransientError } from './providers/http.js';
import {
    ADMIN_ERROR_MESSAGES,
    adminMessageOf,
    classifyApiError,
    classifyGoogleTokenError,
    classifyMicrosoftTokenError,
    PROVIDER_TEXT_MAX,
    providerWordsOf,
    TokenError,
} from './syncErrors.js';

/** Error classification (addendum §2.3): every documented answer → level + code; admin sentences ≤ 300. */

describe('Google token endpoint', () => {
    const cases: [string, number, unknown, string, string][] = [
        ['delegation not set up', 401, { error: 'unauthorized_client', error_description: 'Client is unauthorized to retrieve access tokens.' }, 'app', 'delegation_missing'],
        [
            'delegation added with the email / wrong id',
            401,
            { error: 'unauthorized_client', error_description: 'Client is unauthorized to retrieve access tokens using this method, or client not authorized for any of the scopes requested.' },
            'app',
            'delegation_wrong_id',
        ],
        ['a scope missing in the Admin console', 400, { error: 'access_denied', error_description: 'Requested client not authorized.' }, 'app', 'scopes_not_authorised'],
        ['Workspace policy', 400, { error: 'admin_policy_enforced' }, 'app', 'admin_policy'],
        ['deleted key', 401, { error: 'invalid_client', error_description: 'The OAuth client was not found.' }, 'app', 'key_invalid'],
        ['disabled service account', 401, { error: 'disabled_client' }, 'app', 'key_invalid'],
        ['bad signature', 400, { error: 'invalid_grant', error_description: 'Invalid JWT Signature.' }, 'app', 'key_invalid'],
        ['clock skew', 400, { error: 'invalid_grant', error_description: 'Invalid JWT: Token must be a short-lived token (60 minutes) and in a reasonable timeframe.' }, 'app', 'clock_skew'],
        ['unknown user', 400, { error: 'invalid_grant', error_description: 'Invalid email or User ID' }, 'user', 'user_not_found'],
        ['suspended user (undocumented text)', 400, { error: 'invalid_grant', error_description: 'Something else' }, 'user', 'user_unavailable'],
        ['unexpected 400', 400, { error: 'weird' }, 'app', 'provider_error'],
        ['rate limited', 429, null, 'transient', 'rate_limited'],
        ['server error', 502, null, 'transient', 'provider_unavailable'],
        ['network', 0, null, 'transient', 'network'],
    ];
    for (const [name, status, body, level, code] of cases) {
        it(`${name} → ${level} ${code}`, () => {
            const failure = classifyGoogleTokenError(status, body);
            assert.equal(failure.level, level);
            assert.equal(failure.code, code);
        });
    }

    it('a timeout is provider_unavailable; provider words are error: first line of the description, ≤ 300', () => {
        assert.equal(classifyGoogleTokenError(0, null, { timedOut: true }).code, 'provider_unavailable');
        const words = providerWordsOf({ error: 'invalid_grant', error_description: `Line one ${'x'.repeat(400)}\nsecond line with asha@x.com` });
        assert.ok(words.startsWith('invalid_grant: Line one'));
        assert.equal(words.length, PROVIDER_TEXT_MAX);
        assert.ok(!words.includes('second line'));
        assert.equal(providerWordsOf('text'), '');
    });
});

describe('Microsoft token endpoint', () => {
    it('every failure is app-level (AADSTS in error_codes or the text); 5xx / 429 transient', () => {
        assert.equal(classifyMicrosoftTokenError(401, { error: 'invalid_client', error_codes: [7000215] }).code, 'invalid_client');
        assert.equal(classifyMicrosoftTokenError(401, { error: 'invalid_client', error_description: 'AADSTS7000222: expired' }).code, 'secret_expired');
        assert.equal(classifyMicrosoftTokenError(400, { error: 'unauthorized_client', error_description: 'AADSTS700016: not found' }).code, 'app_not_in_tenant');
        assert.equal(classifyMicrosoftTokenError(400, { error: 'invalid_request', error_codes: [90002] }).code, 'tenant_not_found');
        assert.equal(classifyMicrosoftTokenError(401, { error: 'invalid_client' }).code, 'invalid_client');
        assert.deepEqual(classifyMicrosoftTokenError(400, { error: 'other' }).level, 'app');
        assert.equal(classifyMicrosoftTokenError(503, null).level, 'transient');
        assert.equal(classifyMicrosoftTokenError(429, null).code, 'rate_limited');
    });
});

describe('calendar API errors', () => {
    const err = (Ctor: typeof ProviderAuthError, provider: string, status: number, code: string) => new Ctor({ provider, operation: 'probe', status, code });

    it('Microsoft: ErrorAccessDenied → user mailbox_out_of_scope (any status); mailbox codes / probe 404 → no_mailbox', () => {
        assert.deepEqual(classifyApiError('microsoft', err(ProviderBadRequestError, 'microsoft', 403, 'ErrorAccessDenied'))?.code, 'mailbox_out_of_scope');
        assert.equal(classifyApiError('microsoft', err(ProviderBadRequestError, 'microsoft', 403, 'ErrorAccessDenied'))?.level, 'user');
        assert.equal(classifyApiError('microsoft', err(ProviderNotFoundError, 'microsoft', 404, 'MailboxNotEnabledForRESTAPI'))?.code, 'no_mailbox');
        assert.equal(classifyApiError('microsoft', err(ProviderNotFoundError, 'microsoft', 404, 'ErrorInvalidUser'), { probe: true })?.code, 'no_mailbox');
        assert.equal(classifyApiError('microsoft', err(ProviderNotFoundError, 'microsoft', 404, 'http_404'), { probe: true })?.code, 'no_mailbox');
        // A 404 on one event outside a probe says nothing about the person.
        assert.equal(classifyApiError('microsoft', err(ProviderNotFoundError, 'microsoft', 404, 'ErrorItemNotFound')), null);
    });

    it('Google / fake: 403 or 404 on the probe → user calendar_unavailable; elsewhere null', () => {
        assert.equal(classifyApiError('google', err(ProviderAuthError, 'google', 403, 'insufficientPermissions'), { probe: true })?.code, 'calendar_unavailable');
        assert.equal(classifyApiError('google', err(ProviderNotFoundError, 'google', 404, 'notFound'), { probe: true })?.code, 'calendar_unavailable');
        assert.equal(classifyApiError('fake', err(ProviderBadRequestError, 'fake', 403, 'http_403'), { probe: true })?.code, 'calendar_unavailable');
        assert.equal(classifyApiError('google', err(ProviderNotFoundError, 'google', 404, 'notFound')), null);
        assert.equal(classifyApiError('google', err(ProviderPreconditionError, 'google', 412, 'conditionNotMet'), { probe: true }), null);
    });

    it('rate limits and 5xx are transient; TokenErrors keep their level; other errors → null', () => {
        assert.deepEqual(classifyApiError('google', err(ProviderRateLimitedError, 'google', 429, 'rateLimitExceeded')), { level: 'transient', code: 'rate_limited' });
        assert.deepEqual(classifyApiError('google', err(ProviderTransientError, 'google', 0, 'network')), { level: 'transient', code: 'network' });
        assert.deepEqual(classifyApiError('google', err(ProviderTransientError, 'google', 503, 'backendError')), { level: 'transient', code: 'provider_unavailable' });
        const token = new TokenError('google', { level: 'user', code: 'user_not_found', providerText: 'invalid_grant: Invalid email or User ID' });
        assert.deepEqual(classifyApiError('google', token), { level: 'user', code: 'user_not_found', providerText: 'invalid_grant: Invalid email or User ID' });
        assert.equal(classifyApiError('google', new Error('boom')), null);
    });
});

describe('admin messages', () => {
    it('every code has a sentence ≤ 300; adminMessageOf adds the provider words in brackets within 300', () => {
        for (const code of [...USER_ERROR_CODES, ...APP_ERROR_CODES, ...TRANSIENT_ERROR_CODES]) {
            assert.ok(ADMIN_ERROR_MESSAGES[code], code);
            assert.ok(ADMIN_ERROR_MESSAGES[code].length <= PROVIDER_TEXT_MAX, code);
        }
        assert.equal(adminMessageOf({ code: 'user_not_found' }), ADMIN_ERROR_MESSAGES.user_not_found);
        const long = adminMessageOf({ code: 'user_not_found', providerText: 'y'.repeat(500) });
        assert.ok(long.startsWith(`${ADMIN_ERROR_MESSAGES.user_not_found} (`));
        assert.ok(long.length <= PROVIDER_TEXT_MAX);
    });

    it('TokenError message names only the provider and the code', () => {
        const error = new TokenError('google', { level: 'user', code: 'user_not_found', providerText: 'asha@nandiniinfosys.com' });
        assert.equal(error.message, 'google token failed: user_not_found');
    });
});
