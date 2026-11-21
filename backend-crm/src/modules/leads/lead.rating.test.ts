import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    ageingFromColumns,
    ageingJson,
    calendarDaysBetween,
    closesLeadFromMeta,
    DEFAULT_NEW_LEAD_LIMITS,
    newLeadLimitsFrom,
    rateAgeing,
    rateFollowUp,
    rateNewLead,
    ratingForCount,
    ratingLimitsSchema,
    ratingRuleFromMeta,
    ratingRuleSchema,
    type RatingRule,
} from './lead.rating.js';

const gap: RatingRule = { rule: 'followUpGap', hot: 5, warm: 'noLimit' };
const sinceResponse: RatingRule = { rule: 'daysSinceResponse', hot: 6, warm: 14 };
const calls: RatingRule = { rule: 'unansweredCalls', hot: 2, warm: 4 };

describe('calendarDaysBetween', () => {
    it('counts calendar days across months and years', () => {
        assert.equal(calendarDaysBetween('2026-11-20', '2026-11-20'), 0);
        assert.equal(calendarDaysBetween('2026-11-20', '2026-11-25'), 5);
        assert.equal(calendarDaysBetween('2026-11-30', '2026-12-01'), 1);
        assert.equal(calendarDaysBetween('2026-12-31', '2027-01-01'), 1);
        assert.equal(calendarDaysBetween('2026-11-21', '2026-11-20'), -1);
    });
});

describe('ratingForCount', () => {
    it('applies inclusive limits, Off and No limit', () => {
        assert.equal(ratingForCount(5, { hot: 5, warm: 14 }), 'Hot');
        assert.equal(ratingForCount(6, { hot: 5, warm: 14 }), 'Warm');
        assert.equal(ratingForCount(14, { hot: 5, warm: 14 }), 'Warm');
        assert.equal(ratingForCount(15, { hot: 5, warm: 14 }), 'Cold');
        assert.equal(ratingForCount(400, { hot: 5, warm: 'noLimit' }), 'Warm');
        assert.equal(ratingForCount(0, { hot: null, warm: 3 }), 'Warm');
        assert.equal(ratingForCount(6, { hot: 5, warm: null }), 'Cold');
        assert.equal(ratingForCount(0, { hot: null, warm: null }), 'Cold');
    });
});

describe('rateNewLead', () => {
    it('created 20 Nov: a follow-up up to 25 Nov is Hot, from 26 Nov Warm', () => {
        assert.equal(rateNewLead(DEFAULT_NEW_LEAD_LIMITS, '2026-11-20', '2026-11-20').rating, 'Hot');
        assert.equal(rateNewLead(DEFAULT_NEW_LEAD_LIMITS, '2026-11-20', '2026-11-25').rating, 'Hot');
        assert.equal(rateNewLead(DEFAULT_NEW_LEAD_LIMITS, '2026-11-20', '2026-11-26').rating, 'Warm');
        assert.equal(rateNewLead(DEFAULT_NEW_LEAD_LIMITS, '2026-11-20', '2027-03-01').rating, 'Warm');
        assert.equal(rateNewLead(DEFAULT_NEW_LEAD_LIMITS, '2026-11-20', '2026-11-23').reason, 'New lead, first follow-up in 3 days');
    });
});

describe('rateFollowUp', () => {
    const base = { response: 'Asked to call back later', today: '2026-11-20', followUpDate: '2026-11-20', unansweredCalls: 0 };

    it('Follow-up gap: 0–5 days Hot, 6+ Warm, and resets the call count', () => {
        assert.equal(rateFollowUp({ ...base, rule: gap, followUpDate: '2026-11-25' }).rating, 'Hot');
        const warm = rateFollowUp({ ...base, rule: gap, followUpDate: '2026-11-26', unansweredCalls: 3 });
        assert.equal(warm.rating, 'Warm');
        assert.equal(warm.unansweredCalls, 0);
        assert.equal(warm.ageing, null);
        assert.equal(warm.reason, 'Follow-up in 6 days after "Asked to call back later"');
    });

    it('Days since response: Hot on the day and starts ageing', () => {
        const result = rateFollowUp({ ...base, rule: sinceResponse, response: 'Interested - send quotation' });
        assert.equal(result.rating, 'Hot');
        assert.deepEqual(result.ageing, { from: '2026-11-20', limits: { hot: 6, warm: 14 }, response: 'Interested - send quotation' });
    });

    it('Unanswered calls: 1–2 Hot, 3–4 Warm, 5+ Cold, counting this call', () => {
        const ratings: string[] = [];
        let count = 0;
        for (let i = 0; i < 6; i++) {
            const result = rateFollowUp({ ...base, rule: calls, unansweredCalls: count });
            ratings.push(result.rating);
            count = result.unansweredCalls;
        }
        assert.deepEqual(ratings, ['Hot', 'Hot', 'Warm', 'Warm', 'Cold', 'Cold']);
        assert.equal(count, 6);
        // Any other response resets the counter.
        assert.equal(rateFollowUp({ ...base, rule: gap, unansweredCalls: count }).unansweredCalls, 0);
    });

    it('Always: the fixed Rating whatever the dates', () => {
        const result = rateFollowUp({ ...base, rule: { rule: 'always', rating: 'Cold' }, response: 'Not interested', unansweredCalls: 2 });
        assert.equal(result.rating, 'Cold');
        assert.equal(result.unansweredCalls, 0);
        assert.equal(result.reason, '"Not interested" is always Cold');
    });
});

