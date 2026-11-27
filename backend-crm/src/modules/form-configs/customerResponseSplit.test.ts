import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { metaForModule } from './customerResponseSplit.js';

describe('metaForModule (Customer Response split)', () => {
    const shared = JSON.stringify({ ratingRule: { rule: 'always', rating: 'Cold' }, opportunityStages: ['Demo'], noFollowUp: true, icon: 'x' });

    it('keeps the Rating rule for leads only', () => {
        assert.deepEqual(JSON.parse(metaForModule(shared, 'leads') ?? 'null'), { ratingRule: { rule: 'always', rating: 'Cold' }, icon: 'x' });
    });

    it('keeps the Sales Stages and No follow-up for opportunities only', () => {
        assert.deepEqual(JSON.parse(metaForModule(shared, 'opportunities') ?? 'null'), { opportunityStages: ['Demo'], noFollowUp: true, icon: 'x' });
    });

    it('drops all module rules for activities, keeping other meta', () => {
        assert.deepEqual(JSON.parse(metaForModule(shared, 'activities') ?? 'null'), { icon: 'x' });
        assert.equal(metaForModule(JSON.stringify({ ratingRule: {} }), 'activities'), null);
    });

    it('passes empty and malformed meta through', () => {
        assert.equal(metaForModule(null, 'leads'), null);
        assert.equal(metaForModule('not json', 'leads'), 'not json');
    });
});
