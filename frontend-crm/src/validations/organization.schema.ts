import { z } from 'zod';
import {
    requiredString,
    optionalString,
    gstSchema,
    panSchema,
    pinCodeSchema,
} from './common';
import { corporateEmailSchema } from './contact.schema';

export const partnerCompanySchema = z.object({
    id: z.string(),
    partnerCompanyName: requiredString('Partner Company Name'),
    relationshipType: optionalString,
    contactPerson: optionalString,
    contactEmail: optionalString,
    contactPhone: optionalString,
    status: z.enum(['Active', 'Inactive']).default('Active'),
});

export const organizationFormSchema = z.object({
    // Basic Details
    organizationName: requiredString('Organization Name')
        .max(150, { message: 'Organization Name cannot exceed 150 characters.' }),
    mailingName: optionalString,
    natureOfBusiness: optionalString,
    accountStatus: optionalString,
    typeOfEntity: optionalString,
    customerType: optionalString,
    sapCodeTallyId: optionalString,
    showroomBranchCode: optionalString,
    sourceOfLead: optionalString,
    memberOfParentCorp: optionalString,
    numberOfEmployees: optionalString,
    annualTurnover: optionalString,
    description: optionalString,
    accountVerified: z.boolean().default(false),
    provideSupport: z.enum(['Yes', 'No']).default('Yes'),
    corporateEmails: z.array(corporateEmailSchema).default([]),

    // Billing Address
    billingStreet: optionalString,
    billingCity: optionalString,
    billingState: optionalString,
    billingPostalCode: pinCodeSchema,
    billingCountry: optionalString.default('India'),
    billingLatitude: optionalString,

    // Shipping Address
    shippingStreet: optionalString,
    shippingCity: optionalString,
    shippingState: optionalString,
    shippingPostalCode: pinCodeSchema,
    shippingCountry: optionalString.default('India'),
    shippingLongitude: optionalString,
    copyAddressFromBilling: z.boolean().default(false),

    // Tax & Bank Details
    registrationType: optionalString.default('Registered'),
    panNumber: panSchema,
    msmeRegnNumber: optionalString,
    accountName: optionalString,
    bankName: optionalString,
    bankIfscCode: optionalString,
    gstNumber: gstSchema,
    cinNo: optionalString,
    tanNumber: optionalString,
    accountNumber: optionalString,
    typeOfAccount: optionalString,
    bankAddress: optionalString,

    // Partner Company
    partnerCompanies: z.array(partnerCompanySchema).default([]),
});

export type OrganizationFormSchemaType = z.infer<typeof organizationFormSchema>;
