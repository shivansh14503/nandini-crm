import { z } from 'zod';
import { E164_REGEX, normalizeToE164, phoneIssue } from '../utils/phone';
import { DEFAULT_COUNTRY_CODE, resolveCountryIso2 } from '../data/addressMaster';
import { FIELD_MAX_LENGTH } from '../config/fieldLimits';

/**
 * Extracts the first human-readable validation error message from a ZodError
 * to display cleanly inside toast notifications.
 */
export function getZodErrorMessage(error: z.ZodError): string {
    if (error.issues && error.issues.length > 0) {
        return error.issues[0].message;
    }
    return 'Invalid form data. Please check required fields.';
}

/**
 * Walks a React Hook Form `FieldErrors` tree (including nested objects/arrays) and returns
 * the first human-readable message, for display in toast notifications.
 */
export function getFirstErrorMessage(errors: unknown): string | undefined {
    if (!errors || typeof errors !== 'object') return undefined;
    const node = errors as Record<string, unknown>;
    if (typeof node.message === 'string' && node.message) return node.message;
    for (const key of Object.keys(node)) {
        if (key === 'ref' || key === 'type') continue;
        const found = getFirstErrorMessage(node[key]);
        if (found) return found;
    }
    return undefined;
}

export type ValidationResult<T> =
    | { success: true; data: T }
    | { success: false; error: string; /** Top-level key of the first invalid field. */ fieldName?: string };

/**
 * Safely validates form data using a Zod schema and extracts a single friendly
 * toast message if validation fails.
 */
export function validateWithToast<T>(
    schema: z.ZodType<T>,
    data: unknown
): ValidationResult<T> {
    const result = schema.safeParse(data);
    if (!result.success) {
        const firstKey = result.error.issues[0]?.path[0];
        return {
            success: false,
            error: getZodErrorMessage(result.error),
            fieldName: firstKey !== undefined ? String(firstKey) : undefined,
        };
    }
    return {
        success: true,
        data: result.data,
    };
}

// ── Reusable Regex Constants ──────────────────────────────────────────────────

/** ITU-T E.164 (+919811234567). Kept under the old name so existing imports keep working. */
export const PHONE_REGEX = E164_REGEX;
/** Indian PIN code: exactly 6 digits. */
export const PIN_CODE_REGEX = /^\d{6}$/;
/** Non-Indian postal / ZIP codes: 2–12 letters, digits, spaces or hyphens (e.g. SW1A 1AA, K1A 0B1, 94105-1234). */
export const INTL_POSTAL_CODE_REGEX = /^[A-Za-z0-9\s-]{2,12}$/;
/** Characters a postal code may contain in any country (base shape before the country-specific check). */
const POSTAL_CODE_CHARS_REGEX = /^[A-Za-z0-9\s-]*$/;
export const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
export const GST_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
export const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;

// ── Reusable String Primitives ────────────────────────────────────────────────

// Non-empty trimmed string
export const requiredString = (fieldName: string) =>
    z
        .string()
        .trim()
        .min(1, { message: `${fieldName} is required.` });

// Optional trimmed string
export const optionalString = z
    .string()
    .trim()
    .optional()
    .or(z.literal(''));

// ── Length-capped text (limits mirror each input's `maxLength`, see config/fieldLimits) ──

const maxLengthMessage = (fieldName: string, max: number) => ({
    message: `${fieldName} cannot exceed ${max} characters.`,
});

/** Required trimmed text capped at `max` characters. */
export const requiredText = (fieldName: string, max: number) =>
    requiredString(fieldName).max(max, maxLengthMessage(fieldName, max));

/** Optional trimmed text capped at `max` characters. */
export const optionalText = (fieldName: string, max: number) =>
    z
        .string()
        .trim()
        .max(max, maxLengthMessage(fieldName, max))
        .optional()
        .or(z.literal(''));

// ── Central DRY Zod Validation Dictionary ─────────────────────────────────────

/** International phone in E.164 (legacy 10-digit Indian numbers are upgraded to +91). */
export const zodPhone = z
    .string()
    .trim()
    .transform(normalizeToE164)
    .superRefine((val, ctx) => {
        const message = phoneIssue(val);
        if (message) ctx.addIssue({ code: 'custom', message });
    });

export const zodPhoneOptional = z
    .string()
    .trim()
    .transform(normalizeToE164)
    .superRefine((val, ctx) => {
        const message = val ? phoneIssue(val) : null;
        if (message) ctx.addIssue({ code: 'custom', message });
    })
    .optional()
    .or(z.literal(''));
/** Exactly 6 digits Indian postal PIN code */
export const zodPinCode = z
    .string()
    .trim()
    .regex(PIN_CODE_REGEX, { message: 'Must be exactly 6 digits.' });

