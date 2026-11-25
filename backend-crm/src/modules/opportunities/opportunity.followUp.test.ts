import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HttpError } from '../../utils/httpError.js';
import { planOpportunityFollowUp, type ResponseRules } from './opportunity.followUp.js';

const rules: ResponseRules = {
    responses: new Map([
        ['requested demo', { value: 'Requested Demo', stages: ['Qualification', 'Demo'], noFollowUp: false }],
        ['need more information', { value: 'Need More Information', stages: null, noFollowUp: false }],
        ['do not contact', { value: 'Do Not Contact', stages: null, noFollowUp: true }],
    ]),
};
const NOW = '2026-11-25T10:00';
const plan = (values: Parameters<typeof planOpportunityFollowUp>[0], recorded = true) => planOpportunityFollowUp(values, recorded, rules, NOW);
const refusedAt = (fn: () => unknown): string | undefined => {
    try {
        fn();
    } catch (err) {
        return err instanceof HttpError ? err.errors?.[0]?.path[0] : 'other';
    }
    return undefined;
};

describe('planOpportunityFollowUp', () => {
    const future = { nextFollowupDate: '2026-11-28', nextFollowupTime: '11:00 AM' };

    it('keeps a response allowed at the stage, with a future follow-up', () => {
        assert.deepEqual(plan({ salesStage: 'Demo', customerResponse: 'requested demo', ...future }), {
            customerResponse: 'Requested Demo',
            nextFollowupDate: '2026-11-28',
            nextFollowupTime: '11:00 AM',
            followUpCleared: false,
        });
    });

    it('refuses a response the stage does not allow, or one not in the list', () => {
        assert.equal(refusedAt(() => plan({ salesStage: 'Negotiation', customerResponse: 'Requested Demo', ...future })), 'customerResponse');
        assert.equal(refusedAt(() => plan({ salesStage: 'Demo', customerResponse: 'Made up', ...future })), 'customerResponse');
    });

    it('needs a follow-up date and a time later than now', () => {
        assert.equal(refusedAt(() => plan({ salesStage: 'Demo', customerResponse: 'Requested Demo' })), 'nextFollowupDate');
        assert.equal(refusedAt(() => plan({ salesStage: 'Demo', customerResponse: 'Requested Demo', nextFollowupDate: '2026-11-28' })), 'nextFollowupTime');
        assert.equal(refusedAt(() => plan({ salesStage: 'Demo', customerResponse: 'Requested Demo', nextFollowupDate: '2026-11-25', nextFollowupTime: '09:30 AM' })), 'nextFollowupTime');
        assert.equal(refusedAt(() => plan({ salesStage: 'Demo', customerResponse: 'Requested Demo', nextFollowupDate: '2026-11-25', nextFollowupTime: '10:30 AM' })), undefined);
    });

    it('clears the response and the follow-up at Closed Won / Closed Lost', () => {
        for (const salesStage of ['Closed Won', 'Closed Lost']) {
            assert.deepEqual(plan({ salesStage, customerResponse: 'Requested Demo', ...future }), {
                customerResponse: '',
                nextFollowupDate: null,
                nextFollowupTime: '',
                followUpCleared: true,
            });
        }
    });

    it('keeps Do Not Contact but clears the follow-up', () => {
        const result = plan({ salesStage: 'Negotiation', customerResponse: 'Do Not Contact', ...future });
        assert.equal(result.customerResponse, 'Do Not Contact');
        assert.equal(result.nextFollowupDate, null);
        assert.equal(result.followUpCleared, true);
    });

    it('leaves the stored response alone when none is recorded', () => {
        const result = plan({ salesStage: 'Negotiation', customerResponse: 'Requested Demo', ...future }, false);
        assert.equal(result.customerResponse, 'Requested Demo');
        assert.equal(result.followUpCleared, false);
    });
});
