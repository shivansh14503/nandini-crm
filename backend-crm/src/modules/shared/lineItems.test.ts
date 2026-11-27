import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { TransactionClient } from '../../config/prisma.js';
import { Prisma } from '../../generated/prisma/client.js';
import { assertHasLineItems, calculateLineItems, lineItemListSchema, normalizeTaxRate, prepareLineItems, requiredLineItemListSchema } from './lineItems.js';

const line = { productName: 'TallyPrime Silver', quantity: 2, rate: 1000, discount: 10, taxRate: '18%' };

describe('line item math (CRM-111)', () => {
    it('Gross = Quantity × Rate, Discount is a % of Gross, Taxable = Gross − Discount; GST is summed into the totals', () => {
        const parsed = lineItemListSchema.parse([line, { productName: 'AMC', quantity: 1, rate: 500, taxRate: '5%' }]);
        const { items, totals } = calculateLineItems(parsed, 100);
        assert.deepEqual(
            items.map(({ grossAmount, discountAmount, taxableAmount }) => ({ grossAmount, discountAmount, taxableAmount })),
            [
                { grossAmount: 2000, discountAmount: 200, taxableAmount: 1800 },
                { grossAmount: 500, discountAmount: 0, taxableAmount: 500 },
            ],
        );
        // GST: 1800 × 18% + 500 × 5% = 324 + 25; Grand Total = 2300 + 349 − 100.
        assert.deepEqual(totals, { totalAmount: 2500, totalDiscount: 200, subtotal: 2300, totalTax: 349, grandTotal: 2549 });
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
        assert.equal(legacy.discount, 10);
        assert.equal(legacy.taxRate, '12%');
        assert.equal(normalizeTaxRate('--None--'), '0%');
        assert.equal(normalizeTaxRate(''), '');
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
