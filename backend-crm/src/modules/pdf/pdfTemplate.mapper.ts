import { createHash } from 'node:crypto';
import type { PdfTemplate } from '../../generated/prisma/client.js';
import { decimalToNumber, text, toIso } from '../../utils/mappers.js';
import { mergeBranding, mergeFieldVisibility } from './fieldVisibility.js';
import type { Branding, FieldVisibility, Orientation, PageSize, PdfFieldRegistry, PdfMargins, PdfModule } from './pdf.types.js';
import { ORIENTATIONS, PAGE_SIZES, PDF_MODULES } from './pdf.types.js';

/** `PdfTemplateListItem` in frontend-crm/src/types/pdfTemplate.types.ts (no HTML). */
export interface PdfTemplateListItemDto {
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

/** `PdfTemplate` in frontend-crm/src/types/pdfTemplate.types.ts. */
export interface PdfTemplateDto extends PdfTemplateListItemDto {
    margins: PdfMargins;
    headerHtml: string;
    bodyHtml: string;
    footerHtml: string;
    css: string;
    fieldVisibility: FieldVisibility;
    branding: Branding;
}

const oneOf = <T extends string>(values: readonly T[], value: string, fallback: T): T => ((values as readonly string[]).includes(value) ? (value as T) : fallback);

export const toModule = (value: string): PdfModule => oneOf(PDF_MODULES, value, 'QUOTATION');

export function toMargins(row: PdfTemplate): PdfMargins {
    return {
        top: decimalToNumber(row.marginTop),
        right: decimalToNumber(row.marginRight),
        bottom: decimalToNumber(row.marginBottom),
        left: decimalToNumber(row.marginLeft),
        header: decimalToNumber(row.marginHeader),
        footer: decimalToNumber(row.marginFooter),
    };
}

export function toPdfTemplateListItem(row: PdfTemplate): PdfTemplateListItemDto {
    return {
        id: row.id,
        name: row.name,
        module: toModule(row.module),
        description: text(row.description),
        isSystem: row.isSystem,
        isDefault: row.isDefault,
        isActive: row.isActive,
        pageSize: oneOf(PAGE_SIZES, row.pageSize, 'A4'),
        orientation: oneOf(ORIENTATIONS, row.orientation, 'portrait'),
        version: row.version,
        createdBy: row.createdBy,
        updatedBy: text(row.updatedBy),
        createdAt: toIso(row.createdAt),
        updatedAt: toIso(row.updatedAt),
    };
}

/** Full template; visibility is merged with the current registry so the editor always sees every field. */
export function toPdfTemplateDto(row: PdfTemplate, registry: PdfFieldRegistry): PdfTemplateDto {
    return {
        ...toPdfTemplateListItem(row),
        margins: toMargins(row),
        headerHtml: text(row.headerHtml),
        bodyHtml: row.bodyHtml,
        footerHtml: text(row.footerHtml),
        css: text(row.css),
        fieldVisibility: mergeFieldVisibility(registry, row.fieldVisibilityJson),
        branding: mergeBranding(row.brandingJson),
    };
}

/** Large HTML/CSS is audited as a short digest, so audit rows stay small but changes stay visible. */
const digest = (value: string | null | undefined): string => {
    if (!value) return '';
    return `sha256:${createHash('sha256').update(value).digest('hex').slice(0, 12)} (${value.length} chars)`;
};

/** Flat snapshot used for audit diffs. */
export function toAuditSnapshot(row: PdfTemplate): Record<string, unknown> {
    const m = toMargins(row);
    return {
        name: row.name,
        module: row.module,
        description: text(row.description),
        isActive: row.isActive,
        isDefault: row.isDefault,
        pageSize: row.pageSize,
        orientation: row.orientation,
        margins: `${m.top}/${m.right}/${m.bottom}/${m.left} · header ${m.header} · footer ${m.footer} mm`,
        headerHtml: digest(row.headerHtml),
        bodyHtml: digest(row.bodyHtml),
        footerHtml: digest(row.footerHtml),
        css: digest(row.css),
        fieldVisibility: digest(row.fieldVisibilityJson),
        branding: row.brandingJson ?? '',
        version: row.version,
        isDeleted: row.isDeleted,
    };
}
