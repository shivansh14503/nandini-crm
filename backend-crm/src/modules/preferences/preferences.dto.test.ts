import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PREFERENCE_DEFAULTS } from './preferences.constants.js';
import { outOfOfficeOf, preferenceAuditSnapshot, toPreferencesDto, type PreferenceRow } from './preferences.dto.js';

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
const ctx = { today: '2026-11-26', onLeave: false, email: ' palak@nandiniinfosys.com ', summaryEnabled: true, mailEnabled: false };
const row = (overrides: Partial<PreferenceRow> = {}): PreferenceRow => ({
    ...PREFERENCE_DEFAULTS,
    updatedAt: new Date('2026-11-25T10:00:00.000Z'),
    ...overrides,
});

describe('toPreferencesDto', () => {
    it('gives every default when the user has no row', () => {
        assert.deepEqual(toPreferencesDto(null, { ...ctx, email: null }), {
            inApp: { activity_reminder: true, activity_assigned: true, activity_invited: true, contract_renewal: true },
            morningSummaryEmail: true,
            defaultReminder: null,
            outOfOffice: null,
            onLeave: false,
            email: '',
            mail: { summaryEnabled: true, mailEnabled: false },
            updatedAt: null,
        });
    });

    it('maps the stored switches, default reminder and the server switches', () => {
        const dto = toPreferencesDto(row({ inAppActivityInvited: false, emailMorningSummary: false, defaultReminder: 'none' }), { ...ctx, onLeave: true });
        assert.deepEqual(dto.inApp, { activity_reminder: true, activity_assigned: true, activity_invited: false, contract_renewal: true });
        assert.equal(dto.morningSummaryEmail, false);
        assert.equal(dto.defaultReminder, 'none');
        assert.equal(dto.onLeave, true);
        assert.equal(dto.email, 'palak@nandiniinfosys.com');
        assert.equal(dto.updatedAt, '2026-11-25T10:00:00.000Z');
    });

    it('shows a scheduled range as not active, a current one as active, and an ended one as none', () => {
        const range = { outOfOfficeFrom: day('2026-12-01'), outOfOfficeTo: day('2026-12-05'), outOfOfficeMessage: 'Travelling' };
        assert.deepEqual(toPreferencesDto(row(range), ctx).outOfOffice, { from: '2026-12-01', to: '2026-12-05', message: 'Travelling', active: false });
        assert.equal(toPreferencesDto(row(range), { ...ctx, today: '2026-12-01' }).outOfOffice?.active, true);
        assert.equal(toPreferencesDto(row(range), { ...ctx, today: '2026-12-05' }).outOfOffice?.active, true);
        assert.equal(toPreferencesDto(row(range), { ...ctx, today: '2026-12-06' }).outOfOffice, null);
    });
});

describe('outOfOfficeOf', () => {
    it('is null when unset, half set or ended, and the range with its message otherwise', () => {
        assert.equal(outOfOfficeOf(null, '2026-11-26'), null);
        assert.equal(outOfOfficeOf({ outOfOfficeFrom: day('2026-12-01'), outOfOfficeTo: null, outOfOfficeMessage: null }, '2026-11-26'), null);
        const pref = { outOfOfficeFrom: day('2026-11-20'), outOfOfficeTo: day('2026-11-26'), outOfOfficeMessage: null };
        assert.deepEqual(outOfOfficeOf(pref, '2026-11-26'), { from: '2026-11-20', to: '2026-11-26', message: null });
        assert.equal(outOfOfficeOf(pref, '2026-11-27'), null);
    });
});

describe('preferenceAuditSnapshot', () => {
    it('has the 9 stored values with dates as YYYY-MM-DD', () => {
        const snapshot = preferenceAuditSnapshot(row({ outOfOfficeFrom: day('2026-12-01'), outOfOfficeTo: day('2026-12-05'), outOfOfficeMessage: 'Away' }));
        assert.deepEqual(snapshot, {
            inAppActivityReminder: true,
            inAppActivityAssigned: true,
            inAppActivityInvited: true,
            inAppContractRenewal: true,
            emailMorningSummary: true,
            defaultReminder: null,
            outOfOfficeFrom: '2026-12-01',
            outOfOfficeTo: '2026-12-05',
            outOfOfficeMessage: 'Away',
        });
        assert.equal('updatedAt' in snapshot, false);
        assert.equal(preferenceAuditSnapshot(PREFERENCE_DEFAULTS).outOfOfficeFrom, null);
    });
});
