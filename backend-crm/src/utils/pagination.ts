import { z } from 'zod';

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;
export const MAX_SEARCH_LENGTH = 100;

/** List query params sent by the frontend's `createCrudService` (`PaginationParams`). */
export const paginationQuerySchema = z.object({
    page: z.coerce.number().int().min(1).catch(1).default(1),
    limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).catch(DEFAULT_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
    search: z.string().trim().max(MAX_SEARCH_LENGTH).optional().catch(undefined),
    sortBy: z.string().trim().optional().catch(undefined),
    sortOrder: z.enum(['asc', 'desc']).catch('desc').default('desc'),
});

export interface PaginationOptions<TSortField extends string> {
    page: number;
    limit: number;
    skip: number;
    take: number;
    /** Trimmed search term, or undefined when blank. */
    search?: string;
    sortBy: TSortField;
    sortOrder: 'asc' | 'desc';
    /** Ready to spread into a Prisma `findMany` call. */
    orderBy: Record<TSortField, 'asc' | 'desc'>;
}

/**
 * Parses `page`, `limit`, `search`, `sortBy` and `sortOrder` from a request query. Bad values fall back to
 * defaults instead of failing the request, and `sortBy` is restricted to `allowedSortFields` so arbitrary
 * column names never reach the ORM.
 */
export function parsePagination<TSortField extends string>(
    query: unknown,
    allowedSortFields: readonly [TSortField, ...TSortField[]],
    defaultSortField: TSortField = allowedSortFields[0],
): PaginationOptions<TSortField> {
    const parsed = paginationQuerySchema.parse(query ?? {});
    const sortBy = allowedSortFields.includes(parsed.sortBy as TSortField) ? (parsed.sortBy as TSortField) : defaultSortField;

    return {
        page: parsed.page,
        limit: parsed.limit,
        skip: (parsed.page - 1) * parsed.limit,
        take: parsed.limit,
        search: parsed.search || undefined,
        sortBy,
        sortOrder: parsed.sortOrder,
        orderBy: { [sortBy]: parsed.sortOrder } as Record<TSortField, 'asc' | 'desc'>,
    };
}
