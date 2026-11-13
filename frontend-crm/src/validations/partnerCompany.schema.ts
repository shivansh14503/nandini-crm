import { z } from 'zod';
import { FIELD_MAX_LENGTH as L } from '../config/fieldLimits';
import {
    optionalString,
    optionalText,
    refinePostalCodeForCountry,
    requiredText,
    zodGstOptional,
    zodIfscOptional,
    zodPanOptional,
    zodPhoneOptional,
    zodPostalCodeOptional,
    customFieldsSchema,
} from './common';
import { corporateEmailSchema } from './contact.schema';

/** Column widths without a shared `FIELD_MAX_LENGTH` entry (mirrors backend-crm partnerCompany.validator.ts). */
const WEBSITE_MAX = 200;
const BANK_BRANCH_MAX = 150;

/**
 * Partner Company form. Only the Partner Name is locked (docs/field-locking-policy.md); Nature of Partner, Office
 * Phone and the billing address are required by the form configuration, which useRhfForm applies on top.
 */
export const partnerCompanyFormSchema = z
    .object({
        // Company information
        companyName: requiredText('Partner Name', L.organizationName),
        natureOfPartner: optionalString,
        phone: zodPhoneOptional,
        website: optionalText('Website', WEBSITE_MAX),
        emailAddresses: z
            .array(corporateEmailSchema)
            .min(1, { message: 'At least one email address is required.' })
            .refine((list) => list.some((e) => (e.email || '').trim().length > 0), {
                message: 'Email Address is required.',
            }),
        addDescription: optionalText('Add Description', L.longText),
        description: optionalText('Description', L.longText),
        assignedTo: optionalString,
        principalCompany: optionalText('Principal Company', L.organizationName),

        // Bank details
        bankName: optionalText('Bank Name', L.personName),
        bankBranch: optionalText('Branch', BANK_BRANCH_MAX),
        accountNumber: optionalText('Account No', L.bankAccount),
        bankIfscCode: zodIfscOptional,

        // Billing address
        billingAddress: optionalText('Billing Street', L.address),
        billingStreet: optionalText('Billing Street', L.address),
        billingCity: optionalText('Billing City', L.shortText),
        billingState: optionalText('Billing State', L.shortText),
        billingPostalCode: zodPostalCodeOptional,
        billingCountry: optionalString.default('IN'),

        // Shipping address
        shippingAddress: optionalText('Shipping Street', L.address),
        shippingStreet: optionalText('Shipping Street', L.address),
        shippingCity: optionalText('Shipping City', L.shortText),
        shippingState: optionalText('Shipping State', L.shortText),
        shippingPostalCode: zodPostalCodeOptional,
        shippingCountry: optionalString.default('IN'),
        copyAddressFromBilling: z.boolean().default(false),

        // Statutory
        gstNo: zodGstOptional,
        panNumber: zodPanOptional,
        cinNo: optionalText('CIN No', L.cin),
        msmeRegnNumber: optionalText('MSME Regn. Number', L.msme),
        tanNumber: optionalText('TAN Number', L.tan),

        /** Admin-defined custom field values (validated against the form configuration by useRhfForm). */
        customFields: customFieldsSchema,
    })
    .superRefine((data, ctx) => {
        refinePostalCodeForCountry(ctx, 'billingPostalCode', data.billingPostalCode, data.billingCountry);
        if (!data.copyAddressFromBilling) {
            refinePostalCodeForCountry(ctx, 'shippingPostalCode', data.shippingPostalCode, data.shippingCountry);
        }
    });

export type PartnerCompanyFormSchemaType = z.infer<typeof partnerCompanyFormSchema>;
