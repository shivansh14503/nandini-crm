import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseSessionRecord, sessionKey, sessionKeyPattern } from './sessionRecord.js';

const now = new Date('2026-11-26T10:00:00.000Z');
const jti = '3f2b8c1e-4d5a-4b6c-9d7e-8f9a0b1c2d3e';
const key = sessionKey(7, jti);

describe('session keys', () => {
    it('are session:{userId}:{jti}, matched per user', () => {
        assert.equal(key, `session:7:${jti}`);
        assert.equal(sessionKeyPattern(7), 'session:7:*');
    });
});

describe('parseSessionRecord', () => {
    it('reads the stored details and the expiry from the PTTL', () => {
        const value = JSON.stringify({ ip: '10.0.0.5', userAgent: 'Firefox/133.0', createdAt: '2026-11-26T08:00:00.000Z' });
        assert.deepEqual(parseSessionRecord(key, value, 3_600_000, now), {
            jti,
            ip: '10.0.0.5',
            userAgent: 'Firefox/133.0',
            createdAt: '2026-11-26T08:00:00.000Z',
            expiresAt: '2026-11-26T11:00:00.000Z',
        });
    });

    it('skips a key that is gone', () => {
        assert.equal(parseSessionRecord(key, null, 1000, now), null);
        assert.equal(parseSessionRecord(key, '{}', -2, now), null);
        assert.equal(parseSessionRecord('session:7:', '{}', 1000, now), null);
    });

    it('keeps a session whose value is not the expected JSON, without details', () => {
        const empty = { jti, ip: null, userAgent: null, createdAt: null, expiresAt: null };
        assert.deepEqual(parseSessionRecord(key, 'not json', -1, now), empty);
        assert.deepEqual(parseSessionRecord(key, '[1,2]', -1, now), empty);
        assert.deepEqual(parseSessionRecord(key, JSON.stringify({ ip: 5, userAgent: '', createdAt: 'yesterday' }), -1, now), empty);
    });

    it('cuts an oversized User-Agent', () => {
        const record = parseSessionRecord(key, JSON.stringify({ userAgent: 'x'.repeat(1000) }), 1000, now);
        assert.equal(record?.userAgent?.length, 400);
    });
});
