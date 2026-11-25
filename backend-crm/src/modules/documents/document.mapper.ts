import type { Document, Opportunity } from '../../generated/prisma/client.js';
import { parseStringArray, text, toDateOnly, toIso } from '../../utils/mappers.js';
import { RECORD_FILE_SELECT, toRecordFileDto, type RecordFileDto } from '../files/recordFile.dto.js';

/** Opportunity columns a document shows (its link, owner and organization / contact). */
export const DOCUMENT_OPPORTUNITY_SELECT = {
    id: true,
    opportunityCode: true,
    opportunityName: true,
    productCategoryJson: true,
    organizationName: true,
    organizationId: true,
    contact: true,
    contactId: true,
    salesStage: true,
    assignedTo: true,
    createdBy: true,
} as const;

export const DOCUMENT_INCLUDE = {
    documentFile: { select: RECORD_FILE_SELECT },
    opportunity: { select: DOCUMENT_OPPORTUNITY_SELECT },
} as const;

export type DocumentRow = Document & {
    documentFile: { id: string; fileName: string; mimeType: string; sizeBytes: number } | null;
    opportunity: Pick<Opportunity, keyof typeof DOCUMENT_OPPORTUNITY_SELECT>;
};

/** `Document` from frontend-crm/src/types/document.types.ts. Same field keys as the opportunity's Documentation section. */
export interface DocumentDto {
    id: string;
    documentNo: string;
    documentDate: string;
    documentRemarks: string;
    /** Upload Doc. */
    documentFile: RecordFileDto | null;
    opportunityId: string;
    opportunityCode: string;
    /** The opportunity's label: its name, else its products, else its organization (as on Contracts). */
    opportunity: string;
    salesStage: string;
    organizationName: string;
    organizationId?: string;
    contact: string;
    contactId?: string;
    /** The opportunity's owner. */
    assignedTo: string;
    /** Who added the document (uploaded it on the opportunity). */
    createdBy: string;
    /** Last user to change it; empty until then. */
    updatedBy: string;
    createdAt: string;
    updatedAt: string;
}

/** What the forms show for an opportunity (frontend `opportunityLabel`): its name, else its products, else its organization. */
export function opportunityLabel(opportunity: { opportunityName: string | null; productCategoryJson: string | null; organizationName: string }): string {
    return opportunity.opportunityName || parseStringArray(opportunity.productCategoryJson).join(', ') || opportunity.organizationName;
}

export function toDocumentDto(row: DocumentRow): DocumentDto {
    const opp = row.opportunity;
    return {
        id: row.id,
        documentNo: text(row.documentNo),
        documentDate: toDateOnly(row.documentDate),
        documentRemarks: text(row.documentRemarks),
        documentFile: row.documentFile ? toRecordFileDto(row.documentFile) : null,
        opportunityId: opp.id,
        opportunityCode: opp.opportunityCode,
        opportunity: opportunityLabel(opp),
        salesStage: opp.salesStage,
        organizationName: opp.organizationName,
        organizationId: opp.organizationId ?? undefined,
        contact: opp.contact,
        contactId: opp.contactId ?? undefined,
        assignedTo: opp.assignedTo,
        createdBy: row.createdBy,
        updatedBy: row.updatedBy ?? '',
        createdAt: toIso(row.createdAt),
        updatedAt: toIso(row.updatedAt),
    };
}