describe('rateAgeing', () => {
    const snapshot = { from: '2026-11-20', limits: { hot: 6, warm: 14 }, response: 'Interested - send quotation' };
    it('Hot days 0–6, Warm 7–14, Cold from day 15', () => {
        assert.equal(rateAgeing(snapshot, '2026-11-26').rating, 'Hot');
        assert.equal(rateAgeing(snapshot, '2026-11-27').rating, 'Warm');
        assert.equal(rateAgeing(snapshot, '2026-12-04').rating, 'Warm');
        assert.equal(rateAgeing(snapshot, '2026-12-05').rating, 'Cold');
        assert.equal(rateAgeing(snapshot, '2026-11-27').reason, 'Ageing since "Interested - send quotation" on 20 Nov 2026');
        assert.equal(rateAgeing(snapshot, '2026-11-27').reason, rateAgeing(snapshot, '2026-11-20').reason);
    });

    it('round-trips through its columns', () => {
        assert.deepEqual(ageingFromColumns(snapshot.from, ageingJson(snapshot)), snapshot);
        assert.equal(ageingFromColumns('', ageingJson(snapshot)), null);
        assert.equal(ageingFromColumns(snapshot.from, 'not json'), null);
    });
});

describe('rule validation', () => {
    it('accepts the rule shapes and reads them from option meta', () => {
        for (const rule of [gap, sinceResponse, calls, { rule: 'always', rating: 'Warm' }, { rule: 'followUpGap', hot: null, warm: 10 }]) {
            assert.equal(ratingRuleSchema.safeParse(rule).success, true, JSON.stringify(rule));
        }
        assert.deepEqual(ratingRuleFromMeta({ ratingRule: calls, other: 1 }), calls);
        assert.equal(ratingRuleFromMeta({ ratingRule: { rule: 'bogus' } }), null);
        assert.equal(ratingRuleFromMeta(null), null);
    });

    it('refuses overlapping or out-of-range limits', () => {
        assert.equal(ratingRuleSchema.safeParse({ rule: 'followUpGap', hot: 5, warm: 5 }).success, false);
        assert.equal(ratingRuleSchema.safeParse({ rule: 'followUpGap', hot: -1, warm: 'noLimit' }).success, false);
        assert.equal(ratingRuleSchema.safeParse({ rule: 'followUpGap', hot: 400, warm: 'noLimit' }).success, false);
        assert.equal(ratingRuleSchema.safeParse({ rule: 'unansweredCalls', hot: 0, warm: 4 }).success, false);
        assert.equal(ratingRuleSchema.safeParse({ rule: 'always', rating: 'Lukewarm' }).success, false);
        assert.equal(ratingRuleSchema.safeParse({ rule: 'always', rating: 'Hot', hot: 3 }).success, false);
    });

    it('new-lead limits fall back to the default', () => {
        assert.deepEqual(newLeadLimitsFrom({ hot: 3, warm: 10 }), { hot: 3, warm: 10 });
        assert.deepEqual(newLeadLimitsFrom({ hot: 10, warm: 3 }), DEFAULT_NEW_LEAD_LIMITS);
        assert.deepEqual(newLeadLimitsFrom(undefined), DEFAULT_NEW_LEAD_LIMITS);
        assert.equal(ratingLimitsSchema.safeParse({ hot: 0, warm: 'noLimit' }).success, true);
    });

    it('reads the Closes the lead switch', () => {
        assert.equal(closesLeadFromMeta({ closesLead: true }), true);
        assert.equal(closesLeadFromMeta({ closesLead: 'yes' }), false);
        assert.equal(closesLeadFromMeta(null), false);
    });
});
