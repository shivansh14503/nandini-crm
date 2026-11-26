import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { classifyImportRows, expandYearly, listWhere, mergeCalendarDays, yearsBetween } from './holiday.service.js';
import { holidayCalendarQuerySchema, holidayInputSchema, holidayKey, parseImportDate, parseImportMonthDay, yearlyDateIn } from './holiday.validator.js';

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
        assert.deepEqual(input, { occasion: 'Raksha Bandhan', holidayDate: '2026-08-28', repeatsYearly: false, status: 'Active' });
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

describe('yearly holidays', () => {
    it('take a day and month, or a full date whose year is dropped', () => {
        assert.deepEqual(holidayInputSchema.parse({ occasion: 'Republic Day', holidayDate: '01-26', repeatsYearly: true }), {
            occasion: 'Republic Day',
            holidayDate: '01-26',
            repeatsYearly: true,
            status: 'Active',
        });
        assert.equal(holidayInputSchema.parse({ occasion: 'Republic Day', holidayDate: '2027-01-26', repeatsYearly: 'Yes' }).holidayDate, '01-26');
        assert.equal(holidayInputSchema.parse({ occasion: 'Leap Day', holidayDate: '02-29', repeatsYearly: true }).holidayDate, '02-29');
    });

    it('refuse a day that is on no calendar, a one-off date without a year, and an unclear Repeats value', () => {
        assert.equal(holidayInputSchema.safeParse({ occasion: 'X', holidayDate: '02-30', repeatsYearly: true }).success, false);
        assert.equal(holidayInputSchema.safeParse({ occasion: 'X', holidayDate: '13-01', repeatsYearly: true }).success, false);
        assert.equal(holidayInputSchema.safeParse({ occasion: 'X', holidayDate: '01-26' }).success, false);
        assert.equal(holidayInputSchema.safeParse({ occasion: 'X', holidayDate: '01-26', repeatsYearly: 'sometimes' }).success, false);
    });

    it('keep 29 Feb on 28 Feb in years without it', () => {
        assert.equal(yearlyDateIn('02-29', 2028), '2028-02-29');
        assert.equal(yearlyDateIn('02-29', 2027), '2027-02-28');
        assert.equal(yearlyDateIn('02-29', 2100), '2100-02-28');
        assert.equal(yearlyDateIn('08-15', 2026), '2026-08-15');
    });

    it('fall on every year of a calendar range, each with its own id', () => {
        const days = expandYearly(
            [
                { id: 'a', occasion: 'New Year', monthDay: '01-01' },
                { id: 'b', occasion: 'Leap Day', monthDay: '02-29' },
            ],
            '2026-12-01',
            '2027-03-01',
        );
        assert.deepEqual(days, [
            { id: 'a@2027', occasion: 'New Year', holidayDate: '2027-01-01', repeatsYearly: true },
            { id: 'b@2027', occasion: 'Leap Day', holidayDate: '2027-02-28', repeatsYearly: true },
        ]);
        assert.deepEqual(
            expandYearly([{ id: 'a', occasion: 'New Year', monthDay: '01-01' }], '2026-01-01', '2027-01-31').map((d) => d.id),
            ['a@2026', 'a@2027'],
        );
    });

    it('show a one-off copy of a yearly holiday once on the calendar', () => {
        const merged = mergeCalendarDays(
            [
                { id: 'x', occasion: 'republic day', holidayDate: '2026-01-26', repeatsYearly: false },
                { id: 'y', occasion: 'Holi', holidayDate: '2026-03-04', repeatsYearly: false },
            ],
            [{ id: 'r@2026', occasion: 'Republic Day', holidayDate: '2026-01-26', repeatsYearly: true }],
        );
        assert.deepEqual(merged.map((d) => d.id), ['r@2026', 'y']);
    });
});

describe('parseImportMonthDay', () => {
    it('reads a day and month without a year, day first', () => {
        assert.equal(parseImportMonthDay('26/01'), '01-26');
        assert.equal(parseImportMonthDay('5.8'), '08-05');
        assert.equal(parseImportMonthDay('26 Jan'), '01-26');
        assert.equal(parseImportMonthDay('15-Aug'), '08-15');
        assert.equal(parseImportMonthDay('Aug 15th'), '08-15');
        assert.equal(parseImportMonthDay('29 February'), '02-29');
        assert.equal(parseImportMonthDay('30/02'), null);
        assert.equal(parseImportMonthDay('26/01/2026'), null);
        assert.equal(parseImportMonthDay('Diwali'), null);
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
        assert.deepEqual(first.input, { occasion: 'Holi', holidayDate: '2026-03-04', repeatsYearly: false, status: 'Active' });
        assert.equal(second.input, undefined);
    });

    it('treats a date without a year as yearly, and follows the Repeats Every Year column', () => {
        const results = classifyImportRows(
            [
                row(2, { occasion: 'Republic Day', holidayDate: '26 Jan' }),
                row(3, { occasion: 'Independence Day', holidayDate: '15/08/2026', repeatsYearly: 'Yes' }),
                row(4, { occasion: 'Founders Day', holidayDate: '01/04', repeatsYearly: 'No' }),
                row(5, { occasion: 'Holi', holidayDate: '04/03/2026', repeatsYearly: 'often' }),
            ],
            new Set(),
        ).map((r) => r.result);
        assert.deepEqual(results.map((r) => r.outcome), ['new', 'new', 'error', 'error']);
        assert.deepEqual([results[0].holidayDate, results[0].repeatsYearly], ['01-26', true]);
        assert.deepEqual([results[1].holidayDate, results[1].repeatsYearly], ['08-15', true]);
        assert.match(results[2].messages[0], /has no year/);
        assert.deepEqual(results[3].messages, ['Repeats Every Year must be Yes or No.']);
    });

    it('skips a one-off date that a yearly holiday already covers, saved or earlier in the file', () => {
        const existing = new Set([holidayKey('01-26', 'Republic Day')]);
        const results = classifyImportRows(
            [
                row(2, { occasion: 'Republic Day', holidayDate: '26/01/2027' }),
                row(3, { occasion: 'Diwali', holidayDate: '20 Oct', repeatsYearly: 'yes' }),
                row(4, { occasion: 'diwali', holidayDate: '20/10/2027' }),
                row(5, { occasion: 'Republic Day', holidayDate: '26/01' }),
            ],
            existing,
        ).map((r) => r.result);
        assert.deepEqual(results.map((r) => r.outcome), ['duplicate', 'new', 'duplicate', 'duplicate']);
        assert.deepEqual(results[0].messages, ['Already in the list as a holiday every year.']);
        assert.deepEqual(results[2].messages, ['Same as row 3.']);
        assert.deepEqual(results[3].messages, ['Already in the holiday list.']);
    });
});

describe('list helpers', () => {
    it('filters by year, status and occasion', () => {
        assert.deepEqual(listWhere({}), {});
        const where = listWhere({ year: 2026, status: 'Active', search: 'holi' });
        assert.deepEqual(where, {
            AND: [
                { OR: [{ holidayDate: { gte: new Date('2026-01-01T00:00:00.000Z'), lt: new Date('2027-01-01T00:00:00.000Z') } }, { repeatsYearly: true }] },
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
