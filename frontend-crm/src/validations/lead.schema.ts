import { z } from 'zod';
import { FIELD_MAX_LENGTH as L } from '../config/fieldLimits';
import {
    requiredString,
    optionalString,
    requiredText,
    optionalText,
    zodPhone,
    zodPhoneOptional,
    zodPostalCodeOptional,
    refinePostalCodeForCountry,
} from './common';
import { corporateEmailSchema } from './contact.schema';

export const leadFormSchema = z.object({
    // Overview - Left Column
    name: requiredText('Lead Name', L.personName),
    mobile: zodPhone,
    emailAddresses: z.array(corporateEmailSchema).optional().default([]),
    mailingName: optionalText('Mailing Name', L.organizationName),
    designation: optionalString,
    leadSource: requiredString('Lead Source'),
    productCategory: z
        .array(z.string())
        .min(1, { message: 'Please select at least one Product Category.' }),
    followupType: optionalString.default('Call'),
    addDescription: requiredText('Add Description', L.longText)
        .min(3, { message: 'Add Description must be at least 3 characters.' }),
    registrationType: optionalString,
    turnover: optionalString,
    assignedTo: requiredString('Assigned Representative'),

    // Overview - Right Column
    otherPhone: zodPhoneOptional,
    organizationName: optionalText('Organization Name', L.organizationName),
    department: optionalString,
    leadType: requiredString('Lead Type'),
    status: optionalString.default('New'),
    nextFollowupDate: requiredString('Next Followup Date'),
    nextFollowupTime: optionalString,
    description: optionalText('Description', L.longText),
    noOfEmployee: optionalString,
    referredBy: optionalString,

    // Primary Address
    primaryAddress: optionalText('Primary Street', L.address),
    primaryCity: optionalText('Primary City', L.shortText),
    primaryState: optionalText('Primary State', L.shortText),
    primaryPostalCode: zodPostalCodeOptional,
    primaryCountry: optionalString.default('India'),
    primaryLatitude: optionalString,

    // Other Address
    otherAddress: optionalText('Other Street', L.address),
    otherCity: optionalText('Other City', L.shortText),
    otherState: optionalText('Other State', L.shortText),
    otherPostalCode: zodPostalCodeOptional,
    otherCountry: optionalString.default('India'),
    copyAddressFromLeft: z.boolean().default(false),
    otherLongitude: optionalString,
}).superRefine((data, ctx) => {
    refinePostalCodeForCountry(ctx, 'primaryPostalCode', data.primaryPostalCode, data.primaryCountry);
    refinePostalCodeForCountry(ctx, 'otherPostalCode', data.otherPostalCode, data.otherCountry);
});

export type LeadFormSchemaType = z.infer<typeof leadFormSchema>;
