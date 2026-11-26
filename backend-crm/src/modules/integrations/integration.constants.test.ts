import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GOOGLE_DWD_SCOPES, GOOGLE_DWD_SCOPES_ADMIN_CONSOLE, GOOGLE_KEY_CHECK_SCOPE, microsoftAuthorityUrl, webhookUrlsFor } from './integration.constants.js';

describe('Google domain-wide delegation scopes', () => {
    it('the two least-privilege calendar scopes; the Admin console string is comma-separated without spaces', () => {
        assert.deepEqual(GOOGLE_DWD_SCOPES, ['https://www.googleapis.com/auth/calendar.events.owned', 'https://www.googleapis.com/auth/calendar.events.freebusy']);
        assert.equal(GOOGLE_DWD_SCOPES_ADMIN_CONSOLE, 'https://www.googleapis.com/auth/calendar.events.owned,https://www.googleapis.com/auth/calendar.events.freebusy');
        assert.ok(GOOGLE_DWD_SCOPES.includes(GOOGLE_KEY_CHECK_SCOPE));
    });
});

describe('URLs', () => {
    it('Microsoft authority per tenant (encoded)', () => {
        assert.equal(microsoftAuthorityUrl('contoso.onmicrosoft.com'), 'https://login.microsoftonline.com/contoso.onmicrosoft.com/oauth2/v2.0');
        assert.equal(microsoftAuthorityUrl('a/b'), 'https://login.microsoftonline.com/a%2Fb/oauth2/v2.0');
    });
    it('lists the webhook URLs', () => {
        assert.deepEqual(webhookUrlsFor('microsoft', 'https://crm.nandiniinfosys.com'), [
            'https://crm.nandiniinfosys.com/api/webhooks/microsoft/calendar',
            'https://crm.nandiniinfosys.com/api/webhooks/microsoft/lifecycle',
        ]);
        assert.equal(webhookUrlsFor('zoom', null), null);
    });
});
