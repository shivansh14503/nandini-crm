/** A file uploaded to a record field (an opportunity's Upload Doc), as the API returns it. */
export interface RecordFile {
    id: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    /** API path of the file (`/api/files/<id>`). */
    url: string;
}

/** Modules whose records take files (backend-crm/src/modules/files/recordFile.service.ts). */
export type RecordFileModule = 'opportunities';

/** Largest file a record field takes (10 MB), as the API enforces. */
export const RECORD_FILE_MAX_BYTES = 10 * 1024 * 1024;

/** Allowed types by extension: PDF, images, Word and Excel. */
export const RECORD_FILE_TYPES: Record<string, string> = {
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

/** `accept` attribute of the file picker. */
export const RECORD_FILE_ACCEPT = Object.keys(RECORD_FILE_TYPES)
    .map((ext) => `.${ext}`)
    .join(',');

/** Whether a value is an uploaded file (form values and API records hold the object). */
export const isRecordFile = (value: unknown): value is RecordFile =>
    Boolean(value) && typeof value === 'object' && typeof (value as RecordFile).id === 'string' && typeof (value as RecordFile).fileName === 'string';

/** 1536 → '1.5 KB'. */
export function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
