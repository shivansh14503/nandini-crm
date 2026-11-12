import type { PdfDocument, SavedItemContent } from '@/lib/pdf-document';

/** Mirrors backend-crm/src/modules/pdf (pdf.types.ts, pdfTemplate.mapper.ts, pdfSavedItem.service.ts). */

export const PDF_MODULES = ['QUOTATION'] as const;
export type PdfModule = (typeof PDF_MODULES)[number];

export const PDF_MODULE_LABELS: Record<PdfModule, string> = {
    QUOTATION: 'Quotation',
};

export const PAGE_SIZES = ['A4', 'Letter', 'Legal'] as const;
export type PageSize = (typeof PAGE_SIZES)[number];

export const ORIENTATIONS = ['portrait', 'landscape'] as const;
export type Orientation = (typeof ORIENTATIONS)[number];

export type PdfFieldGroup =
    | 'Company'
    | 'Customer'
    | 'Billing Address'
    | 'Shipping Address'
    | 'Quotation'
    | 'Sales Person'
    | 'Totals'
    | 'Terms'
    | 'Custom Fields';

export type PdfFieldType = 'text' | 'date' | 'currency' | 'number' | 'multiline' | 'boolean' | 'image';

export interface PdfFieldDefinition {
    key: string;
    path: string;
    label: string;
    group: PdfFieldGroup;
    type: PdfFieldType;
    defaultVisible: boolean;
}

export interface LineItemColumnDefinition {
    key: string;
    label: string;
    defaultVisible: boolean;
    align: 'left' | 'right' | 'center';
    widthPct?: number;
}

export interface PdfFieldRegistry {
    module: PdfModule;
    fields: PdfFieldDefinition[];
    lineItemColumns: LineItemColumnDefinition[];
}

export interface PdfTemplateListItem {
    id: string;
    name: string;
    module: PdfModule;
    description: string;
    isSystem: boolean;
    isDefault: boolean;
    isActive: boolean;
    pageSize: PageSize;
    orientation: Orientation;
    version: number;
    createdBy: string;
    updatedBy: string;
    createdAt: string;
    updatedAt: string;
}

export interface PdfTemplate extends PdfTemplateListItem {
    document: PdfDocument;
}

export interface PdfTemplateCreateInput {
    name: string;
    module: PdfModule;
    description: string;
    isActive: boolean;
    isDefault: boolean;
    document: PdfDocument;
}

export type PdfTemplateUpdateInput = Partial<Omit<PdfTemplateCreateInput, 'module'>> & { version: number };

export type PdfDisposition = 'inline' | 'attachment';

export interface PdfAsset {
    key: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    url: string;
    createdAt: string;
}

export interface PdfBlobResult {
    blob: Blob;
    fileName: string;
}

export interface PdfSavedItem {
    id: string;
    module: PdfModule;
    name: string;
    kind: 'section' | 'block';
    content: SavedItemContent;
    createdBy: string;
    createdAt: string;
}

/** The record (or sample) context the builder canvas renders with (PdfContext on the server). */
export type PdfRenderContext = Record<string, unknown>;
