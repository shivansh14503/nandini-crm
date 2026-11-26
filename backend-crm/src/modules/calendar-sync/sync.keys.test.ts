import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';
import { checkJobId, enrolledJobId, eventKeyOf, pushJobId, REQUESTED_ID_PATTERN, requestedIdFor, syncKeyOf } from './sync.keys.js';

/** Identifiers of the push engine (spec D10, §8.2, §10.1). */

const sha = (value: string) => createHash('sha256').update(value).digest('hex');

describe('sync.keys', () => {
    it('requestedIdFor: crm + 40 hex of sha256(activity:connection:generation), Google-id safe and stable', () => {
        const id = requestedIdFor('act-1', 'conn-1', 0);
        assert.equal(id, `crm${sha('act-1:conn-1:0').slice(0, 40)}`);
        assert.match(id, REQUESTED_ID_PATTERN);
        // Google ids: base32hex (a–v, 0–9), 5–1024 characters.
        assert.match(id, /^[a-v0-9]{5,1024}$/);
        assert.equal(requestedIdFor('act-1', 'conn-1', 0), id);
        assert.notEqual(requestedIdFor('act-1', 'conn-1', 1), id, 'a new generation is a new id');
        assert.notEqual(requestedIdFor('act-1', 'conn-2', 0), id, "another owner's calendar is a new id");
    });

    it('syncKeyOf = sha256(iCalUID|recurrenceId); eventKeyOf = sha256(event id); 64 hex each', () => {
        assert.equal(syncKeyOf('abc@google.com'), sha('abc@google.com|'));
        assert.equal(syncKeyOf('abc@google.com', '20261127T100000Z'), sha('abc@google.com|20261127T100000Z'));
        assert.equal(eventKeyOf('x'.repeat(1024)), sha('x'.repeat(1024)));
        assert.equal(eventKeyOf('AAMk-1').length, 64);
    });

    it('job ids use hyphens only (BullMQ ids never contain ":")', () => {
        const at = new Date('2026-11-27T05:00:00.123Z');
        assert.equal(pushJobId('link-1', at), `push-link-1-${at.getTime()}`);
        assert.equal(enrolledJobId('conn-1', at), `enrolled-conn-1-${at.getTime()}`);
        assert.equal(checkJobId('conn-1', new Date(120_500)), 'check-conn-1-2');
        assert.ok(!pushJobId('l', at).includes(':'));
    });
});
