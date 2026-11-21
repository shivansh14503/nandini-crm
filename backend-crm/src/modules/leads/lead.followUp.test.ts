import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HttpError } from '../../utils/httpError.js';
import { fromDateOnly } from '../../utils/mappers.js';
import { assertFutureSlot, currentRating, newLeadRatingColumns, planLeadEdit, type LeadRatingState, type RatingConfig } from './lead.followUp.js';
import { ageingJson, DEFAULT_NEW_LEAD_LIMITS } from './lead.rating.js';

const NOW = '2026-11-20T15:10';

const config: RatingConfig = {
    responseRules: new Map([
        ['Asked to call back later', { rule: 'followUpGap', hot: 5, warm: 'noLimit' }],
        ['Interested - send quotation', { rule: 'daysSinceResponse', hot: 6, warm: 14 }],
        ['Not reachable / no answer', { rule: 'unansweredCalls', hot: 2, warm: 4 }],
        ['Not interested', { rule: 'always', rating: 'Cold' }],
    ]),
    closingStatuses: new Set(['Converted', 'Dead']),
    newLeadLimits: DEFAULT_NEW_LEAD_LIMITS,
};

const state = (overrides: Partial<LeadRatingState> = {}): LeadRatingState => ({
    status: 'In Process',
    rating: 'Warm',
    ratingReason: 'earlier',
    unansweredCalls: 0,
    ratingAgeingFrom: null,
    ratingAgeingJson: null,
    nextFollowupDate: fromDateOnly('2026-11-24'),
    nextFollowupTime: '11:00 AM',
    ...overrides,
});

const kept = { date: '2026-11-24', time: '11:00 AM' };
const edit = (overrides: Partial<Parameters<typeof planLeadEdit>[0]> = {}) =>
    planLeadEdit({ state: state(), response: '', remarks: '', decision: undefined, nextStatus: 'In Process', next: kept, config, now: NOW, ...overrides });

/** The field a refused save points at. */
function refusedAt(run: () => unknown): string {
    try {
        run();
    } catch (err) {
        assert.ok(err instanceof HttpError);
        return String(err.errors?.[0]?.path[0] ?? '(no path)');
    }
    assert.fail('expected the save to be refused');
}

describe('assertFutureSlot', () => {
    it('needs a date and a time later than now', () => {
        assert.equal(refusedAt(() => assertFutureSlot({ date: '', time: '' }, NOW)), 'nextFollowupDate');
        assert.equal(refusedAt(() => assertFutureSlot({ date: '2026-11-20', time: '' }, NOW)), 'nextFollowupTime');
        assert.equal(refusedAt(() => assertFutureSlot({ date: '2026-11-20', time: '3:10 PM' }, NOW)), 'nextFollowupTime');
        assert.equal(refusedAt(() => assertFutureSlot({ date: '2026-11-19', time: '6:00 PM' }, NOW)), 'nextFollowupDate');
        assert.doesNotThrow(() => assertFutureSlot({ date: '2026-11-20', time: '3:11 PM' }, NOW));
    });
});

describe('newLeadRatingColumns', () => {
    it('rates by the new-lead rule; no or a past follow-up is Warm', () => {
        assert.equal(newLeadRatingColumns(config, '2026-11-20', '2026-11-25').rating, 'Hot');
        assert.equal(newLeadRatingColumns(config, '2026-11-20', '2026-11-26').rating, 'Warm');
        assert.equal(newLeadRatingColumns(config, '2026-11-20', undefined).rating, 'Warm');
        assert.equal(newLeadRatingColumns(config, '2026-11-20', '2026-11-01').rating, 'Warm');
    });
});

describe('planLeadEdit — details only', () => {
    it('changes nothing about the follow-up or the Rating', () => {
        assert.deepEqual(edit(), { data: {}, followUp: null });
    });

    it('refuses to change the follow-up, close or reopen without a response', () => {
        assert.equal(refusedAt(() => edit({ next: { date: '2026-11-26', time: '11:00 AM' } })), 'customerResponse');
        assert.equal(refusedAt(() => edit({ nextStatus: 'Dead' })), 'customerResponse');
        assert.equal(refusedAt(() => edit({ state: state({ status: 'Dead', nextFollowupDate: null, nextFollowupTime: null }), next: { date: '', time: '' } })), 'customerResponse');
    });

    it('lets a closed lead change its details', () => {
        const closed = state({ status: 'Dead', nextFollowupDate: null, nextFollowupTime: null });
        assert.deepEqual(edit({ state: closed, nextStatus: 'Dead', next: { date: '', time: '' } }), { data: {}, followUp: null });
    });
});

