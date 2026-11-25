import type { TransactionClient } from '../../config/prisma.js';
import type { Document } from '../../generated/prisma/client.js';
import type { AuthUser } from '../../types/user.types.js';
import { fromDateOnly, nullable, toDateOnly } from '../../utils/mappers.js';
import { RECORD_FILE_SELECT } from '../files/recordFile.dto.js';

/**
 * The opportunity form's Documentation section (Add Document, Document No, Document Date, Remarks, Upload Doc) is
 * stored in the Document table, one row per opportunity, which the Documents module lists. The opportunity API keeps
 * the same fields: the mapper reads them from the row and every opportunity save calls `syncOpportunityDocument`.
 */

export type OpportunityDocumentRow = Document & {
    documentFile?: { id: string; fileName: string; mimeType: string; sizeBytes: number } | null;
};

/** `include` for an opportunity query: its document with the linked file's details. */
export const OPPORTUNITY_DOCUMENT_INCLUDE = { include: { documentFile: { select: RECORD_FILE_SELECT } } } as const;

/** The Documentation fields of a parsed opportunity input. */
export interface DocumentationInput {
    addDocument?: string;
    documentNo?: string;
    documentDate?: string;
    documentRemarks?: string;
    documentFile?: string | null;
}

/** Column values the input asks for, or null when Add Document is No (no document). */
export function documentValues(input: DocumentationInput) {
    if (input.addDocument !== 'Yes') return null;
    return {
        documentNo: nullable(input.documentNo),
        documentDate: input.documentDate ? fromDateOnly(input.documentDate) : null,
        documentRemarks: nullable(input.documentRemarks),
        documentFileId: input.documentFile ?? null,
    };
}

type DocumentValues = NonNullable<ReturnType<typeof documentValues>>;

/** Whether the stored document already holds these values (a save that changes nothing leaves it untouched). */
export function sameDocument(row: Pick<Document, 'documentNo' | 'documentDate' | 'documentRemarks' | 'documentFileId'>, values: DocumentValues): boolean {
    return (
        (row.documentNo ?? null) === values.documentNo &&
        toDateOnly(row.documentDate) === toDateOnly(values.documentDate) &&
        (row.documentRemarks ?? null) === values.documentRemarks &&
        (row.documentFileId ?? null) === values.documentFileId
    );
}

/**
 * Writes the opportunity's document after a save: creates it when Add Document turns Yes, updates it when its
 * details change, and deletes it when Add Document is No. Runs in the caller's transaction (which holds the
 * opportunity's lock).
 */
export async function syncOpportunityDocument(tx: TransactionClient, opportunityId: string, input: DocumentationInput, user: AuthUser): Promise<void> {
    const values = documentValues(input);
    const existing = await tx.document.findUnique({
        where: { opportunityId },
        select: { id: true, documentNo: true, documentDate: true, documentRemarks: true, documentFileId: true },
    });
    if (!values) {
        if (existing) await tx.document.delete({ where: { id: existing.id } });
        return;
    }
    if (!existing) {
        await tx.document.create({ data: { ...values, opportunityId, createdBy: user.username } });
        return;
    }
    if (!sameDocument(existing, values)) {
        await tx.document.update({ where: { id: existing.id }, data: { ...values, updatedBy: user.username } });
    }
}
