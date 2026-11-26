import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { describe, it } from 'node:test';
import { planReencrypt } from '../../scripts/reencryptIntegrations.js';
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
});
