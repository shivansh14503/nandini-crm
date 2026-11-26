import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    DATE_FORMATS,
    DEFAULT_DISPLAY_FORMATS,
    datePattern,
    formatCount,
    formatDay,
    formatDayWith,
    formatLongDay,
    formatMoney,
    formatNumber,
    formatShortDay,
    formatTime,
    formatTimeWith,
    formatWallClock,
    groupingLocale,
    isDisplayFormats,
    shortDayOrder,
    timePattern,
    type DateFormat,
    type DisplayFormats,
} from './displayFormats.js';

const NOT_CUSTOMIZED = DEFAULT_DISPLAY_FORMATS;
const saved = (overrides: Partial<DisplayFormats> = {}): DisplayFormats => ({ ...DEFAULT_DISPLAY_FORMATS, customized: true, ...overrides });

describe('settings', () => {
    it('defaults to the CRM style, not customized', () => {
        assert.deepEqual(DEFAULT_DISPLAY_FORMATS, { dateFormat: 'DD-MMM-YYYY', timeFormat: '12h', numberGrouping: 'indian', customized: false });
    });

    it('recognizes a valid formats object only', () => {
        assert.equal(isDisplayFormats(DEFAULT_DISPLAY_FORMATS), true);
        assert.equal(isDisplayFormats(saved({ dateFormat: 'MM/DD/YYYY', timeFormat: '24h', numberGrouping: 'international' })), true);
        assert.equal(isDisplayFormats({ ...DEFAULT_DISPLAY_FORMATS, dateFormat: 'DD.MM.YYYY' }), false);
        assert.equal(isDisplayFormats({ ...DEFAULT_DISPLAY_FORMATS, timeFormat: '12' }), false);
        assert.equal(isDisplayFormats({ ...DEFAULT_DISPLAY_FORMATS, numberGrouping: 'western' }), false);
        assert.equal(isDisplayFormats({ dateFormat: 'DD-MMM-YYYY', timeFormat: '12h', numberGrouping: 'indian' }), false);
        assert.equal(isDisplayFormats(null), false);
        assert.equal(isDisplayFormats('DD-MMM-YYYY'), false);
    });

    it('uses the legacy pattern only while not customized', () => {
        assert.equal(datePattern(NOT_CUSTOMIZED, 'DD MMM YYYY'), 'DD MMM YYYY');
        assert.equal(datePattern(NOT_CUSTOMIZED), 'DD-MMM-YYYY');
        assert.equal(datePattern(saved({ dateFormat: 'YYYY-MM-DD' }), 'DD MMM YYYY'), 'YYYY-MM-DD');
        assert.equal(timePattern(NOT_CUSTOMIZED, 'hh:mm A'), 'hh:mm A');
        assert.equal(timePattern(NOT_CUSTOMIZED), 'h:mm A');
        assert.equal(timePattern(saved(), 'hh:mm A'), 'h:mm A');
        assert.equal(timePattern(saved({ timeFormat: '24h' }), 'hh:mm A'), 'HH:mm');
    });

    it('puts the month first in day labels only for a saved MM/DD/YYYY', () => {
        assert.equal(shortDayOrder(NOT_CUSTOMIZED), 'DM');
        assert.equal(shortDayOrder({ ...NOT_CUSTOMIZED, dateFormat: 'MM/DD/YYYY' }), 'DM');
        assert.equal(shortDayOrder(saved({ dateFormat: 'MM/DD/YYYY' })), 'MD');
        for (const dateFormat of DATE_FORMATS.filter((f) => f !== 'MM/DD/YYYY')) assert.equal(shortDayOrder(saved({ dateFormat })), 'DM');
    });
});

