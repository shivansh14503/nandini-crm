import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { defaultCommissionType, hasCommission, opportunityInputSchema } from './opportunity.validator.js';
import { toOpportunityData } from './opportunity.mapper.js';

const links = { organization: { id: null, name: 'ACME TRADERS' }, contact: { id: null, name: 'Ravi Kumar' } };
const totals = { totalAmount: 0, totalDiscount: 0, subtotal: 0, totalTax: 0, grandTotal: 0 };

const base = {
    contact: 'Ravi Kumar',
    organizationName: 'ACME TRADERS',
    contactNumber: '9811234567',
    salesStage: 'Qualification',
    assignedTo: 'admin',
};

describe('opportunity commission', () => {
    it('defaults to No without an amount', () => {
        const input = opportunityInputSchema.parse(base);
        assert.equal(input.commission, 'No');
        assert.equal(input.commissionAmount, undefined);
    });

    it('requires an amount above 0 when Commission is Yes', () => {
        for (const commissionAmount of [undefined, '', 0]) {
            const result = opportunityInputSchema.safeParse({ ...base, commission: 'Yes', commissionAmount });
            assert.equal(result.success, false, `rejects ${String(commissionAmount)}`);
            assert.deepEqual(result.error?.issues[0]?.path, ['commissionAmount']);
        }
        assert.equal(opportunityInputSchema.parse({ ...base, commission: 'Yes', commissionAmount: '2500' }).commissionAmount, 2500);
    });

    it('only accepts Yes or No', () => {
        assert.equal(opportunityInputSchema.safeParse({ ...base, commission: 'Standard (10%)' }).success, false);
    });
});

describe('opportunity commission type', () => {
    it('defaults to Self up to 1,000 and Other above', () => {
        assert.equal(defaultCommissionType(1000), 'Self');
        assert.equal(defaultCommissionType(250), 'Self');
        assert.equal(defaultCommissionType(1000.01), 'Other');
        assert.equal(hasCommission({ commission: 'No', commissionAmount: 500 }), false);
        assert.equal(hasCommission({ commission: 'Yes' }), false);
    });

    it('fills the default type and keeps bank details only for Other', () => {
        const small = toOpportunityData(opportunityInputSchema.parse({ ...base, commission: 'Yes', commissionAmount: 800, bankName: 'HDFC Bank' }), links, totals);
        assert.equal(small.commissionType, 'Self');
        assert.equal(small.bankName, null);
        const large = toOpportunityData(
            opportunityInputSchema.parse({ ...base, commission: 'Yes', commissionAmount: 5000, bankName: 'HDFC Bank', ifscCode: 'hdfc0001234', panNumber: 'abcde1234f' }),
            links,
            totals,
        );
        assert.equal(large.commissionType, 'Other');
        assert.equal(large.bankName, 'HDFC Bank');
        assert.equal(large.ifscCode, 'HDFC0001234');
        const none = toOpportunityData(opportunityInputSchema.parse({ ...base, commission: 'No', commissionType: 'Other', bankName: 'HDFC Bank' }), links, totals);
        assert.equal(none.commissionType, null);
        assert.equal(none.bankName, null);
    });

    it('rejects a type other than Self or Other and a malformed PAN', () => {
        assert.equal(opportunityInputSchema.safeParse({ ...base, commission: 'Yes', commissionAmount: 10, commissionType: 'Partner' }).success, false);
        assert.equal(opportunityInputSchema.safeParse({ ...base, panNumber: 'ABC' }).success, false);
    });
});
