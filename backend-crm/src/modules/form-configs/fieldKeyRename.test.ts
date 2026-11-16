import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    customDataHasKey,
    describeMigration,
    fieldKeyFormatError,
    filterFingerprint,
    nextPreviousKeys,
    parsePreviousKeys,
    renameCustomDataKey,
    renameFilterCriteria,
    renamePdfFieldPaths,
    serializePreviousKeys,
} from './fieldKeyRename.js';

describe('fieldKeyFormatError', () => {
    it('accepts cf_ + snake_case', () => {
        assert.equal(fieldKeyFormatError('cf_po_number'), null);
        assert.equal(fieldKeyFormatError('cf_a1'), null);
    });
    it('rejects other shapes', () => {
        for (const key of ['po_number', 'cf_', 'cf_1abc', 'cf_PO', 'cf_po-number', 'cf_po number']) assert.ok(fieldKeyFormatError(key), key);
        assert.ok(fieldKeyFormatError(`cf_${'a'.repeat(80)}`));
    });
});

describe('previous keys', () => {
    it('parses defensively', () => {
        assert.deepEqual(parsePreviousKeys(null), []);
        assert.deepEqual(parsePreviousKeys('not json'), []);
        assert.deepEqual(parsePreviousKeys('["cf_a", 3]'), ['cf_a']);
    });
    it('appends the old key, drops the new one, and dedupes', () => {
        assert.deepEqual(nextPreviousKeys(['cf_a', 'cf_b'], 'cf_c', 'cf_a'), ['cf_b', 'cf_c']);
        assert.deepEqual(nextPreviousKeys(['cf_x'], 'cf_x', 'cf_y'), ['cf_x']);
    });
    it('caps the list at the 20 newest', () => {
        const many = Array.from({ length: 25 }, (_, i) => `cf_k${i}`);
        const next = nextPreviousKeys(many, 'cf_new_old', 'cf_now');
        assert.equal(next.length, 20);
        assert.equal(next.at(-1), 'cf_new_old');
    });
    it('serializes an empty list as null', () => {
        assert.equal(serializePreviousKeys([]), null);
        assert.equal(serializePreviousKeys(['cf_a']), '["cf_a"]');
    });
});

describe('renameCustomDataKey', () => {
    it('moves the value and keeps other keys', () => {
        assert.equal(renameCustomDataKey('{"cf_a":1,"cf_b":[1,2]}', 'cf_a', 'cf_z'), '{"cf_z":1,"cf_b":[1,2]}');
    });
    it('replaces a stale value under the new key', () => {
        assert.deepEqual(JSON.parse(renameCustomDataKey('{"cf_new":"stale","cf_old":"live"}', 'cf_old', 'cf_new')!), { cf_new: 'live' });
    });
    it('returns null when there is nothing to move', () => {
        assert.equal(renameCustomDataKey(null, 'cf_a', 'cf_b'), null);
        assert.equal(renameCustomDataKey('{"cf_other":"x","note":"cf_a"}', 'cf_a', 'cf_b'), null);
        assert.equal(renameCustomDataKey('broken', 'cf_a', 'cf_b'), null);
    });
    it('customDataHasKey checks keys, not values', () => {
        assert.equal(customDataHasKey('{"note":"cf_a"}', 'cf_a'), false);
        assert.equal(customDataHasKey('{"cf_a":null}', 'cf_a'), true);
    });
});

describe('renameFilterCriteria', () => {
    it('renames conditions and sort, in both id forms', () => {
        const json = JSON.stringify({ conditions: { 'customFields.cf_a': { op: 'eq', value: '1' }, cf_a: { op: 'eq' }, status: { op: 'in' } }, sort: { field: 'customFields.cf_a', order: 'asc' } });
        const next = JSON.parse(renameFilterCriteria(json, 'cf_a', 'cf_b')!);
        assert.deepEqual(Object.keys(next.conditions).sort(), ['cf_b', 'customFields.cf_b', 'status']);
        assert.equal(next.sort.field, 'customFields.cf_b');
    });
    it('returns null when the filter does not use the field', () => {
        assert.equal(renameFilterCriteria(JSON.stringify({ conditions: { cf_ab: { op: 'eq' } } }), 'cf_a', 'cf_b'), null);
    });
    it('fingerprint ignores key order', () => {
        const a = JSON.stringify({ conditions: { x: { op: 'eq' }, y: { op: 'in', values: ['b', 'a'] } } });
        const b = JSON.stringify({ conditions: { y: { op: 'in', values: ['a', 'b'] }, x: { op: 'eq' } } });
        assert.equal(filterFingerprint(a), filterFingerprint(b));
    });
});

describe('renamePdfFieldPaths', () => {
    it('renames exact custom paths only', () => {
        const doc = '{"a":{"path":"custom.cf_a"},"b":{"path":"custom.cf_ab"},"c":"custom.cf_a"}';
        assert.equal(renamePdfFieldPaths(doc, 'cf_a', 'cf_z'), '{"a":{"path":"custom.cf_z"},"b":{"path":"custom.cf_ab"},"c":"custom.cf_z"}');
        assert.equal(renamePdfFieldPaths('{"path":"quotation.number"}', 'cf_a', 'cf_z'), null);
    });
});

describe('describeMigration', () => {
    it('lists what moved', () => {
        assert.equal(describeMigration({ records: 1, filters: 2, pdfTemplates: 0, pdfSavedItems: 0 }), 'Values moved to the new API name on 1 record, 2 saved filters.');
    });
});
