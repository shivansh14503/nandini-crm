import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { afterEach, describe, it } from 'node:test';
import { configureSecretBox, keyIdOf, open, parseKeyRing, seal, secretBox, SecretBoxError, subkey, type KeyRing } from './secretBox.js';

const key = () => randomBytes(32).toString('base64');
const k1 = key();
const k2 = key();
const ring = (raw: string) => parseKeyRing(raw) as KeyRing;
const code = (fn: () => unknown) => {
    try {
        fn();
    } catch (err) {
        assert.ok(err instanceof SecretBoxError, `expected a SecretBoxError, got ${String(err)}`);
        return err.code;
    }
    assert.fail('expected a throw');
};

describe('parseKeyRing', () => {
    it('reads blank / unset as not configured', () => {
        assert.equal(parseKeyRing(undefined), null);
        assert.equal(parseKeyRing(''), null);
        assert.equal(parseKeyRing('   '), null);
    });

    it('reads a bare base64 key as k1', () => {
        const r = ring(k1);
        assert.equal(r.activeKid, 'k1');
        assert.deepEqual([...r.keys.keys()], ['k1']);
    });

    it('reads a kid list with the first entry active', () => {
        const r = ring(`k2:${k2}, k1:${k1}`);
        assert.equal(r.activeKid, 'k2');
        assert.deepEqual([...r.keys.keys()], ['k2', 'k1']);
    });

    it('refuses bad kids, duplicate kids, wrong key lengths and non-base64', () => {
        assert.equal(code(() => parseKeyRing(`K1:${k1}`)), 'FORMAT');
        assert.equal(code(() => parseKeyRing(`toolongkid:${k1}`)), 'FORMAT');
        assert.equal(code(() => parseKeyRing(`k1:${k1},k1:${k2}`)), 'FORMAT');
        assert.equal(code(() => parseKeyRing(`k1:${randomBytes(31).toString('base64')}`)), 'FORMAT');
        assert.equal(code(() => parseKeyRing(randomBytes(33).toString('base64'))), 'FORMAT');
        assert.equal(code(() => parseKeyRing('k1:not base64!!')), 'FORMAT');
        assert.equal(code(() => parseKeyRing(`k1:${k1},`)), 'FORMAT');
        assert.equal(code(() => parseKeyRing(`:${k1}`)), 'FORMAT');
    });

    it('never puts the key in an error message', () => {
        try {
            parseKeyRing(`k1:${randomBytes(31).toString('base64')}`);
        } catch (err) {
            assert.ok(!(err as Error).message.includes(k1));
        }
    });
});

describe('seal / open', () => {
    const r = ring(`k1:${k1}`);

    it('round-trips text, unicode included, with the expected format', () => {
        const sealed = seal(r, 'GOCSPX-secret ✓ ₹', 'IntegrationProvider:google:secrets');
        assert.match(sealed, /^enc:v1:k1:[\w-]+:[\w-]+:[\w-]*$/);
        assert.equal(open(r, sealed, 'IntegrationProvider:google:secrets'), 'GOCSPX-secret ✓ ₹');
        assert.equal(keyIdOf(sealed), 'k1');
    });

    it('uses a fresh IV each time', () => {
        assert.notEqual(seal(r, 'same', 'aad'), seal(r, 'same', 'aad'));
    });

    it('refuses a wrong AAD, a changed tag or a changed ciphertext (TAMPERED)', () => {
        const sealed = seal(r, 'secret value', 'IntegrationProvider:google:secrets');
        assert.equal(code(() => open(r, sealed, 'IntegrationProvider:microsoft:secrets')), 'TAMPERED');
        const parts = sealed.split(':');
        const flip = (b64: string) => {
            const bytes = Buffer.from(b64, 'base64url');
            bytes[0] ^= 1;
            return bytes.toString('base64url');
        };
        assert.equal(code(() => open(r, [...parts.slice(0, 4), flip(parts[4]), parts[5]].join(':'), 'IntegrationProvider:google:secrets')), 'TAMPERED');
        assert.equal(code(() => open(r, [...parts.slice(0, 5), flip(parts[5])].join(':'), 'IntegrationProvider:google:secrets')), 'TAMPERED');
    });

    it('refuses a value sealed with another key under the same kid (TAMPERED)', () => {
        const sealed = seal(ring(`k1:${k2}`), 'x', 'aad');
        assert.equal(code(() => open(r, sealed, 'aad')), 'TAMPERED');
    });

    it('answers KEY_MISSING for a kid the ring lacks, FORMAT for garbage', () => {
        const sealed = seal(ring(`k9:${k2}`), 'x', 'aad');
        assert.equal(code(() => open(r, sealed, 'aad')), 'KEY_MISSING');
        assert.equal(code(() => open(r, 'plain text', 'aad')), 'FORMAT');
        assert.equal(code(() => open(r, 'enc:v1:k1:a:b:c', 'aad')), 'FORMAT');
        assert.equal(code(() => keyIdOf('enc:v2:k1:a:b:c')), 'FORMAT');
    });

    it('seals with the active kid after rotation while the old kid still opens', () => {
        const old = seal(ring(`k1:${k1}`), 'old secret', 'aad');
        const rotated = ring(`k2:${k2},k1:${k1}`);
        const fresh = seal(rotated, 'new secret', 'aad');
        assert.equal(keyIdOf(fresh), 'k2');
        assert.equal(open(rotated, old, 'aad'), 'old secret');
        assert.equal(open(rotated, fresh, 'aad'), 'new secret');
    });
});

describe('subkey', () => {
    it('is stable per key and purpose, and differs between keys', () => {
        const a = ring(`k2:${k2},k1:${k1}`);
        const b = ring(`k1:${k1}`);
        assert.equal(subkey(a, 'webhook').length, 32);
        assert.deepEqual(subkey(a, 'webhook', 'k1'), subkey(b, 'webhook'));
        assert.notDeepEqual(subkey(a, 'webhook'), subkey(a, 'webhook', 'k1'));
        assert.equal(code(() => subkey(b, 'webhook', 'k7')), 'KEY_MISSING');
    });
});

describe('secretBox singleton', () => {
    afterEach(() => configureSecretBox(null));

    it('is not ready without a ring and refuses to seal', () => {
        configureSecretBox(null);
        assert.equal(secretBox.ready(), false);
        assert.equal(secretBox.activeKid(), null);
        assert.equal(code(() => secretBox.seal('x', 'aad')), 'NOT_CONFIGURED');
    });

    it('seals and opens with the configured ring', () => {
        configureSecretBox(ring(`k3:${k1}`));
        assert.equal(secretBox.ready(), true);
        assert.equal(secretBox.activeKid(), 'k3');
        assert.equal(secretBox.hasKey('k3'), true);
        assert.equal(secretBox.hasKey('k1'), false);
        assert.equal(secretBox.open(secretBox.seal('hello', 'aad'), 'aad'), 'hello');
    });
});
