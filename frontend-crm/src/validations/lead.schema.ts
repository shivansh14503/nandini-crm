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
    customFieldsSchema,
    zodGstOptional,
    GST_REGEX,
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
    gstNo: zodGstOptional,
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

    /** Admin-defined custom field values (validated against the form configuration by useRhfForm). */
    customFields: customFieldsSchema,
}).superRefine((data, ctx) => {
    refinePostalCodeForCountry(ctx, 'primaryPostalCode', data.primaryPostalCode, data.primaryCountry);
    refinePostalCodeForCountry(ctx, 'otherPostalCode', data.otherPostalCode, data.otherCountry);

    // GSTIN is only collected (and then required) for 'Registered' leads; matches organization.schema.ts.
    if (data.registrationType === 'Registered') {
        const gst = data.gstNo?.trim();
        if (!gst) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'GST Number is required when Registration Type is Registered.',
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

export type LeadFormSchemaType = z.infer<typeof leadFormSchema>;
