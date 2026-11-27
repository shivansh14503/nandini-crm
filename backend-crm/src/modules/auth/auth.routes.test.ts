import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { INVITE_LIMIT, INVITE_WINDOW_SECONDS, localInviteLimit } from './auth.routes.js';

describe('set-password link rate limit (in-process fallback while Redis is down)', () => {
    it('allows 30 requests per IP in 15 minutes, then answers with a retry time', () => {
        const now = 1_000_000;
        for (let i = 0; i < INVITE_LIMIT; i++) assert.equal(localInviteLimit('ip:203.0.113.9', now).allowed, true);
        const refused = localInviteLimit('ip:203.0.113.9', now + 1000);
        assert.equal(refused.allowed, false);
        assert.equal(refused.retryAfterSeconds, INVITE_WINDOW_SECONDS - 1);
        // Another address has its own count; the window starts over after it ends.
        assert.equal(localInviteLimit('ip:203.0.113.10', now).allowed, true);
        assert.equal(localInviteLimit('ip:203.0.113.9', now + INVITE_WINDOW_SECONDS * 1000).allowed, true);
    });
});
