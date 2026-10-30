import { z } from 'zod';
import { isValidPhoneNumber } from 'libphonenumber-js';
import { FIELD_MAX_LENGTH as L } from '../config/fieldLimits.js';

/**
 * Zod primitives ported from frontend-crm/src/validations/common.ts so the API enforces exactly what the forms
 * do (same rules, limits and messages). Optional text resolves to `undefined` when blank.
 */

// ── Regexes ──────────────────────────────────────────────────────────────────

/** ITU-T E.164: +, non-zero country code digit, 7-15 digits total. */
export const E164_REGEX = /^\+[1-9]\d{6,14}$/;
export const PHONE_REGEX = E164_REGEX;
export const PIN_CODE_REGEX = /^\d{6}$/;
export const INTL_POSTAL_CODE_REGEX = /^[A-Za-z0-9\s-]{2,12}$/;
const POSTAL_CODE_CHARS_REGEX = /^[A-Za-z0-9\s-]*$/;
export const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
export const GST_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
export const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;

// ── Text ─────────────────────────────────────────────────────────────────────

const maxMessage = (field: string, max: number) => ({ message: `${field} cannot exceed ${max} characters.` });

export const requiredText = (field: string, max: number) =>
    z
        .string({ error: `${field} is required.` })
        .trim()
        .min(1, { message: `${field} is required.` })
        .max(max, maxMessage(field, max));

/** Trimmed text; '' / null / missing become undefined. */
export const optionalText = (field: string, max: number) =>
    z.preprocess(
        (value) => (value === null || (typeof value === 'string' && value.trim() === '') ? undefined : value),
        z.string().trim().max(max, maxMessage(field, max)).optional(),
    );

/** Optional text stored uppercase (codes such as CIN, TAN, MSME). */
export const optionalUpperText = (field: string, max: number) =>
    optionalText(field, max).transform((value) => value?.toUpperCase());

/** One of `values`, or blank (→ undefined). */
export const optionalEnum = <const T extends readonly [string, ...string[]]>(field: string, values: T) =>
    z.preprocess(
        (value) => (value === null || value === '' ? undefined : value),
        z.enum(values, { error: `${field} must be one of: ${values.join(', ')}.` }).optional(),
    );

/** One of `values` with a default when blank / missing. */
export const enumWithDefault = <const T extends readonly [string, ...string[]]>(field: string, values: T, fallback: T[number]) =>
    z.preprocess(
        (value) => (value === null || value === '' ? undefined : value),
        z.enum(values, { error: `${field} must be one of: ${values.join(', ')}.` }).default(fallback),
    );

// ── Contact channels ─────────────────────────────────────────────────────────

/**
 * Normalizes a phone input to E.164 (`+919811234567`). Separators are dropped; a leading `+` (or `00`) is kept
 * as the international prefix. Legacy national-only values are treated as India (+91): 10 digits, 91 + 10
 * digits, or a 0 trunk prefix + 10 digits. Anything else is passed through for validation to reject.
 */
export function normalizePhone(value: unknown): unknown {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    if (!/^\+?[\d\s().-]+$/.test(trimmed)) return trimmed;
    const digits = trimmed.replace(/\D/g, '');
    if (trimmed.startsWith('+')) return `+${digits}`;
    if (digits.startsWith('00')) return `+${digits.slice(2)}`;
    if (digits.length === 10) return `+91${digits}`;
    if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
    if (digits.length === 11 && digits.startsWith('0')) return `+91${digits.slice(1)}`;
    return digits;
}

const PHONE_MESSAGE = (field: string) => `${field} must be a valid phone number with country code (e.g. +919811234567).`;

/** True when `value` is an E.164 string that libphonenumber considers a valid number. */
export const isValidE164 = (value: string): boolean => E164_REGEX.test(value) && isValidPhoneNumber(value);

export const phone = (field: string) =>
    z.preprocess(
        normalizePhone,
        z.string({ error: `${field} is required.` }).refine(isValidE164, { message: PHONE_MESSAGE(field) }),
    );

