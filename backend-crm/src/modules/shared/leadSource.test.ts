import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HttpError } from '../../utils/httpError.js';
import { assertLeadSourceDetails, isPartnerLeadSource, leadSourceDetailIssues, leadSourceNeedsReferredBy, natureOfPartnerFor } from './leadSource.js';

describe('Lead Source follow-up fields', () => {
    it('asks for Referred By on CA and Reference only (any case, trimmed)', () => {
        for (const source of ['CA', 'ca', ' Reference ', 'reference']) assert.equal(leadSourceNeedsReferredBy(source), true, source);
        for (const source of ['', null, undefined, 'Client Referral', 'Partner', 'CA Firm']) assert.equal(leadSourceNeedsReferredBy(source), false, String(source));
    });

    it('asks for Nature of Partner on Partner only', () => {
        assert.equal(isPartnerLeadSource('Partner'), true);
        assert.equal(isPartnerLeadSource(' partner'), true);
        assert.equal(isPartnerLeadSource('Partner Referral'), false);
        assert.equal(isPartnerLeadSource(undefined), false);
    });

    it('names the missing field', () => {
        assert.deepEqual(leadSourceDetailIssues({ leadSource: 'CA', referredBy: ' ' }), [
            { message: 'Referred By is required when Lead Source is CA.', path: ['referredBy'] },
        ]);
        assert.deepEqual(leadSourceDetailIssues({ leadSource: 'Partner' }, { natureOfPartner: 'opportunityNatureOfPartner' }), [
            { message: 'Nature of Partner is required when Lead Source is Partner.', path: ['opportunityNatureOfPartner'] },
        ]);
        assert.deepEqual(leadSourceDetailIssues({ leadSource: 'Reference', referredBy: 'Anita Desai' }), []);
        assert.deepEqual(leadSourceDetailIssues({ leadSource: 'Partner', natureOfPartner: 'TALLY-AP' }), []);
        assert.deepEqual(leadSourceDetailIssues({ leadSource: 'Website Enquiry' }), []);
    });

    it('refuses with a 400 on the field', () => {
        assert.throws(
            () => assertLeadSourceDetails({ leadSource: 'Reference' }),
            (err: unknown) => err instanceof HttpError && err.statusCode === 400 && err.errors?.[0]?.path[0] === 'referredBy',
        );
        assert.doesNotThrow(() => assertLeadSourceDetails({ leadSource: 'Cold Call' }));
    });

    it('stores a Nature of Partner only for Lead Source Partner', () => {
        assert.equal(natureOfPartnerFor({ leadSource: 'Partner', natureOfPartner: ' TALLY-AP ' }), 'TALLY-AP');
        assert.equal(natureOfPartnerFor({ leadSource: 'CA', natureOfPartner: 'TALLY-AP' }), null);
        assert.equal(natureOfPartnerFor({ leadSource: 'Partner', natureOfPartner: '' }), null);
    });
});
