import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isOutOfOfficeOn, outOfOfficeIssues } from './preferences.rules.js';

const today = '2026-11-26';

describe('isOutOfOfficeOn', () => {
    const range = { from: '2026-12-01', to: '2026-12-05' };
    it('covers both ends and nothing outside', () => {
        assert.equal(isOutOfOfficeOn(range, '2026-11-30'), false);
        assert.equal(isOutOfOfficeOn(range, '2026-12-01'), true);
        assert.equal(isOutOfOfficeOn(range, '2026-12-03'), true);
        assert.equal(isOutOfOfficeOn(range, '2026-12-05'), true);
        assert.equal(isOutOfOfficeOn(range, '2026-12-06'), false);
    });
    it('is false without a range', () => {
        assert.equal(isOutOfOfficeOn(null, today), false);
        assert.equal(isOutOfOfficeOn(undefined, today), false);
    });
});

describe('outOfOfficeIssues', () => {
    it('accepts a range of today, a single day and one of exactly 365 days', () => {
        assert.deepEqual(outOfOfficeIssues({ from: today, to: today }, today), []);
        assert.deepEqual(outOfOfficeIssues({ from: '2026-12-01', to: '2026-12-05' }, today), []);
        assert.deepEqual(outOfOfficeIssues({ from: '2026-12-01', to: '2027-11-30' }, today), []);
    });

    it('refuses an end before the start', () => {
        assert.deepEqual(outOfOfficeIssues({ from: '2026-12-05', to: '2026-12-01' }, today), [{ path: 'to', message: 'End Date cannot be before the Start Date.' }]);
    });

    it('refuses 366 days', () => {
        assert.deepEqual(outOfOfficeIssues({ from: '2026-12-01', to: '2027-12-01' }, today), [{ path: 'to', message: 'Out of office can be at most 365 days.' }]);
    });

    it('refuses a new end in the past, but a start in the past is fine while the end is today or later', () => {
        assert.deepEqual(outOfOfficeIssues({ from: '2026-11-20', to: '2026-11-25' }, today), [{ path: 'to', message: 'End Date cannot be in the past.' }]);
        assert.deepEqual(outOfOfficeIssues({ from: '2026-11-20', to: today }, today), []);
    });

    it('refuses a start more than 365 days ahead', () => {
        assert.deepEqual(outOfOfficeIssues({ from: '2027-11-26', to: '2027-11-27' }, today), []);
        assert.deepEqual(outOfOfficeIssues({ from: '2027-11-27', to: '2027-11-28' }, today), [
            { path: 'from', message: 'Start Date must be within the next 365 days.' },
        ]);
    });

    it('skips the today-based rules for the range already stored', () => {
        const stored = { from: '2026-11-20', to: '2026-11-25' };
        assert.deepEqual(outOfOfficeIssues(stored, today, stored), []);
        assert.equal(outOfOfficeIssues({ ...stored, to: '2026-11-24' }, today, stored).length, 1, 'a changed end is checked again');
        // The order-independent rules still apply to an unchanged range.
        const backwards = { from: '2026-12-05', to: '2026-12-01' };
        assert.equal(outOfOfficeIssues(backwards, today, backwards)[0]?.path, 'to');
    });

    it('reports at most one issue per field, in rule order', () => {
        assert.deepEqual(outOfOfficeIssues({ from: '2028-01-10', to: '2026-11-20' }, today), [
            { path: 'to', message: 'End Date cannot be before the Start Date.' },
            { path: 'from', message: 'Start Date must be within the next 365 days.' },
        ]);
    });

    it('leaves invalid days to the date check', () => {
        assert.deepEqual(outOfOfficeIssues({ from: '2026-02-30', to: '2026-03-01' }, today), []);
        assert.deepEqual(outOfOfficeIssues({ from: '', to: '' }, today), []);
    });
});
