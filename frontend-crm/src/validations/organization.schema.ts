import { z } from 'zod';
import { FIELD_MAX_LENGTH as L } from '../config/fieldLimits';
import {
    requiredString,
    optionalString,
    requiredText,
    optionalText,
    zodPostalCode,
    zodPostalCodeOptional,
    refinePostalCodeForCountry,
    zodPanOptional,
    zodGstOptional,
    zodIfscOptional,
    zodPhoneOptional,
    zodEmailOptional,
    GST_REGEX,
} from './common';
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

export const organizationFormSchema = z
    .object({
        // Basic Details
        organizationName: requiredText('Organization Name', L.organizationName),
        mailingName: optionalText('Mailing Name', L.organizationName),
        tradeName: optionalText('Trade Name', L.organizationName),
        natureOfBusiness: requiredString('Nature of Business'),
        accountStatus: z.enum(['Active', 'Inactive']).default('Active'),
        inactivityReason: optionalString,
        typeOfEntity: requiredString('Type of Entity'),
        customerType: requiredString('Customer Type'),
        sapCodeTallyId: optionalText('SAP Code / Tally ID', L.shortCode),
        showroomBranchCode: optionalText('Showroom / Branch Code', L.shortCode),
        sourceOfLead: optionalString,
        memberOfParentCorp: optionalText('Parent Corporation', L.organizationName),
        numberOfEmployees: optionalString,
        annualTurnover: optionalString,
        description: optionalText('Description', L.organizationDescription),
        accountVerified: z.boolean().default(false),
        verifiedAt: optionalString,
        verifiedBy: optionalString,
        activeAmc: z.boolean().default(false),
        activeCloud: z.boolean().default(false),
        provideSupport: z.enum(['Yes', 'No']).default('Yes'),
        // Emails live on Contacts now; accepted but not required for older records.
        corporateEmails: z.array(corporateEmailSchema).optional(),

        // Billing Address
        billingAddress: requiredText('Billing Address', L.address),
        billingStreet: optionalText('Billing Street', L.address),
        billingCity: requiredText('Billing City', L.shortText),
        billingState: requiredText('Billing State', L.shortText),
        billingPostalCode: zodPostalCode,
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
        registrationType: z.enum(['Registered', 'Unregistered']).default('Registered'),
        panNumber: zodPanOptional,
        msmeRegnNumber: optionalText('MSME Regn. Number', L.msme),
        accountName: optionalText('Account Name', L.organizationName),
        bankName: optionalText('Bank Name', L.personName),
        bankIfscCode: zodIfscOptional,
        gstNo: zodGstOptional,
        gstNumber: optionalString,
        cinNo: optionalText('CIN No', L.cin),
        tanNumber: optionalText('TAN Number', L.tan),
        accountNumber: optionalText('Account Number', L.bankAccount),
        typeOfAccount: optionalString,
        bankAddress: optionalText('Bank Address', L.address),

        // Partner Company
        partnerCompanies: z.array(z.union([z.string(), partnerCompanySchema])).default([]),
    })
    .superRefine((data, ctx) => {
        refinePostalCodeForCountry(ctx, 'billingPostalCode', data.billingPostalCode, data.billingCountry, true);
        refinePostalCodeForCountry(ctx, 'shippingPostalCode', data.shippingPostalCode, data.shippingCountry);

        if (data.registrationType === 'Registered') {
            const gst = (data.gstNo || data.gstNumber)?.trim();
            if (!gst || gst.length < 1) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: 'GST Number is required for registered organizations.',
                    path: ['gstNo'],
                });
            } else if (!GST_REGEX.test(gst.toUpperCase())) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: 'Please enter a valid 15-character GSTIN (e.g. 07AAAAA0000A1Z5).',
                    path: ['gstNo'],
                });
            }
        }
    });

export type OrganizationFormSchemaType = z.infer<typeof organizationFormSchema>;
