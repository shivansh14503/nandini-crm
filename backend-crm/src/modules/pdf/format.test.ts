import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_DISPLAY_FORMATS, type DisplayFormats } from '../company-formats/core/displayFormats.js';
import {
    amountInWords,
    formatCurrency,
    formatDate,
    formatDateTime,
    formatNumber,
    integerToIndianWords,
    integerToInternationalWords,
    resolveCurrencyCode,
    slugify,
} from './format.js';
import { pdfCacheKey } from './pdfRender.service.js';

describe('amountInWords', () => {
    it('reads zero', () => {
        assert.equal(amountInWords(0), 'Rupees Zero Only');
    });

    it('reads single digits and teens', () => {
        assert.equal(amountInWords(1), 'Rupees One Only');
        assert.equal(amountInWords(15), 'Rupees Fifteen Only');
    });

    it('uses lakh for 1,00,000', () => {
        assert.equal(amountInWords(100000), 'Rupees One Lakh Only');
    });

    it('reads crore, lakh, thousand, hundreds and paise', () => {
        assert.equal(
            amountInWords(123456789.5),
            'Rupees Twelve Crore Thirty Four Lakh Fifty Six Thousand Seven Hundred Eighty Nine and Fifty Paise Only',
        );
    });

    it('accepts numeric strings and rounds to paise', () => {
        assert.equal(amountInWords('1,050.255'), 'Rupees One Thousand Fifty and Twenty Six Paise Only');
        assert.equal(amountInWords('not a number'), 'Rupees Zero Only');
    });

    it('handles values of 100 crore and more', () => {
        assert.equal(integerToIndianWords(1_000_000_000), 'One Hundred Crore');
    });

    it('names the currency from the stored label', () => {
        assert.equal(amountInWords(2.01, 'US Dollar: $'), 'Dollars Two and One Cents Only');
        assert.equal(amountInWords(2, 'Indian Rupee: ₹'), 'Rupees Two Only');
    });
});

describe('formatters', () => {
    it('resolves currency labels to ISO codes (INR fallback)', () => {
        assert.equal(resolveCurrencyCode('Indian Rupee: ₹'), 'INR');
        assert.equal(resolveCurrencyCode('EUR'), 'EUR');
        assert.equal(resolveCurrencyCode(''), 'INR');
    });

    it('formats currency with Indian digit grouping', () => {
        assert.equal(formatCurrency(123456.5, 'Indian Rupee: ₹'), '₹1,23,456.50');
    });

    it('formats numbers', () => {
        assert.equal(formatNumber(1234567.125, 2), '12,34,567.13');
        assert.equal(formatNumber(3), '3');
    });

    it('formats date-only values without timezone drift', () => {
        assert.equal(formatDate('2026-11-05'), '05 Nov 2026');
        assert.equal(formatDate(new Date('2026-01-31T00:00:00.000Z')), '31 Jan 2026');
        assert.equal(formatDate(''), '');
        assert.equal(formatDate('garbage'), '');
    });

    it('slugifies to ASCII', () => {
        assert.equal(slugify('Acmé Pvt. Ltd. (India)'), 'acme-pvt-ltd-india');
        assert.equal(slugify('   '), '');
    });
});

