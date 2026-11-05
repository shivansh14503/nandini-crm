import type { AuditEntityType } from '../../../services/audit.service.js';
import type { CustomFieldMeta } from '../fieldRegistry.js';
import type { Branding, FieldVisibility, PdfContext, PdfFieldRegistry } from '../pdf.types.js';

/** What every module's context builder receives (resolved by pdfRender.service). */
export interface ContextBuildInput {
    registry: PdfFieldRegistry;
    visibility: FieldVisibility;
    branding: Branding;
    /** data: URI of the branding logo ('' when none). */
    logoDataUri: string;
    customFields: CustomFieldMeta[];
    generatedBy: string;
    timeZone: string;
}

/** Cheap per-record facts used for the cache key and file name before the full context is built. */
export interface RecordMeta {
    id: string;
    updatedAt: Date;
    /** e.g. `QT-0042_acme-pvt-ltd` (no extension). */
    fileBaseName: string;
    /** Human label for logs / the print toolbar. */
    title: string;
}

export interface PdfModuleAdapter {
    /** Audit entity the PDF_GENERATED event is recorded on (shows in the record's Changes timeline). */
    auditEntityType: AuditEntityType;
    /** 404 when the record is missing or soft-deleted. */
    loadRecordMeta(recordId: string): Promise<RecordMeta>;
    buildContext(recordId: string, input: ContextBuildInput): Promise<PdfContext>;
    buildSampleContext(input: ContextBuildInput): PdfContext;
}
