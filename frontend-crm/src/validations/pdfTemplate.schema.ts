import { z } from 'zod';
import { ORIENTATIONS, PAGE_SIZES, PDF_MODULES } from '@/types/pdfTemplate.types';

/** Mirrors backend-crm/src/modules/pdf/pdfTemplate.validator.ts (the API re-validates and sanitizes everything). */

const KB = 1024;
export const TEMPLATE_SIZE_LIMITS = { body: 500 * KB, header: 100 * KB, footer: 100 * KB, css: 100 * KB } as const;

const byteLength = (value: string) => new TextEncoder().encode(value).length;

const sizeLimited = (field: string, maxBytes: number) =>
    z.string().refine((value) => byteLength(value) <= maxBytes, { message: `${field} cannot exceed ${Math.round(maxBytes / KB)} KB.` });

const margin = (field: string) =>
    z
        .number({ error: `${field} must be a number.` })
        .min(0, { message: `${field} cannot be negative.` })
        .max(100, { message: `${field} cannot exceed 100 mm.` });

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export const pdfTemplateFormSchema = z.object({
    name: z.string().trim().min(1, { message: 'Name is required.' }).max(120, { message: 'Name cannot exceed 120 characters.' }),
    module: z.enum(PDF_MODULES),
    description: z.string().trim().max(500, { message: 'Description cannot exceed 500 characters.' }),
    isActive: z.boolean(),
    isDefault: z.boolean(),
    pageSize: z.enum(PAGE_SIZES),
    orientation: z.enum(ORIENTATIONS),
    margins: z.object({
        top: margin('Top margin'),
        right: margin('Right margin'),
        bottom: margin('Bottom margin'),
        left: margin('Left margin'),
        header: margin('Header margin'),
        footer: margin('Footer margin'),
    }),
    headerHtml: sizeLimited('Header', TEMPLATE_SIZE_LIMITS.header),
    bodyHtml: sizeLimited('Body', TEMPLATE_SIZE_LIMITS.body).refine((value) => value.trim().length > 0, { message: 'Body is required.' }),
    footerHtml: sizeLimited('Footer', TEMPLATE_SIZE_LIMITS.footer),
    css: sizeLimited('CSS', TEMPLATE_SIZE_LIMITS.css),
    fieldVisibility: z.object({
        fields: z.record(z.string(), z.boolean()),
        lineItemColumns: z.array(
            z.object({
                key: z.string().min(1).max(40),
                label: z.string().trim().max(60, { message: 'Column labels cannot exceed 60 characters.' }),
                visible: z.boolean(),
                order: z.number().int().min(0),
                widthPct: z.number().min(1).max(100).optional(),
            }),
        ),
    }),
    branding: z.object({
        accentColor: z.string().trim().regex(HEX_COLOR, { message: 'Use a hex colour such as #1d4ed8.' }),
        logoAssetKey: z.string().optional(),
        companyName: z.string().trim().max(200),
        companyAddress: z.string().trim().max(1000),
        companyPhone: z.string().trim().max(60),
        companyEmail: z.union([z.literal(''), z.email({ message: 'Enter a valid email address.' }).max(120)]),
        companyGstin: z.string().trim().max(20),
        companyWebsite: z.string().trim().max(200),
    }),
});

export type PdfTemplateFormValues = z.infer<typeof pdfTemplateFormSchema>;
