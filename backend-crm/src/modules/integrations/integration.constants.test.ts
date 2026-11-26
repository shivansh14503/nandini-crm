import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { missingGrantedScopes, normalizeGrantedScopes, redirectUriFor, webhookUrlsFor } from './integration.constants.js';

describe('normalizeGrantedScopes / missingGrantedScopes', () => {
    it('reads Google scopes as case-sensitive full URLs (userinfo.email included, never required)', () => {
        const scope = 'openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/calendar.events.owned https://www.googleapis.com/auth/calendar.events.freebusy';
        assert.ok(normalizeGrantedScopes('google', scope).has('https://www.googleapis.com/auth/userinfo.email'));
        assert.deepEqual(missingGrantedScopes('google', scope), []);
        assert.deepEqual(missingGrantedScopes('google', scope, 'broad'), ['https://www.googleapis.com/auth/calendar.events']);
        assert.deepEqual(missingGrantedScopes('google', 'openid email https://www.googleapis.com/auth/calendar.events.owned'), [
            'https://www.googleapis.com/auth/calendar.events.freebusy',
        ]);
        assert.equal(missingGrantedScopes('google', scope.toUpperCase()).length, 2);
    });
    it('reads Microsoft scopes with or without the Graph prefix, any case, percent-encoded, without OIDC scopes', () => {
        assert.deepEqual(missingGrantedScopes('microsoft', 'https://graph.microsoft.com/Calendars.ReadWrite https://graph.microsoft.com/User.Read'), []);
        assert.deepEqual(missingGrantedScopes('microsoft', 'calendars.readwrite USER.READ'), []);
        assert.deepEqual(missingGrantedScopes('microsoft', 'https%3A%2F%2Fgraph.microsoft.com%2FCalendars.ReadWrite%20https%3A%2F%2Fgraph.microsoft.com%2FUser.Read'), []);
        assert.deepEqual(missingGrantedScopes('microsoft', 'User.Read'), ['calendars.readwrite']);
    });
    it('treats a missing Microsoft scope field as the requested set', () => {
        assert.deepEqual(missingGrantedScopes('microsoft', undefined), []);
        assert.deepEqual(missingGrantedScopes('microsoft', ''), []);
        assert.deepEqual(missingGrantedScopes('google', undefined).length, 2);
    });
});

describe('redirect and webhook URLs', () => {
    it('builds one callback path per provider from PUBLIC_API_URL', () => {
        assert.equal(redirectUriFor('google', 'https://crm.nandiniinfosys.com/'), 'https://crm.nandiniinfosys.com/api/calendar-connections/oauth/google/callback');
        assert.equal(redirectUriFor('microsoft', 'http://localhost:8008'), 'http://localhost:8008/api/calendar-connections/oauth/microsoft/callback');
        assert.equal(redirectUriFor('google', null), null);
    });
    it('lists the webhook URLs', () => {
        assert.deepEqual(webhookUrlsFor('microsoft', 'https://crm.nandiniinfosys.com'), [
            'https://crm.nandiniinfosys.com/api/webhooks/microsoft/calendar',
            'https://crm.nandiniinfosys.com/api/webhooks/microsoft/lifecycle',
        ]);
        assert.equal(webhookUrlsFor('zoom', null), null);
    });
});
