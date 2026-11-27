import { z } from 'zod';
import { FIELD_MAX_LENGTH as L } from '../../config/fieldLimits.js';
import { optionalPhone, requiredPersonName } from '../../validators/common.js';
import { clearable } from '../profile/profile.validator.js';
import { normalizeUserEmail, USER_EMAIL_MAX_LENGTH } from '../users/userEmail.service.js';
import { ROLE_NAME_MAX_LENGTH } from './roles.js';
import { normalizeUsername, usernameIssue } from './username.js';

/** Request schemas of /api/admin/users (Admin › Users). Bodies are strict: an unknown key is refused (400). */

export const DEPARTMENT_MAX_LENGTH = 50;
export const JOB_TITLE_MAX_LENGTH = 100;
export const ADMIN_USERS_MAX_PAGE_SIZE = 100;
export const ADMIN_USERS_DEFAULT_PAGE_SIZE = 25;
export const ADMIN_USER_STATUSES = ['active', 'inactive', 'all'] as const;
export type AdminUserStatus = (typeof ADMIN_USER_STATUSES)[number];

/** Trimmed with inner runs of spaces collapsed ("Sales   Manager" → "Sales Manager"). */
const tidy = (value: unknown) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value);

/** A label the admin picks or types (role, department, job title): tidied, non-blank, at most `max`. */
const label = (field: string, max: number) =>
    z.preprocess(
        tidy,
        z
            .string({ error: `${field} is required.` })
            .min(1, { message: `${field} is required.` })
            .max(max, { message: `${field} cannot exceed ${max} characters.` }),
    );

const username = z
    .string({ error: 'Username is required.' })
    .superRefine((value, ctx) => {
        const issue = usernameIssue(value);
        if (issue) ctx.addIssue({ code: 'custom', message: issue });
    })
    .transform(normalizeUsername);

/** An address under the company email rule (users/userEmail.service.ts): missing = unchanged, '' / null = none. */
const email = z
    .preprocess(
        (value) => (value === undefined ? undefined : normalizeUserEmail(value)),
        z
            .email({ message: 'Enter a valid email address.' })
            .max(USER_EMAIL_MAX_LENGTH, { message: `Email cannot exceed ${USER_EMAIL_MAX_LENGTH} characters.` })
            .nullable(),
    )
    .optional();

const userId = (field: string) => z.number({ error: `${field} must be a user id.` }).int({ message: `${field} must be a user id.` }).positive({ message: `${field} must be a user id.` });

const flag = (field: string) => z.boolean({ error: `${field} must be true or false.` });

/** A new user's work email: required, since their invite link is emailed there. */
const inviteEmail = z.preprocess(
    (value) => (value === undefined || value === null ? '' : normalizeUserEmail(value) ?? ''),
    z
        .string()
        .min(1, { message: 'Work email is required: the invite to set a password is sent there.' })
        .pipe(z.email({ message: 'Enter a valid email address.' }).max(USER_EMAIL_MAX_LENGTH, { message: `Email cannot exceed ${USER_EMAIL_MAX_LENGTH} characters.` })),
);

/** Fields an admin may set on create and edit. */
const editable = {
    firstName: requiredPersonName('First Name', L.personName),
    lastName: clearable(requiredPersonName('Last Name', L.personName)),
    email,
    /** Lets the admin save an address outside the company domains (e.g. a consultant's own domain). */
    allowOtherDomain: flag('Allow another domain').optional(),
    role: label('Role', ROLE_NAME_MAX_LENGTH),
    department: clearable(label('Department', DEPARTMENT_MAX_LENGTH)),
    jobTitle: clearable(label('Job title', JOB_TITLE_MAX_LENGTH)),
    reportsToId: clearable(userId('Reports to')),
    mobile: clearable(optionalPhone('Mobile')),
    officePhone: clearable(optionalPhone('Office Phone')),
    isGroupUser: flag('Group user').optional(),
};

/**
 * POST /api/admin/users. A new user is active and Invited: no password is set or shown here, they choose one from the
 * link emailed to `email` (required).
 */
export const createUserSchema = z.strictObject({
    username,
    ...editable,
    email: inviteEmail,
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

/** PATCH /api/admin/users/:id. Keys left out stay as they are; the username never changes. */
export const updateUserSchema = z.strictObject({
    ...editable,
    firstName: editable.firstName.optional(),
    role: editable.role.optional(),
    onLeave: flag('On leave').optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const userIdParamSchema = z.object({ id: z.coerce.number({ error: 'Invalid user id.' }).int().positive({ message: 'Invalid user id.' }) });

const optionalFilter = (max: number) => z.preprocess(tidy, z.string().max(max).optional()).transform((value) => value || undefined);

/** GET /api/admin/users. Unknown or bad values fall back to the defaults rather than failing the list. */
export const listUsersQuerySchema = z.object({
    search: optionalFilter(100).catch(undefined),
    status: z.enum(ADMIN_USER_STATUSES).catch('active').default('active'),
    role: optionalFilter(ROLE_NAME_MAX_LENGTH).catch(undefined),
    department: optionalFilter(DEPARTMENT_MAX_LENGTH).catch(undefined),
    page: z.coerce.number().int().min(1).catch(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(ADMIN_USERS_MAX_PAGE_SIZE).catch(ADMIN_USERS_DEFAULT_PAGE_SIZE).default(ADMIN_USERS_DEFAULT_PAGE_SIZE),
});
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
