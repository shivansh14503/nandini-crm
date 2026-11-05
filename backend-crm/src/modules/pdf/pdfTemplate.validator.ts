import { z } from 'zod';
import { booleanQuery } from '../../validators/common.js';
import { ORIENTATIONS, PAGE_SIZES, PDF_MODULES } from './pdf.types.js';
import { byteLength, TEMPLATE_SIZE_LIMITS } from './sanitize.js';

/** Zod schemas for /api/pdf-templates, /api/pdf-assets and /api/quotations/:id/pdf. */

const sizeLimited = (field: string, maxBytes: number) =>
    z
        .string({ error: `${field} must be text.` })
        .refine((value) => byteLength(value) <= maxBytes, { message: `${field} cannot exceed ${Math.round(maxBytes / 1024)} KB.` });

const optionalPart = (field: string, maxBytes: number) =>
    z.preprocess((value) => (value === null ? '' : value), sizeLimited(field, maxBytes).optional());

const margin = (field: string) =>
    z.coerce
        .number({ error: `${field} must be a number.` })
        .refine(Number.isFinite, { message: `${field} must be a number.` })
        .min(0, { message: `${field} cannot be negative.` })
        .max(100, { message: `${field} cannot exceed 100 mm.` })
        .transform((value) => Math.round(value * 10) / 10);

export const pdfModuleSchema = z.enum(PDF_MODULES, { error: `module must be one of: ${PDF_MODULES.join(', ')}.` });

export const marginsSchema = z.object({
    top: margin('Top margin'),
    right: margin('Right margin'),
    bottom: margin('Bottom margin'),
    left: margin('Left margin'),
    header: margin('Header margin'),
    footer: margin('Footer margin'),
});

const columnSettingSchema = z.object({
    key: z.string().trim().min(1).max(40),
    label: z.string().trim().max(60),
    visible: z.boolean(),
    order: z.number().int().min(0).max(100),
    widthPct: z.number().min(1).max(100).optional(),
});

export const fieldVisibilitySchema = z.object({
    fields: z.record(z.string().trim().min(1).max(80), z.boolean()).refine((value) => Object.keys(value).length <= 500, { message: 'Too many fields.' }),
    lineItemColumns: z.array(columnSettingSchema).max(40),
});

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export const brandingSchema = z.object({
    accentColor: z.string().trim().regex(HEX_COLOR, { message: 'Accent colour must be a hex colour such as #1d4ed8.' }),
    logoAssetKey: z.preprocess(
        (value) => (value === null || value === '' ? undefined : value),
        z.string().trim().regex(/^[\w.-]{1,80}$/, { message: 'Invalid logo asset key.' }).optional(),
    ),
    companyName: z.string().trim().max(200),
    companyAddress: z.string().trim().max(1000),
    companyPhone: z.string().trim().max(60),
    companyEmail: z.string().trim().max(120),
    companyGstin: z.string().trim().max(20),
    companyWebsite: z.string().trim().max(200),
});

const name = z
    .string({ error: 'Name is required.' })
    .trim()
    .min(1, { message: 'Name is required.' })
    .max(120, { message: 'Name cannot exceed 120 characters.' });

const description = z.preprocess(
    (value) => (value === null ? '' : value),
    z.string().trim().max(500, { message: 'Description cannot exceed 500 characters.' }).optional(),
);

/** Template content shared by create, update and preview drafts. */
const templateContentShape = {
    pageSize: z.enum(PAGE_SIZES, { error: `Page size must be one of: ${PAGE_SIZES.join(', ')}.` }),
    orientation: z.enum(ORIENTATIONS, { error: 'Orientation must be portrait or landscape.' }),
    margins: marginsSchema,
    headerHtml: optionalPart('Header', TEMPLATE_SIZE_LIMITS.header),
    bodyHtml: sizeLimited('Body', TEMPLATE_SIZE_LIMITS.body).refine((value) => value.trim().length > 0, { message: 'Body is required.' }),
    footerHtml: optionalPart('Footer', TEMPLATE_SIZE_LIMITS.footer),
    css: optionalPart('CSS', TEMPLATE_SIZE_LIMITS.css),
    fieldVisibility: fieldVisibilitySchema.optional(),
    branding: brandingSchema.optional(),
};

export const templateCreateSchema = z.object({
    name,
    module: pdfModuleSchema,
    description,
    isActive: z.boolean().default(true),
    isDefault: z.boolean().default(false),
    ...templateContentShape,
});
export type TemplateCreateInput = z.infer<typeof templateCreateSchema>;

export const templateUpdateSchema = z.object({
    version: z.number({ error: 'version is required (reload the template and try again).' }).int().min(1),
    name: name.optional(),
    description,
    isActive: z.boolean().optional(),
    isDefault: z.boolean().optional(),
    pageSize: templateContentShape.pageSize.optional(),
    orientation: templateContentShape.orientation.optional(),
    margins: marginsSchema.optional(),
    headerHtml: templateContentShape.headerHtml,
    bodyHtml: templateContentShape.bodyHtml.optional(),
    footerHtml: templateContentShape.footerHtml,
    css: templateContentShape.css,
    fieldVisibility: fieldVisibilitySchema.optional(),
    branding: brandingSchema.optional(),
});
export type TemplateUpdateInput = z.infer<typeof templateUpdateSchema>;

export const templateDraftSchema = z.object({
    id: z.string().trim().max(50).optional(),
    module: pdfModuleSchema,
    name: z.string().trim().max(120).optional(),
    ...templateContentShape,
});
export type TemplateDraft = z.infer<typeof templateDraftSchema>;

export const previewBodySchema = z.object({
    template: templateDraftSchema,
    recordId: z.preprocess((value) => (value === '' || value === null ? undefined : value), z.string().trim().min(1).max(50).optional()),
    format: z.enum(['html', 'pdf']).default('html'),
});
export type PreviewBody = z.infer<typeof previewBodySchema>;

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
