import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { opportunityInputSchema } from './opportunity.validator.js';

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
