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
import { formatExpiry } from './inviteEmail.render.js';
import { EMAIL_TEMPLATES, renderEmailTemplate } from '../email/email.templates.js';
import { templateFor } from './invite.service.js';

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
        appName: 'Nandini CRM',
        firstName: 'Asha',
        fullName: 'Asha Kulkarni',
        username: 'asha.k',
        link: 'https://crm.example.com/set-password?token=tok_en-1',
        expiresAt: 'Mon, 30 Nov 2026, 3:30 pm IST',
        linkValidHours: String(INVITE_TTL_HOURS),
        sentBy: 'Rahul Mehta',
    };
    const render = (purpose: 'invite' | 'reset', vars: Record<string, string> = {}, selfService = false) => {
        const def = EMAIL_TEMPLATES[templateFor(purpose, selfService)];
        return renderEmailTemplate(def, def.defaults, { ...base, ...vars });
    };

    it('invites a new user with a button, the username, the expiry and a plain-link fallback', () => {
        const email = render('invite');
        assert.equal(email.subject, 'You’re invited to Nandini CRM');
        assert.match(email.html, /Welcome to Nandini CRM, Asha/);
        assert.match(email.html, /Rahul Mehta added you/);
        assert.match(email.html, />Set your password<\/a>/);
        assert.match(email.html, /asha\.k/);
        assert.match(email.html, /Mon, 30 Nov 2026, 3:30 pm IST/);
        // The button's href, the fallback link's href and its text.
        assert.equal(email.html.split(escapeHtml(base.link)).length - 1, 3);
        assert.match(email.text, /Set your password: https:\/\/crm\.example\.com\/set-password\?token=tok_en-1/);
        assert.match(email.text, /Your username: asha\.k/);
        assert.match(email.text, /Never forward this email/);
    });

    it('words an admin-sent and a self-service reset link differently', () => {
        const email = render('reset', { sentBy: 'Your administrator' });
        assert.equal(email.subject, 'Reset your Nandini CRM password');
        assert.match(email.html, /Your administrator sent you a link to choose a new password/);
        assert.match(email.text, /current password keeps working/);
        const self = render('reset', {}, true);
        assert.match(self.text, /We received a request to reset the password/);
        assert.doesNotMatch(self.text, /Rahul Mehta/);
    });

    it('escapes every value', () => {
        const email = render('invite', { firstName: '<b>x</b>', sentBy: '"Eve" <eve>' });
        assert.doesNotMatch(email.html, /<b>x<\/b>/);
        assert.match(email.html, /&lt;b&gt;x&lt;\/b&gt;/);
        assert.match(email.html, /&quot;Eve&quot; &lt;eve&gt;/);
    });

    it('formats the expiry in the business timezone', () => {
        assert.match(formatExpiry(new Date('2026-11-30T10:00:00.000Z'), 'Asia/Kolkata'), /30 Nov 2026.*3:30/);
    });
});
