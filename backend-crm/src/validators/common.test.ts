import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { z } from 'zod';
import { optionalInstant, requiredInstant } from './common.js';

const schema = z.object({ startAt: optionalInstant('Start') });
const parse = (startAt: unknown) => schema.safeParse({ startAt });
const message = (startAt: unknown) => {
    const result = parse(startAt);
    return result.success ? undefined : result.error.issues[0]?.message;
};

describe('optionalInstant', () => {
    it('accepts Z and explicit offsets, normalized to UTC', () => {
        assert.equal(parse('2026-11-25T05:00:00Z').data?.startAt, '2026-11-25T05:00:00.000Z');
        assert.equal(parse('2026-11-25T10:30:00+05:30').data?.startAt, '2026-11-25T05:00:00.000Z');
        assert.equal(parse('2026-11-25T10:30+05:30').data?.startAt, '2026-11-25T05:00:00.000Z');
        assert.equal(parse('2026-11-25T05:00:00.123Z').data?.startAt, '2026-11-25T05:00:00.123Z');
        assert.equal(parse('2026-11-25T00:00:00-05:00').data?.startAt, '2026-11-25T05:00:00.000Z');
    });

    it('refuses a wall clock without a zone', () => {
        for (const naive of ['2026-11-25T10:30', '2026-11-25T10:30:00', '2026-11-25T10:30:00.000']) {
            assert.equal(message(naive), 'Start must include a timezone (e.g. 2026-11-25T10:30:00+05:30).', naive);
        }
    });

    it('refuses values that are not a real moment', () => {
        for (const bad of ['2026-02-30T10:00:00Z', '2026-11-25T24:00:00Z', '2026-11-25T10:60Z', '2026-11-25T10:30+15:00', 'tomorrow', '2026-11-25']) {
            assert.equal(message(bad), 'Start must be a valid date and time.', bad);
        }
    });

    it('reads blank and null as missing', () => {
        assert.equal(parse('').data?.startAt, undefined);
        assert.equal(parse('   ').data?.startAt, undefined);
        assert.equal(parse(null).data?.startAt, undefined);
        assert.equal(schema.parse({}).startAt, undefined);
    });
});

describe('requiredInstant', () => {
    const required = z.object({ from: requiredInstant('from') });

    it('requires a value', () => {
        assert.equal(required.safeParse({}).error?.issues[0]?.message, 'from is required.');
        assert.equal(required.safeParse({ from: '' }).error?.issues[0]?.message, 'from is required.');
    });

    it('applies the instant rules', () => {
        assert.equal(required.parse({ from: '2026-11-25T00:00:00+05:30' }).from, '2026-11-24T18:30:00.000Z');
        assert.equal(required.safeParse({ from: '2026-11-25T00:00' }).error?.issues[0]?.message, 'from must include a timezone (e.g. 2026-11-25T10:30:00+05:30).');
    });
});
