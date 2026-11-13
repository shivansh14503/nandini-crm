import { z } from 'zod';
import { FIELD_MAX_LENGTH as L } from '../../config/fieldLimits.js';
import {
    booleanQuery,
    createdWithinDaysQuery,
    customFieldsSchema,
    optionalGst,
    optionalIfsc,
    optionalPan,
    optionalPhone,
    optionalPostalCode,
    optionalText,
    optionalUpperText,
    refinePostalCodeForCountry,
    requiredText,
} from '../../validators/common.js';
import { corporateEmailListSchema } from '../shared/entityEmails.js';

/** Column widths that have no shared `FIELD_MAX_LENGTH` entry (see prisma/schema.prisma). */
const WEBSITE_MAX = 200;
const BANK_BRANCH_MAX = 150;

/**
 * Field rules shared by the partner company form and bulk import. Only the Partner Name is locked
 * (docs/field-locking-policy.md); nature, phone and billing address are enforced from the form configuration.
 */
const partnerCompanyFields = z
    .object({
        // Company information
        companyName: requiredText('Partner Name', L.organizationName),
        natureOfPartner: optionalText('Nature of Partner', L.option),
        phone: optionalPhone('Office Phone'),
        website: optionalText('Website', WEBSITE_MAX),
        emailAddresses: corporateEmailListSchema.default([]).superRefine((emails, ctx) => {
            if (!emails.some((row) => row.email)) {
                ctx.addIssue({ code: 'custom', message: 'Email Address is required.' });
            }
        }),
        addDescription: optionalText('Add Description', L.longText),
        description: optionalText('Description', L.longText),
        assignedTo: optionalText('Assigned to', L.username),
        principalCompany: optionalText('Principal Company', L.organizationName),

        // Bank details
        bankName: optionalText('Bank Name', L.personName),
        bankBranch: optionalText('Branch', BANK_BRANCH_MAX),
        accountNumber: optionalText('Account No', L.bankAccount),
        bankIfscCode: optionalIfsc,

        // Billing address (same rules as the organization form, which uses the same address section)
        billingAddress: optionalText('Billing Street', L.address),
        billingStreet: optionalText('Billing Street', L.address),
        billingCity: optionalText('Billing City', L.shortText),
        billingState: optionalText('Billing State', L.shortText),
        billingPostalCode: optionalPostalCode,
        billingCountry: optionalText('Billing Country', L.shortText),

        // Shipping address
        shippingAddress: optionalText('Shipping Street', L.address),
        shippingStreet: optionalText('Shipping Street', L.address),
        shippingCity: optionalText('Shipping City', L.shortText),
        shippingState: optionalText('Shipping State', L.shortText),
        shippingPostalCode: optionalPostalCode,
        shippingCountry: optionalText('Shipping Country', L.shortText),
        copyAddressFromBilling: z.boolean().default(false),

        // Statutory
        gstNo: optionalGst,
        panNumber: optionalPan,
        cinNo: optionalUpperText('CIN No', L.cin),
        msmeRegnNumber: optionalUpperText('MSME Regn. Number', L.msme),
        tanNumber: optionalUpperText('TAN Number', L.tan),

        customFields: customFieldsSchema,
    });

/** Postal code formats; whether the billing PIN is required comes from the form configuration. */
function refinePartnerPostalCodes(
    input: { billingPostalCode?: string; billingCountry?: string; shippingPostalCode?: string; shippingCountry?: string; copyAddressFromBilling: boolean },
    ctx: z.RefinementCtx,
): void {
    refinePostalCodeForCountry(ctx, 'billingPostalCode', input.billingPostalCode, input.billingCountry);
    if (!input.copyAddressFromBilling) {
        refinePostalCodeForCountry(ctx, 'shippingPostalCode', input.shippingPostalCode, input.shippingCountry);
    }
}

/** `PartnerCompanyFormData` rules from frontend-crm/src/validations/partnerCompany.schema.ts. */
export const partnerCompanyInputSchema = partnerCompanyFields.superRefine((input, ctx) => refinePartnerPostalCodes(input, ctx));

/** Bulk import: the same rules (spreadsheets often carry no address; required fields come from the form configuration). */
export const partnerCompanyImportSchema = partnerCompanyInputSchema;

export type PartnerCompanyInput = z.infer<typeof partnerCompanyInputSchema>;
/** What a partner company write accepts: a form submission or an imported row (whose billing address may be blank). */
export type PartnerCompanyRecordInput = PartnerCompanyInput | z.infer<typeof partnerCompanyImportSchema>;

export const partnerCompanyListQuerySchema = z.object({
    natureOfPartner: z.string().trim().max(L.option).optional(),
    assignedTo: z.string().trim().max(L.username).optional(),
    /** Only partner companies assigned to the signed-in user. */
    mine: booleanQuery,
    createdWithinDays: createdWithinDaysQuery,
});

export const PARTNER_COMPANY_SORT_FIELDS = [
    'createdAt',
    'updatedAt',
    'companyName',
    'natureOfPartner',
    'phone',
    'email',
    'city',
    'billingCountry',
    'assignedTo',
] as const;