describe('dates', () => {
    const expected: Record<DateFormat, [string, string, string]> = {
        'DD-MMM-YYYY': ['25-Mar-2026', '05-Sep-2026', '29-Feb-2028'],
        'DD MMM YYYY': ['25 Mar 2026', '05 Sep 2026', '29 Feb 2028'],
        'DD/MM/YYYY': ['25/03/2026', '05/09/2026', '29/02/2028'],
        'DD-MM-YYYY': ['25-03-2026', '05-09-2026', '29-02-2028'],
        'MM/DD/YYYY': ['03/25/2026', '09/05/2026', '02/29/2028'],
        'YYYY-MM-DD': ['2026-03-25', '2026-09-05', '2028-02-29'],
    };

    it('writes every date format (September is Sep, never Sept)', () => {
        for (const dateFormat of DATE_FORMATS) {
            assert.deepEqual(
                ['2026-03-25', '2026-09-05', '2028-02-29'].map((day) => formatDay(day, saved({ dateFormat }))),
                expected[dateFormat],
                dateFormat,
            );
        }
    });

    it('reads the leading day of a wall clock or an ISO instant', () => {
        assert.equal(formatDayWith('2026-11-25T10:30', 'DD MMM YYYY'), '25 Nov 2026');
        assert.equal(formatDayWith('2026-11-25T04:30:00.000Z', 'DD/MM/YYYY'), '25/11/2026');
    });

    it('returns anything that is not a real day unchanged', () => {
        for (const value of ['', 'garbage', '2026-02-30', '2027-02-29', '2026-13-01', '2026-00-10', '2026-11-00', '26-11-2026', '2026-1-5']) {
            assert.equal(formatDayWith(value, 'DD-MMM-YYYY'), value);
            assert.equal(formatDay(value, saved()), value);
            assert.equal(formatShortDay(value, saved(), { weekday: true }), value);
            assert.equal(formatLongDay(value, saved()), value);
        }
    });

    it('spells weekdays and long months by hand', () => {
        assert.equal(formatDayWith('2026-11-26', 'dddd, D MMMM YYYY'), 'Thursday, 26 November 2026');
        assert.equal(formatDayWith('2026-11-01', 'ddd D MMM'), 'Sun 1 Nov');
        assert.equal(formatDayWith('0999-01-05', 'YYYY-MM-DD'), '0999-01-05');
    });

    it('puts the weekday in front of the company pattern when asked, not of a legacy one', () => {
        assert.equal(formatDay('2026-11-25', saved({ dateFormat: 'DD/MM/YYYY' }), { weekday: true }), 'Wed 25/11/2026');
        assert.equal(formatDay('2026-11-25', NOT_CUSTOMIZED, { weekday: true, legacy: 'ddd D MMM YYYY' }), 'Wed 25 Nov 2026');
        assert.equal(formatDay('2026-11-25', NOT_CUSTOMIZED, { weekday: false, legacy: 'D MMM YYYY' }), '25 Nov 2026');
        assert.equal(formatDay('2026-11-25', saved(), { weekday: true, legacy: 'ddd D MMM YYYY' }), 'Wed 25-Nov-2026');
    });

    it('orders short and long labels by the date format', () => {
        const mdy = saved({ dateFormat: 'MM/DD/YYYY' });
        assert.equal(formatShortDay('2026-11-25', mdy, { weekday: true }), 'Wed Nov 25');
        assert.equal(formatShortDay('2026-11-25', mdy), 'Nov 25');
        assert.equal(formatShortDay('2026-11-25', saved({ dateFormat: 'YYYY-MM-DD' }), { weekday: true }), 'Wed 25 Nov');
        assert.equal(formatShortDay('2026-11-05', NOT_CUSTOMIZED), '5 Nov');
        assert.equal(formatLongDay('2026-11-26', mdy), 'Thursday, November 26, 2026');
        assert.equal(formatLongDay('2026-11-26', saved({ dateFormat: 'DD/MM/YYYY' })), 'Thursday, 26 November 2026');
    });
});

describe('times', () => {
    it('reads minutes, HH:mm, wall clocks and 12-hour texts', () => {
        const twelve = saved();
        assert.equal(formatTime(14 * 60 + 5, twelve), '2:05 PM');
        assert.equal(formatTime('14:05', twelve), '2:05 PM');
        assert.equal(formatTime('9:05', twelve), '9:05 AM');
        assert.equal(formatTime('14:05:59', twelve), '2:05 PM');
        assert.equal(formatTime('2026-11-25T14:05', twelve), '2:05 PM');
        assert.equal(formatTime('04:15 PM', twelve), '4:15 PM');
        assert.equal(formatTime('4:15 pm', twelve), '4:15 PM');
        assert.equal(formatTime('4:15pm', twelve), '4:15 PM');
        assert.equal(formatTime('4:15 p.m.', twelve), '4:15 PM');
    });

    it('handles midnight and noon in 12h and 24h', () => {
        const twelve = saved();
        const day = saved({ timeFormat: '24h' });
        assert.equal(formatTime(5, twelve), '12:05 AM');
        assert.equal(formatTime(12 * 60, twelve), '12:00 PM');
        assert.equal(formatTime('12:00 AM', twelve), '12:00 AM');
        assert.equal(formatTime('12:30 am', day), '00:30');
        assert.equal(formatTime('12:30 PM', day), '12:30');
        assert.equal(formatTime(5, day), '00:05');
        assert.equal(formatTime('23:59', day), '23:59');
        assert.equal(formatTime('04:15 PM', day), '16:15');
    });

    it('writes every time pattern', () => {
        assert.equal(formatTimeWith(13 * 60 + 7, 'h:mm A'), '1:07 PM');
        assert.equal(formatTimeWith(13 * 60 + 7, 'hh:mm A'), '01:07 PM');
        assert.equal(formatTimeWith(13 * 60 + 7, 'h:mm a'), '1:07 pm');
        assert.equal(formatTimeWith(13 * 60 + 7, 'hh:mm a'), '01:07 pm');
        assert.equal(formatTimeWith(13 * 60 + 7, 'HH:mm'), '13:07');
    });

    it('returns anything it cannot read unchanged', () => {
        for (const value of ['', 'soon', '24:00', '12:60', '13:00 PM', '0:15 AM', '2026-02-30T10:00', '10']) {
            assert.equal(formatTime(value, saved()), value);
        }
        assert.equal(formatTime(-1, saved()), '-1');
        assert.equal(formatTime(1440, saved()), '1440');
        assert.equal(formatTime(10.5, saved()), '10.5');
    });

    it('joins a wall clock as date + time', () => {
        assert.equal(formatWallClock('2026-10-24T13:07', saved()), '24-Oct-2026, 1:07 PM');
        assert.equal(formatWallClock('2026-10-24T13:07', saved({ dateFormat: 'YYYY-MM-DD', timeFormat: '24h' })), '2026-10-24, 13:07');
        assert.equal(formatWallClock('2026-10-24T13:07', saved({ dateFormat: 'DD/MM/YYYY' }), { weekday: true, separator: ' • ' }), 'Sat 24/10/2026 • 1:07 PM');
        assert.equal(formatWallClock('2026-10-24 13:07:30', saved()), '24-Oct-2026, 1:07 PM');
        for (const value of ['', '2026-10-24', '13:07', '2026-10-24T25:00', '2026-02-30T10:00', '2026-10-24T13:07Z']) {
            assert.equal(formatWallClock(value, saved()), value);
        }
    });
});

