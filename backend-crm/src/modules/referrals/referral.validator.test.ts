import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { referralInputSchema } from './referral.validator.js';

const valid = {
    name: 'anita desai',
    organizationName: 'Desai & Co',
    mobile: '9876543210',
    emailAddress: [{ email: 'anita@desai.in', isPrimary: true }],
    assignedTo: 'priya',
};

describe('referralInputSchema', () => {
    it('takes the Contact form fields a referral has, plus Status (Active by default)', () => {
        const parsed = referralInputSchema.parse(valid);
        assert.equal(parsed.name, 'Anita Desai');
        assert.equal(parsed.organizationName, 'DESAI & CO');
        assert.equal(parsed.status, 'Active');
        assert.equal(referralInputSchema.parse({ ...valid, status: 'Inactive' }).status, 'Inactive');
    });

    it('refuses other statuses and a missing mobile, as the Contact form does', () => {
        assert.equal(referralInputSchema.safeParse({ ...valid, status: 'Dormant' }).success, false);
        assert.equal(referralInputSchema.safeParse({ ...valid, mobile: '' }).success, false);
        assert.equal(referralInputSchema.safeParse({ ...valid, mobile: '12345' }).success, false);
    });

    it('has none of the contact-only fields', () => {
        const parsed = referralInputSchema.parse({ ...valid, leftJob: 'Yes', phone3: '9876543211', doNotCall: true, isPrimaryContact: true, addDescription: 'x', communicationType: ['Call'] });
        for (const key of ['leftJob', 'phone3', 'phone4', 'phone5', 'doNotCall', 'isPrimaryContact', 'addDescription', 'communicationType']) {
            assert.equal(key in parsed, false, key);
        }
    });
});
