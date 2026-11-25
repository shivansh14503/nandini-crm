import type { RecordFile } from './recordFile.types';

/**
 * A document in Activities › Documents (backend `DocumentDto`): the document an opportunity records in its
 * Documentation section. Read-only here; it is added, changed and removed from the opportunity form. The document
 * fields use the opportunity form's keys (Document No, Document Date, Remarks, Upload Doc).
 */
export interface Document {
    id: string;
    documentNo: string;
    /** YYYY-MM-DD, or empty. */
    documentDate: string;
    /** Remarks. */
    documentRemarks: string;
    /** Upload Doc. */
    documentFile: RecordFile | null;
    opportunityId: string;
    opportunityCode: string;
    /** The opportunity's label: its name, else its products, else its organization. */
    opportunity: string;
    salesStage: string;
    organizationName: string;
    organizationId?: string;
    contact: string;
    contactId?: string;
    /** The opportunity's owner. */
    assignedTo: string;
    /** Who added the document on the opportunity. */
    createdBy: string;
    /** Last user to change it; empty until then. */
    updatedBy: string;
    createdAt: string;
    updatedAt: string;
}
