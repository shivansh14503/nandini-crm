import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { BOOKING_TOKEN_TTL_SECONDS } from './bookingLink.constants.js';
import { setBookingSigningKeyForTests, signSlot, tokenHashOf, verifySlot } from './bookingLink.token.js';

const LINK = { id: 'link-1', updatedAt: new Date('2026-11-26T10:00:00.000Z') };
const NOW = new Date('2026-11-30T03:30:00.000Z');
const START = new Date('2026-11-30T05:00:00.000Z');

describe('booking slot tokens', () => {
    afterEach(() => setBookingSigningKeyForTests(null));

    it('round-trips the claim and is compact', () => {
        const token = signSlot(LINK, { start: START, durationMinutes: 30 }, NOW);
        assert.ok(token.length <= 60, token);
        assert.match(token, /^v1\.[0-9a-z]+\.30\.[0-9a-z]+\.[A-Za-z0-9_-]{22}$/);
        const result = verifySlot(LINK, token, NOW);
        assert.deepEqual(result, { ok: true, claim: { start: START, durationMinutes: 30 } });
    });

    it('refuses another link, another version of the link, or a changed claim', () => {
        const token = signSlot(LINK, { start: START, durationMinutes: 30 }, NOW);
        assert.deepEqual(verifySlot({ ...LINK, id: 'link-2' }, token, NOW), { ok: false, problem: 'bad_signature' });
        assert.deepEqual(verifySlot({ ...LINK, updatedAt: new Date(LINK.updatedAt.getTime() + 1) }, token, NOW), { ok: false, problem: 'bad_signature' });
        const parts = token.split('.');
        const longer = [parts[0], parts[1], '60', parts[3], parts[4]].join('.');
        assert.deepEqual(verifySlot(LINK, longer, NOW), { ok: false, problem: 'bad_signature' });
        const earlier = [parts[0], (parseInt(parts[1], 36) - 1800).toString(36), parts[2], parts[3], parts[4]].join('.');
        assert.deepEqual(verifySlot(LINK, earlier, NOW), { ok: false, problem: 'bad_signature' });
    });

    it('expires after the TTL', () => {
        const token = signSlot(LINK, { start: START, durationMinutes: 30 }, NOW);
        const later = new Date(NOW.getTime() + BOOKING_TOKEN_TTL_SECONDS * 1000 + 1000);
        assert.deepEqual(verifySlot(LINK, token, later), { ok: false, problem: 'expired', claim: { start: START, durationMinutes: 30 } }, 'the claim comes back for the resubmit check');
        const extended = token.replace(/\.([0-9a-z]+)\.([^.]+)$/, (_m, exp: string, mac: string) => `.${(parseInt(exp, 36) + 3600).toString(36)}.${mac}`);
        assert.deepEqual(verifySlot(LINK, extended, later), { ok: false, problem: 'bad_signature' }, 'the expiry is signed');
    });

    it('a token signed with another key is refused', () => {
        const token = signSlot(LINK, { start: START, durationMinutes: 30 }, NOW);
        setBookingSigningKeyForTests(Buffer.alloc(32, 7));
        assert.deepEqual(verifySlot(LINK, token, NOW), { ok: false, problem: 'bad_signature' });
    });

    it('malformed tokens are refused before any MAC work', () => {
        for (const bad of ['', 'v1', 'v2.a.30.b.cccccccccccccccccccccc', 'v1.a.30.b.short', 'v1.A!.30.b.cccccccccccccccccccccc', 'v1.a.99999.b.cccccccccccccccccccccc']) {
            assert.deepEqual(verifySlot(LINK, bad, NOW), { ok: false, problem: 'malformed' }, bad);
        }
    });

    it('hashes tokens for the one-use index', () => {
        assert.match(tokenHashOf('abc'), /^[0-9a-f]{64}$/);
        assert.notEqual(tokenHashOf('abc'), tokenHashOf('abd'));
    });
});
