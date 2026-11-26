import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { REDACTED_URL_PARAMS, redactUrl } from './redactUrl.js';

describe('redactUrl', () => {
    it('masks every listed parameter', () => {
        for (const name of REDACTED_URL_PARAMS) {
            assert.equal(redactUrl(`/api/x?${name}=s3cr3t&keep=1`), `/api/x?${name}=[REDACTED]&keep=1`, name);
        }
    });

    it('masks an OAuth callback and leaves the rest as it was', () => {
        assert.equal(
            redactUrl('/api/calendar-connections/oauth/google/callback?state=abc&code=4%2F0AQ&scope=email%20openid&hd=nandiniinfosys.com'),
            '/api/calendar-connections/oauth/google/callback?state=[REDACTED]&code=[REDACTED]&scope=email%20openid&hd=nandiniinfosys.com',
        );
    });

    it('matches names case-insensitively and when the name itself is encoded', () => {
        assert.equal(redactUrl('/x?CODE=1&%24deltatoken=abc&%24SkipToken=def'), '/x?CODE=[REDACTED]&%24deltatoken=[REDACTED]&%24SkipToken=[REDACTED]');
        assert.equal(redactUrl('/x?validationtoken=Validation%3A%20Testing'), '/x?validationtoken=[REDACTED]');
    });

    it('masks repeated keys and valueless keys', () => {
        assert.equal(redactUrl('/x?code=a&code=b&state'), '/x?code=[REDACTED]&code=[REDACTED]&state=[REDACTED]');
    });

    it('leaves URLs without a query, and harmless parameters, untouched', () => {
        assert.equal(redactUrl('/api/leads'), '/api/leads');
        assert.equal(redactUrl('/api/leads?page=2&search=code'), '/api/leads?page=2&search=code');
        assert.equal(redactUrl('/api/leads?leadCode=LD-0012&tokens=3'), '/api/leads?leadCode=LD-0012&tokens=3');
        assert.equal(redactUrl(''), '');
        assert.equal(redactUrl(undefined), '');
    });

    it('works on absolute URLs (Graph delta links) and drops a sensitive fragment', () => {
        assert.equal(
            redactUrl('https://graph.microsoft.com/v1.0/me/calendarView/delta?$deltatoken=R0usmc&$top=50'),
            'https://graph.microsoft.com/v1.0/me/calendarView/delta?$deltatoken=[REDACTED]&$top=50',
        );
        assert.equal(redactUrl('https://app/cb?x=1#access_token=abc'), 'https://app/cb?x=1#[REDACTED]');
        assert.equal(redactUrl('https://app/cb?x=1#section'), 'https://app/cb?x=1#section');
    });
});
