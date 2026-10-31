import { z } from 'zod';
import { FIELD_MAX_LENGTH as L } from '../../config/fieldLimits.js';
import {
    booleanQuery,
    createdWithinDaysQuery,
    optionalGst,
    optionalIfsc,
    optionalPan,
    optionalPostalCode,
    optionalText,
    optionalUpperText,
    phone,
    refinePostalCodeForCountry,
    requiredText,
} from '../../validators/common.js';
import { corporateEmailListSchema } from '../shared/entityEmails.js';

/** Column widths that have no shared `FIELD_MAX_LENGTH` entry (see prisma/schema.prisma). */
const WEBSITE_MAX = 200;
const BANK_BRANCH_MAX = 150;

/** `PartnerCompanyFormData` rules from frontend-crm/src/validations/partnerCompany.schema.ts. */
export const partnerCompanyInputSchema = z
    .object({
        // Company information
        companyName: requiredText('Partner Name', L.organizationName),
        natureOfPartner: requiredText('Nature of Partner', L.option),
        phone: phone('Office Phone'),
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
        billingAddress: requiredText('Billing Street', L.address),
        billingStreet: optionalText('Billing Street', L.address),
        billingCity: requiredText('Billing City', L.shortText),
        billingState: requiredText('Billing State', L.shortText),
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
    })
    .superRefine((input, ctx) => {
        refinePostalCodeForCountry(ctx, 'billingPostalCode', input.billingPostalCode, input.billingCountry, true);
        if (!input.copyAddressFromBilling) {
            refinePostalCodeForCountry(ctx, 'shippingPostalCode', input.shippingPostalCode, input.shippingCountry);
        }
    });

export type PartnerCompanyInput = z.infer<typeof partnerCompanyInputSchema>;

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
