import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { TransactionClient } from '../../config/prisma.js';
import { Prisma } from '../../generated/prisma/client.js';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    assertHasLineItems,
    assertLumpSumWithinTotal,
    assertTotalsMatch,
    calculateLineItems,
    customerStateOf,
    gstTypeFor,
    lineItemListSchema,
    lineItemSummary,
    normalizeTaxRate,
    prepareLineItems,
    requiredLineItemListSchema,
    roundOffSchema,
} from './lineItems.js';
import { taxRowLines } from './lineItemMath.js';

const line = { productName: 'TallyPrime Silver', quantity: 2, rate: 1000, discount: 10, taxRate: '18%' };

describe('line item math (CRM-111)', () => {
    it('Gross = Quantity × Rate, Discount is a % of Gross, Taxable = Gross − Discount; GST is summed into the totals', () => {
        const parsed = lineItemListSchema.parse([line, { productName: 'AMC', quantity: 1, rate: 500, taxRate: '5%' }]);
        const { items, totals } = calculateLineItems(parsed, { lumpSumDiscount: 100, gstType: 'IGST' });
        assert.deepEqual(
            items.map(({ grossAmount, discountAmount, taxableAmount }) => ({ grossAmount, discountAmount, taxableAmount })),
            [
                { grossAmount: 2000, discountAmount: 200, taxableAmount: 1800 },
                { grossAmount: 500, discountAmount: 0, taxableAmount: 500 },
            ],
        );
        // The ₹100 lump sum is shared 1800 : 500 → 78.26 / 21.74, so GST = 1721.74 × 18% + 478.26 × 5% = 309.91 + 23.91;
        // Actual (Before Tax) 2200 + 333.82 = 2533.82, rounded off to 2534.
        assert.deepEqual(totals, { totalAmount: 2500, totalDiscount: 200, subtotal: 2300, actualBeforeTax: 2200, totalTax: 333.82, roundOffAmount: 0.18, grandTotal: 2534 });
    });

    it('needs Product, Quantity, Rate and GST; Discount, Description and Note are optional', () => {
        assert.ok(lineItemListSchema.safeParse([{ productName: 'X', quantity: 1, rate: 10, taxRate: '0%' }]).success);
        const missing = lineItemListSchema.safeParse([{ productName: 'X', quantity: 1, discount: 5 }]);
        assert.equal(missing.success, false);
        const messages = missing.error?.issues.map((i) => i.message) ?? [];
        assert.ok(messages.includes('Rate is required.'));
        assert.ok(messages.includes('GST is required.'));
        assert.equal(lineItemListSchema.safeParse([{ ...line, discount: 101 }]).success, false);
    });

    it('Discount is a Percentage (the default) or an Amount off the line, never more than the Gross Amount', () => {
        const [percentage, amount] = lineItemListSchema.parse([line, { ...line, discount: 250, discountType: 'amount' }]);
        assert.equal(percentage.discountType, 'percentage');
        const { items, totals } = calculateLineItems([percentage, amount], {});
        assert.deepEqual(
            items.map(({ discountAmount, taxableAmount }) => ({ discountAmount, taxableAmount })),
            [
                { discountAmount: 200, taxableAmount: 1800 },
                { discountAmount: 250, taxableAmount: 1750 },
            ],
        );
        assert.equal(totals.totalDiscount, 450);
        // An amount may be more than 100 but not more than the Gross Amount (2 × 1000).
        assert.ok(lineItemListSchema.safeParse([{ ...line, discount: 2000, discountType: 'amount' }]).success);
        const over = lineItemListSchema.safeParse([{ ...line, discount: 2001, discountType: 'amount' }]);
        assert.equal(over.success, false);
        assert.ok(over.error?.issues.some((i) => i.message === 'Discount cannot exceed the Gross Amount.'));
        assert.equal(lineItemListSchema.safeParse([{ ...line, discountType: 'flat' }]).success, false);
    });

    it('drops lines nothing was entered on; a quotation still needs one real line', () => {
        const blank = { productName: '', quantity: 1, rate: 0, discount: 0, taxRate: '18%', description: '', note: '' };
        assert.deepEqual(lineItemListSchema.parse([blank]), []);
        assert.equal(lineItemListSchema.parse([line, blank]).length, 1);
        assert.equal(requiredLineItemListSchema.safeParse([blank]).success, false);
    });

    it('an opportunity save needs one real line', () => {
        const blank = { productName: '', quantity: 1, rate: 0, discount: 0, taxRate: '18%', description: '', note: '' };
        assert.throws(() => assertHasLineItems(lineItemListSchema.parse([blank]), 'opportunity'), /line item is required to save the opportunity/);
        assert.doesNotThrow(() => assertHasLineItems(lineItemListSchema.parse([line, blank]), 'opportunity'));
    });

    it('reads lines in the format before CRM-111', () => {
        const [legacy] = lineItemListSchema.parse([
            { productName: 'Old', quantity: 3, amount: 500, discount: 50, discountType: 'direct', salePrice: 450, taxRate: 'GST 12%', taxAmount: 162, total: 1512 },
        ]);
        assert.equal(legacy.rate, 500);
        // ₹50 off each of 3 units: ₹150 off the line.
        assert.equal(legacy.discountType, 'amount');
        assert.equal(legacy.discount, 150);
        assert.equal(legacy.taxRate, '12%');
        assert.equal(normalizeTaxRate('--None--'), '0%');
        assert.equal(normalizeTaxRate(''), '');
    });
});