export const zodPinCodeOptional = z
    .string()
    .trim()
    .refine((val) => !val || PIN_CODE_REGEX.test(val), {
        message: 'Must be exactly 6 digits.',
    })
    .optional()
    .or(z.literal(''));

// ── Country-aware postal codes ────────────────────────────────────────────────
// Address_Field_Design: postal codes are text (letters / leading zeros allowed) and their format depends on country.

const POSTAL_CODE_REQUIRED_MESSAGE = 'Postal / PIN Code is required.';
const INDIAN_PIN_MESSAGE = 'Must be a valid 6-digit Indian PIN code (e.g. 110001).';
const INTL_POSTAL_MESSAGE = 'Must be a valid postal / ZIP code (2–12 alphanumeric characters).';

/**
 * Validates a postal code against its country (ISO2 code or name).
 * An empty country means India; a non-empty country that isn't in the master (e.g. legacy 'Other')
 * gets the international rule rather than being forced into the Indian PIN format.
 */
export function validatePostalCodeByCountry(
    postalCode: string | undefined,
    country: string | undefined,
    isRequired: boolean
): { valid: boolean; message?: string } {
    const value = postalCode?.trim() ?? '';
    if (!value) {
        return { valid: !isRequired, message: isRequired ? POSTAL_CODE_REQUIRED_MESSAGE : undefined };
    }
    const iso2 = country?.trim() ? resolveCountryIso2(country) : DEFAULT_COUNTRY_CODE;
    if (iso2 === DEFAULT_COUNTRY_CODE) {
        return PIN_CODE_REGEX.test(value) ? { valid: true } : { valid: false, message: INDIAN_PIN_MESSAGE };
    }
    return INTL_POSTAL_CODE_REGEX.test(value) ? { valid: true } : { valid: false, message: INTL_POSTAL_MESSAGE };
}

/**
 * Adds a field issue to a schema's superRefine when the postal code doesn't fit its country.
 * Use with zodPostalCode / zodPostalCodeOptional, which only check the generic shape.
 */
export function refinePostalCodeForCountry(
    ctx: z.RefinementCtx,
    field: string,
    postalCode: string | undefined,
    country: string | undefined,
    isRequired = false
): void {
    const result = validatePostalCodeByCountry(postalCode, country, isRequired);
    if (!result.valid) {
        ctx.addIssue({ code: 'custom', message: result.message ?? INTL_POSTAL_MESSAGE, path: [field] });
    }
}

/** Required postal code: text, up to 12 letters/digits/spaces/hyphens. Country format is checked by refinePostalCodeForCountry. */
export const zodPostalCode = z
    .string()
    .trim()
    .min(1, { message: POSTAL_CODE_REQUIRED_MESSAGE })
    .max(12, { message: INTL_POSTAL_MESSAGE })
    .regex(POSTAL_CODE_CHARS_REGEX, { message: INTL_POSTAL_MESSAGE });

export const zodPostalCodeOptional = z
    .string()
    .trim()
    .max(12, { message: INTL_POSTAL_MESSAGE })
    .regex(POSTAL_CODE_CHARS_REGEX, { message: INTL_POSTAL_MESSAGE })
    .optional()
    .or(z.literal(''));

/** 10-character Indian PAN format with auto toUpperCase */
export const zodPan = z
    .string()
    .trim()
    .transform((val) => val.toUpperCase())
    .refine((val) => PAN_REGEX.test(val), {
        message: 'Must be a valid 10-character Indian PAN (e.g. ABCDE1234F).',
    });

export const zodPanOptional = z
    .string()
    .trim()
    .transform((val) => (val ? val.toUpperCase() : ''))
    .refine((val) => !val || PAN_REGEX.test(val), {
        message: 'Must be a valid 10-character Indian PAN (e.g. ABCDE1234F).',
    })
    .optional()
    .or(z.literal(''));

/** 15-character GST format with auto toUpperCase */
export const zodGst = z
    .string()
    .trim()
    .transform((val) => val.toUpperCase())
    .refine((val) => GST_REGEX.test(val), {
        message: 'Must be a valid 15-character GSTIN (e.g. 07AAAAA0000A1Z5).',
    });

export const zodGstOptional = z
    .string()
    .trim()
    .transform((val) => (val ? val.toUpperCase() : ''))
    .refine((val) => !val || GST_REGEX.test(val), {
        message: 'Must be a valid 15-character GSTIN (e.g. 07AAAAA0000A1Z5).',
    })
    .optional()
    .or(z.literal(''));

/** 11-character Indian IFSC code with auto toUpperCase */
export const zodIfsc = z
    .string()
    .trim()
    .transform((val) => val.toUpperCase())
    .refine((val) => IFSC_REGEX.test(val), {
        message: 'Must be a valid 11-character IFSC code (e.g. SBIN0001234).',
    });

