import { z } from 'zod';
import { FIELD_MAX_LENGTH as L } from '../../config/fieldLimits.js';
import {
    booleanQuery,
    createdWithinDaysQuery,
    enumWithDefault,
    optionalPhone,
    optionalText,
    phone,
    requiredText,
} from '../../validators/common.js';
import { corporateEmailListSchema } from '../shared/entityEmails.js';

const MAX_COMMUNICATION_TYPES = 10;

/** `ContactFormData` rules from frontend-crm/src/validations/contact.schema.ts. */
export const contactInputSchema = z.object({
    name: requiredText('Contact Name', L.personName),
    organizationName: requiredText('Organization Name', L.organizationName),
    organizationId: optionalText('Organization', 50),
    mobile: phone('Mobile'),
    officePhone: optionalPhone('Office Phone'),
    phone3: optionalPhone('Phone 3'),
    phone4: optionalPhone('Phone 4'),
    phone5: optionalPhone('Phone 5'),
    emailAddresses: corporateEmailListSchema.default([]).superRefine((emails, ctx) => {
        if (emails.length > 0 && !emails.some((row) => row.email)) {
            ctx.addIssue({ code: 'custom', message: 'Please provide at least one valid email address.' });
        }
    }),
    assignedTo: requiredText('Assigned Representative', L.username),
    isPrimaryContact: z.boolean().default(false),
    designation: optionalText('Designation', L.option),
    department: optionalText('Department', L.option),
    leftJob: enumWithDefault('Left Job', ['No', 'Yes'], 'No'),
    communicationType: z
        .array(z.string().trim().min(1).max(30))
        .max(MAX_COMMUNICATION_TYPES, { message: `At most ${MAX_COMMUNICATION_TYPES} communication types are allowed.` })
        .default(['Call', 'Email']),
    doNotCall: z.boolean().default(false),
    description: optionalText('Description', L.longText),
});

export type ContactInput = z.infer<typeof contactInputSchema>;

export const contactListQuerySchema = z.object({
    organizationId: z.string().trim().max(50).optional(),
    assignedTo: z.string().trim().max(L.username).optional(),
    isPrimaryContact: booleanQuery,
    /** Only contacts assigned to the signed-in user ("My Contacts"). */
    mine: booleanQuery,
    createdWithinDays: createdWithinDaysQuery,
});

export const CONTACT_SORT_FIELDS = [
    'createdAt',
    'updatedAt',
    'name',
    'contactCode',
    'organizationName',
    'designation',
    'department',
    'assignedTo',
    'mobile',
] as const;
