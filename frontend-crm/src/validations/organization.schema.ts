import { z } from 'zod';
import {
    requiredString,
    optionalString,
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
        organizationName: requiredString('Organization Name')
            .max(150, { message: 'Organization Name cannot exceed 150 characters.' }),
        mailingName: optionalString,
        tradeName: optionalString,
        natureOfBusiness: requiredString('Nature of Business'),
        accountStatus: z.enum(['Active', 'Inactive']).default('Active'),
        inactivityReason: optionalString,
        typeOfEntity: requiredString('Type of Entity'),
        customerType: requiredString('Customer Type'),
        sapCodeTallyId: optionalString,
        showroomBranchCode: optionalString,
        sourceOfLead: optionalString,
        memberOfParentCorp: optionalString,
        numberOfEmployees: optionalString,
        annualTurnover: optionalString,
        description: optionalString,
        accountVerified: z.boolean().default(false),
        verifiedAt: optionalString,
        verifiedBy: optionalString,
        activeAmc: z.boolean().default(false),
        activeCloud: z.boolean().default(false),
        provideSupport: z.enum(['Yes', 'No']).default('Yes'),
        // Emails live on Contacts now; accepted but not required for older records.
        corporateEmails: z.array(corporateEmailSchema).optional(),

        // Billing Address
        billingAddress: requiredString('Billing Address'),
        billingStreet: optionalString,
        billingCity: requiredString('Billing City'),
        billingState: requiredString('Billing State'),
        billingPostalCode: zodPostalCode,
        billingCountry: optionalString.default('India'),
        billingLatitude: optionalString,

        // Shipping Address
        shippingAddress: optionalString,
        shippingStreet: optionalString,
        shippingCity: optionalString,
        shippingState: optionalString,
        shippingPostalCode: zodPostalCodeOptional,
        shippingCountry: optionalString.default('India'),
        shippingLongitude: optionalString,
        copyAddressFromBilling: z.boolean().default(false),

        // Tax & Bank Details
        registrationType: z.enum(['Registered', 'Unregistered']).default('Registered'),
        panNumber: zodPanOptional,
        msmeRegnNumber: optionalString,
        accountName: optionalString,
        bankName: optionalString,
        bankIfscCode: zodIfscOptional,
        gstNo: zodGstOptional,
        gstNumber: optionalString,
        cinNo: optionalString,
        tanNumber: optionalString,
        accountNumber: optionalString,
        typeOfAccount: optionalString,
        bankAddress: optionalString,

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
