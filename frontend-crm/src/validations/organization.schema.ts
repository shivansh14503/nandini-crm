import { z } from 'zod';
import { FIELD_MAX_LENGTH as L } from '../config/fieldLimits';
import { isGstRegistrationType, isPartnerCustomerType, NATURE_OF_PARTNER_REQUIRED_MESSAGE } from '../config/constants';
import { GST_REGEX, configurableOption, customFieldsSchema, optionalLongText, optionalString, optionalText, refinePostalCodeForCountry, requiredString, requiredText, zodEmailOptional, zodGstOptional, zodIfscOptional, zodPanOptional, zodPhoneOptional, zodPostalCodeOptional } from './common';
import { corporateEmailSchema } from './contact.schema';

export const partnerCompanySchema = z.object({
    id: z.string(),
    partnerCompanyName: requiredString('Partner Company Name'),
    relationshipType: optionalString,
    contactPerson: optionalString,
    contactEmail: zodEmailOptional,
    contactPhone: zodPhoneOptional,
    status: z.enum(['Active', 'Inactive']).default('Active'),
});

/** Field rules of the Organization form (Convert Lead reuses them for the organization it creates). */
export const organizationFieldsSchema = z.object({
        // Basic Details
        organizationName: requiredText('Organization Name', L.organizationName),
        mailingName: optionalText('Mailing Name', L.organizationName),
        tradeName: optionalText('Trade Name', L.organizationName),
        // Classification and billing address are required by the form configuration (admin-relaxable,
        // docs/field-locking-policy.md), which OrganizationForm applies on top of this schema.
        natureOfBusiness: optionalString,
        // Admin-customizable (org_account_status / shared_registration_type, the lead form's list).
        accountStatus: configurableOption('Account Status', 'Active'),
        inactivityReason: optionalString,
        typeOfEntity: optionalString,
        customerType: optionalString,
        // Required when Customer Type is Partner (below).
        natureOfPartner: optionalString,
        sapCodeTallyId: optionalText('SAP Code / Tally ID', L.shortCode),
        showroomBranchCode: optionalText('Showroom / Branch Code', L.shortCode),
        leadSource: optionalString,
        memberOf: optionalText('Parent Corporation', L.organizationName),
        numberOfEmployees: optionalString,
        annualTurnover: optionalString,
        addDescriptionAndScope: optionalLongText,
        accountVerified: z.boolean().default(false),
        verifiedAt: optionalString,
        verifiedBy: optionalString,
        activeAmc: z.boolean().default(false),
        activeCloud: z.boolean().default(false),
        provideSupport: z.enum(['Yes', 'No']).default('Yes'),
        // Emails live on Contacts now; accepted but not required for older records.
        corporateEmails: z.array(corporateEmailSchema).optional(),

        // Billing Address
        billingAddress: optionalText('Billing Address', L.address),
        billingStreet: optionalText('Billing Street', L.address),
        billingCity: optionalText('Billing City', L.shortText),
        billingState: optionalText('Billing State', L.shortText),
        billingPostalCode: zodPostalCodeOptional,
        billingCountry: optionalString.default('India'),
        billingLatitude: optionalString,

        // Shipping Address
        shippingAddress: optionalText('Shipping Address', L.address),
        shippingStreet: optionalText('Shipping Street', L.address),
        shippingCity: optionalText('Shipping City', L.shortText),
        shippingState: optionalText('Shipping State', L.shortText),
        shippingPostalCode: zodPostalCodeOptional,
        shippingCountry: optionalString.default('India'),
        shippingLongitude: optionalString,
        copyAddressFromBilling: z.boolean().default(false),

        // Tax & Bank Details
        // Blank stays blank: whether it's required comes from the form configuration.
        registrationType: optionalString,
        panNumber: zodPanOptional,
        msmeRegnNumber: optionalText('MSME Regn. Number', L.msme),
        accountName: optionalText('Account Name', L.organizationName),
        bankName: optionalText('Bank Name', L.personName),
        ifscCode: zodIfscOptional,
        gstNumber: zodGstOptional,
        cinNo: optionalText('CIN No', L.cin),
        tanNumber: optionalText('TAN Number', L.tan),
        accountNo: optionalText('Account No', L.bankAccount),
        typeOfAccount: optionalString,
        bankAddress: optionalText('Bank Address', L.address),

        // Partner Company
        partnerCompanies: z.array(z.union([z.string(), partnerCompanySchema])).default([]),
        partnerCompany: optionalString,

        /** Admin-defined custom field values (validated against the form configuration by useRhfForm). */
        customFields: customFieldsSchema,
    });

export const organizationFormSchema = organizationFieldsSchema
    .superRefine((data, ctx) => {
        refinePostalCodeForCountry(ctx, 'billingPostalCode', data.billingPostalCode, data.billingCountry);
        refinePostalCodeForCountry(ctx, 'shippingPostalCode', data.shippingPostalCode, data.shippingCountry);

        // Partner organizations give their Nature of Partner (the field shows beside Customer Type only for them).
        if (isPartnerCustomerType(data.customerType) && !data.natureOfPartner?.trim()) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: NATURE_OF_PARTNER_REQUIRED_MESSAGE, path: ['natureOfPartner'] });
        }

        // GSTIN is only collected (and then required) for 'Registered' / SEZ organizations.
        if (isGstRegistrationType(data.registrationType)) {
            const gst = (data.gstNumber || data.gstNumber)?.trim();
            if (!gst || gst.length < 1) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: `GST Number is required when Registration Type is ${data.registrationType}.`,
                    path: ['gstNumber'],
                });
            } else if (!GST_REGEX.test(gst.toUpperCase())) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: 'Please enter a valid 15-character GSTIN (e.g. 07AAAAA0000A1Z5).',
                    path: ['gstNumber'],
                });
            }
        }
    });

export type OrganizationFormSchemaType = z.infer<typeof organizationFormSchema>;
