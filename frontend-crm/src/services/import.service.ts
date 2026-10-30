import type { ApiResponse } from '../types/api.types';
import { apiClient } from './apiClient';

export type ImportEntity = 'organizations' | 'contacts' | 'products' | 'leads';

export interface ImportRowFailure {
    rowNumber: number;
    errors: string[];
}

export interface ImportResult {
    importId: string;
    entity: ImportEntity;
    total: number;
    created: number;
    failed: ImportRowFailure[];
}

/** POST /api/import/:entity: queued in the background (202) or, when the queue is down, run immediately (200). */
export type ImportStart =
    | { status: 'queued'; importId: string; total: number }
    | { status: 'completed'; importId: string; result: ImportResult };

export interface ImportJob {
    importId: string;
    entity: ImportEntity;
    total: number;
    /** BullMQ state: waiting | active | completed | failed | delayed … */
    state: string;
    /** 0–100 */
    progress: number;
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
};