describe('numbers and money', () => {
    const indian = saved();
    const international = saved({ numberGrouping: 'international' });

    it('groups digits the Indian or the international way', () => {
        assert.equal(groupingLocale(indian), 'en-IN');
        assert.equal(groupingLocale(international), 'en-US');
        assert.equal(formatNumber(1234567.891, indian), '12,34,567.89');
        assert.equal(formatNumber(1234567.891, international), '1,234,567.89');
        assert.equal(formatNumber(1234567.891, NOT_CUSTOMIZED), '12,34,567.89');
        assert.equal(formatNumber(0, indian), '0');
        assert.equal(formatNumber(2.5, indian, { minDecimals: 2 }), '2.50');
        assert.equal(formatNumber(1.23456, indian, { maxDecimals: 3 }), '1.235');
        assert.equal(formatNumber(1.5, indian, { minDecimals: 3, maxDecimals: 1 }), '1.500');
    });

    it('counts in whole numbers', () => {
        assert.equal(formatCount(1234567, indian), '12,34,567');
        assert.equal(formatCount(1234567, international), '1,234,567');
        assert.equal(formatCount(12.6, indian), '13');
    });

    it('writes amounts with the rupee symbol', () => {
        assert.equal(formatMoney(1234567.891, indian), '₹12,34,567.89');
        assert.equal(formatMoney(1234567.891, international), '₹1,234,567.89');
        assert.equal(formatMoney(1234567.5, indian, { maxDecimals: 0 }), '₹12,34,568');
        assert.equal(formatMoney(-5, indian, { maxDecimals: 0 }), '-₹5');
        assert.equal(formatMoney(-5, indian), '-₹5.00');
        assert.equal(formatMoney(0, indian), '₹0.00');
        assert.equal(formatMoney(125000.123, indian, { minDecimals: 0, maxDecimals: 3 }), '₹1,25,000.123');
        assert.equal(formatMoney(125000.12345, indian, { minDecimals: 0, maxDecimals: 3 }), '₹1,25,000.123');
        assert.equal(formatMoney(1234.5, international, { currencyCode: 'USD' }), '$1,234.50');
    });

    it('writes nothing for a value that is not a finite number', () => {
        for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
            assert.equal(formatNumber(value, indian), '');
            assert.equal(formatCount(value, indian), '');
            assert.equal(formatMoney(value, indian), '');
        }
        assert.equal(formatNumber('12' as unknown as number, indian), '');
    });
});

/**
 * Not customized, each call site passes its own legacy pattern and gets exactly what it showed before company formats
 * existed (frontend utils/date, drawerFields, activityTime, formConfig, FormField, RhfDateTimeField, RecordAuditFooter,
 * line items and scorecards; backend PDFs, notification texts and audit times). Customized, the same calls give one
 * unified style.
 */
