/**
 * Character limits shared by form inputs (`maxLength`) and Zod schemas (`.max()`), so the UI never accepts
 * text that validation then rejects. Formatted identifiers use their exact length.
 * UI-free on purpose: imported by both `components/forms/fieldSizing` and `validations/`.
 */
export const FIELD_MAX_LENGTH = {
    phone: 16,
    pinCode: 6,
    postalCode: 12,
    pan: 10,
    tan: 10,
    ifsc: 11,
    gstin: 15,
    cin: 21,
    /** Udyam registration number, e.g. UDYAM-MH-26-0123456. */
    msme: 19,
    hsn: 8,
    shortCode: 30,
    bankAccount: 18,
    email: 120,
    url: 255,
    personName: 100,
    organizationName: 200,
    shortText: 80,
    title: 200,
    address: 250,
    /** Organization "Description & Scope" (shows a live x / 1000 counter). */
    organizationDescription: 1000,
    longText: 2000,
} as const;
