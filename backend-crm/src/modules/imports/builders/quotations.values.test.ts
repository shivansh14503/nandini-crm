import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HttpError } from '../../../utils/httpError.js';
import {
    discountCells,
    hasLineCells,
    numberCell,
    onlyMatch,
    quotationDropdownDefaults,
    quotationLineCells,
    taxRateCell,
    validationPeriodDays,
    validUntilFor,
    type DropdownConfigs,
} from './quotations.values.js';

describe('quotation import line cells', () => {
    it('reads the line item columns by their import keys', () => {
        const cells = quotationLineCells({ lineProduct: ' TallyPrime Silver ', lineQuantity: '2', quotationTitle: 'x' });
        assert.equal(cells.product, 'TallyPrime Silver');
        assert.equal(cells.quantity, '2');
        assert.equal(cells.rate, '');
        assert.equal(hasLineCells(cells), true);
        assert.equal(hasLineCells(quotationLineCells({ quotationTitle: 'x' })), false);
    });

    it('cleans number cells and keeps unreadable text for the schema to reject', () => {
        assert.equal(numberCell('₹ 22,500.50'), '22500.50');
        assert.equal(numberCell('  '), undefined);
        assert.equal(numberCell(undefined), undefined);
        assert.equal(numberCell('abc'), 'abc');
    });

    it('reads GST as a Tax Rate', () => {
        assert.equal(taxRateCell('18'), '18%');
        assert.equal(taxRateCell('18 %'), '18%');
        assert.equal(taxRateCell('GST 12%'), '12%');
        assert.equal(taxRateCell('0.18'), '18%');
        assert.equal(taxRateCell('0'), '0%');
        assert.equal(taxRateCell(''), undefined);
    });

    it('reads the discount and its type', () => {
        assert.deepEqual(discountCells('10%', ''), { discount: '10', discountType: 'percentage' });
        assert.deepEqual(discountCells('10%', 'Amount'), { discount: '10', discountType: 'percentage' });
        assert.deepEqual(discountCells('500', 'amount'), { discount: '500', discountType: 'amount' });
        assert.deepEqual(discountCells('5', 'Percentage'), { discount: '5', discountType: 'percentage' });
        assert.deepEqual(discountCells('', ''), { discount: undefined, discountType: 'percentage' });
        assert.throws(() => discountCells('5', 'half'), (err: unknown) => err instanceof HttpError && /Percentage or Amount/.test(err.message));
    });
});

describe('validUntilFor', () => {
    it('adds the Validation Period to the Quotation Date', () => {
        assert.equal(validationPeriodDays('30 Days'), 30);
        assert.equal(validationPeriodDays('1 day'), 1);
        assert.equal(validationPeriodDays('One month'), null);
        assert.equal(validUntilFor('2026-11-28', '15 Days'), '2026-12-13');
        assert.equal(validUntilFor('2026-12-20', '30 Days'), '2027-01-19');
    });

    it('falls back to the default validity when the period is not "<n> Days"', () => {
        assert.equal(validUntilFor('2026-02-01', undefined), '2026-03-03');
        assert.equal(validUntilFor('2026-02-01', 'Custom', 7), '2026-02-08');
    });
});

describe('onlyMatch', () => {
    const what = { label: 'Opportunity', plural: 'opportunities', hint: 'give its Opportunity number instead.', path: 'opportunity' };

    it('returns the single match', () => {
        assert.equal(onlyMatch(['a'], what, 'Deal'), 'a');
    });

    it('names a missing or ambiguous record', () => {
        assert.throws(() => onlyMatch([], what, 'Deal'), (err: unknown) => err instanceof HttpError && err.message === "Opportunity 'Deal' was not found.");
        assert.throws(
            () => onlyMatch(['a', 'b'], what, 'Deal'),
            (err: unknown) => err instanceof HttpError && err.message === "Several opportunities are named 'Deal': give its Opportunity number instead.",
        );
    });
});

describe('quotationDropdownDefaults', () => {
    const option = (value: string, extra: Partial<DropdownConfigs['categories'][number]['options'][number]> = {}) => ({
        value,
        meta: null,
        sortOrder: 0,
        isActive: true,
        isDefault: false,
        ...extra,
    });
    const configs: DropdownConfigs = {
        categories: [
            { id: 'c-company', options: [option('B Co', { sortOrder: 2 }), option('A Co', { sortOrder: 1 })] },
            { id: 'c-stage', options: [option('Draft', { sortOrder: 1 }), option('Negotiation', { sortOrder: 2, isDefault: true })] },
            { id: 'c-period', options: [option('15 Days', { sortOrder: 1 }), option('30 Days', { sortOrder: 2 })] },
            {
                id: 'c-terms',
                options: [
                    option('Standard', { isDefault: true, meta: { description: 'Standard text' } }),
                    option('Old', { isActive: false, isDefault: true, meta: { description: 'Old text' } }),
                ],
            },
            { id: 'c-pay', options: [option('Advance', { isDefault: true, isActive: false })] },
        ],
        fieldsByModule: {
            quotations: [
                { fieldKey: 'company', isSystem: true, dropdownCategoryId: 'c-company' },
                { fieldKey: 'quoteStage', isSystem: true, dropdownCategoryId: 'c-stage' },
                { fieldKey: 'validationPeriod', isSystem: true, dropdownCategoryId: 'c-period' },
                { fieldKey: 'termsAndCondition', isSystem: true, dropdownCategoryId: 'c-terms' },
                { fieldKey: 'paymentTerms', isSystem: true, dropdownCategoryId: 'c-pay' },
            ],
        },
    };

    it("takes the admin's default option, and the first active one for Company / Quote Stage", () => {
        const defaults = quotationDropdownDefaults(configs);
        assert.equal(defaults.company, 'A Co');
        assert.equal(defaults.quoteStage, 'Negotiation');
        // Soft dropdowns without an admin default stay empty, as on the form.
        assert.equal(defaults.validationPeriod, '');
        assert.equal(defaults.termsAndCondition, 'Standard');
        // An archived default is not offered.
        assert.equal(defaults.paymentTerms, '');
    });

    it("reads the terms options' descriptions", () => {
        const defaults = quotationDropdownDefaults(configs);
        assert.equal(defaults.termsDescriptions.get('Standard'), 'Standard text');
        assert.equal(defaults.termsDescriptions.has('Old'), false);
        assert.equal(defaults.paymentDescriptions.size, 0);
    });

    it('is empty without a quotation form configuration', () => {
        const defaults = quotationDropdownDefaults({ categories: [], fieldsByModule: {} });
        assert.equal(defaults.company, '');
        assert.equal(defaults.quoteStage, '');
    });
});
