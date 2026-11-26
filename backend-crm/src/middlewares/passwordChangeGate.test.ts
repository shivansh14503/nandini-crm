import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { effectiveMustChangePassword, gatePath, isAllowedWhilePasswordChangeRequired as allowed, passwordChangeRequired } from './passwordChangeGate.js';

describe('must-change-password allow-list', () => {
    it('allows only what the change-password screen needs', () => {
        assert.equal(allowed('GET', '/api/auth/me'), true);
        assert.equal(allowed('POST', '/api/auth/logout'), true);
        assert.equal(allowed('POST', '/api/auth/change-password'), true);
        assert.equal(allowed('GET', '/api/me/profile'), true);
        assert.equal(allowed('GET', '/api/me/sessions'), true);
        assert.equal(allowed('GET', '/api/user-photos/6f1c2a8e-1111-4222-8333-944455556666'), true);
        assert.equal(allowed('HEAD', '/api/auth/me'), true);
    });

    it('ignores the query string, letter case and a trailing slash', () => {
        assert.equal(allowed('GET', '/api/auth/me?x=1'), true);
        assert.equal(allowed('GET', '/API/Auth/Me/'), true);
        assert.equal(allowed('get', '/api/me/profile/'), true);
    });

    it('refuses every other route and method', () => {
        assert.equal(allowed('PATCH', '/api/me/profile'), false);
        assert.equal(allowed('PUT', '/api/me/photo'), false);
        assert.equal(allowed('DELETE', '/api/me/sessions'), false);
        assert.equal(allowed('DELETE', '/api/me/sessions/abc'), false);
        assert.equal(allowed('GET', '/api/leads'), false);
        assert.equal(allowed('GET', '/api/admin/users'), false);
        assert.equal(allowed('POST', '/api/auth/me'), false);
        assert.equal(allowed('GET', '/api/auth/change-password'), false);
        assert.equal(allowed('GET', '/api/lookups/users'), false);
    });

    it('never lets a photo path reach another router', () => {
        assert.equal(allowed('GET', '/api/user-photos/'), false);
        assert.equal(allowed('GET', '/api/user-photos/a/b'), false);
        assert.equal(allowed('GET', '/api/user-photos/../leads'), false);
        assert.equal(allowed('GET', '/api/user-photos/..'), false);
        assert.equal(allowed('GET', '/api/me/profile/../../leads'), false);
        assert.equal(allowed('GET', '/api/auth/mex'), false);
    });

    it('normalizes paths', () => {
        assert.equal(gatePath('/API/Me/Profile/?a=b#c'), '/api/me/profile');
        assert.equal(gatePath('/'), '/');
    });

    it('answers 403 PASSWORD_CHANGE_REQUIRED', () => {
        const err = passwordChangeRequired();
        assert.equal(err.statusCode, 403);
        assert.equal(err.code, 'PASSWORD_CHANGE_REQUIRED');
        assert.equal(err.message, 'Change your password to continue.');
    });

    it('/auth/me stays locked while the token carries `mcp`, even after the stored flag was cleared', () => {
        // Password changed on another device, but this session (untracked, or Redis down) still has the claim.
        assert.equal(effectiveMustChangePassword(false, true), true);
        assert.equal(effectiveMustChangePassword(true, false), true);
        assert.equal(effectiveMustChangePassword(false, false), false);
    });
});
