import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { describe, it } from 'node:test';
import { connectionTokenAad, planConnectionReencrypt, planReencrypt } from '../../scripts/reencryptIntegrations.js';
import { open, parseKeyRing, seal, type KeyRing } from './secretBox.js';

describe('integrations:reencrypt plan', () => {
    const k1 = randomBytes(32).toString('base64');
    const k2 = randomBytes(32).toString('base64');
    const oldRing = parseKeyRing(`k1:${k1}`) as KeyRing;
    const rotated = parseKeyRing(`k2:${k2},k1:${k1}`) as KeyRing;

    it('re-seals old-key rows with the active key, leaves current rows, and names unreadable ones', () => {
        const aad = (p: string) => `IntegrationProvider:${p}:secrets`;
        const rows = [
            { id: 'google', aad: aad('google'), sealed: seal(oldRing, '{"clientSecret":"g"}', aad('google')) },
            { id: 'microsoft', aad: aad('microsoft'), sealed: seal(rotated, '{"clientSecret":"m"}', aad('microsoft')) },
            { id: 'zoom', aad: aad('zoom'), sealed: seal(parseKeyRing(`k9:${k2}`) as KeyRing, '{}', aad('zoom')) },
            { id: 'bad', aad: aad('bad'), sealed: 'plain' },
        ];
        const plan = planReencrypt(rows, rotated);
        assert.deepEqual(plan.byKid, { k1: 1, k2: 1, k9: 1 });
        assert.equal(plan.alreadyCurrent, 1);
        assert.deepEqual(plan.updates.map((u) => [u.id, u.fromKid]), [['google', 'k1']]);
        assert.equal(open(rotated, plan.updates[0].sealed, aad('google')), '{"clientSecret":"g"}');
        assert.match(plan.updates[0].sealed, /^enc:v1:k2:/);
        assert.deepEqual(plan.unreadable, [
            { id: 'zoom', reason: 'KEY_MISSING' },
            { id: 'bad', reason: 'not a sealed value' },
        ]);
    });

    it('calendar connection tokens: both columns of a row re-sealed in one update, with its tokenVersion; AAD per row and column', () => {
        const at = (id: string) => connectionTokenAad(id, 'accessToken');
        const rt = (id: string) => connectionTokenAad(id, 'refreshToken');
        const rows = [
            { id: 'c-old', tokenVersion: 4, accessTokenEnc: seal(oldRing, 'at-old', at('c-old')), refreshTokenEnc: seal(oldRing, 'rt-old', rt('c-old')) },
            { id: 'c-new', tokenVersion: 1, accessTokenEnc: seal(rotated, 'at-new', at('c-new')), refreshTokenEnc: seal(rotated, 'rt-new', rt('c-new')) },
            { id: 'c-half', tokenVersion: 2, accessTokenEnc: seal(rotated, 'at-half', at('c-half')), refreshTokenEnc: seal(oldRing, 'rt-half', rt('c-half')) },
            // Sealed for another row: the AAD does not match, so it is reported, not re-sealed.
            { id: 'c-moved', tokenVersion: 0, accessTokenEnc: seal(oldRing, 'at-x', at('c-other')), refreshTokenEnc: null },
        ];
        const plan = planConnectionReencrypt(rows, rotated);
        assert.equal(plan.alreadyCurrent, 3);
        assert.deepEqual(plan.byKid, { k1: 4, k2: 3 });
        assert.deepEqual(
            plan.updates.map((u) => [u.id, u.tokenVersion, Boolean(u.accessTokenEnc), Boolean(u.refreshTokenEnc)]),
            [
                ['c-old', 4, true, true],
                ['c-half', 2, false, true],
            ],
        );
        assert.equal(open(rotated, plan.updates[0].accessTokenEnc!, at('c-old')), 'at-old');
        assert.equal(open(rotated, plan.updates[1].refreshTokenEnc!, rt('c-half')), 'rt-half');
        assert.deepEqual(plan.unreadable.map((u) => u.id), ['c-moved|accessToken']);
    });
});
