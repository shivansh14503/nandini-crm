import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isBuiltInAmountKey, moduleHasBuiltInAmount, saveScorecardSchema } from './scorecard.validator.js';

test('built-in totals are recognised by their prefix', () => {
    assert.equal(isBuiltInAmountKey('builtin.grandTotal'), true);
    assert.equal(isBuiltInAmountKey('cf_deal_value'), false);
    assert.equal(isBuiltInAmountKey('grandTotal'), false);
});

test('only the modules that compute a total offer it', () => {
    assert.equal(moduleHasBuiltInAmount('opportunities', 'builtin.grandTotal'), true);
    assert.equal(moduleHasBuiltInAmount('opportunities', 'builtin.commissionAmount'), true);
    assert.equal(moduleHasBuiltInAmount('opportunities', 'builtin.shipping'), false);
    assert.equal(moduleHasBuiltInAmount('leads', 'builtin.grandTotal'), false);
    assert.equal(moduleHasBuiltInAmount('quotations', 'builtin.totalTax'), true);
    // Quotations total Grand Total by default (saved as no currency field) and have no commission.
    assert.equal(moduleHasBuiltInAmount('quotations', 'builtin.grandTotal'), false);
    assert.equal(moduleHasBuiltInAmount('quotations', 'builtin.commissionAmount'), false);
});

test('a built-in total passes the save schema as the currency field', () => {
    const parsed = saveScorecardSchema.parse({
        fieldKey: 'salesStage',
        currencyFieldKey: 'builtin.totalTax',
        options: [{ value: 'Demo', color: '#EAB308' }],
        listViewColor: true,
        drawerViewColor: false,
    });
    assert.equal(parsed.currencyFieldKey, 'builtin.totalTax');
});
