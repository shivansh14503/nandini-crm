import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    generateInviteToken,
    hashInviteToken,
    INVITE_TTL_HOURS,
    isInviteUsable,
    isWellFormedToken,
    setPasswordUrl,
    tokenMatchesHash,
} from './invite.token.js';
import { escapeHtml } from '../notifications/morningSummary.render.js';
import { formatExpiry, renderSetPasswordEmail } from './inviteEmail.render.js';

describe('set-password link tokens', () => {
    it('are 256 random bits as 43 base64url characters, different every time', () => {
        const tokens = new Set(Array.from({ length: 200 }, generateInviteToken));
        assert.equal(tokens.size, 200);
        for (const token of tokens) assert.equal(isWellFormedToken(token), true, token);
    });

    it('are stored only as a hex SHA-256, compared in constant time', () => {
        const token = generateInviteToken();
        const hash = hashInviteToken(token);
        assert.match(hash, /^[0-9a-f]{64}$/);
        assert.notEqual(hash, token);
        assert.equal(tokenMatchesHash(token, hash), true);
        assert.equal(tokenMatchesHash(generateInviteToken(), hash), false);
        assert.equal(tokenMatchesHash(token, ''), false);
        assert.equal(tokenMatchesHash(token, 'abc'), false);
    });

    it('refuses anything that is not a token before any lookup', () => {
        for (const bad of [undefined, null, 42, '', 'short', `${'a'.repeat(43)}=`, 'a'.repeat(44), `${'a'.repeat(42)}+`, `${'a'.repeat(42)} `]) {
            assert.equal(isWellFormedToken(bad), false, String(bad));
        }
    });

    it('work once, until they expire, while not revoked', () => {
        const now = new Date('2026-11-27T10:00:00.000Z');
        const live = { expiresAt: new Date('2026-11-30T10:00:00.000Z'), usedAt: null, revokedAt: null };
        assert.equal(isInviteUsable(live, now), true);
        assert.equal(isInviteUsable({ ...live, usedAt: now }, now), false);
        assert.equal(isInviteUsable({ ...live, revokedAt: now }, now), false);
        assert.equal(isInviteUsable({ ...live, expiresAt: now }, now), false);
        assert.equal(isInviteUsable(live, new Date('2026-11-30T10:00:00.001Z')), false);
        assert.equal(INVITE_TTL_HOURS, 72);
    });

    it('open the frontend set-password page', () => {
        assert.equal(setPasswordUrl('https://crm.nandiniinfosys.com/', 'abc_-1'), 'https://crm.nandiniinfosys.com/set-password?token=abc_-1');
    });
});

describe('set-password email', () => {
    const base = {
        recipientName: 'Asha',
        username: 'asha.k',
        url: 'https://crm.example.com/set-password?token=tok_en-1',
        expiresLabel: 'Mon, 30 Nov 2026, 3:30 pm IST',
        sentBy: 'Rahul Mehta',
    };

    it('invites a new user with a button, the username, the expiry and a plain-link fallback', () => {
        const email = renderSetPasswordEmail({ ...base, purpose: 'invite' });
        assert.equal(email.subject, 'You’re invited to Nandini CRM');
        assert.match(email.html, /Welcome to Nandini CRM, Asha/);
        assert.match(email.html, /Rahul Mehta added you/);
        assert.match(email.html, />Set your password<\/a>/);
        assert.match(email.html, /asha\.k/);
        assert.match(email.html, /Mon, 30 Nov 2026, 3:30 pm IST/);
        // The button's href, the fallback link's href and its text.
        assert.equal(email.html.split(escapeHtml(base.url)).length - 1, 3);
        assert.match(email.text, /Set your password: https:\/\/crm\.example\.com\/set-password\?token=tok_en-1/);
        assert.match(email.text, /Your username: asha\.k/);
    });

    it('words a reset link differently', () => {
        const email = renderSetPasswordEmail({ ...base, purpose: 'reset', sentBy: null });
        assert.equal(email.subject, 'Reset your Nandini CRM password');
        assert.match(email.html, /You were sent a link to choose a new password/);
        assert.match(email.text, /current password keeps working/);
    });

    it('escapes every value', () => {
        const email = renderSetPasswordEmail({ ...base, purpose: 'invite', recipientName: '<b>x</b>', sentBy: '"Eve" <eve>' });
        assert.doesNotMatch(email.html, /<b>x<\/b>/);
        assert.match(email.html, /&lt;b&gt;x&lt;\/b&gt;/);
        assert.match(email.html, /&quot;Eve&quot; &lt;eve&gt;/);
    });

    it('formats the expiry in the business timezone', () => {
        assert.match(formatExpiry(new Date('2026-11-30T10:00:00.000Z'), 'Asia/Kolkata'), /30 Nov 2026.*3:30/);
    });
});
