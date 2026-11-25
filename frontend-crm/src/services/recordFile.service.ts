import { ENV } from '../config/env';
import type { ApiResponse } from '../types/api.types';
import { RECORD_FILE_MAX_BYTES, RECORD_FILE_TYPES, type RecordFile, type RecordFileModule } from '../types/recordFile.types';
import { ApiClientError, apiClient } from './apiClient';

const ENDPOINT = '/api/files';

const clientError = (message: string) => new ApiClientError(message, undefined, { message });

/** Files uploaded to record fields (an opportunity's Upload Doc): uploaded when picked, linked when the record saves. */
export const recordFileService = {
    upload: async (file: File, module: RecordFileModule): Promise<RecordFile> => {
        const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
        // Some systems leave `type` empty for Office files: fall back to the extension.
        const mimeType = Object.values(RECORD_FILE_TYPES).includes(file.type) ? file.type : RECORD_FILE_TYPES[ext];
        if (!mimeType) throw clientError('Only PDF, image (PNG, JPEG, WebP), Word or Excel files can be uploaded.');
        if (file.size === 0) throw clientError('The file is empty.');
        if (file.size > RECORD_FILE_MAX_BYTES) throw clientError('Files cannot exceed 10 MB.');
        const data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(clientError('Could not read the file.'));
            reader.readAsDataURL(file);
        });
        const res = await apiClient.post<ApiResponse<RecordFile>>(ENDPOINT, { module, fileName: file.name, mimeType, data });
        return res.data;
    },

    /** Absolute URL of an uploaded file (opens with the session cookie: PDFs and images in the browser, others download). */
    fileUrl: (file: Pick<RecordFile, 'id'>): string => `${ENV.API_URL}${ENDPOINT}/${encodeURIComponent(file.id)}`,
};
