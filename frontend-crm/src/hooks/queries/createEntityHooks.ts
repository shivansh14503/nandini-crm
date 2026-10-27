import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CrudService } from '@/services/base.service';
import type { PaginationParams } from '@/types/api.types';
import type { EntityQueryKeys } from './queryKeys';

/**
 * Builds list/detail queries and create/update/delete mutations for a CRUD service. Queries start from the
 * local store (`getAllSync`/`getByIdSync`) so views render instantly; mutations invalidate the entity's cache.
 */
export function createEntityHooks<T, CreateDto, UpdateDto>(
    keys: EntityQueryKeys,
    service: CrudService<T, CreateDto, UpdateDto>
) {
    function useList(params?: PaginationParams) {
        return useQuery<T[]>({
            queryKey: keys.list(params),
            queryFn: () => service.getAll(params),
            initialData: () => service.getAllSync(),
        });
    }

    /** Resolves to `null` when the record doesn't exist (TanStack Query doesn't allow `undefined` data). */
    function useDetail(id?: string) {
        return useQuery<T | null>({
            queryKey: keys.detail(id ?? ''),
            queryFn: async () => (await service.getById(id!)) ?? null,
            enabled: Boolean(id),
            initialData: () => (id ? service.getByIdSync(id) : undefined),
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

    return { useList, useDetail, useCreate, useUpdate, useDelete, useBulkDelete };
}
