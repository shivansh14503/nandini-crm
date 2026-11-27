import { z } from 'zod';

/** Request schemas of /api/admin/roles (Admin › Roles). Bodies are strict: an unknown key is refused (400). */

export const ROLE_NAME_MAX_LENGTH = 50;
export const ROLE_DESCRIPTION_MAX_LENGTH = 500;

const tidy = (value: unknown) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value);

const name = z.preprocess(
    tidy,
    z
        .string({ error: 'Role Name is required.' })
        .min(1, { message: 'Role Name is required.' })
        .max(ROLE_NAME_MAX_LENGTH, { message: `Role Name cannot exceed ${ROLE_NAME_MAX_LENGTH} characters.` }),
);

const description = z.preprocess(
    (value) => (typeof value === 'string' ? value.trim() || null : value),
    z.string().max(ROLE_DESCRIPTION_MAX_LENGTH, { message: `Description cannot exceed ${ROLE_DESCRIPTION_MAX_LENGTH} characters.` }).nullable(),
);

/** Any object; `normalizePermissions` makes it complete and consistent. */
const permissions = z.record(z.string(), z.record(z.string(), z.string()));

export const createRoleSchema = z.strictObject({
    name,
    description: description.optional(),
    adminPanel: z.boolean().optional(),
    permissions,
});

export const updateRoleSchema = z.strictObject({
    name: name.optional(),
    description: description.optional(),
    adminPanel: z.boolean().optional(),
    permissions: permissions.optional(),
});

export const deleteRoleSchema = z.object({
    /** Where the role's users move (required when it has any). */
    reassignTo: z.coerce.number().int().positive().optional(),
});

export const roleIdParamSchema = z.object({ id: z.coerce.number().int().positive() });

export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
export type DeleteRoleInput = z.infer<typeof deleteRoleSchema>;