describe('Summary Breakdown (CRM-111)', () => {
    const lines = [
        { quantity: 1, rate: 10000.5, discount: 0, taxRate: '18%' },
        { quantity: 2, rate: 250, discount: 0, taxRate: '5%' },
        { quantity: 1, rate: 300, discount: 0, taxRate: '0%' },
    ];

    it('Total Taxable Amount − Lump Sum = Actual (Before Tax); GST per rate on its share; Round Off; Grand Total', () => {
        const s = lineItemSummary(lines, { lumpSumDiscount: 1080.05, gstType: 'IGST' });
        assert.equal(s.subtotal, 10800.5);
        assert.equal(s.actualBeforeTax, 9720.45);
        // Shares of the lump sum: 10000.50 → 1000.05, 500 → 50, 300 → 30 (10%), so the bases are 9000.45 / 450 / 270.
        assert.deepEqual(s.taxes.map((t) => [t.rate, t.taxableValue, t.igst]), [[5, 450, 22.5], [18, 9000.45, 1620.08]]);
        assert.equal(s.totalTax, 1642.58);
        assert.equal(s.roundOffAmount, -0.03);
        assert.equal(s.grandTotal, 11363);
        // The 0% line is in the totals but adds no GST row.
        assert.equal(s.taxes.length, 2);
    });

    it('CGST and SGST are half the rate each, rounded half up to the paisa', () => {
        const s = lineItemSummary([{ quantity: 1, rate: 100.5, discount: 0, taxRate: '18%' }], { gstType: 'CGST_SGST', roundOff: false });
        assert.deepEqual(s.taxes.map((t) => [t.cgst, t.sgst, t.igst]), [[9.05, 9.05, 0]]);
        assert.equal(s.grandTotal, 118.6);
        assert.equal(s.roundOffAmount, 0);
        assert.deepEqual(taxRowLines(s.taxes[0], 'CGST_SGST').map((r) => r.label), ['Add: CGST @ 9%', 'Add: SGST @ 9%']);
        assert.deepEqual(taxRowLines(s.taxes[0], 'IGST').map((r) => r.label), ['Add: IGST @ 18%']);
        assert.deepEqual(taxRowLines(s.taxes[0], null).map((r) => r.label), ['Add: GST @ 18%']);
    });

    it('Round Off rounds 0.50 up and is on unless turned off', () => {
        const half = lineItemSummary([{ quantity: 1, rate: 100.5, discount: 0, taxRate: '0%' }], {});
        assert.equal(half.roundOff, true);
        assert.equal(half.roundOffAmount, 0.5);
        assert.equal(half.grandTotal, 101);
        assert.equal(roundOffSchema.parse(undefined), true);
        assert.equal(roundOffSchema.parse('false'), false);
        assert.equal(roundOffSchema.parse(false), false);
    });

    it('the shares of a lump sum add up to it exactly', () => {
        const s = lineItemSummary(
            [
                { quantity: 1, rate: 100, discount: 0, taxRate: '5%' },
                { quantity: 1, rate: 100, discount: 0, taxRate: '12%' },
                { quantity: 1, rate: 100, discount: 0, taxRate: '18%' },
            ],
            { lumpSumDiscount: 0.1, gstType: 'IGST' },
        );
        assert.equal(Math.round(s.taxes.reduce((sum, t) => sum + t.taxableValue, 0) * 100) / 100, 299.9);
    });

    it('IGST for a customer in another state, CGST + SGST in the same state (or without one), plain GST without a company state', () => {
        assert.equal(gstTypeFor('Haryana', 'Gujarat'), 'IGST');
        assert.equal(gstTypeFor('Delhi', 'IN-DL'), 'CGST_SGST');
        assert.equal(gstTypeFor('Odisha', 'orissa'), 'CGST_SGST');
        assert.equal(gstTypeFor('Jammu & Kashmir', 'jammu and kashmir'), 'CGST_SGST');
        assert.equal(gstTypeFor('Haryana', ''), 'CGST_SGST');
        assert.equal(gstTypeFor('', 'Gujarat'), null);
        assert.equal(customerStateOf({ shippingState: 'Gujarat', billingState: 'Delhi' }), 'Gujarat');
        assert.equal(customerStateOf({ shippingState: ' ', billingState: 'Delhi' }), 'Delhi');
        assert.equal(customerStateOf({ shippingState: 'Gujarat', billingState: 'Delhi', copyAddressFromBilling: true }), 'Delhi');
    });

    it('a Lump Sum Discount may not exceed the Total Taxable Amount; sent totals are checked to the paisa', () => {
        const parsed = lineItemListSchema.parse([line]);
        assert.doesNotThrow(() => assertLumpSumWithinTotal(parsed, 1800));
        assert.throws(() => assertLumpSumWithinTotal(parsed, 1800.01), /cannot exceed the Total Taxable Amount/);
        const { totals } = calculateLineItems(parsed, { lumpSumDiscount: 0.5, gstType: 'IGST', roundOff: false });
        assert.doesNotThrow(() => assertTotalsMatch({ grandTotal: totals.grandTotal, actualBeforeTax: 1799.5 }, totals));
        assert.throws(() => assertTotalsMatch({ grandTotal: totals.grandTotal + 0.01 }, totals), /Totals do not match/);
    });

    it('the frontend copy of the math is identical', () => {
        const here = path.dirname(fileURLToPath(import.meta.url));
        const backend = readFileSync(path.join(here, 'lineItemMath.ts'), 'utf8');
        const frontend = readFileSync(path.resolve(here, '../../../../frontend-crm/src/lib/line-items/lineItemMath.ts'), 'utf8');
        assert.equal(frontend, backend);
    });
});

