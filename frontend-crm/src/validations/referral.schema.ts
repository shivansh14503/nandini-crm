import { z } from 'zod';
import { FIELD_MAX_LENGTH as L } from '../config/fieldLimits';
import { requiredString, optionalString, requiredText, zodPhone, zodPhoneOptional, customFieldsSchema } from './common';
import { corporateEmailSchema } from './contact.schema';
import { REFERRAL_STATUSES } from '../types/referral.types';

/**
 * Mirrors backend-crm/src/modules/referrals/referral.validator.ts: the Contact form's rules (contact.schema.ts) for
 * the fields a referral shares with a contact, plus its Status (Active / Inactive).
 */
export const referralFormSchema = z.object({
    name: requiredText('Name', L.personName),
    organizationName: requiredText('Organization Name', L.organizationName),
    organizationId: optionalString,
    mobile: zodPhone,
    officePhone: zodPhoneOptional,
    emailAddress: z.array(corporateEmailSchema).superRefine((emails, ctx) => {
        // If emails are present, ensure at least one has a non-empty address (as on contacts).
        if (emails.length > 0 && !emails.some((e) => (e.email || '').trim().length > 0)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Please provide at least one valid email address.' });
        }
    }),
    assignedTo: requiredString('Assigned Representative'),
    designation: optionalString,
    department: optionalString,
    status: z.enum(REFERRAL_STATUSES).default('Active'),

    /** Admin-defined custom field values (validated against the form configuration by useRhfForm). */
    customFields: customFieldsSchema,
});

export type ReferralFormSchemaType = z.infer<typeof referralFormSchema>;
