import { z } from 'zod';
import { FIELD_MAX_LENGTH as L } from '../../config/fieldLimits.js';
import {
    booleanQuery,
    createdWithinDaysQuery,
    csvQuery,
    customFieldsSchema,
    enumWithDefault,
    optionalPhone,
    optionalText,
    phone,
    requiredPersonName,
    requiredText,
    requiredUpperText,
} from '../../validators/common.js';
import { corporateEmailListSchema } from '../shared/entityEmails.js';

/** The `referral_status` options (fixed). Only Active referrals are offered as Referred By. */
export const REFERRAL_STATUSES = ['Active', 'Inactive'] as const;
export type ReferralStatus = (typeof REFERRAL_STATUSES)[number];
export const ACTIVE_REFERRAL_STATUS: ReferralStatus = 'Active';

/**
 * `ReferralFormData` rules from frontend-crm/src/validations/referral.schema.ts: the Contact form's rules
 * (contact.validator.ts) for the fields a referral shares with a contact, plus its Status.
 */
export const referralInputSchema = z.object({
    name: requiredPersonName('Name', L.personName),
    organizationName: requiredUpperText('Organization Name', L.organizationName),
    organizationId: optionalText('Organization', 50),
    mobile: phone('Mobile'),
    officePhone: optionalPhone('Office Phone'),
    emailAddress: corporateEmailListSchema.default([]).superRefine((emails, ctx) => {
        if (emails.length > 0 && !emails.some((row) => row.email)) {
            ctx.addIssue({ code: 'custom', message: 'Please provide at least one valid email address.' });
        }
    }),
    assignedTo: requiredText('Assigned Representative', L.username),
    designation: optionalText('Designation', L.option),
    department: optionalText('Department', L.option),
    status: enumWithDefault('Status', REFERRAL_STATUSES, ACTIVE_REFERRAL_STATUS),
    customFields: customFieldsSchema,
});

export type ReferralInput = z.infer<typeof referralInputSchema>;

export const referralListQuerySchema = z.object({
    /** `?status=Active` lists the referrals the Referred By picker offers. */
    status: csvQuery,
    organizationId: z.string().trim().max(50).optional(),
    assignedTo: z.string().trim().max(L.username).optional(),
    /** Only referrals assigned to the signed-in user ("My Referrals"). */
    mine: booleanQuery,
    createdWithinDays: createdWithinDaysQuery,
});

export const REFERRAL_SORT_FIELDS = [
    'createdAt',
    'updatedAt',
    'name',
    'organizationName',
    'designation',
    'department',
    'assignedTo',
    'mobile',
    'status',
] as const;
