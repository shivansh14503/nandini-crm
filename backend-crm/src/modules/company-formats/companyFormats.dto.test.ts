import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_DISPLAY_FORMATS } from './core/displayFormats.js';
import { companyFormatsAuditSnapshot, formatsOf, toCompanyFormatsDto, type CompanyFormatsRow } from './companyFormats.dto.js';

const row: CompanyFormatsRow = { dateFormat: 'MM/DD/YYYY', timeFormat: '24h', numberGrouping: 'international', updatedBy: 'admin', updatedAt: '2026-11-26T06:00:00.000Z' };

describe('company formats DTO', () => {
    it('no row: the defaults, not customized, nobody changed it', () => {
        assert.deepEqual(formatsOf(null), DEFAULT_DISPLAY_FORMATS);
        assert.deepEqual(toCompanyFormatsDto(null, 'Asia/Kolkata'), {
            dateFormat: 'DD-MMM-YYYY',
            timeFormat: '12h',
            numberGrouping: 'indian',
            customized: false,
            currency: { code: 'INR', symbol: '₹', name: 'Indian Rupee', decimals: 2 },
            timeZone: 'Asia/Kolkata',
            updatedAt: null,
            updatedBy: null,
        });
    });

    it('a row: its values, customized, who saved it and when', () => {
        assert.deepEqual(formatsOf(row), { dateFormat: 'MM/DD/YYYY', timeFormat: '24h', numberGrouping: 'international', customized: true });
        assert.deepEqual(toCompanyFormatsDto(row, 'Asia/Kolkata'), {
            dateFormat: 'MM/DD/YYYY',
            timeFormat: '24h',
            numberGrouping: 'international',
            customized: true,
            currency: { code: 'INR', symbol: '₹', name: 'Indian Rupee', decimals: 2 },
            timeZone: 'Asia/Kolkata',
            updatedAt: '2026-11-26T06:00:00.000Z',
            updatedBy: 'admin',
        });
    });

    it('a stored value outside the lists falls back to that field’s default (still customized)', () => {
        assert.deepEqual(formatsOf({ dateFormat: 'DD.MM.YYYY', timeFormat: '24h', numberGrouping: 'roman' }), {
            dateFormat: 'DD-MMM-YYYY',
            timeFormat: '24h',
            numberGrouping: 'indian',
            customized: true,
        });
    });

    it('snapshots the audited fields', () => {
        assert.deepEqual(companyFormatsAuditSnapshot(formatsOf(row)), { dateFormat: 'MM/DD/YYYY', timeFormat: '24h', numberGrouping: 'international', customized: true });
        assert.deepEqual(companyFormatsAuditSnapshot(DEFAULT_DISPLAY_FORMATS), { dateFormat: 'DD-MMM-YYYY', timeFormat: '12h', numberGrouping: 'indian', customized: false });
    });
});
