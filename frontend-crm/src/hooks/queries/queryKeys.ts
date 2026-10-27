import type { PaginationParams } from '@/types/api.types';

/** Hierarchical keys (`all` → `lists`/`details` → one list/record) so invalidation can target any level. */
function createEntityKeys<E extends string>(entity: E) {
    const all = [entity] as const;
    return {
        all,
        lists: () => [...all, 'list'] as const,
        list: (params?: PaginationParams) => [...all, 'list', params ?? {}] as const,
        details: () => [...all, 'detail'] as const,
        detail: (id: string) => [...all, 'detail', id] as const,
    };
}

export type EntityQueryKeys = ReturnType<typeof createEntityKeys<string>>;

export const queryKeys = {
    organizations: createEntityKeys('organizations'),
    contacts: createEntityKeys('contacts'),
    tickets: createEntityKeys('tickets'),
    leads: createEntityKeys('leads'),
    opportunities: createEntityKeys('opportunities'),
    quotations: createEntityKeys('quotations'),
    products: createEntityKeys('products'),
    users: {
        all: ['users'] as const,
    },
} as const;

export type QueryEntity = keyof typeof queryKeys;

/**
 * Maps a `notifyCrmUpdate` entity (services pass their endpoint, e.g. `/api/tickets`) to its query-key
 * namespace, or undefined when no queries are cached under it.
 */
export function queryEntityFromSync(entity?: string): QueryEntity | undefined {
    const name = entity?.split('/').filter(Boolean).pop()?.toLowerCase();
    return name && name in queryKeys ? (name as QueryEntity) : undefined;
}
