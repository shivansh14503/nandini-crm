import { createHash } from 'node:crypto';
import type { PdfTemplate } from '../../generated/prisma/client.js';
import { text, toIso } from '../../utils/mappers.js';
import { documentSchema, type PdfDocument } from './document/index.js';
import type { Orientation, PageSize, PdfModule } from './pdf.types.js';
import { ORIENTATIONS, PAGE_SIZES, PDF_MODULES } from './pdf.types.js';

/** `PdfTemplateListItem` in frontend-crm/src/types/pdfTemplate.types.ts (no document). */
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
    document: PdfDocument;
}

const oneOf = <T extends string>(values: readonly T[], value: string, fallback: T): T => ((values as readonly string[]).includes(value) ? (value as T) : fallback);

export const toModule = (value: string): PdfModule => oneOf(PDF_MODULES, value, 'QUOTATION');

/** The stored document, or null when it is missing / not a valid document (e.g. a row awaiting the seed). */
export function parseStoredDocument(json: string | null | undefined): PdfDocument | null {
    if (!json) return null;
    try {
        const parsed = documentSchema.safeParse(JSON.parse(json));
        return parsed.success ? parsed.data : null;
    } catch {
        return null;
    }
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

export function toPdfTemplateDto(row: PdfTemplate, document: PdfDocument): PdfTemplateDto {
    return { ...toPdfTemplateListItem(row), document };
}

/** The document is audited as a short digest plus its shape, so audit rows stay small but changes stay visible. */
function documentSummary(json: string): string {
    const doc = parseStoredDocument(json);
    const digest = `sha256:${createHash('sha256').update(json).digest('hex').slice(0, 12)}`;
    if (!doc) return digest;
    const blocks = (band: 'header' | 'body' | 'footer') => doc[band].reduce((n, s) => n + s.columns.reduce((m, c) => m + c.blocks.length, 0), 0);
    const m = doc.page.margins;
    return `${digest} · ${doc.body.length} sections / ${blocks('body')} blocks (header ${blocks('header')}, footer ${blocks('footer')}) · margins ${m.top}/${m.right}/${m.bottom}/${m.left} mm`;
}

/** Flat snapshot used for audit diffs. */
export function toAuditSnapshot(row: PdfTemplate): Record<string, unknown> {
    return {
        name: row.name,
        module: row.module,
        description: text(row.description),
        isActive: row.isActive,
        isDefault: row.isDefault,
        pageSize: row.pageSize,
        orientation: row.orientation,
        document: documentSummary(row.documentJson),
        version: row.version,
        isDeleted: row.isDeleted,
    };
}
