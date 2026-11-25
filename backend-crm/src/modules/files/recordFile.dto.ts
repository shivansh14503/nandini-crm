/** A record's uploaded file as the API returns it (no database access here, so pure code and tests can use it). */

export interface RecordFileDto {
    id: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    /** API path of the file (`/api/files/<id>`). */
    url: string;
}

export const toRecordFileDto = (row: { id: string; fileName: string; mimeType: string; sizeBytes: number }): RecordFileDto => ({
    id: row.id,
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    url: `/api/files/${encodeURIComponent(row.id)}`,
});

/** Columns of a linked file a record returns. */
export const RECORD_FILE_SELECT = { id: true, fileName: true, mimeType: true, sizeBytes: true } as const;
