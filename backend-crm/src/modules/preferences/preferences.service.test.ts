import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { diffRecords } from '../../services/audit.service.js';
import { PREFERENCE_DEFAULTS } from './preferences.constants.js';
import { preferenceAuditSnapshot } from './preferences.dto.js';
import { applyPreferencesPatch } from './preferences.service.js';

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

describe('applyPreferencesPatch', () => {
    it('changes only the keys sent', () => {
        const next = applyPreferencesPatch(PREFERENCE_DEFAULTS, { inApp: { contract_renewal: false }, defaultReminder: '1 hour before' });
        assert.deepEqual(next, { ...PREFERENCE_DEFAULTS, inAppContractRenewal: false, defaultReminder: '1 hour before' });
        assert.deepEqual(applyPreferencesPatch(next, {}), next);
    });

    it('sets a range at UTC midnight, keeps the stored message when none is sent, and clears all three on null', () => {
        const stored = { ...PREFERENCE_DEFAULTS, outOfOfficeFrom: day('2026-12-01'), outOfOfficeTo: day('2026-12-05'), outOfOfficeMessage: 'Away' };
        const moved = applyPreferencesPatch(stored, { outOfOffice: { from: '2026-12-02', to: '2026-12-06' } });
        assert.equal(moved.outOfOfficeFrom?.toISOString(), '2026-12-02T00:00:00.000Z');
        assert.equal(moved.outOfOfficeTo?.toISOString(), '2026-12-06T00:00:00.000Z');
        assert.equal(moved.outOfOfficeMessage, 'Away');
        assert.equal(applyPreferencesPatch(stored, { outOfOffice: { from: '2026-12-01', to: '2026-12-05', message: null } }).outOfOfficeMessage, null);
        const cleared = applyPreferencesPatch(stored, { outOfOffice: null });
        assert.deepEqual([cleared.outOfOfficeFrom, cleared.outOfOfficeTo, cleared.outOfOfficeMessage], [null, null, null]);
    });

    it('re-sending the stored values is no change (nothing written or audited)', () => {
        const stored = { ...PREFERENCE_DEFAULTS, inAppActivityReminder: false, outOfOfficeFrom: day('2026-12-01'), outOfOfficeTo: day('2026-12-05') };
        const next = applyPreferencesPatch(stored, { inApp: { activity_reminder: false }, outOfOffice: { from: '2026-12-01', to: '2026-12-05' } });
        assert.deepEqual(diffRecords(preferenceAuditSnapshot(stored), preferenceAuditSnapshot(next)), {});
    });
});
