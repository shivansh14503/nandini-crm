import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    counterKey,
    legacyRule,
    LEGACY_SETTINGS,
    DEFAULT_SETTINGS,
    financialYearOf,
    formatDocumentNumber,
    formatFinancialYear,
    nextNumber,
    type SeriesRule,
    type SeriesSettings,
} from './documentSeries.format.js';

const IST = 'Asia/Kolkata';
const nipl: SeriesSettings = { companyPrefix: 'NIPL', separator: '/', fyStartMonth: 4, fyFormat: 'YY-YY' };
const leadRule: SeriesRule = { ...legacyRule('lead'), modulePrefix: 'L', includeCompanyPrefix: true, includeFinancialYear: true };

describe('financial year', () => {
    it('starts in April by default, on the business timezone calendar', () => {
        assert.deepEqual(financialYearOf(new Date('2026-11-13T10:00:00Z'), nipl, IST), { startYear: 2026, label: '26-27' });
        assert.deepEqual(financialYearOf(new Date('2027-03-31T12:00:00Z'), nipl, IST), { startYear: 2026, label: '26-27' });
        // 31 Mar 19:00 UTC is already 1 Apr in India.
        assert.deepEqual(financialYearOf(new Date('2027-03-31T19:00:00Z'), nipl, IST), { startYear: 2027, label: '27-28' });
    });

    it('supports every label format', () => {
        assert.equal(formatFinancialYear(2026, 4, 'YY-YY'), '26-27');
        assert.equal(formatFinancialYear(2026, 4, 'YYYY-YY'), '2026-27');
        assert.equal(formatFinancialYear(2026, 4, 'YYYY-YYYY'), '2026-2027');
        assert.equal(formatFinancialYear(2026, 4, 'YYYY'), '2026');
        assert.equal(formatFinancialYear(2026, 4, 'YY'), '26');
        assert.equal(formatFinancialYear(2099, 4, 'YY-YY'), '99-00');
    });

    it('shows a single year when the financial year is the calendar year', () => {
        assert.equal(formatFinancialYear(2026, 1, 'YY-YY'), '26');
        assert.equal(formatFinancialYear(2026, 1, 'YYYY-YYYY'), '2026');
    });
});

describe('document numbers', () => {
    const fy = { startYear: 2026, label: '26-27' };

    it('builds the company format', () => {
        assert.equal(formatDocumentNumber(nipl, leadRule, fy, 1004), 'NIPL/L/26-27/1004');
        assert.equal(formatDocumentNumber(nipl, { ...leadRule, suffix: 'HO' }, fy, 7), 'NIPL/L/26-27/0007/HO');
    });

    it('uses a slash by default for admin-added series', () => {
        assert.equal(DEFAULT_SETTINGS.separator, '/');
        assert.equal(formatDocumentNumber({ ...DEFAULT_SETTINGS, companyPrefix: 'NIPL' }, leadRule, fy, 1004), 'NIPL/L/26-27/1004');
    });

    it('reproduces the original codes for modules without a series', () => {
        assert.equal(formatDocumentNumber(LEGACY_SETTINGS, legacyRule('lead'), fy, 42), 'LD-0042');
        assert.equal(formatDocumentNumber(LEGACY_SETTINGS, legacyRule('organization'), fy, 12345), 'ORG-12345');
    });

    it('leaves out switched-off and blank parts with their separator', () => {
        assert.equal(formatDocumentNumber({ ...nipl, companyPrefix: '' }, leadRule, fy, 5), 'L/26-27/0005');
        assert.equal(formatDocumentNumber(nipl, { ...leadRule, includeFinancialYear: false, padLength: 1 }, fy, 5), 'NIPL/L/5');
        assert.equal(formatDocumentNumber({ ...nipl, separator: '' }, leadRule, fy, 5), 'NIPLL26-270005');
    });

    it('keys counters by module, per financial year only when the series resets', () => {
        assert.equal(counterKey('lead', { resetEachFinancialYear: false }, fy), 'LD');
        assert.equal(counterKey('lead', { resetEachFinancialYear: true }, { startYear: 2027, label: '27-28' }), 'LD@2027');
        assert.equal(counterKey('opportunity', { resetEachFinancialYear: true }, fy), 'OPP@2026');
    });

    it('never goes below the starting number or backwards', () => {
        assert.equal(nextNumber(0, 1), 1);
        assert.equal(nextNumber(42, 1), 43);
        assert.equal(nextNumber(42, 1001), 1001);
        assert.equal(nextNumber(1500, 1001), 1501);
    });
});
