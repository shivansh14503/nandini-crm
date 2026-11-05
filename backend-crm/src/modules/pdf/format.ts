/**
 * Pure formatting helpers for PDF contexts and Handlebars helpers: currency / number / date strings in the
 * 'en-IN' locale and amounts in words using the Indian numbering system (thousand, lakh, crore).
 */

export const PDF_LOCALE = 'en-IN';

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

/** `₹1,23,456.00` (Indian digit grouping). */
export function formatCurrency(value: unknown, currency?: string | null): string {
    const code = resolveCurrencyCode(currency);
    let formatter = currencyFormatters.get(code);
    if (!formatter) {
        formatter = new Intl.NumberFormat(PDF_LOCALE, { style: 'currency', currency: code, minimumFractionDigits: 2, maximumFractionDigits: 2 });
        currencyFormatters.set(code, formatter);
    }
    return formatter.format(toFiniteNumber(value));
}

/** `1,23,456.5` with 0–`maxFractionDigits` decimals. */
export function formatNumber(value: unknown, maxFractionDigits = 2): string {
    const digits = Math.min(Math.max(Math.trunc(maxFractionDigits), 0), 6);
    return new Intl.NumberFormat(PDF_LOCALE, { minimumFractionDigits: 0, maximumFractionDigits: digits }).format(toFiniteNumber(value));
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * `05 Nov 2026`. Accepts a Date, an ISO string or a `yyyy-MM-dd` date-only string. Date-only values
 * (`@db.Date` columns) are read in UTC so they never shift by a day. Invalid / empty input → ''.
 */
export function formatDate(value: unknown): string {
    if (value === null || value === undefined || value === '') return '';
    const date = value instanceof Date ? value : new Date(typeof value === 'string' || typeof value === 'number' ? value : Number.NaN);
    if (Number.isNaN(date.getTime())) return '';
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${day} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** `05 Nov 2026, 14:30` in the given timezone (used for "generated at"). */
export function formatDateTime(value: Date, timeZone: string): string {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone,
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).formatToParts(value);
    const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
    return `${get('day')} ${get('month')} ${get('year')}, ${get('hour')}:${get('minute')}`;
}

// ─── Amount in words (Indian numbering) ─────────────────────────────────────────

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

/**
 * `Rupees Twelve Crore Thirty Four Lakh Fifty Six Thousand Seven Hundred Eighty Nine and Fifty Paise Only`.
 * Rounds to 2 decimals; negative amounts are prefixed with "Minus".
 */
export function amountInWords(value: unknown, currency?: string | null): string {
    const info = CURRENCIES[resolveCurrencyCode(currency)];
    const amount = toFiniteNumber(value);
    const totalMinor = Math.round(Math.abs(amount) * 100);
    const major = Math.floor(totalMinor / 100);
    const minor = totalMinor % 100;
    const sign = amount < 0 && totalMinor > 0 ? 'Minus ' : '';
    const majorWords = `${info.major} ${integerToIndianWords(major)}`;
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
