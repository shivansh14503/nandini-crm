import {
    DEFAULT_DISPLAY_FORMATS,
    formatDay,
    formatNumber as formatNumberIn,
    formatWallClock,
    groupingLocale,
    type DisplayFormats,
} from '../company-formats/core/displayFormats.js';
import { instantToZonedWallClock } from '../../utils/zonedTime.js';

/**
 * Pure formatting helpers for PDF contexts and Handlebars helpers: currency / number / date strings and amounts in
 * words, in the company display formats (Admin › Company formats). Every helper takes the formats last, defaulting
 * to "not customized", which keeps the PDF's own pre-company-formats style: `05 Nov 2026`, `05 Nov 2026, 14:30`,
 * Indian digit grouping (12,34,567) and lakh / crore words.
 */

interface CurrencyInfo {
    code: string;
    major: string;
    minor: string;
}

const CURRENCIES: Record<string, CurrencyInfo> = {
    INR: { code: 'INR', major: 'Rupees', minor: 'Paise' },
    USD: { code: 'USD', major: 'Dollars', minor: 'Cents' },
    EUR: { code: 'EUR', major: 'Euros', minor: 'Cents' },
    GBP: { code: 'GBP', major: 'Pounds', minor: 'Pence' },
    AED: { code: 'AED', major: 'Dirhams', minor: 'Fils' },
};

const CURRENCY_KEYWORDS: [RegExp, string][] = [
    [/rupee|₹|\binr\b/i, 'INR'],
    [/dollar|\$|\busd\b/i, 'USD'],
    [/euro|€|\beur\b/i, 'EUR'],
    [/pound|£|\bgbp\b/i, 'GBP'],
    [/dirham|\baed\b/i, 'AED'],
];

/** Resolves a stored currency label (`'Indian Rupee: ₹'`, `'USD'`, …) to an ISO code; INR when unknown. */
export function resolveCurrencyCode(currency: string | null | undefined): string {
    const value = (currency ?? '').trim();
    if (/^[A-Z]{3}$/.test(value) && CURRENCIES[value]) return value;
    for (const [pattern, code] of CURRENCY_KEYWORDS) if (pattern.test(value)) return code;
    return 'INR';
}

const toFiniteNumber = (value: unknown): number => {
    const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.replace(/,/g, '')) : Number.NaN;
    return Number.isFinite(n) ? n : 0;
};

const currencyFormatters = new Map<string, Intl.NumberFormat>();

/** `₹1,23,456.00` (Indian grouping) / `₹123,456.00` (international), always 2 decimals, in the record's currency. */
export function formatCurrency(value: unknown, currency?: string | null, formats: DisplayFormats = DEFAULT_DISPLAY_FORMATS): string {
    const code = resolveCurrencyCode(currency);
    const locale = groupingLocale(formats);
    const key = `${locale}|${code}`;
    let formatter = currencyFormatters.get(key);
    if (!formatter) {
        formatter = new Intl.NumberFormat(locale, { style: 'currency', currency: code, minimumFractionDigits: 2, maximumFractionDigits: 2 });
        currencyFormatters.set(key, formatter);
    }
    return formatter.format(toFiniteNumber(value));
}

/** `1,23,456.5` / `123,456.5` with 0–`maxFractionDigits` decimals. */
export function formatNumber(value: unknown, maxFractionDigits = 2, formats: DisplayFormats = DEFAULT_DISPLAY_FORMATS): string {
    const digits = Math.min(Math.max(Math.trunc(maxFractionDigits), 0), 6);
    return formatNumberIn(toFiniteNumber(value), formats, { minDecimals: 0, maxDecimals: digits });
}

/**
 * A day in the company date format (`05 Nov 2026` while not customized). Accepts a Date, an ISO string or a
 * `yyyy-MM-dd` date-only string. Date-only values (`@db.Date` columns) are read in UTC so they never shift by a day.
 * Invalid / empty input → ''.
 */
