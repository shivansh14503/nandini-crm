import { z } from 'zod';
import {
    requiredString,
    optionalString,
    phoneSchema,
} from './common';
import { corporateEmailSchema } from './contact.schema';

export const leadFormSchema = z.object({
    // Overview - Left Column
    name: requiredString('Lead Name')
        .max(100, { message: 'Lead Name cannot exceed 100 characters.' }),
    mobile: z
        .string()
        .trim()
        .min(1, { message: 'Mobile Number is required.' })
        .refine(
            (val) => /^[+]?[\d\s\-().]{7,20}$/.test(val),
            { message: 'Please enter a valid mobile number.' }
        ),
    emailAddresses: z.array(corporateEmailSchema).optional().default([]),
    mailingName: optionalString,
    designation: optionalString,
    leadSource: requiredString('Lead Source'),
    productCategory: z
        .array(z.string())
        .min(1, { message: 'Please select at least one Product Category.' }),
    followupType: optionalString.default('Call'),
    addDescription: requiredString('Add Description')
        .min(3, { message: 'Add Description must be at least 3 characters.' }),
    registrationType: optionalString,
    turnover: optionalString,
    assignedTo: requiredString('Assigned Representative'),

    // Overview - Right Column
    otherPhone: phoneSchema('Other Phone Number'),
    organizationName: optionalString,
    department: optionalString,
    leadType: requiredString('Lead Type'),
    status: optionalString.default('New'),
    nextFollowupDate: requiredString('Next Followup Date'),
    nextFollowupTime: optionalString,
    description: optionalString,
    noOfEmployee: optionalString,
    referredBy: optionalString,

    // Primary Address
    primaryAddress: optionalString,
    primaryCity: optionalString,
    primaryState: optionalString,
    primaryPostalCode: optionalString,
    primaryCountry: optionalString.default('India'),
    primaryLatitude: optionalString.default('0.00000000'),

    // Other Address
    otherAddress: optionalString,
    otherCity: optionalString,
    otherState: optionalString,
    otherPostalCode: optionalString,
    otherCountry: optionalString.default('India'),
    copyAddressFromLeft: z.boolean().default(false),
    otherLongitude: optionalString.default('0.00000000'),
});

export type LeadFormSchemaType = z.infer<typeof leadFormSchema>;
