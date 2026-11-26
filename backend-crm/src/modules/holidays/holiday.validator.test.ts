import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { classifyImportRows, listWhere, yearsBetween } from './holiday.service.js';
import { holidayCalendarQuerySchema, holidayInputSchema, holidayKey, parseImportDate } from './holiday.validator.js';

describe('parseImportDate', () => {
    it('reads ISO and day-first dates', () => {
        assert.equal(parseImportDate('2026-08-15'), '2026-08-15');
        assert.equal(parseImportDate('2026-8-5'), '2026-08-05');
        assert.equal(parseImportDate('2026-08-15T00:00:00.000Z'), '2026-08-15');
        assert.equal(parseImportDate('15/08/2026'), '2026-08-15');
        assert.equal(parseImportDate('5/8/2026'), '2026-08-05');
        assert.equal(parseImportDate('15-08-2026'), '2026-08-15');
        assert.equal(parseImportDate('15.08.26'), '2026-08-15');
    });

    it('reads month names', () => {
        assert.equal(parseImportDate('15 Aug 2026'), '2026-08-15');
        assert.equal(parseImportDate('15-Aug-26'), '2026-08-15');
        assert.equal(parseImportDate('15th August 2026'), '2026-08-15');
        assert.equal(parseImportDate('Aug 15, 2026'), '2026-08-15');
        assert.equal(parseImportDate('October 2 2026'), '2026-10-02');
    });

    it('rejects blanks, impossible days and text', () => {
        assert.equal(parseImportDate(''), null);
        assert.equal(parseImportDate(undefined), null);
        assert.equal(parseImportDate('31/02/2026'), null);
        assert.equal(parseImportDate('15/13/2026'), null);
        assert.equal(parseImportDate('Diwali'), null);
        assert.equal(parseImportDate('15 Foo 2026'), null);
    });
});

describe('holidayInputSchema', () => {
    it('defaults Status, and tidies the occasion', () => {
        const input = holidayInputSchema.parse({ occasion: '  Raksha   Bandhan ', holidayDate: '2026-08-28' });
        assert.deepEqual(input, { occasion: 'Raksha Bandhan', holidayDate: '2026-08-28', status: 'Active' });
    });

    it('accepts Status in any letter case and drops a Holiday Type sent by an old client', () => {
        const input = holidayInputSchema.parse({ occasion: 'Holi', holidayDate: '2026-03-04', holidayType: 'Optional', status: 'INACTIVE' });
        assert.equal('holidayType' in input, false);
        assert.equal(input.status, 'Inactive');
    });

    it('rejects unknown options, missing occasion and far-off years', () => {
        assert.equal(holidayInputSchema.safeParse({ occasion: 'Holi', holidayDate: '2026-03-04', status: 'Pending' }).success, false);
        assert.equal(holidayInputSchema.safeParse({ occasion: ' ', holidayDate: '2026-03-04' }).success, false);
        assert.equal(holidayInputSchema.safeParse({ occasion: 'Holi', holidayDate: '1999-03-04' }).success, false);
        assert.equal(holidayInputSchema.safeParse({ occasion: 'Holi', holidayDate: '2026-02-30' }).success, false);
    });
});

describe('holidayCalendarQuerySchema', () => {
    it('takes an inclusive day range of at most 400 days', () => {
        assert.equal(holidayCalendarQuerySchema.safeParse({ from: '2026-11-01', to: '2026-12-13' }).success, true);
        assert.equal(holidayCalendarQuerySchema.safeParse({ from: '2026-12-13', to: '2026-11-01' }).success, false);
        assert.equal(holidayCalendarQuerySchema.safeParse({ from: '2025-01-01', to: '2026-12-31' }).success, false);
    });
});

describe('classifyImportRows', () => {
    const row = (rowNumber: number, values: Record<string, string>) => ({ rowNumber, values });

    it('marks new rows, duplicates of saved holidays and repeats within the file', () => {
        const existing = new Set([holidayKey('2026-01-26', 'Republic Day')]);
        const results = classifyImportRows(
            [
                row(2, { occasion: 'republic day', holidayDate: '26/01/2026' }),
                row(3, { occasion: 'Holi', holidayDate: '04/03/2026', status: 'inactive' }),
                row(4, { occasion: 'HOLI ', holidayDate: '2026-03-04' }),
                row(5, { occasion: 'Diwali', holidayDate: 'soon' }),
                row(6, { occasion: '', holidayDate: '' }),
            ],
            existing,
        ).map((r) => r.result);

        assert.deepEqual(results.map((r) => r.outcome), ['duplicate', 'new', 'duplicate', 'error', 'error']);
        assert.deepEqual(results[0].messages, ['Already in the holiday list.']);
        assert.equal(results[1].holidayDate, '2026-03-04');
        assert.equal(results[1].status, 'Inactive');
        assert.deepEqual(results[2].messages, ['Same as row 3.']);
        assert.match(results[3].messages[0], /"soon" is not a date/);
        assert.ok(results[4].messages.includes('Occasion is required.'));
        assert.ok(results[4].messages.includes('Holiday Date is required.'));
    });

    it('returns the input to save only for new rows', () => {
        const [first, second] = classifyImportRows([row(2, { occasion: 'Holi', holidayDate: '2026-03-04' }), row(3, { occasion: 'Holi', holidayDate: '2026-03-04' })], new Set());
        assert.deepEqual(first.input, { occasion: 'Holi', holidayDate: '2026-03-04', status: 'Active' });
        assert.equal(second.input, undefined);
    });
});

describe('list helpers', () => {
    it('filters by year, status and occasion', () => {
        assert.deepEqual(listWhere({}), {});
        const where = listWhere({ year: 2026, status: 'Active', search: 'holi' });
        assert.deepEqual(where, {
            AND: [
                { holidayDate: { gte: new Date('2026-01-01T00:00:00.000Z'), lt: new Date('2027-01-01T00:00:00.000Z') } },
                { status: 'Active' },
                { occasion: { contains: 'holi' } },
            ],
        });
    });

    it('offers every year from the earliest holiday to the latest, current year included', () => {
        assert.deepEqual(yearsBetween(null, null, 2026), [2026]);
        assert.deepEqual(yearsBetween(new Date('2024-01-01'), new Date('2025-10-22'), 2026), [2026, 2025, 2024]);
        assert.deepEqual(yearsBetween(new Date('2026-01-01'), new Date('2027-01-01'), 2026), [2027, 2026]);
    });
});
