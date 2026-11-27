import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { toStatus } from './referral.mapper.js';
import { isActiveReferralStatus } from './referral.validator.js';

describe('referral status', () => {
    it('reads a stored status ignoring case and spaces, so an inactive referral never shows as Active', () => {
        assert.equal(toStatus('Active'), 'Active');
        assert.equal(toStatus(' active '), 'Active');
        assert.equal(toStatus('Inactive'), 'Inactive');
        assert.equal(toStatus('INACTIVE '), 'Inactive');
        assert.equal(toStatus('Dormant'), 'Inactive');
        assert.equal(toStatus(''), 'Active');
    });

    it('treats only Active as offerable for Referred By', () => {
        assert.equal(isActiveReferralStatus('Active'), true);
        assert.equal(isActiveReferralStatus('active'), true);
        assert.equal(isActiveReferralStatus('Inactive'), false);
        assert.equal(isActiveReferralStatus(null), false);
    });
});
