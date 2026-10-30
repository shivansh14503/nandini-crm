/**
 * Character limits enforced by the API validators. Mirrors frontend-crm/src/config/fieldLimits.ts (the inputs'
 * `maxLength`) and must stay in sync with it and with the column widths in prisma/schema.prisma.
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
    shortCode: 30,
    bankAccount: 18,
    email: 120,
    url: 255,
    personName: 100,
    organizationName: 200,
    shortText: 80,
    title: 200,
    address: 250,
    organizationDescription: 1000,
    longText: 2000,
    /** Option values (stage, source, category, …) and usernames. */
    option: 100,
    username: 50,
} as const;
