import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { customCategoryKeyBase, customFieldKeyBase, keyMatchesBase, uniqueDerivedKey } from './derivedKeys.js';

describe('customFieldKeyBase', () => {
    it('is cf_ + the snake_cased label', () => {
        assert.equal(customFieldKeyBase('PO Number'), 'cf_po_number');
        assert.equal(customFieldKeyBase('Rating'), 'cf_rating');
    });
    it('prefixes a leading digit and falls back for an empty slug', () => {
        assert.equal(customFieldKeyBase('1st Contact'), 'cf_f_1st_contact');
        assert.equal(customFieldKeyBase('!!!'), 'cf_field');
    });
});

describe('customCategoryKeyBase', () => {
    it('is custom_ + the snake_cased name', () => {
        assert.equal(customCategoryKeyBase('Lead Rating'), 'custom_lead_rating');
        assert.equal(customCategoryKeyBase('???'), 'custom_list');
    });
});

describe('keyMatchesBase', () => {
    it('accepts the base and its numbered forms only', () => {
        assert.ok(keyMatchesBase('cf_rating', 'cf_rating'));
        assert.ok(keyMatchesBase('cf_rating_2', 'cf_rating'));
        assert.ok(!keyMatchesBase('cf_rating_old', 'cf_rating'));
        assert.ok(!keyMatchesBase('rating', 'cf_rating'));
        assert.ok(!keyMatchesBase('cf_ratings', 'cf_rating'));
    });
    it('compares against the length-capped root', () => {
        const base = `cf_${'a'.repeat(100)}`;
        assert.ok(keyMatchesBase(base.slice(0, 76), base));
        assert.ok(keyMatchesBase(`${base.slice(0, 76)}_3`, base));
    });
});

describe('uniqueDerivedKey', () => {
    it('numbers the key until it is free', async () => {
        const taken = new Set(['cf_rating', 'cf_rating_2']);
        assert.equal(await uniqueDerivedKey('cf_rating', async (k) => taken.has(k)), 'cf_rating_3');
        assert.equal(await uniqueDerivedKey('cf_other', async (k) => taken.has(k)), 'cf_other');
    });
});
