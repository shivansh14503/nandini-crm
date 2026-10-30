import type { ApiResponse, PaginatedResponse, PaginationParams } from '../types/api.types';
import { ApiClientError, apiClient } from './apiClient';
import { notifyCrmUpdate } from './crmSync';

export interface CrudService<T, CreateDto = Partial<T>, UpdateDto = Partial<CreateDto>> {
    readonly endpoint: string;
    /** One page: `GET endpoint?page&limit&search&sortBy&sortOrder&<filters>`. */
    list: (params?: PaginationParams) => Promise<PaginatedResponse<T>>;
    /** Every record matching the filters (all pages). Prefer `list` for anything that can grow large. */
    getAll: (params?: PaginationParams) => Promise<T[]>;
    /** `undefined` when the record doesn't exist (or was deleted). */
    getById: (id: string) => Promise<T | undefined>;
    create: (data: CreateDto) => Promise<T>;
    update: (id: string, data: UpdateDto) => Promise<T>;
    delete: (id: string) => Promise<void>;
    deleteBulk: (ids: string[]) => Promise<void>;
}

/** The API caps a page at 100 records. */
const PAGE_SIZE = 100;
/** Safety cap for `getAll` (10,000 records). */
const MAX_PAGES = 100;

/**
 * CRUD client for a backend entity endpoint. Writes broadcast `notifyCrmUpdate(endpoint)`, which invalidates the
 * entity's React Query cache in this tab and in other open tabs.
 */
export function createCrudService<T, CreateDto = Partial<T>, UpdateDto = Partial<CreateDto>>(
    endpoint: string
): CrudService<T, CreateDto, UpdateDto> {
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

    const list = (params?: PaginationParams) => apiClient.get<PaginatedResponse<T>>(cleanEndpoint, { params });

    return {
        endpoint: cleanEndpoint,
        list,

        getAll: async (params?: PaginationParams): Promise<T[]> => {
            const all: T[] = [];
            for (let page = 1; page <= MAX_PAGES; page++) {
                const res = await list({ ...params, page, limit: PAGE_SIZE });
                all.push(...res.data);
                if (res.data.length < PAGE_SIZE || all.length >= res.total) return all;
            }
            console.warn(`${cleanEndpoint}: stopped after ${MAX_PAGES * PAGE_SIZE} records; use list() with server-side pagination instead.`);
            return all;
        },

        getById: async (id: string): Promise<T | undefined> => {
            try {
                const res = await apiClient.get<ApiResponse<T>>(`${cleanEndpoint}/${encodeURIComponent(id)}`);
                return res.data;
            } catch (err) {
                // A missing record is "not found", not an error (callers render their empty state).
                if (err instanceof ApiClientError && err.status === 404) return undefined;
                throw err;
            }
        },

        create: async (data: CreateDto): Promise<T> => {
            const res = await apiClient.post<ApiResponse<T>>(cleanEndpoint, data);
            notifyCrmUpdate(cleanEndpoint);
            return res.data;
        },

        update: async (id: string, data: UpdateDto): Promise<T> => {
            const res = await apiClient.put<ApiResponse<T>>(`${cleanEndpoint}/${encodeURIComponent(id)}`, data);
            notifyCrmUpdate(cleanEndpoint, id);
            return res.data;
        },

        delete: async (id: string): Promise<void> => {
            await apiClient.delete<ApiResponse<unknown>>(`${cleanEndpoint}/${encodeURIComponent(id)}`);
            notifyCrmUpdate(cleanEndpoint, id);
        },

        deleteBulk: async (ids: string[]): Promise<void> => {
            await apiClient.post<ApiResponse<unknown>>(`${cleanEndpoint}/bulk-delete`, { ids });
            notifyCrmUpdate(cleanEndpoint);
        },
    };
}
