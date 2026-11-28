import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { REFERRAL_IMPORT_DEFAULTS, referralImportRaw } from './referrals.values.js';

describe('referral import defaults', () => {
    it('fills a blank Status and Assigned to', () => {
        const raw = referralImportRaw({ name: 'Rajesh Kumar', mobile: '+919876543210' }, {}, 'importer');
        assert.equal(raw.status, REFERRAL_IMPORT_DEFAULTS.status);
        assert.equal(raw.status, 'Active');
        assert.equal(raw.assignedTo, 'importer');
        assert.deepEqual(raw.customFields, {});
    });

    it('treats whitespace-only cells as blank', () => {
        const raw = referralImportRaw({ status: '  ', assignedTo: ' ' }, {}, 'importer');
        assert.equal(raw.status, 'Active');
        assert.equal(raw.assignedTo, 'importer');
    });

    it('keeps the values a row gives', () => {
        const raw = referralImportRaw({ name: 'Neha', status: 'Inactive', assignedTo: 'asha', companyName: 'KHANNA & ASSOCIATES' }, { region: 'North' }, 'importer');
        assert.equal(raw.status, 'Inactive');
        assert.equal(raw.assignedTo, 'asha');
        assert.equal(raw.companyName, 'KHANNA & ASSOCIATES');
        assert.deepEqual(raw.customFields, { region: 'North' });
    });
});