describe('prepareLineItems', () => {
    const products = [
        { id: 'p-mrp', status: 'Active', isDeleted: false, productName: 'With MRP', mrp: new Prisma.Decimal(1500), taxRate: '12%' },
        { id: 'p-free', status: 'Active', isDeleted: false, productName: 'No MRP', mrp: null, taxRate: null },
    ];
    const tx = { product: { findMany: async () => products } } as unknown as TransactionClient;

    it("takes a newly added product's Rate (MRP) and GST (Tax Rate) from the catalog; a product without them keeps the typed values", async () => {
        const items = lineItemListSchema.parse([
            { ...line, productId: 'p-mrp', rate: 1, taxRate: '18%' },
            { ...line, productId: 'p-free', rate: 777, taxRate: '5%' },
        ]);
        const prepared = await prepareLineItems(tx, items);
        assert.deepEqual(prepared.items.map((i) => [i.rate, i.taxRate]), [[1500, '12%'], [777, '5%']]);
    });

    it('keeps the saved Rate and GST of a product the record already had', async () => {
        const items = lineItemListSchema.parse([{ ...line, productId: 'p-mrp', rate: 1200, taxRate: '18%' }]);
        const prepared = await prepareLineItems(tx, items, new Set(['p-mrp']));
        assert.deepEqual(prepared.items.map((i) => [i.rate, i.taxRate]), [[1200, '18%']]);
    });
});
