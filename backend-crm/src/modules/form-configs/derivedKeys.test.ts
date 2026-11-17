import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DERIVED_KEY_MAX, dropdownKeyFromLabel, fieldKeyFromLabel } from './derivedKeys.js';

describe('fieldKeyFromLabel', () => {
    it('is the snake_cased label, with no prefix', () => {
        assert.equal(fieldKeyFromLabel('PO Number'), 'po_number');
        assert.equal(fieldKeyFromLabel('Rating'), 'rating');
        assert.equal(fieldKeyFromLabel('  Site Visit / Date '), 'site_visit_date');
    });
    it('starts with a letter and falls back for an empty slug', () => {
        assert.equal(fieldKeyFromLabel('1st Contact'), 'field_1st_contact');
        assert.equal(fieldKeyFromLabel('!!!'), 'field');
    });
    it('is cut to the maximum length without a trailing underscore', () => {
        const key = fieldKeyFromLabel(`${'a'.repeat(79)} b`);
        assert.equal(key, 'a'.repeat(79));
        assert.ok(fieldKeyFromLabel('x'.repeat(200)).length <= DERIVED_KEY_MAX);
    });
});

describe('dropdownKeyFromLabel', () => {
    it('is the snake_cased name, with no prefix', () => {
        assert.equal(dropdownKeyFromLabel('Lead Rating'), 'lead_rating');
        assert.equal(dropdownKeyFromLabel('2026 Plans'), 'list_2026_plans');
        assert.equal(dropdownKeyFromLabel('???'), 'list');
    });
});