describe('golden: what each PR5a call site shows', () => {
    const wall = '2026-10-24T13:07';
    const cases: { site: string; call: (f: DisplayFormats) => string; today: string; saved: string }[] = [
        { site: 'utils/date formatDateTime, audit displayTime', call: (f) => formatWallClock(wall, f, { legacyTime: 'hh:mm A' }), today: '24-Oct-2026, 01:07 PM', saved: '24-Oct-2026, 1:07 PM' },
        { site: 'drawer formatDay', call: (f) => formatDay('2026-11-28', f), today: '28-Nov-2026', saved: '28-Nov-2026' },
        { site: 'drawer formatClock', call: (f) => formatTime('14:30', f, { legacy: 'hh:mm A' }), today: '02:30 PM', saved: '2:30 PM' },
        { site: 'activity day label, bell, morning email', call: (f) => formatShortDay('2026-11-25', f, { weekday: true }), today: 'Wed 25 Nov', saved: 'Wed 25 Nov' },
        {
            site: 'activity day label with year',
            call: (f) => formatDay('2026-11-25', f, { weekday: true, legacy: 'ddd D MMM YYYY' }),
            today: 'Wed 25 Nov 2026',
            saved: 'Wed 25-Nov-2026',
        },
        {
            site: 'activity when with year',
            call: (f) => formatWallClock('2026-11-25T10:30', f, { legacyDate: 'D MMM YYYY', legacyTime: 'h:mm A' }),
            today: '25 Nov 2026, 10:30 AM',
            saved: '25-Nov-2026, 10:30 AM',
        },
        {
            site: 'RecordAuditFooter',
            call: (f) => formatWallClock('2026-11-25T13:07', f, { legacyDate: 'DD MMM YYYY', legacyTime: 'hh:mm a' }),
            today: '25 Nov 2026, 01:07 pm',
            saved: '25-Nov-2026, 1:07 PM',
        },
        {
            site: 'RhfDateTimeField view',
            call: (f) => formatWallClock('2026-11-25T10:30', f, { legacyDate: 'DD MMM YYYY', legacyTime: 'h:mm a' }),
            today: '25 Nov 2026, 10:30 am',
            saved: '25-Nov-2026, 10:30 AM',
        },
        { site: 'morning email day', call: (f) => formatShortDay('2026-11-26', f, { weekday: true }), today: 'Thu 26 Nov', saved: 'Thu 26 Nov' },
        { site: 'morning email heading', call: (f) => formatLongDay('2026-11-26', f), today: 'Thursday, 26 November 2026', saved: 'Thursday, 26 November 2026' },
        { site: 'bell / activity time', call: (f) => formatTime('2026-11-26T10:30', f), today: '10:30 AM', saved: '10:30 AM' },
        { site: 'PDF date, form view, custom fields', call: (f) => formatDay('2026-11-05', f, { legacy: 'DD MMM YYYY' }), today: '05 Nov 2026', saved: '05-Nov-2026' },
        {
            site: 'PDF generated at',
            call: (f) => formatWallClock('2026-11-05T14:30', f, { legacyDate: 'DD MMM YYYY', legacyTime: 'HH:mm' }),
            today: '05 Nov 2026, 14:30',
            saved: '05-Nov-2026, 2:30 PM',
        },
        { site: 'PDF / product MRP amount', call: (f) => formatMoney(123456, f), today: '₹1,23,456.00', saved: '₹1,23,456.00' },
        { site: 'PDF amount', call: (f) => formatMoney(27000, f), today: '₹27,000.00', saved: '₹27,000.00' },
        { site: 'drawer / custom field amount', call: (f) => formatMoney(125000.5, f, { minDecimals: 0, maxDecimals: 2 }), today: '₹1,25,000.5', saved: '₹1,25,000.5' },
        { site: 'line items', call: (f) => formatMoney(125000.123, f, { minDecimals: 0, maxDecimals: 3 }), today: '₹1,25,000.123', saved: '₹1,25,000.123' },
        { site: 'list amounts, scorecards', call: (f) => formatMoney(125000.4, f, { maxDecimals: 0 }), today: '₹1,25,000', saved: '₹1,25,000' },
    ];

    for (const { site, call, today, saved: unified } of cases) {
        it(site, () => {
            assert.equal(call(NOT_CUSTOMIZED), today, 'not customized');
            assert.equal(call(saved()), unified, 'customized with the default values');
        });
    }

    it('a customized MM/DD/YYYY, 24h, international setting reaches every site', () => {
        const us = saved({ dateFormat: 'MM/DD/YYYY', timeFormat: '24h', numberGrouping: 'international' });
        assert.deepEqual(
            cases.map(({ call }) => call(us)),
            [
                '10/24/2026, 13:07',
                '11/28/2026',
                '14:30',
                'Wed Nov 25',
                'Wed 11/25/2026',
                '11/25/2026, 10:30',
                '11/25/2026, 13:07',
                '11/25/2026, 10:30',
                'Thu Nov 26',
                'Thursday, November 26, 2026',
                '10:30',
                '11/05/2026',
                '11/05/2026, 14:30',
                '₹123,456.00',
                '₹27,000.00',
                '₹125,000.5',
                '₹125,000.123',
                '₹125,000',
            ],
        );
    });
});
