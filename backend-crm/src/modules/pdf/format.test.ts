import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { amountInWords, formatCurrency, formatDate, formatNumber, integerToIndianWords, resolveCurrencyCode, slugify } from './format.js';

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
