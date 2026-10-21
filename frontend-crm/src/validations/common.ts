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

// ── Reusable Regex & String Primitives ────────────────────────────────────────

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

// Phone number: optional or at least 7 digits
export const phoneSchema = (fieldName: string = 'Phone Number') =>
    z
        .string()
        .trim()
        .refine(
            (val) => !val || /^[+]?[\d\s\-().]{7,20}$/.test(val),
            { message: `Please enter a valid ${fieldName}.` }
        );

// Email address schema: optional or valid email format
export const emailSchema = z
    .string()
    .trim()
    .refine(
        (val) => !val || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val),
        { message: 'Please enter a valid email address.' }
    );

// GSTIN format: 2-digit state code + 10-char PAN + 1-char entity + 'Z' + 1-char checksum
export const gstSchema = z
    .string()
    .trim()
    .refine(
        (val) =>
            !val ||
            /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(
                val.toUpperCase()
            ),
        { message: 'Please enter a valid 15-digit GSTIN (e.g. 07AAAAA0000A1Z5).' }
    );

// PAN format: 5 letters + 4 digits + 1 letter
export const panSchema = z
    .string()
    .trim()
    .refine(
        (val) => !val || /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(val.toUpperCase()),
        { message: 'Please enter a valid 10-digit PAN (e.g. ABCDE1234F).' }
    );

// 6-digit Indian PIN code
export const pinCodeSchema = z
    .string()
    .trim()
    .refine((val) => !val || /^[1-9][0-9]{5}$/.test(val), {
        message: 'Postal PIN code must be a valid 6-digit number.',
    });
