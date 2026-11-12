import { z } from 'zod';
import { booleanQuery } from '../../validators/common.js';
import { documentSchema, savedItemContentSchema } from './document/index.js';
import { PDF_MODULES } from './pdf.types.js';

/** Zod schemas for /api/pdf-templates, /api/pdf-saved-items, /api/pdf-assets and /api/quotations/:id/pdf. */

export const pdfModuleSchema = z.enum(PDF_MODULES, { error: `module must be one of: ${PDF_MODULES.join(', ')}.` });

const name = z
    .string({ error: 'Name is required.' })
    .trim()
    .min(1, { message: 'Name is required.' })
    .max(120, { message: 'Name cannot exceed 120 characters.' });

const description = z.preprocess(
    (value) => (value === null ? '' : value),
    z.string().trim().max(500, { message: 'Description cannot exceed 500 characters.' }).optional(),
);

export const templateCreateSchema = z.object({
    name,
    module: pdfModuleSchema,
    description,
    isActive: z.boolean().default(true),
    isDefault: z.boolean().default(false),
    document: documentSchema,
});
export type TemplateCreateInput = z.infer<typeof templateCreateSchema>;

export const templateUpdateSchema = z.object({
    version: z.number({ error: 'version is required (reload the template and try again).' }).int().min(1),
    name: name.optional(),
    description,
    isActive: z.boolean().optional(),
    isDefault: z.boolean().optional(),
    document: documentSchema.optional(),
});
export type TemplateUpdateInput = z.infer<typeof templateUpdateSchema>;

export const previewBodySchema = z.object({
    module: pdfModuleSchema,
    document: documentSchema,
    recordId: z.preprocess((value) => (value === '' || value === null ? undefined : value), z.string().trim().min(1).max(50).optional()),
});
export type PreviewBody = z.infer<typeof previewBodySchema>;

export const contextQuerySchema = z.object({
    module: pdfModuleSchema.default('QUOTATION'),
    recordId: z.preprocess((value) => (value === '' ? undefined : value), z.string().trim().min(1).max(50).optional()),
});

export const savedItemCreateSchema = z.object({
    module: pdfModuleSchema,
    name,
    content: savedItemContentSchema,
});
export const savedItemListQuerySchema = z.object({ module: pdfModuleSchema.default('QUOTATION') });

export const listQuerySchema = z.object({
    module: pdfModuleSchema.optional(),
    includeInactive: booleanQuery.optional(),
});

export const fieldsQuerySchema = z.object({ module: pdfModuleSchema.default('QUOTATION') });

export const duplicateBodySchema = z.object({ name: name.optional() });

export const activeBodySchema = z.object({ isActive: z.boolean({ error: 'isActive must be true or false.' }) });

export const recordPdfQuerySchema = z.object({
    templateId: z.preprocess((value) => (value === '' ? undefined : value), z.string().trim().min(1).max(50).optional()),
    disposition: z.enum(['inline', 'attachment']).default('inline'),
});

// ─── Assets ─────────────────────────────────────────────────────────────────────

export const ASSET_MAX_BYTES = 1024 * 1024;

export const assetUploadSchema = z.object({
    fileName: z.string().trim().min(1, { message: 'File name is required.' }).max(200),
    mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp'], { error: 'Only PNG, JPEG or WebP images are allowed.' }),
    /** Base64 (optionally a full data: URI). */
    data: z
        .string({ error: 'Image data is required.' })
        .min(8, { message: 'Image data is required.' })
        .max(Math.ceil((ASSET_MAX_BYTES * 4) / 3) + 128, { message: 'Images cannot exceed 1 MB.' }),
    key: z.preprocess(
        (value) => (value === '' || value === null ? undefined : value),
        z.string().trim().regex(/^[a-z0-9][a-z0-9_.-]{0,59}$/i, { message: 'Key may only contain letters, digits, ".", "_" and "-".' }).optional(),
    ),
});
export type AssetUploadInput = z.infer<typeof assetUploadSchema>;

export const assetKeyParamSchema = z.object({ key: z.string().trim().regex(/^[\w.-]{1,80}$/, { message: 'Invalid asset key.' }) });
