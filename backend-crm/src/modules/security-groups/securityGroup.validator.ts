import { z } from 'zod';

/** Request schemas of /api/admin/security-groups (Admin › Security Groups). Bodies are strict: an unknown key is refused (400). */

export const SECURITY_GROUP_NAME_MAX_LENGTH = 100;

const tidy = (value: unknown) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value);

const name = z.preprocess(
    tidy,
    z
        .string({ error: 'Group Name is required.' })
        .min(1, { message: 'Group Name is required.' })
        .max(SECURITY_GROUP_NAME_MAX_LENGTH, { message: `Group Name cannot exceed ${SECURITY_GROUP_NAME_MAX_LENGTH} characters.` }),
);

const description = z.preprocess(
    (value) => (typeof value === 'string' ? value.trim() || null : value),
    // Long text: no character limit (NVARCHAR(MAX)).
    z.string().nullable(),
);

const parentId = z.number().int().positive().nullable();

/** User ids (Admin › Users), each at most once. */
const userIds = z
    .array(z.number().int().positive())
    .max(5000)
    .transform((ids) => [...new Set(ids)]);

export const createSecurityGroupSchema = z.strictObject({
    name,
    description: description.optional(),
    parentId: parentId.optional(),
    memberIds: userIds.optional(),
});

export const updateSecurityGroupSchema = z.strictObject({
    name: name.optional(),
    description: description.optional(),
    parentId: parentId.optional(),
    /** False archives the group: it keeps its members but grants nothing. */
    isActive: z.boolean().optional(),
});

/** Replaces the member list (the dialog's picker sends the whole list). */
export const setSecurityGroupMembersSchema = z.strictObject({ memberIds: userIds });

export const securityGroupIdParamSchema = z.object({ id: z.coerce.number().int().positive() });

export type CreateSecurityGroupInput = z.infer<typeof createSecurityGroupSchema>;
export type UpdateSecurityGroupInput = z.infer<typeof updateSecurityGroupSchema>;
export type SetSecurityGroupMembersInput = z.infer<typeof setSecurityGroupMembersSchema>;
