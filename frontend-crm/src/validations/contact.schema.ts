import { z } from 'zod';
import { FIELD_MAX_LENGTH as L } from '../config/fieldLimits';
import { customFieldsSchema, optionalLongText, optionalString, requiredString, requiredText, zodEmailOptional, zodPhone, zodPhoneOptional } from './common';

export const corporateEmailSchema = z
    .object({
        id: z.string(),
        email: zodEmailOptional,
        isPrimary: z.boolean().default(false),
        isOptedOut: z.boolean().default(false),
        isInvalidBounce: z.boolean().default(false),
        /** Client-only: set when the field check found the address can't receive email (see EmailRow). */
        undeliverableMessage: z.string().nullish(),
    })
    // The check already said "invalid": block the save here instead of sending it to be rejected again.
    .superRefine((row, ctx) => {
        if (row.undeliverableMessage && row.email) {
            ctx.addIssue({ code: 'custom', path: ['email'], message: row.undeliverableMessage });
        }
    });

export const contactFormSchema = z.object({
    name: requiredText('Contact Name', L.personName),
    organizationName: requiredText('Organization Name', L.organizationName),
    mobile: zodPhone,
    officePhone: zodPhoneOptional,
    phone3: zodPhoneOptional,
    phone4: zodPhoneOptional,
    phone5: zodPhoneOptional,
    emailAddress: z.array(corporateEmailSchema).superRefine((emails, ctx) => {
        // If emails are present, ensure at least one has a non-empty address
        if (emails.length > 0) {
            const hasValidEmail = emails.some((e) => (e.email || '').trim().length > 0);
            if (!hasValidEmail) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: 'Please provide at least one valid email address.',
                });
            }
        }
    }),
    assignedTo: requiredString('Assigned Representative'),
    isPrimaryContact: z.boolean().default(false),
    designation: optionalString,
    department: optionalString,
    leftJob: z.enum(['No', 'Yes']).default('No'),
    communicationType: z.array(z.string()).default(['Call', 'Email']),
    doNotCall: z.boolean().default(false),
    addDescription: optionalLongText,

    /** Admin-defined custom field values (validated against the form configuration by useRhfForm). */
    customFields: customFieldsSchema,
});

export type ContactFormSchemaType = z.infer<typeof contactFormSchema>;