describe('company formats', () => {
    const saved = (overrides: Partial<DisplayFormats> = {}): DisplayFormats => ({ ...DEFAULT_DISPLAY_FORMATS, customized: true, ...overrides });
    const generatedAt = new Date('2026-11-05T09:00:00.000Z'); // 14:30 in Asia/Kolkata

    it('keeps the PDF’s own style while not customized', () => {
        assert.equal(formatDate('2026-11-05', DEFAULT_DISPLAY_FORMATS), '05 Nov 2026');
        assert.equal(formatDateTime(generatedAt, 'Asia/Kolkata'), '05 Nov 2026, 14:30');
        assert.equal(formatDateTime(generatedAt, 'Asia/Kolkata', DEFAULT_DISPLAY_FORMATS), '05 Nov 2026, 14:30');
    });

    it('writes dates and times in a saved format', () => {
        assert.equal(formatDate('2026-11-05', saved()), '05-Nov-2026');
        assert.equal(formatDate('2026-11-05', saved({ dateFormat: 'MM/DD/YYYY' })), '11/05/2026');
        assert.equal(formatDate(new Date('2026-01-31T00:00:00.000Z'), saved({ dateFormat: 'YYYY-MM-DD' })), '2026-01-31');
        assert.equal(formatDate('garbage', saved()), '');
        assert.equal(formatDateTime(generatedAt, 'Asia/Kolkata', saved()), '05-Nov-2026, 2:30 PM');
        assert.equal(formatDateTime(generatedAt, 'Asia/Kolkata', saved({ dateFormat: 'MM/DD/YYYY', timeFormat: '24h' })), '11/05/2026, 14:30');
    });

    it('groups amounts and numbers the international way, in the record’s currency', () => {
        const international = saved({ numberGrouping: 'international' });
        assert.equal(formatCurrency(1234567.891, 'Indian Rupee: ₹', international), '₹1,234,567.89');
        assert.equal(formatCurrency(1234567.891, 'US Dollar: $', international), '$1,234,567.89');
        assert.equal(formatCurrency(1234567.891, 'US Dollar: $', saved()), '$12,34,567.89');
        assert.equal(formatNumber(1234567.125, 2, international), '1,234,567.13');
        assert.equal(formatNumber(1234567.125, 2, saved()), '12,34,567.13');
    });

    it('reads amounts in words with thousand / million / billion for international grouping', () => {
        assert.equal(integerToInternationalWords(1_234_567), 'One Million Two Hundred Thirty Four Thousand Five Hundred Sixty Seven');
        assert.equal(integerToInternationalWords(0), 'Zero');
        assert.equal(integerToInternationalWords(100_000), 'One Hundred Thousand');
        assert.equal(integerToInternationalWords(2_000_000_005), 'Two Billion Five');
        assert.equal(integerToInternationalWords(1_500_000_000_000), 'One Thousand Five Hundred Billion');
        const international = saved({ numberGrouping: 'international' });
        assert.equal(amountInWords(123456789.5, 'Indian Rupee: ₹', international), 'Rupees One Hundred Twenty Three Million Four Hundred Fifty Six Thousand Seven Hundred Eighty Nine and Fifty Paise Only');
        assert.equal(amountInWords(-1500, 'US Dollar: $', international), 'Minus Dollars One Thousand Five Hundred Only');
        assert.equal(amountInWords(100000, 'Indian Rupee: ₹', saved()), 'Rupees One Lakh Only');
    });
});

describe('pdfCacheKey', () => {
    const parts = ['tpl-1', 3, 'rec-1', '2026-11-05T09:00:00.000Z', ['cf_po:PO Number:text']];

    it('is stable for the same inputs', () => {
        assert.equal(pdfCacheKey('QUOTATION', [...parts, DEFAULT_DISPLAY_FORMATS]), pdfCacheKey('QUOTATION', [...parts, { ...DEFAULT_DISPLAY_FORMATS }]));
        assert.match(pdfCacheKey('QUOTATION', parts), /^pdf:QUOTATION:[0-9a-f]{64}$/);
    });

    it('differs when the company formats differ, so a saved format never serves an old PDF', () => {
        const keys = new Set([
            pdfCacheKey('QUOTATION', [...parts, DEFAULT_DISPLAY_FORMATS]),
            pdfCacheKey('QUOTATION', [...parts, { ...DEFAULT_DISPLAY_FORMATS, customized: true }]),
            pdfCacheKey('QUOTATION', [...parts, { ...DEFAULT_DISPLAY_FORMATS, customized: true, dateFormat: 'MM/DD/YYYY' }]),
            pdfCacheKey('QUOTATION', [...parts, { ...DEFAULT_DISPLAY_FORMATS, customized: true, timeFormat: '24h' }]),
            pdfCacheKey('QUOTATION', [...parts, { ...DEFAULT_DISPLAY_FORMATS, customized: true, numberGrouping: 'international' }]),
        ]);
        assert.equal(keys.size, 5);
    });
});