export const optionalPhone = (field: string) =>
    z.preprocess(
        (value) => (value === null || (typeof value === 'string' && value.trim() === '') ? undefined : normalizePhone(value)),
        z.string().refine(isValidE164, { message: PHONE_MESSAGE(field) }).optional(),
    );
export const optionalEmail = z.preprocess(
    (value) => (value === null || (typeof value === 'string' && value.trim() === '') ? undefined : value),
    z
        .string()
        .trim()
        .toLowerCase()
        .max(L.email, maxMessage('Email', L.email))
        .pipe(z.email({ message: 'Invalid email format.' }))
        .optional(),
);

// ── Indian tax identifiers (uppercased) ──────────────────────────────────────

const optionalIdentifier = (pattern: RegExp, message: string) =>
    z.preprocess(
        (value) => (value === null || (typeof value === 'string' && value.trim() === '') ? undefined : value),
        z
            .string()
            .trim()
            .transform((value) => value.toUpperCase())
            .refine((value) => pattern.test(value), { message })
            .optional(),
    );

export const optionalPan = optionalIdentifier(PAN_REGEX, 'Must be a valid 10-character Indian PAN (e.g. ABCDE1234F).');
export const optionalGst = optionalIdentifier(GST_REGEX, 'Must be a valid 15-character GSTIN (e.g. 07AAAAA0000A1Z5).');
export const optionalIfsc = optionalIdentifier(IFSC_REGEX, 'Must be a valid 11-character IFSC code (e.g. SBIN0001234).');

// ── Postal codes (country-aware) ─────────────────────────────────────────────

const POSTAL_CODE_REQUIRED_MESSAGE = 'Postal / PIN Code is required.';
const INDIAN_PIN_MESSAGE = 'Must be a valid 6-digit Indian PIN code (e.g. 110001).';
const INTL_POSTAL_MESSAGE = 'Must be a valid postal / ZIP code (2–12 alphanumeric characters).';

/** Countries stored as ISO2 ('IN'), ISO3 or legacy names; blank means India (the CRM default). */
export function isIndia(country: string | undefined | null): boolean {
    const value = country?.trim().toLowerCase() ?? '';
    return value === '' || value === 'in' || value === 'ind' || value === 'india';
}

/** Generic shape only; the country-specific format is checked by `refinePostalCodeForCountry`. */
export const optionalPostalCode = z.preprocess(
    (value) => (value === null || (typeof value === 'string' && value.trim() === '') ? undefined : value),
    z
        .string()
        .trim()
        .max(L.postalCode, { message: INTL_POSTAL_MESSAGE })
        .regex(POSTAL_CODE_CHARS_REGEX, { message: INTL_POSTAL_MESSAGE })
        .optional(),
);

export function refinePostalCodeForCountry(
    ctx: z.RefinementCtx,
    field: string,
    postalCode: string | undefined,
    country: string | undefined,
    isRequired = false,
): void {
    const value = postalCode?.trim() ?? '';
    if (!value) {
        if (isRequired) ctx.addIssue({ code: 'custom', message: POSTAL_CODE_REQUIRED_MESSAGE, path: [field] });
        return;
    }
    const india = isIndia(country);
    const valid = india ? PIN_CODE_REGEX.test(value) : INTL_POSTAL_CODE_REGEX.test(value);
    if (!valid) ctx.addIssue({ code: 'custom', message: india ? INDIAN_PIN_MESSAGE : INTL_POSTAL_MESSAGE, path: [field] });
}

// ── Numbers sent as strings (product prices) ─────────────────────────────────

const AMOUNT_PATTERN = /^\d{1,16}(\.\d{1,2})?$/;

/** Non-negative amount with up to 2 decimals, accepted as string or number; blank → undefined. */
export const optionalAmountString = (field: string) =>
    z.preprocess(
        (value) => (value === null || value === undefined || String(value).trim() === '' ? undefined : String(value).trim()),
        z.string().regex(AMOUNT_PATTERN, { message: `${field} must be a non-negative amount with up to 2 decimals.` }).optional(),
    );

