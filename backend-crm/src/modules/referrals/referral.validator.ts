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
    optionalUpperText,
    phone,
    requiredPersonName,
    requiredText,
} from '../../validators/common.js';
import { corporateEmailListSchema } from '../shared/entityEmails.js';

/** The `referral_status` options (fixed). Only Active referrals are offered as Referred By. */
export const REFERRAL_STATUSES = ['Active', 'Inactive'] as const;
export type ReferralStatus = (typeof REFERRAL_STATUSES)[number];
export const ACTIVE_REFERRAL_STATUS: ReferralStatus = 'Active';
/** Whether a stored status is Active (ignoring case and spaces, as the default SQL Server collation compares). */
export const isActiveReferralStatus = (status: string | null | undefined): boolean =>
    (status ?? '').trim().toLowerCase() === ACTIVE_REFERRAL_STATUS.toLowerCase();

/**
 * `ReferralFormData` rules from frontend-crm/src/validations/referral.schema.ts: the Contact form's rules
 * (contact.validator.ts) for the fields a referral shares with a contact, plus a free-text Company Name and Status.
 */
export const referralInputSchema = z.object({
    name: requiredPersonName('Name', L.personName),
    /** Free text, stored uppercase like other company names (not linked to an organization). */
    companyName: optionalUpperText('Company Name', L.organizationName),
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
    assignedTo: z.string().trim().max(L.username).optional(),
    /** Only referrals assigned to the signed-in user ("My Referrals"). */
    mine: booleanQuery,
    createdWithinDays: createdWithinDaysQuery,
});

export const REFERRAL_SORT_FIELDS = [
    'createdAt',
    'updatedAt',
    'name',
    'companyName',
    'designation',
    'department',
    'assignedTo',
    'mobile',
    'status',
] as const;
