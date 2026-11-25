import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decideReferredBy } from './referredBy.js';

const anita = { id: 'R1', name: 'Anita Desai', status: 'Active', isDeleted: false };
const inactive = { id: 'R2', name: 'Vikram Rao', status: 'Inactive', isDeleted: false };
const deleted = { id: 'R3', name: 'Meera Shah', status: 'Active', isDeleted: true };

describe('Referred By (a referral)', () => {
    it('is empty when nothing is sent', () => {
        assert.deepEqual(decideReferredBy({ referredBy: ' ', referredById: '' }, undefined, {}), { referredBy: null, referredById: null });
    });

    it('takes a picked active referral, with its current name', () => {
        assert.deepEqual(decideReferredBy({ referredBy: 'anita', referredById: 'R1' }, undefined, { byId: anita }), {
            referredBy: 'Anita Desai',
            referredById: 'R1',
        });
    });

    it('refuses a newly picked Inactive or deleted referral', () => {
        assert.deepEqual(decideReferredBy({ referredById: 'R2' }, undefined, { byId: inactive }), {
            error: 'This referral is Inactive. Pick an active referral.',
        });
        assert.deepEqual(decideReferredBy({ referredById: 'R3' }, undefined, { byId: deleted }), { error: 'The selected referral no longer exists.' });
        assert.deepEqual(decideReferredBy({ referredById: 'R9' }, undefined, { byId: null }), { error: 'The selected referral no longer exists.' });
    });

    it('keeps the referral a record already has, even once Inactive or deleted', () => {
        const previous = { referredBy: 'Vikram Rao', referredById: 'R2' };
        assert.deepEqual(decideReferredBy({ referredBy: 'Vikram Rao', referredById: 'R2' }, previous, { byId: inactive }), {
            referredBy: 'Vikram Rao',
            referredById: 'R2',
        });
        assert.deepEqual(decideReferredBy({ referredById: 'R3' }, { referredBy: 'Meera Shah', referredById: 'R3' }, { byId: deleted }), {
            referredBy: 'Meera Shah',
            referredById: 'R3',
        });
    });

    it('keeps a legacy typed value sent unchanged, and links its name when it is the referral it held', () => {
        assert.deepEqual(decideReferredBy({ referredBy: ' Rajesh (CA) ' }, { referredBy: 'Rajesh (CA)', referredById: null }, {}), {
            referredBy: 'Rajesh (CA)',
            referredById: null,
        });
        assert.deepEqual(decideReferredBy({ referredBy: 'Anita Desai' }, { referredBy: 'Anita Desai', referredById: 'R1' }, {}), {
            referredBy: 'Anita Desai',
            referredById: 'R1',
        });
    });

    it('finds a typed name among the active referrals (imports), and refuses anything else', () => {
        assert.deepEqual(decideReferredBy({ referredBy: 'anita desai' }, undefined, { byName: [anita] }), { referredBy: 'Anita Desai', referredById: 'R1' });
        assert.deepEqual(decideReferredBy({ referredBy: 'Someone New' }, undefined, { byName: [] }), { error: 'Pick Referred By from the active Referrals.' });
        assert.deepEqual(decideReferredBy({ referredBy: 'Rajesh' }, { referredBy: 'Rajesh (CA)' }, { byName: [] }), {
            error: 'Pick Referred By from the active Referrals.',
        });
        assert.match(String((decideReferredBy({ referredBy: 'Anita Desai' }, undefined, { byName: [anita, { ...anita, id: 'R4' }] }) as { error: string }).error), /Several active referrals/);
    });
});
