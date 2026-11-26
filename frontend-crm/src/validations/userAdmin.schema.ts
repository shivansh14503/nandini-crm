import { z } from 'zod';
import { FIELD_MAX_LENGTH as L } from '../config/fieldLimits';
import { DEPARTMENT_MAX_LENGTH, JOB_TITLE_MAX_LENGTH } from '../types/userAdmin.types';
import { formatPersonName } from '../utils/personName';
import { ROLE_NAME_MAX_LENGTH } from '../utils/roleAccess';
import { normalizeUsername, usernameIssue } from '../utils/username';
import { optionalText, requiredText, zodEmailOptional, zodPhoneOptional } from './common';

/**
 * Admin › Users › Add / Edit user. Mirrors backend `user-admin` validator: names in name case (the same rules as My
 * Profile), phones in E.164, the username rules (utils/username), the role / department / job title limits. The
 * company-domain and uniqueness rules for email are the API's (it answers on the `email` field).
 */

export type UserFormMode = 'create' | 'edit';
export type PasswordMode = 'generate' | 'set';

const isCompanyAddress = (email: string, domains: readonly string[]) => {
    const at = email.lastIndexOf('@');
    const domain = at === -1 ? '' : email.slice(at + 1).trim().toLowerCase();
    return domain !== '' && domains.some((d) => d.toLowerCase() === domain);
};

/** Whether an address needs "allow another domain" (it isn't on a company domain). */
export const needsOtherDomain = (email: string, domains: readonly string[]) => email.trim() !== '' && email.includes('@') && !isCompanyAddress(email, domains);

export function userFormSchema({
    mode,
    companyDomains,
    passwordIssue,
}: {
    mode: UserFormMode;
    companyDomains: readonly string[];
    /** The first password rule a typed password breaks (needs the username), or null. */
    passwordIssue: (password: string, username: string) => string | null;
}) {
    return z
        .object({
            firstName: requiredText('First Name', L.personName).transform(formatPersonName),
            lastName: optionalText('Last Name', L.personName).transform((v) => (v ? formatPersonName(v) : '')),
            username: z.string().transform(normalizeUsername),
            email: zodEmailOptional,
            allowOtherDomain: z.boolean(),
            passwordMode: z.enum(['generate', 'set']),
            password: z.string(),
            role: requiredText('Role', ROLE_NAME_MAX_LENGTH).transform((v) => v.replace(/\s+/g, ' ')),
            jobTitle: optionalText('Job title', JOB_TITLE_MAX_LENGTH),
            department: optionalText('Department', DEPARTMENT_MAX_LENGTH),
            reportsToId: z.number().int().positive().nullable(),
            mobile: zodPhoneOptional,
            officePhone: zodPhoneOptional,
            isGroupUser: z.boolean(),
            onLeave: z.boolean(),
        })
        .superRefine((values, ctx) => {
            if (mode === 'create') {
                const issue = usernameIssue(values.username);
                if (issue) ctx.addIssue({ code: 'custom', message: issue, path: ['username'] });
                if (values.passwordMode === 'set') {
                    const pwIssue = values.password ? passwordIssue(values.password, values.username) : 'Type a password, or generate one.';
                    if (pwIssue) ctx.addIssue({ code: 'custom', message: pwIssue, path: ['password'] });
                }
            }
            // Same rule as My Profile: the full name (first + ' ' + last) fits the 100-character column.
            const fullName = `${values.firstName} ${values.lastName ?? ''}`.trim();
            if (fullName.length > L.personName) {
                ctx.addIssue({
                    code: 'custom',
                    message: `First and last name together cannot exceed ${L.personName - 1} characters.`,
                    path: [values.lastName ? 'lastName' : 'firstName'],
                });
            }
            if (values.email && !values.allowOtherDomain && needsOtherDomain(values.email, companyDomains)) {
                const list = companyDomains.map((d) => `@${d}`).join(', ');
                ctx.addIssue({
                    code: 'custom',
                    message: list ? `Use a company address (${list}), or allow another domain.` : 'No company domain is set: tick "Allow another domain" to save this address.',
                    path: ['email'],
                });
            }
        });
}

export type UserFormSchema = ReturnType<typeof userFormSchema>;
/** Form values (what the inputs hold). */
export type UserFormData = z.input<UserFormSchema>;
/** Parsed values (trimmed, name-cased, E.164). */
export type UserFormOutput = z.output<UserFormSchema>;
