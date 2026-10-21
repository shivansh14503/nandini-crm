import { ENV } from '../config/env';
import type { ApiResponse, PaginatedResponse, PaginationParams } from '../types/api.types';
import { apiClient } from './apiClient';

export interface CrudMockAdapter<T, CreateDto, UpdateDto> {
    getAll: () => T[];
    getById: (id: string) => T | undefined;
    create: (data: CreateDto) => T;
    update: (id: string, data: UpdateDto) => T | null;
    delete: (id: string) => boolean;
    deleteBulk: (ids: string[]) => boolean;
    saveAll?: (items: T[]) => void;
}

export interface CrudService<T, CreateDto = Partial<T>, UpdateDto = Partial<CreateDto>> {
    readonly endpoint: string;
    list: (params?: PaginationParams) => Promise<PaginatedResponse<T>>;
    getAll: (params?: PaginationParams) => Promise<T[]>;
    getById: (id: string) => Promise<T | undefined>;
    create: (data: CreateDto) => Promise<T>;
    update: (id: string, data: UpdateDto) => Promise<T | null>;
    delete: (id: string) => Promise<boolean>;
    deleteBulk: (ids: string[]) => Promise<boolean>;
    getAllSync: () => T[];
    getByIdSync: (id: string) => T | undefined;
    saveAllSync: (items: T[]) => void;
}

export function createCrudService<T, CreateDto = Partial<T>, UpdateDto = Partial<CreateDto>>(
    endpoint: string,
    mockAdapter?: CrudMockAdapter<T, CreateDto, UpdateDto>
): CrudService<T, CreateDto, UpdateDto> {
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

    return {
        endpoint: cleanEndpoint,

        list: async (params?: PaginationParams): Promise<PaginatedResponse<T>> => {
            if (ENV.USE_MOCK && mockAdapter) {
                const all = mockAdapter.getAll();
                const page = Number(params?.page ?? 1);
                const limit = Number(params?.limit ?? (all.length || 25));
                const start = (page - 1) * limit;
                const data = all.slice(start, start + limit);
                return {
                    success: true,
                    data,
                    total: all.length,
                    page,
                    limit,
                };
            }

            try {
                return await apiClient.get<PaginatedResponse<T>>(cleanEndpoint, { params });
            } catch (err) {
                if (mockAdapter) {
                    const all = mockAdapter.getAll();
                    return {
                        success: true,
                        data: all,
                        total: all.length,
                        page: Number(params?.page ?? 1),
                        limit: Number(params?.limit ?? (all.length || 25)),
                    };
                }
                throw err;
            }
        },

        getAll: async (params?: PaginationParams): Promise<T[]> => {
            if (ENV.USE_MOCK && mockAdapter) {
                return mockAdapter.getAll();
            }

            try {
                const res = await apiClient.get<PaginatedResponse<T> | ApiResponse<T[]> | T[]>(
                    cleanEndpoint,
                    { params }
                );
                if (Array.isArray(res)) return res;
                return res.data;
            } catch (err) {
                if (mockAdapter) return mockAdapter.getAll();
                throw err;
            }
        },

        getById: async (id: string): Promise<T | undefined> => {
            if (ENV.USE_MOCK && mockAdapter) {
                return mockAdapter.getById(id);
            }

            try {
                const res = await apiClient.get<ApiResponse<T> | T>(`${cleanEndpoint}/${id}`);
                if (res && typeof res === 'object' && 'data' in res) {
                    return (res as ApiResponse<T>).data;
                }
                return res as T;
            } catch (err) {
                if (mockAdapter) return mockAdapter.getById(id);
                throw err;
            }
        },

        create: async (data: CreateDto): Promise<T> => {
            if (ENV.USE_MOCK && mockAdapter) {
                return mockAdapter.create(data);
            }

            try {
                const res = await apiClient.post<ApiResponse<T> | T>(cleanEndpoint, data);
                const created =
                    res && typeof res === 'object' && 'data' in res
                        ? (res as ApiResponse<T>).data
                        : (res as T);
                if (mockAdapter?.saveAll) {
                    const existing = mockAdapter.getAll();
                    mockAdapter.saveAll([created, ...existing]);
                }
                return created;
            } catch (err) {
                if (mockAdapter) return mockAdapter.create(data);
                throw err;
            }
        },

        update: async (id: string, data: UpdateDto): Promise<T | null> => {
            if (ENV.USE_MOCK && mockAdapter) {
                return mockAdapter.update(id, data);
            }

            try {
                const res = await apiClient.put<ApiResponse<T> | T>(`${cleanEndpoint}/${id}`, data);
                const updated =
                    res && typeof res === 'object' && 'data' in res
                        ? (res as ApiResponse<T>).data
                        : (res as T);
                if (mockAdapter) {
                    mockAdapter.update(id, data);
                }
                return updated;
            } catch (err) {
                if (mockAdapter) return mockAdapter.update(id, data);
                throw err;
            }
        },

        delete: async (id: string): Promise<boolean> => {
            if (ENV.USE_MOCK && mockAdapter) {
                return mockAdapter.delete(id);
            }

            try {
                await apiClient.delete<ApiResponse<unknown>>(`${cleanEndpoint}/${id}`);
                if (mockAdapter) {
                    mockAdapter.delete(id);
                }
                return true;
            } catch (err) {
                if (mockAdapter) return mockAdapter.delete(id);
                throw err;
            }
        },

        deleteBulk: async (ids: string[]): Promise<boolean> => {
            if (ENV.USE_MOCK && mockAdapter) {
                return mockAdapter.deleteBulk(ids);
            }

            try {
                await apiClient.post<ApiResponse<unknown>>(`${cleanEndpoint}/bulk-delete`, { ids });
                if (mockAdapter) {
                    mockAdapter.deleteBulk(ids);
                }
                return true;
            } catch (err) {
                if (mockAdapter) return mockAdapter.deleteBulk(ids);
                throw err;
            }
        },

        getAllSync: (): T[] => {
            return mockAdapter ? mockAdapter.getAll() : [];
        },

        getByIdSync: (id: string): T | undefined => {
            return mockAdapter ? mockAdapter.getById(id) : undefined;
        },

        saveAllSync: (items: T[]): void => {
            mockAdapter?.saveAll?.(items);
        },
    };
}