describe('planLeadEdit — recording a follow-up', () => {
    const response = 'Asked to call back later';

    it('needs an explicit keep / new decision', () => {
        assert.equal(refusedAt(() => edit({ response })), 'followUpDecision');
    });

    it('keep: the follow-up must still be ahead at save time, unchanged', () => {
        const plan = edit({ response, decision: 'keep' });
        assert.equal(plan.data.rating, 'Hot'); // 4 days ahead
        assert.equal(plan.followUp?.decision, 'keep');
        assert.equal(refusedAt(() => edit({ response, decision: 'keep', now: '2026-11-24T11:00' })), 'nextFollowupDate');
        assert.equal(refusedAt(() => edit({ response, decision: 'keep', next: { date: '2026-11-25', time: '11:00 AM' } })), 'nextFollowupDate');
        assert.equal(refusedAt(() => edit({ response, decision: 'keep', state: state({ nextFollowupDate: null, nextFollowupTime: null }) })), 'nextFollowupDate');
    });

    it('new: needs a later date and time; 6+ days out is Warm', () => {
        assert.equal(refusedAt(() => edit({ response, decision: 'new', next: { date: '2026-11-20', time: '2:00 PM' } })), 'nextFollowupTime');
        const plan = edit({ response, decision: 'new', next: { date: '2026-11-26', time: '10:00 AM' } });
        assert.equal(plan.data.rating, 'Warm');
        assert.deepEqual(plan.followUp?.rating, { from: 'Warm', to: 'Warm' });
        assert.deepEqual(plan.followUp?.previous, kept);
    });

    it('counts unanswered calls and resets them on any other response', () => {
        const calls = edit({ response: 'Not reachable / no answer', decision: 'keep', state: state({ unansweredCalls: 2 }) });
        assert.equal(calls.data.unansweredCalls, 3);
        assert.equal(calls.data.rating, 'Warm');
        const reset = edit({ response: 'Not interested', decision: 'keep', state: state({ unansweredCalls: 4 }) });
        assert.equal(reset.data.unansweredCalls, 0);
        assert.equal(reset.data.rating, 'Cold');
    });

    it('starts and clears ageing; an unknown response uses the default rule', () => {
        const ageing = edit({ response: 'Interested - send quotation', decision: 'keep' });
        assert.equal(ageing.data.rating, 'Hot');
        assert.ok(ageing.data.ratingAgeingFrom instanceof Date);
        assert.ok(ageing.data.ratingAgeingJson);
        const other = edit({ response: 'Something new', decision: 'new', next: { date: '2026-11-21', time: '10:00 AM' } });
        assert.equal(other.data.rating, 'Hot');
        assert.equal(other.data.ratingAgeingFrom, null);
    });

    it('reopening needs a new follow-up', () => {
        const closed = state({ status: 'Dead', nextFollowupDate: null, nextFollowupTime: null });
        assert.equal(refusedAt(() => edit({ state: closed, response, decision: 'keep', next: { date: '', time: '' } })), 'nextFollowupDate');
        assert.equal(edit({ state: closed, response, decision: 'new', next: { date: '2026-11-21', time: '10:00 AM' } }).data.rating, 'Hot');
    });
});

describe('planLeadEdit — closing', () => {
    const snapshot = { from: '2026-11-10', limits: { hot: 6, warm: 14 }, response: 'Interested - send quotation' };
    const ageingLead = state({ rating: 'Hot', ratingAgeingFrom: fromDateOnly(snapshot.from), ratingAgeingJson: ageingJson(snapshot) });

    it('keeps the Rating as it is today, clears the follow-up and stops ageing', () => {
        const plan = edit({ state: ageingLead, response: 'Using another product', nextStatus: 'Dead', next: { date: '', time: '' } });
        assert.equal(plan.data.rating, 'Warm'); // day 10 of the quotation's ageing
        assert.equal(plan.data.ratingAgeingFrom, null);
        assert.equal(plan.data.nextFollowupDate, null);
        assert.equal(plan.followUp?.decision, 'closed');
        assert.deepEqual(plan.followUp?.rating, { from: 'Hot', to: 'Warm' });
    });

    it('currentRating ages only leads with a snapshot', () => {
        assert.equal(currentRating(ageingLead, '2026-11-25').rating, 'Cold');
        assert.equal(currentRating(state(), '2026-12-31').rating, 'Warm');
    });
});
