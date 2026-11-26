import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ACTIVITY_REMINDERS } from '../activities/activity.schedule.js';
import { preferencesPatchSchema } from './preferences.validator.js';

const issues = (value: unknown) => {
    const result = preferencesPatchSchema.safeParse(value);
    return result.success ? [] : result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
};
const parse = (value: unknown) => preferencesPatchSchema.parse(value);

describe('preferencesPatchSchema', () => {
    it('accepts an empty body (changes nothing)', () => {
        assert.deepEqual(parse({}), {});
    });

    it('refuses unknown keys, top-level and nested', () => {
        assert.equal(issues({ theme: 'dark' }).length, 1);
        assert.deepEqual(issues({ inApp: { calendar_sync_issue: false } }).map((issue) => issue.path), ['inApp']);
        assert.deepEqual(issues({ outOfOffice: { from: '2026-12-01', to: '2026-12-02', reason: 'x' } }).map((issue) => issue.path), ['outOfOffice']);
    });

    it('takes on / off switches, with the row label in the message', () => {
        assert.deepEqual(parse({ inApp: { activity_assigned: false }, morningSummaryEmail: true }), { inApp: { activity_assigned: false }, morningSummaryEmail: true });
        assert.deepEqual(issues({ inApp: { activity_reminder: 'no' } }), [{ path: 'inApp.activity_reminder', message: '"Activity reminders" must be on or off.' }]);
        assert.deepEqual(issues({ inApp: { contract_renewal: null } }), [{ path: 'inApp.contract_renewal', message: '"Contract renewals" must be on or off.' }]);
        assert.deepEqual(issues({ morningSummaryEmail: 1 }), [{ path: 'morningSummaryEmail', message: '"Morning summary email" must be on or off.' }]);
    });

    it('takes every reminder label, none and null as the default reminder', () => {
        for (const reminder of [...ACTIVITY_REMINDERS, 'none', null]) assert.deepEqual(parse({ defaultReminder: reminder }), { defaultReminder: reminder });
        assert.deepEqual(issues({ defaultReminder: '15 min' }), [{ path: 'defaultReminder', message: 'Pick a reminder from the list.' }]);
        assert.deepEqual(issues({ defaultReminder: '' }), [{ path: 'defaultReminder', message: 'Pick a reminder from the list.' }]);
    });

    it('takes out of office as null (clear) or a range with an optional message', () => {
        assert.deepEqual(parse({ outOfOffice: null }), { outOfOffice: null });
        assert.deepEqual(parse({ outOfOffice: { from: '2026-12-01', to: '2026-12-05' } }), { outOfOffice: { from: '2026-12-01', to: '2026-12-05' } });
        assert.deepEqual(parse({ outOfOffice: { from: '2026-12-01', to: '2026-12-05', message: '  At the Pune office ' } }).outOfOffice?.message, 'At the Pune office');
        assert.equal(parse({ outOfOffice: { from: '2026-12-01', to: '2026-12-05', message: '' } }).outOfOffice?.message, null);
        assert.equal(parse({ outOfOffice: { from: '2026-12-01', to: '2026-12-05', message: '   ' } }).outOfOffice?.message, null);
    });

    it('checks the dates and the message length', () => {
        assert.deepEqual(issues({ outOfOffice: { from: '2026-02-30', to: '2026-12-05' } }), [
            { path: 'outOfOffice.from', message: 'Start Date must be a valid date (YYYY-MM-DD).' },
        ]);
        assert.deepEqual(issues({ outOfOffice: { from: '2026-12-01' } }), [{ path: 'outOfOffice.to', message: 'End Date is required.' }]);
        assert.deepEqual(issues({ outOfOffice: { from: '2026-12-01', to: '2026-12-05', message: 'x'.repeat(201) } }), [
            { path: 'outOfOffice.message', message: 'Message cannot exceed 200 characters.' },
        ]);
        assert.equal(parse({ outOfOffice: { from: '2026-12-01', to: '2026-12-05', message: 'x'.repeat(200) } }).outOfOffice?.message?.length, 200);
    });
});
