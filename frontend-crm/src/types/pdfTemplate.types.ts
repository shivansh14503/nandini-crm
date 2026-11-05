/** Mirrors backend-crm/src/modules/pdf (pdf.types.ts, pdfTemplate.mapper.ts). */

export const PDF_MODULES = ['QUOTATION'] as const;
export type PdfModule = (typeof PDF_MODULES)[number];

export const PDF_MODULE_LABELS: Record<PdfModule, string> = {
    QUOTATION: 'Quotation',
};

export const PAGE_SIZES = ['A4', 'Letter', 'Legal'] as const;
export type PageSize = (typeof PAGE_SIZES)[number];

export const ORIENTATIONS = ['portrait', 'landscape'] as const;
export type Orientation = (typeof ORIENTATIONS)[number];

export interface PdfMargins {
    top: number;
    right: number;
    bottom: number;
    left: number;
    header: number;
    footer: number;
}

export interface LineItemColumnSetting {
    key: string;
    label: string;
    visible: boolean;
    order: number;
    widthPct?: number;
}

export interface FieldVisibility {
    fields: Record<string, boolean>;
    lineItemColumns: LineItemColumnSetting[];
}

export interface Branding {
    accentColor: string;
    logoAssetKey?: string;
    companyName: string;
    companyAddress: string;
    companyPhone: string;
    companyEmail: string;
    companyGstin: string;
    companyWebsite: string;
}

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

export type PdfFieldType = 'text' | 'date' | 'currency' | 'number' | 'multiline' | 'boolean';

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
    margins: PdfMargins;
    headerHtml: string;
    bodyHtml: string;
    footerHtml: string;
    css: string;
    fieldVisibility: FieldVisibility;
    branding: Branding;
}

/** Editable template content (create / update / preview drafts). */
export interface PdfTemplateContent {
    pageSize: PageSize;
    orientation: Orientation;
    margins: PdfMargins;
    headerHtml: string;
    bodyHtml: string;
    footerHtml: string;
    css: string;
    fieldVisibility: FieldVisibility;
    branding: Branding;
}

export interface PdfTemplateCreateInput extends PdfTemplateContent {
    name: string;
    module: PdfModule;
    description: string;
    isActive: boolean;
    isDefault: boolean;
}

export type PdfTemplateUpdateInput = Partial<Omit<PdfTemplateCreateInput, 'module'>> & { version: number };

export interface PdfTemplateDraft extends PdfTemplateContent {
    id?: string;
    module: PdfModule;
    name?: string;
}

export type PdfPreviewFormat = 'html' | 'pdf';
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

export const DEFAULT_MARGINS: PdfMargins = { top: 45, right: 10, bottom: 16, left: 10, header: 0, footer: 5 };

export const DEFAULT_BRANDING: Branding = {
    accentColor: '#1d4ed8',
    companyName: 'Nandini Infosys Pvt. Ltd.',
    companyAddress: '',
    companyPhone: '',
    companyEmail: '',
    companyGstin: '',
    companyWebsite: '',
};
