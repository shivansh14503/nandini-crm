import type { ApiResponse } from '../types/api.types';
import { apiClient } from './apiClient';
import type { ImportEntityType } from '../components/common/import/types';

/** Single source of truth: the import wizard's entity list. */
export type ImportEntity = ImportEntityType;

export interface ImportRowFailure {
    rowNumber: number;
    errors: string[];
}

export interface ImportResult {
    importId: string;
    entity: ImportEntity;
    total: number;
    /** Rows the import got through (equals `total` unless cancelled; missing on imports from before this field). */
    processed?: number;
    created: number;
    failed: ImportRowFailure[];
    /** The owner cancelled it part-way; rows imported before that stay. */
    cancelled?: boolean;
}

/** POST /api/import/:entity: queued in the background (202) or, when the queue is down, run immediately (200). */
export type ImportStart =
    | { status: 'queued'; importId: string; total: number }
    | { status: 'completed'; importId: string; result: ImportResult };

export interface ImportJob {
    importId: string;
    entity: ImportEntity;
    total: number;
    /** BullMQ state (waiting | active | completed | failed | delayed …), or `cancelled` for a queued import removed by Cancel. */
    state: string;
    /** 0–100: processed / total. */
    progress: number;
    /** Live counts while the rows run. */
    processed: number;
    created: number;
    failedCount: number;
    cancelRequested: boolean;
    result?: ImportResult;
    failedReason?: string;
}

export const importService = {
    async start(entity: ImportEntity, rows: { rowNumber: number; values: Record<string, string> }[], fileName?: string): Promise<ImportStart> {
        const res = await apiClient.post<ApiResponse<ImportStart>>(`/api/import/${entity}`, { rows, fileName });
        return res.data;
    },

    async job(importId: string): Promise<ImportJob> {
        const res = await apiClient.get<ApiResponse<ImportJob>>(`/api/import/jobs/${importId}`);
        return res.data;
    },

    /** Removes a queued import, or stops a running one before its next row (rows already imported stay). */
    async cancel(importId: string): Promise<ImportJob> {
        const res = await apiClient.post<ApiResponse<ImportJob>>(`/api/import/jobs/${importId}/cancel`, {});
        return res.data;
    },
};
