import { z } from 'zod';
import {
    requiredString,
    optionalString,
    phoneSchema,
    requiredPhoneSchema,
    emailSchema,
} from './common';

export const corporateEmailSchema = z.object({
    id: z.string(),
    email: emailSchema,
    isPrimary: z.boolean().default(false),
    isOptedOut: z.boolean().default(false),
    isInvalidBounce: z.boolean().default(false),
});

export const contactFormSchema = z.object({
    name: requiredString('Contact Name')
        .max(100, { message: 'Contact Name cannot exceed 100 characters.' }),
    organizationName: requiredString('Organization Name'),
    mobile: requiredPhoneSchema('Mobile Number'),
    officePhone: phoneSchema('Office Phone Number').optional().or(z.literal('')),
    phone3: phoneSchema('Phone 3 Number').optional().or(z.literal('')),
    phone4: phoneSchema('Phone 4 Number').optional().or(z.literal('')),
    phone5: phoneSchema('Phone 5 Number').optional().or(z.literal('')),
    emailAddresses: z.array(corporateEmailSchema).superRefine((emails, ctx) => {
        // If emails are present, ensure at least one has a non-empty address
        if (emails.length > 0) {
            const hasValidEmail = emails.some((e) => e.email.trim().length > 0);
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
    location: optionalString,
    leftJob: z.enum(['No', 'Yes']).default('No'),
    communicationType: z.array(z.string()).default(['Call', 'Email']),
    doNotCall: z.boolean().default(false),
    description: optionalString,
});

export type ContactFormSchemaType = z.infer<typeof contactFormSchema>;