export function formatDate(value: unknown, formats: DisplayFormats = DEFAULT_DISPLAY_FORMATS): string {
    if (value === null || value === undefined || value === '') return '';
    const date = value instanceof Date ? value : new Date(typeof value === 'string' || typeof value === 'number' ? value : Number.NaN);
    if (Number.isNaN(date.getTime())) return '';
    const day = `${String(date.getUTCFullYear()).padStart(4, '0')}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
    return formatDay(day, formats, { legacy: 'DD MMM YYYY' });
}

/** `05 Nov 2026, 14:30` (while not customized) in the given timezone (used for "generated at"). */
export function formatDateTime(value: Date, timeZone: string, formats: DisplayFormats = DEFAULT_DISPLAY_FORMATS): string {
    return formatWallClock(instantToZonedWallClock(value, timeZone), formats, { legacyDate: 'DD MMM YYYY', legacyTime: 'HH:mm' });
}

// ─── Amount in words ────────────────────────────────────────────────────────────

const ONES = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

/** 0–99 */
function twoDigits(n: number): string {
    if (n < 20) return ONES[n];
    const ten = TENS[Math.floor(n / 10)];
    const one = ONES[n % 10];
    return one ? `${ten} ${one}` : ten;
}

/** 0–999 */
function threeDigits(n: number): string {
    const hundred = Math.floor(n / 100);
    const rest = n % 100;
    const parts: string[] = [];
    if (hundred) parts.push(`${ONES[hundred]} Hundred`);
    if (rest) parts.push(twoDigits(rest));
    return parts.join(' ');
}

/** Whole number in words using crore / lakh / thousand; crores recurse so values ≥ 100 crore still read naturally. */
export function integerToIndianWords(value: number): string {
    let n = Math.floor(Math.abs(value));
    if (n === 0) return 'Zero';
    const parts: string[] = [];
    const crore = Math.floor(n / 10_000_000);
    n %= 10_000_000;
    const lakh = Math.floor(n / 100_000);
    n %= 100_000;
    const thousand = Math.floor(n / 1000);
    n %= 1000;
    if (crore) parts.push(`${integerToIndianWords(crore)} Crore`);
    if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
    if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
    if (n) parts.push(threeDigits(n));
    return parts.join(' ');
}

/** Whole number in words using billion / million / thousand (international grouping); billions recurse. */
export function integerToInternationalWords(value: number): string {
    let n = Math.floor(Math.abs(value));
    if (n === 0) return 'Zero';
    const parts: string[] = [];
    const billion = Math.floor(n / 1_000_000_000);
    n %= 1_000_000_000;
    const million = Math.floor(n / 1_000_000);
    n %= 1_000_000;
    const thousand = Math.floor(n / 1000);
    n %= 1000;
    if (billion) parts.push(`${integerToInternationalWords(billion)} Billion`);
    if (million) parts.push(`${threeDigits(million)} Million`);
    if (thousand) parts.push(`${threeDigits(thousand)} Thousand`);
    if (n) parts.push(threeDigits(n));
    return parts.join(' ');
}

/**
 * `Rupees Twelve Crore Thirty Four Lakh Fifty Six Thousand Seven Hundred Eighty Nine and Fifty Paise Only`
 * (Indian grouping) or `Rupees One Hundred Twenty Three Million …` (international). Rounds to 2 decimals; negative
 * amounts are prefixed with "Minus".
 */
export function amountInWords(value: unknown, currency?: string | null, formats: DisplayFormats = DEFAULT_DISPLAY_FORMATS): string {
    const info = CURRENCIES[resolveCurrencyCode(currency)];
    const amount = toFiniteNumber(value);
    const totalMinor = Math.round(Math.abs(amount) * 100);
    const major = Math.floor(totalMinor / 100);
    const minor = totalMinor % 100;
    const sign = amount < 0 && totalMinor > 0 ? 'Minus ' : '';
    const words = formats.numberGrouping === 'international' ? integerToInternationalWords(major) : integerToIndianWords(major);
    const majorWords = `${info.major} ${words}`;
    const minorWords = minor ? ` and ${twoDigits(minor)} ${info.minor}` : '';
    return `${sign}${majorWords}${minorWords} Only`;
}

/** Lowercase ASCII slug for file names: `Acme Pvt. Ltd.` → `acme-pvt-ltd`. */
export function slugify(value: string, maxLength = 60): string {
    return value
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, maxLength)
        .replace(/-+$/g, '');
}