/** Percentage 0–100 with up to 2 decimals, accepted as string or number; blank → undefined. */
export const optionalPercentString = (field: string) =>
    optionalAmountString(field).refine((value) => value === undefined || Number(value) <= 100, {
        message: `${field} cannot exceed 100.`,
    });

// ── Dates ────────────────────────────────────────────────────────────────────

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** `YYYY-MM-DD` that exists on the calendar (rejects 2026-02-31). */
export const isCalendarDate = (value: string): boolean => {
    if (!DATE_ONLY_PATTERN.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

/** Accepts `YYYY-MM-DD` or a full ISO timestamp (date part kept); blank → undefined. */
const normalizeDateInput = (value: unknown): unknown => {
    if (value === null) return undefined;
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    return /^\d{4}-\d{2}-\d{2}T/.test(trimmed) ? trimmed.slice(0, 10) : trimmed;
};

export const requiredDate = (field: string) =>
    z.preprocess(
        normalizeDateInput,
        z
            .string({ error: `${field} is required.` })
            .refine(isCalendarDate, { message: `${field} must be a valid date (YYYY-MM-DD).` }),
    );

export const optionalDate = (field: string) =>
    z.preprocess(
        normalizeDateInput,
        z.string().refine(isCalendarDate, { message: `${field} must be a valid date (YYYY-MM-DD).` }).optional(),
    );

const WALL_CLOCK_PATTERN = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/;

/**
 * Local date-time from a `datetime-local` input (`YYYY-MM-DDTHH:mm`); seconds / milliseconds are dropped.
 * The value is a wall-clock time with no timezone.
 */
export const requiredWallClock = (field: string) =>
    z.preprocess(
        (value) => (typeof value === 'string' ? value.trim().replace(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(:\d{2}(\.\d+)?)?Z?$/, '$1') : value),
        z.string({ error: `${field} is required.` }).refine(
            (value) => {
                const match = WALL_CLOCK_PATTERN.exec(value);
                return Boolean(match && isCalendarDate(match[1]) && Number(match[2]) < 24 && Number(match[3]) < 60);
            },
            { message: `${field} must be a valid date and time.` },
        ),
    );

/** Optional array of trimmed option strings (e.g. product categories), each bounded. */
export const stringList = (field: string, maxItems: number, maxLength: number) =>
    z
        .array(z.string().trim().min(1).max(maxLength, { message: `${field} entries cannot exceed ${maxLength} characters.` }), {
            error: `${field} must be a list.`,
        })
        .max(maxItems, { message: `${field} can have at most ${maxItems} entries.` });

// ── Request plumbing ─────────────────────────────────────────────────────────

export const idParamSchema = z.object({ id: z.string().trim().min(1).max(50) });

export const MAX_BULK_IDS = 500;

export const bulkIdsSchema = z.object({
    ids: z
        .array(z.string().trim().min(1).max(50), { error: 'ids must be an array of record ids.' })
        .min(1, { message: 'Select at least one record.' })
        .max(MAX_BULK_IDS, { message: `At most ${MAX_BULK_IDS} records can be changed at once.` })
        .transform((ids) => [...new Set(ids)]),
});

/** Body of `PUT /:id`: any object. The service merges it onto the stored record and validates the result. */
export const patchBodySchema = z.record(z.string(), z.unknown(), { error: 'Request body must be a JSON object.' });

/** `?flag=true|false|1|0` → boolean. */
export const booleanQuery = z
    .enum(['true', 'false', '1', '0'], { error: 'Must be true or false.' })
    .transform((value) => value === 'true' || value === '1')
    .optional();

/** `?status=a,b` or repeated `?status=a&status=b` → string[]. */
export const csvQuery = z
    .union([z.string(), z.array(z.string())])
    .transform((value) =>
        (Array.isArray(value) ? value : value.split(','))
            .map((item) => item.trim())
            .filter(Boolean)
            .slice(0, 50),
    )
    .optional();

/** `?createdWithinDays=7` → records created in the last N days. */
export const createdWithinDaysQuery = z.coerce.number().int().min(1).max(3650).optional();
