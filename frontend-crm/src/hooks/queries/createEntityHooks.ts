import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CrudService } from '@/services/base.service';
import type { PaginatedResponse, PaginationParams } from '@/types/api.types';
import type { EntityQueryKeys } from './queryKeys';

/**
 * Builds list/detail queries and create/update/delete mutations for a CRUD service. Mutations invalidate the
 * entity's cache (services also broadcast `notifyCrmUpdate`, which reaches other tabs).
 */
export function createEntityHooks<T, CreateDto, UpdateDto>(
    keys: EntityQueryKeys,
    service: CrudService<T, CreateDto, UpdateDto>
) {
    /** Every record matching `params` (filters such as `organizationId`), e.g. for lookups and related lists. */
    function useList(params?: PaginationParams, options: { enabled?: boolean } = {}) {
        return useQuery<T[]>({
            queryKey: keys.list(params),
            queryFn: () => service.getAll(params),
            enabled: options.enabled ?? true,
        });
    }

    /** Server-paginated page (`{ data, total, page, limit }`) with smooth page-to-page transitions. */
    function usePaginatedList(params?: PaginationParams, options: { enabled?: boolean } = {}) {
        return useQuery<PaginatedResponse<T>>({
            queryKey: [...keys.list(params), 'paginated'] as const,
            queryFn: () => service.list(params),
            placeholderData: keepPreviousData,
            enabled: options.enabled ?? true,
        });
    }

    /** Resolves to `null` when the record doesn't exist (TanStack Query doesn't allow `undefined` data). */
    function useDetail(id?: string) {
        return useQuery<T | null>({
            queryKey: keys.detail(id ?? ''),
            queryFn: async () => (await service.getById(id!)) ?? null,
            enabled: Boolean(id),
        });
    }

    function useCreate() {
        const queryClient = useQueryClient();
        return useMutation({
            mutationFn: (data: CreateDto) => service.create(data),
            onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.all }),
        });
    }

    function useUpdate() {
        const queryClient = useQueryClient();
        return useMutation({
            mutationFn: ({ id, data }: { id: string; data: UpdateDto }) => service.update(id, data),
            // `all` covers the record's detail key too.
            onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.all }),
        });
    }

    function useDelete() {
        const queryClient = useQueryClient();
        return useMutation({
            mutationFn: (id: string) => service.delete(id),
            onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.all }),
        });
    }

    function useBulkDelete() {
        const queryClient = useQueryClient();
        return useMutation({
            mutationFn: (ids: string[]) => service.deleteBulk(ids),
            onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.all }),
        });
    }

    return { useList, usePaginatedList, useDetail, useCreate, useUpdate, useDelete, useBulkDelete };
}
