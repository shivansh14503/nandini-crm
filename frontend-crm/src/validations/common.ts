import { z } from 'zod';

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
    | { success: false; error: string };

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
        return {
            success: false,
            error: getZodErrorMessage(result.error),
        };
    }
    return {
        success: true,
        data: result.data,
    };
}

// ── Reusable Regex Constants ──────────────────────────────────────────────────

export const PHONE_REGEX = /^\d{10}$/;
export const PIN_CODE_REGEX = /^\d{6}$/;
export const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
export const GST_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

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

// ── Phone Number Primitives ───────────────────────────────────────────────────

/**
 * Optional phone number: allows empty string, or exactly 10 numeric digits.
 */
export const phoneSchema = (fieldName: string = 'Phone Number') =>
    z
        .string()
        .trim()
        .refine(
            (val) => !val || PHONE_REGEX.test(val),
            { message: `${fieldName} must be exactly 10 digits.` }
        );

/**
 * Required phone number: exactly 10 numeric digits.
 */
export const requiredPhoneSchema = (fieldName: string = 'Phone Number') =>
    z
        .string()
        .trim()
        .min(1, { message: `${fieldName} is required.` })
        .regex(PHONE_REGEX, { message: `${fieldName} must be exactly 10 digits.` });

// ── Postal Code / PIN Primitives ──────────────────────────────────────────────

/**
 * Optional postal/PIN code: allows empty string, or exactly 6 numeric digits.
 */
export const pinCodeSchema = z
    .string()
    .trim()
    .refine((val) => !val || PIN_CODE_REGEX.test(val), {
        message: 'Postal PIN code must be exactly 6 digits.',
    });

/**
 * Required postal/PIN code: exactly 6 numeric digits.
 */
export const requiredPinCodeSchema = (fieldName: string = 'Postal / PIN code') =>
    z
        .string()
        .trim()
        .min(1, { message: `${fieldName} is required.` })
        .regex(PIN_CODE_REGEX, { message: `${fieldName} must be exactly 6 digits.` });

// ── Email Address Primitives ──────────────────────────────────────────────────

/**
 * Standard email validation primitive (required, trimmed, lowercased).
 */
export const emailPrimitive = z
    .string()
    .trim()
    .toLowerCase()
    .email({ message: 'Invalid email format.' });

/**
 * Required email address schema.
 */
export const requiredEmailSchema = (fieldName: string = 'Email Address') =>
    z
        .string()
        .trim()
        .min(1, { message: `${fieldName} is required.` })
        .email({ message: 'Invalid email format.' })
        .toLowerCase();

/**
 * Optional email address schema: allows empty string, or valid email format.
 */
export const emailSchema = z
    .string()
    .trim()
    .toLowerCase()
    .refine((val) => !val || z.string().email().safeParse(val).success, {
        message: 'Invalid email format.',
    });

// ── PAN Number Primitives ─────────────────────────────────────────────────────

/**
 * Standard 10-character Indian PAN format with auto toUpperCase transformation.
 * Optional when empty.
 */
export const panSchema = z
    .string()
    .trim()
    .transform((val) => (val ? val.toUpperCase() : ''))
    .refine((val) => !val || PAN_REGEX.test(val), {
        message: 'Please enter a valid 10-character Indian PAN (e.g. ABCDE1234F).',
    });

/**
 * Required 10-character Indian PAN.
 */
export const requiredPanSchema = (fieldName: string = 'PAN Number') =>
    z
        .string()
        .trim()
        .min(1, { message: `${fieldName} is required.` })
        .transform((val) => val.toUpperCase())
        .refine((val) => PAN_REGEX.test(val), {
            message: `${fieldName} must be a valid 10-character Indian PAN (e.g. ABCDE1234F).`,
        });

// ── GST Number Primitives ─────────────────────────────────────────────────────

/**
 * Standard 15-character GST format with auto toUpperCase transformation.
 * Optional when empty.
 */
export const gstSchema = z
    .string()
    .trim()
    .transform((val) => (val ? val.toUpperCase() : ''))
    .refine((val) => !val || GST_REGEX.test(val), {
        message: 'Please enter a valid 15-character GSTIN (e.g. 07AAAAA0000A1Z5).',
    });

/**
 * Required 15-character GST number.
 */
export const requiredGstSchema = (fieldName: string = 'GST Number') =>
    z
        .string()
        .trim()
        .min(1, { message: `${fieldName} is required.` })
        .transform((val) => val.toUpperCase())
        .refine((val) => GST_REGEX.test(val), {
            message: `${fieldName} must be a valid 15-character GSTIN (e.g. 07AAAAA0000A1Z5).`,
        });

// ── Website / URL Primitives ──────────────────────────────────────────────────

/**
 * Optional URL schema: allows empty string, or valid URL format.
 */
export const urlSchema = z
    .string()
    .trim()
    .refine((val) => !val || z.string().url().safeParse(val).success, {
        message: 'Please enter a valid URL (e.g. https://example.com).',
    });

/**
 * Required URL schema.
 */
export const requiredUrlSchema = (fieldName: string = 'Website URL') =>
    z
        .string()
        .trim()
        .min(1, { message: `${fieldName} is required.` })
        .url({ message: 'Please enter a valid URL (e.g. https://example.com).' });

// ── Currency / Amount / Quantity Primitives ───────────────────────────────────

/**
 * Non-negative coerced number validator (handles strings and numbers).
 */
export const nonNegativeNumber = (fieldName: string = 'Amount') =>
    z.coerce.number().min(0, {
        message: `${fieldName} cannot be negative.`,
    });

export const amountSchema = nonNegativeNumber('Amount');

export const quantitySchema = z.coerce
    .number()
    .min(1, { message: 'Quantity must be at least 1.' });
