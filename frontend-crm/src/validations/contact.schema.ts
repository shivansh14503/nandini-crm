import { z } from 'zod';
import {
    requiredString,
    optionalString,
    zodPhone,
    zodPhoneOptional,
    zodEmailOptional,
} from './common';

export const corporateEmailSchema = z.object({
    id: z.string(),
    email: zodEmailOptional,
    isPrimary: z.boolean().default(false),
    isOptedOut: z.boolean().default(false),
    isInvalidBounce: z.boolean().default(false),
});

export const contactFormSchema = z.object({
    name: requiredString('Contact Name')
        .max(100, { message: 'Contact Name cannot exceed 100 characters.' }),
    organizationName: requiredString('Organization Name'),
    mobile: zodPhone,
    officePhone: zodPhoneOptional,
    phone3: zodPhoneOptional,
    phone4: zodPhoneOptional,
    phone5: zodPhoneOptional,
    emailAddresses: z.array(corporateEmailSchema).superRefine((emails, ctx) => {
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
    location: optionalString,
    leftJob: z.enum(['No', 'Yes']).default('No'),
    communicationType: z.array(z.string()).default(['Call', 'Email']),
    doNotCall: z.boolean().default(false),
    description: optionalString,
});

export type ContactFormSchemaType = z.infer<typeof contactFormSchema>;