export const zodIfscOptional = z
    .string()
    .trim()
    .transform((val) => (val ? val.toUpperCase() : ''))
    .refine((val) => !val || IFSC_REGEX.test(val), {
        message: 'Must be a valid 11-character IFSC code (e.g. SBIN0001234).',
    })
    .optional()
    .or(z.literal(''));

/** Standard email validation, trimmed, lowercased */
export const zodEmail = z
    .string()
    .trim()
    .max(FIELD_MAX_LENGTH.email, maxLengthMessage('Email', FIELD_MAX_LENGTH.email))
    .email({ message: 'Invalid email format.' })
    .toLowerCase();

export const zodEmailOptional = z
    .string()
    .trim()
    .toLowerCase()
    .max(FIELD_MAX_LENGTH.email, maxLengthMessage('Email', FIELD_MAX_LENGTH.email))
    .refine((val) => !val || z.string().email().safeParse(val).success, {
        message: 'Invalid email format.',
    })
    .default('');

/** Non-negative number coercion */
export const zodAmount = z.coerce
    .number()
    .min(0, { message: 'Amount cannot be negative.' });

/** Number coercion between 0 and 100 */
export const zodPercentage = z.coerce
    .number()
    .min(0, { message: 'Percentage cannot be less than 0.' })
    .max(100, { message: 'Percentage cannot exceed 100.' });

// ── Aliases & Parameterized Helpers ───────────────────────────────────────────

export const phoneSchema = (fieldName: string = 'Phone Number') =>
    z
        .string()
        .trim()
        .transform(normalizeToE164)
        .superRefine((val, ctx) => {
            const message = val ? phoneIssue(val) : null;
            if (message) ctx.addIssue({ code: 'custom', message: message.replace('Phone number', fieldName) });
        });

export const requiredPhoneSchema = (fieldName: string = 'Phone Number') =>
    z
        .string()
        .trim()
        .min(1, { message: `${fieldName} is required.` })
        .transform(normalizeToE164)
        .superRefine((val, ctx) => {
            const message = phoneIssue(val);
            if (message) ctx.addIssue({ code: 'custom', message: message.replace('Phone number', fieldName) });
        });

export const pinCodeSchema = zodPinCodeOptional;
export const requiredPinCodeSchema = (fieldName: string = 'Postal / PIN code') =>
    z
        .string()
        .trim()
        .min(1, { message: `${fieldName} is required.` })
        .regex(PIN_CODE_REGEX, { message: `${fieldName} must be exactly 6 digits.` });

export const emailPrimitive = zodEmail;
export const emailSchema = zodEmailOptional;
export const requiredEmailSchema = (fieldName: string = 'Email Address') =>
    z
        .string()
        .trim()
        .min(1, { message: `${fieldName} is required.` })
        .max(FIELD_MAX_LENGTH.email, maxLengthMessage(fieldName, FIELD_MAX_LENGTH.email))
        .email({ message: 'Invalid email format.' })
        .toLowerCase();

export const panSchema = zodPanOptional;
export const requiredPanSchema = (fieldName: string = 'PAN Number') =>
    z
        .string()
        .trim()
        .min(1, { message: `${fieldName} is required.` })
        .transform((val) => val.toUpperCase())
        .refine((val) => PAN_REGEX.test(val), {
            message: `${fieldName} must be a valid 10-character Indian PAN (e.g. ABCDE1234F).`,
        });

export const gstSchema = zodGstOptional;
export const requiredGstSchema = (fieldName: string = 'GST Number') =>
    z
        .string()
        .trim()
        .min(1, { message: `${fieldName} is required.` })
        .transform((val) => val.toUpperCase())
        .refine((val) => GST_REGEX.test(val), {
            message: `${fieldName} must be a valid 15-character GSTIN (e.g. 07AAAAA0000A1Z5).`,
        });

export const urlSchema = z
    .string()
    .trim()
    .refine((val) => !val || z.string().url().safeParse(val).success, {
        message: 'Please enter a valid URL (e.g. https://example.com).',
    });

export const requiredUrlSchema = (fieldName: string = 'Website URL') =>
    z
        .string()
        .trim()
        .min(1, { message: `${fieldName} is required.` })
        .url({ message: 'Please enter a valid URL (e.g. https://example.com).' });

export const nonNegativeNumber = (fieldName: string = 'Amount') =>
    z.coerce.number().min(0, {
        message: `${fieldName} cannot be negative.`,
    });

export const amountSchema = zodAmount;

export const quantitySchema = z.coerce
    .number()
    .min(1, { message: 'Quantity must be at least 1.' });
