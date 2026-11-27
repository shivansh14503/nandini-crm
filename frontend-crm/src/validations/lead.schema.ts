import { z } from 'zod';
import { FIELD_MAX_LENGTH as L } from '../config/fieldLimits';
import { isGstRegistrationType } from '../config/constants';
import { leadSourceDetailIssues } from '../utils/leadSource';
import { GST_REGEX, customFieldsSchema, optionalDescription, optionalLongText, optionalString, optionalText, refinePostalCodeForCountry, requiredString, requiredText, zodGstOptional, zodPhoneOptional, zodPostalCodeOptional } from './common';
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
    emailAddress: z.array(corporateEmailSchema).optional().default([]),
    mailingName: optionalText('Mailing Name', L.organizationName),
    tradeName: optionalText('Trade Name', L.organizationName),
    designation: optionalString,
    leadSource: optionalString,
    productCategory: z.array(z.string()).default([]),
    followupType: optionalString.default('Call'),
    customerResponse: optionalString,
    remarks: optionalDescription('Remarks'),
    registrationType: optionalString,
    gstNumber: zodGstOptional,
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
    description: optionalLongText,
    noOfEmployee: optionalString,
    // Required for Lead Source CA / Reference; Partner Company for Lead Source Partner (below).
    referredBy: optionalString,
    referredById: optionalString,
    partnerCompany: optionalString,

    // Billing Address
    primaryAddress: optionalText('Billing Street', L.address),
    primaryCity: optionalText('Billing City', L.shortText),
    primaryState: optionalText('Billing State', L.shortText),
    primaryPostalCode: zodPostalCodeOptional,
    primaryCountry: optionalString.default('India'),
    primaryLatitude: optionalString,

    // Shipping Address
    otherAddress: optionalText('Shipping Street', L.address),
    otherCity: optionalText('Shipping City', L.shortText),
    otherState: optionalText('Shipping State', L.shortText),
    otherPostalCode: zodPostalCodeOptional,
    otherCountry: optionalString.default('India'),
    copyAddressFromLeft: z.boolean().default(false),
    otherLongitude: optionalString,

    /** Admin-defined custom field values (validated against the form configuration by useRhfForm). */
    customFields: customFieldsSchema,
}).superRefine((data, ctx) => {
    refinePostalCodeForCountry(ctx, 'primaryPostalCode', data.primaryPostalCode, data.primaryCountry);
    refinePostalCodeForCountry(ctx, 'otherPostalCode', data.otherPostalCode, data.otherCountry);

    // The Lead Source's follow-up field: Referred By (CA, Reference) or Partner Company (Partner).
    for (const issue of leadSourceDetailIssues(data)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: issue.message, path: [issue.path] });
    }

    // GSTIN is only collected (and then required) for 'Registered' / SEZ leads; matches organization.schema.ts.
    if (isGstRegistrationType(data.registrationType)) {
        const gst = data.gstNumber?.trim();
        if (!gst) {
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

export type LeadFormSchemaType = z.infer<typeof leadFormSchema>;
