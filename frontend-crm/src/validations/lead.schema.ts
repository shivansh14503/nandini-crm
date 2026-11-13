import { z } from 'zod';
import { FIELD_MAX_LENGTH as L } from '../config/fieldLimits';
import {
    requiredString,
    optionalString,
    requiredText,
    optionalText,
    optionalDescription,
    zodPhoneOptional,
    zodPostalCodeOptional,
    refinePostalCodeForCountry,
    customFieldsSchema,
    zodGstOptional,
    GST_REGEX,
} from './common';
import { corporateEmailSchema } from './contact.schema';

/**
 * Only locked fields are required here (docs/field-locking-policy.md). Fields an admin may relax (Mobile, Lead
 * Source, Lead Type, Next Followup Date, Product Category, Add Description) are required by the form
 * configuration, which useRhfForm applies on top of this schema.
 */
export const leadFormSchema = z.object({
    // Overview - Left Column
    name: requiredText('Lead Name', L.personName),
    mobile: zodPhoneOptional,
    emailAddresses: z.array(corporateEmailSchema).optional().default([]),
    mailingName: optionalText('Mailing Name', L.organizationName),
    tradeName: optionalText('Trade Name', L.organizationName),
    designation: optionalString,
    leadSource: optionalString,
    productCategory: z.array(z.string()).default([]),
    followupType: optionalString.default('Call'),
    addDescription: optionalDescription('Add Description', L.longText),
    registrationType: optionalString,
    gstNo: zodGstOptional,
    turnover: optionalString,
    assignedTo: requiredString('Assigned Representative'),

    // Overview - Right Column
    otherPhone: zodPhoneOptional,
    organizationName: optionalText('Organization Name', L.organizationName),
    department: optionalString,
    leadType: optionalString,
    status: optionalString.default('New'),
    nextFollowupDate: optionalString,
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
