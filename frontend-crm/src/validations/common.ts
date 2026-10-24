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

export const PHONE_REGEX = /^\d{10}$/;
export const PIN_CODE_REGEX = /^\d{6}$/;
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

// ── Central DRY Zod Validation Dictionary ─────────────────────────────────────

/** Exactly 10 digits numeric phone */
export const zodPhone = z
    .string()
    .trim()
    .regex(PHONE_REGEX, { message: 'Must be exactly 10 digits.' });

export const zodPhoneOptional = z
    .string()
    .trim()
    .refine((val) => !val || PHONE_REGEX.test(val), {
        message: 'Must be exactly 10 digits.',
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
    .email({ message: 'Invalid email format.' })
    .toLowerCase();

export const zodEmailOptional = z
    .string()
    .trim()
    .toLowerCase()
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
        .refine(
            (val) => !val || PHONE_REGEX.test(val),
            { message: `${fieldName} must be exactly 10 digits.` }
        );

export const requiredPhoneSchema = (fieldName: string = 'Phone Number') =>
    z
        .string()
        .trim()
        .min(1, { message: `${fieldName} is required.` })
        .regex(PHONE_REGEX, { message: `${fieldName} must be exactly 10 digits.` });

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
