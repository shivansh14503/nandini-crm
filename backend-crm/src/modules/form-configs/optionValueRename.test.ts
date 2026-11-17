import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { describeOptionMigration, likeContaining, renameCustomDataValue, renameFilterValues, renameInList, renameJsonList } from './optionValueRename.js';

describe('renameInList', () => {
    it('renames the value, ignoring case', () => {
        assert.deepEqual(renameInList(['Biz Analyst', 'hot'], 'Hot', 'Warm'), ['Biz Analyst', 'Warm']);
    });
    it('drops a duplicate the rename would leave', () => {
        assert.deepEqual(renameInList(['Hot', 'Warm'], 'Hot', 'Warm'), ['Warm']);
    });
    it('returns null when the value is absent or the input is not a list', () => {
        assert.equal(renameInList(['Cold'], 'Hot', 'Warm'), null);
        assert.equal(renameInList('Hot', 'Hot', 'Warm'), null);
    });
});

describe('renameJsonList', () => {
    it('rewrites a JSON array column', () => {
        assert.equal(renameJsonList('["A","Hot"]', 'Hot', 'hot_lead'), '["A","hot_lead"]');
    });
    it('leaves empty, invalid or unrelated columns alone', () => {
        assert.equal(renameJsonList(null, 'Hot', 'x'), null);
        assert.equal(renameJsonList('not json', 'Hot', 'x'), null);
        assert.equal(renameJsonList('["Cold"]', 'Hot', 'x'), null);
    });
});

describe('renameCustomDataValue', () => {
    it('renames a select value under the field key only', () => {
        const json = JSON.stringify({ cf_rating: 'Hot', cf_other: 'Hot' });
        assert.equal(renameCustomDataValue(json, 'cf_rating', 'select', 'Hot', 'warm'), JSON.stringify({ cf_rating: 'warm', cf_other: 'Hot' }));
    });
    it('renames inside a multi-select list', () => {
        const json = JSON.stringify({ cf_tags: ['A', 'Hot'] });
        assert.equal(renameCustomDataValue(json, 'cf_tags', 'multiselect', 'hot', 'Warm'), JSON.stringify({ cf_tags: ['A', 'Warm'] }));
    });
    it('returns null when nothing changes', () => {
        assert.equal(renameCustomDataValue(JSON.stringify({ cf_rating: 'Cold' }), 'cf_rating', 'select', 'Hot', 'x'), null);
        assert.equal(renameCustomDataValue(JSON.stringify({ other: 'Hot' }), 'cf_rating', 'select', 'Hot', 'x'), null);
        assert.equal(renameCustomDataValue(null, 'cf_rating', 'select', 'Hot', 'x'), null);
    });
});

describe('renameFilterValues', () => {
    const ids = new Set(['status', 'customFields.cf_rating']);
    it('renames values of conditions on the linked fields only', () => {
        const json = JSON.stringify({
            conditions: { status: { op: 'in', values: ['Hot', 'New'] }, 'customFields.cf_rating': { op: 'eq', value: 'Hot' }, city: { op: 'eq', value: 'Hot' } },
            sort: { field: 'status', order: 'asc' },
        });
        assert.deepEqual(JSON.parse(renameFilterValues(json, ids, 'Hot', 'Warm') ?? 'null'), {
            conditions: { status: { op: 'in', values: ['Warm', 'New'] }, 'customFields.cf_rating': { op: 'eq', value: 'Warm' }, city: { op: 'eq', value: 'Hot' } },
            sort: { field: 'status', order: 'asc' },
        });
    });
    it('returns null when no linked condition uses the value', () => {
        assert.equal(renameFilterValues(JSON.stringify({ conditions: { city: { op: 'eq', value: 'Hot' } } }), ids, 'Hot', 'Warm'), null);
        assert.equal(renameFilterValues('bad', ids, 'Hot', 'Warm'), null);
    });
});

describe('likeContaining', () => {
    it('escapes SQL Server LIKE wildcards', () => {
        assert.equal(likeContaining('"50%_[a]"'), '%"50[%][_][[]a]"%');
    });
});

describe('describeOptionMigration', () => {
    it('counts records and filters', () => {
        assert.equal(describeOptionMigration({ records: 1, filters: 0 }), 'Carried over to the renamed option: 1 record.');
        assert.equal(describeOptionMigration({ records: 3, filters: 2 }), 'Carried over to the renamed option: 3 records, 2 table filters.');
    });
});
