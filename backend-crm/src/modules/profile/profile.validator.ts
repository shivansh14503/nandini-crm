import { z } from 'zod';
import { FIELD_MAX_LENGTH as L } from '../../config/fieldLimits.js';
import { optionalPhone, requiredPersonName } from '../../validators/common.js';

/** Request schemas of /api/me (My Profile) and /api/user-photos. */

const isBlank = (value: unknown) => value === null || (typeof value === 'string' && value.trim() === '');

/**
 * A field the user may clear: missing → undefined (left as it is), '' / null → null (cleared), anything else checked
 * by `schema`.
 */
const clearable = <T extends z.ZodType>(schema: T) => z.preprocess((value) => (isBlank(value) ? null : value), schema.nullable()).optional();

/**
 * PATCH /api/me/profile. Only these four fields are the user's to change (role, department, email and username are
 * admin-managed); any other key is refused. Names are name-cased like every person-name field (formatPersonName).
 */
export const profileUpdateSchema = z.strictObject({
    firstName: requiredPersonName('First Name', L.personName).optional(),
    lastName: clearable(requiredPersonName('Last Name', L.personName)),
    mobile: clearable(optionalPhone('Mobile')),
    officePhone: clearable(optionalPhone('Office Phone')),
});
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

/** Largest profile photo kept (the crop dialog sends a 256 × 256 WebP / JPEG, far below this). */
export const PHOTO_MAX_BYTES = 512 * 1024;
export const PHOTO_MAX_LABEL = '512 KB';
/** Longest base64 payload accepted (the encoding grows data by 4/3; a little room for padding and line breaks). */
export const PHOTO_MAX_BASE64_CHARS = Math.ceil((PHOTO_MAX_BYTES * 4) / 3) + 128;
export const PHOTO_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type PhotoMimeType = (typeof PHOTO_MIME_TYPES)[number];

/**
 * PUT /api/me/photo: `data` is base64 or a data: URI. Type and size are checked by the service (from the decoded
 * bytes) so the answer carries INVALID_IMAGE / IMAGE_TOO_LARGE; here only the shape. `data` is bounded by the 1 MB
 * body parser.
 */
export const photoUploadSchema = z.object({
    mimeType: z.string({ error: 'mimeType is required.' }).trim().max(100),
    data: z.string({ error: 'Photo data is required.' }).min(1, { message: 'Photo data is required.' }),
    fileName: z.string().trim().max(200).optional(),
});
export type PhotoUploadInput = z.infer<typeof photoUploadSchema>;

const uuid = (what: string) => z.uuid({ message: `Invalid ${what} id.` });

/** DELETE /api/me/sessions/:id (a session's JWT id). */
export const sessionIdParamSchema = z.object({ id: uuid('session') });

/** GET /api/user-photos/:id. */
export const photoIdParamSchema = z.object({ id: uuid('photo') });
