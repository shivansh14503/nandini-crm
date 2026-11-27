import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { TransactionClient } from '../../config/prisma.js';
import { HttpError } from '../../utils/httpError.js';
import { resolveProductIds } from '../shared/lineItems.js';
import { INACTIVITY_REASON_REQUIRED, PRODUCT_STATUS_ADMIN_ONLY, productStatusData } from './product.status.js';
import { productInputSchema, productListQuerySchema } from './product.validator.js';

const admin = { username: 'meera', role: 'Admin' };
const sales = { username: 'ravi', role: 'Sales Executive' };
const now = new Date('2026-11-27T10:00:00Z');
const activeRow = { status: 'Active', inactivityReason: null, inactiveSince: null, inactivatedBy: null };
const inactiveRow = { status: 'Inactive', inactivityReason: 'Discontinued by vendor', inactiveSince: new Date('2026-10-01T05:00:00Z'), inactivatedBy: 'meera' };

const rejects = (fn: () => unknown, status: number, message: string) =>
    assert.throws(fn, (err: unknown) => err instanceof HttpError && err.statusCode === status && err.message === message);

describe('productInputSchema Status', () => {
    const valid = { productName: 'TallyPrime Silver' };
    it('starts Active and accepts only Active / Inactive', () => {
        assert.equal(productInputSchema.parse(valid).status, 'Active');
        assert.equal(productInputSchema.parse({ ...valid, status: 'Inactive', inactivityReason: 'x' }).status, 'Inactive');
        assert.throws(() => productInputSchema.parse({ ...valid, status: 'Paused' }));
    });
    it('caps the Inactivity Reason at 500 characters', () => {
        assert.throws(() => productInputSchema.parse({ ...valid, inactivityReason: 'x'.repeat(501) }));
    });
    it('filters the list by Status', () => {
        assert.deepEqual(productListQuerySchema.parse({ status: 'Inactive' }).status, ['Inactive']);
    });
});

describe('productStatusData', () => {
    it('stores the reason, the time and the admin when an admin makes a product Inactive', () => {
        assert.deepEqual(productStatusData({ status: 'Inactive', inactivityReason: '  Discontinued  ' }, activeRow, admin, now), {
            status: 'Inactive',
            inactivityReason: 'Discontinued',
            inactiveSince: now,
            inactivatedBy: 'meera',
        });
    });

    it('needs a reason to make a product Inactive', () => {
        rejects(() => productStatusData({ status: 'Inactive', inactivityReason: ' ' }, activeRow, admin, now), 400, INACTIVITY_REASON_REQUIRED);
        rejects(() => productStatusData({ status: 'Inactive' }, null, admin, now), 400, INACTIVITY_REASON_REQUIRED);
    });

    it('keeps the stored reason, date and admin while the product stays Inactive', () => {
        assert.deepEqual(productStatusData({ status: 'Inactive', inactivityReason: 'edited' }, inactiveRow, sales, now), inactiveRow);
    });

    it('clears them when an admin makes the product Active again', () => {
        assert.deepEqual(productStatusData({ status: 'Active', inactivityReason: 'Discontinued by vendor' }, inactiveRow, admin, now), activeRow);
    });

    it('lets only Admins change the Status', () => {
        rejects(() => productStatusData({ status: 'Inactive', inactivityReason: 'x' }, activeRow, sales, now), 403, PRODUCT_STATUS_ADMIN_ONLY);
        rejects(() => productStatusData({ status: 'Active' }, inactiveRow, sales, now), 403, PRODUCT_STATUS_ADMIN_ONLY);
        rejects(() => productStatusData({ status: 'Inactive', inactivityReason: 'x' }, null, sales, now), 403, PRODUCT_STATUS_ADMIN_ONLY);
        // Editing other fields of an active product needs no admin.
        assert.deepEqual(productStatusData({ status: 'Active' }, activeRow, sales, now), activeRow);
    });
});

describe('resolveProductIds', () => {
    const products = [
        { id: 'p-active', status: 'Active', isDeleted: false, productName: 'TallyPrime Silver' },
        { id: 'p-inactive', status: 'Inactive', isDeleted: false, productName: 'Old AMC' },
    ];
    const tx = { product: { findMany: async () => products } } as unknown as TransactionClient;
    const line = (productId: string) => ({ productId, productName: 'x' }) as Parameters<typeof resolveProductIds>[1][number];

    it('refuses an Inactive product on a new line', async () => {
        await assert.rejects(resolveProductIds(tx, [line('p-active'), line('p-inactive')]), (err: unknown) => {
            assert.ok(err instanceof HttpError && err.statusCode === 400);
            assert.match(err.message, /Old AMC is Inactive/);
            return true;
        });
    });

    it('keeps an Inactive product the record already had', async () => {
        const known = await resolveProductIds(tx, [line('p-active'), line('p-inactive')], new Set(['p-inactive']));
        assert.deepEqual([...known].sort(), ['p-active', 'p-inactive']);
    });
});
