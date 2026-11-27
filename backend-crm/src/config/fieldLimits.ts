/**
 * Character limits enforced by the API validators. Mirrors frontend-crm/src/config/fieldLimits.ts (the inputs'
 * `maxLength`) and must stay in sync with it and with the column widths in prisma/schema.prisma.
 * The frontend copy is checked against this one by src/validators/contractSync.test.ts.
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
    msme: 19,
    hsn: 8,
    /** Tally licence serial number: exactly 9 digits, starting with 7. */
    tallySerialNo: 9,
    shortCode: 30,
    bankAccount: 18,
    email: 120,
    url: 255,
    personName: 100,
    organizationName: 200,
    shortText: 80,
    title: 200,
    address: 250,
    /** Organization "Description & Scope". */
    organizationDescription: 1000,
    /** Descriptions, remarks, notes and other long text (shows a live "x / 2,000" counter). */
    longText: 2000,
    /** Quotation terms (Terms & Condition / Payment Terms descriptions, Terms and Conditions): legal text runs long. */
    termsText: 4000,
    /** Long text fields an admin adds in the Form Builder (type Long Text). */
    customLongText: 4000,
    /** Reason asked when an organization or product is made Inactive. */
    inactivityReason: 500,
    /** Option values (stage, source, category, …) and usernames. */
    option: 100,
    username: 50,
} as const;
