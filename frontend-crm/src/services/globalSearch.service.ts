import type { ApiResponse } from '../types/api.types';
import { apiClient } from './apiClient';

/** Result groups in Sales navbar order (leads → opportunities → quotations → organizations → contacts), then the rest. */
export const GLOBAL_SEARCH_CATEGORIES = [
    'leads',
    'opportunities',
    'quotations',
    'organizations',
    'contacts',
    'tickets',
    'contracts',
    'products',
    'partnerCompanies',
] as const;

export type GlobalSearchCategory = (typeof GLOBAL_SEARCH_CATEGORIES)[number];

export const isGlobalSearchCategory = (value: unknown): value is GlobalSearchCategory =>
    typeof value === 'string' && (GLOBAL_SEARCH_CATEGORIES as readonly string[]).includes(value);

/** The field that matched when it is not already in the title / subtitle (e.g. `PAN · AAACR1234A`). */
export interface GlobalSearchMatch {
    label: string;
    value: string;
}

export interface GlobalSearchResult {
    id: string;
    category: GlobalSearchCategory;
    title: string;
    subtitle: string;
    /** Extra right-aligned tag (e.g. opportunity stage). */
    meta?: string;
    match?: GlobalSearchMatch;
    href: string;
}

export type GlobalSearchResults = Record<GlobalSearchCategory, GlobalSearchResult[]>;
export type GlobalSearchTotals = Record<GlobalSearchCategory, number>;

export interface GlobalSearchResponse {
    results: GlobalSearchResults;
    /** Only when requested with `totals`. */
    totals?: GlobalSearchTotals;
    /** Every matching record id per module (most recently updated first); only when requested with `ids`. */
    ids?: Record<GlobalSearchCategory, string[]>;
}

const perCategory = <T>(value: () => T): Record<GlobalSearchCategory, T> =>
    Object.fromEntries(GLOBAL_SEARCH_CATEGORIES.map((c) => [c, value()])) as Record<GlobalSearchCategory, T>;

export const emptySearchResults = (): GlobalSearchResults => perCategory(() => []);
export const emptySearchTotals = (): GlobalSearchTotals => perCategory(() => 0);

export interface SearchCrmOptions {
    /** Matches per category (max 50). */
    limit?: number;
    /** Search one module only. */
    category?: GlobalSearchCategory;
    /** 1-based page within `category`. */
    page?: number;
    /** Also count all matches per category. */
    totals?: boolean;
    /** Also return every matching id per category (no display rows). */
    ids?: boolean;
    /**
     * Typed digits needed before phone / account / other numbers match by any part of them (1-3). The API default
     * of 3 suits the navbar suggestions; the results page passes 1 so even a single digit finds numbers.
     */
    minDigits?: number;
}

/** Same budget as apiClient's default timeout, which it skips when the caller passes a signal of its own. */
const SEARCH_TIMEOUT_MS = 30_000;

/** The caller's cancel signal (React Query aborts superseded searches) combined with a request timeout. */
function withTimeout(signal?: AbortSignal): AbortSignal | undefined {
    if (!signal || typeof AbortSignal.any !== 'function' || typeof AbortSignal.timeout !== 'function') return signal;
    return AbortSignal.any([signal, AbortSignal.timeout(SEARCH_TIMEOUT_MS)]);
}

/**
 * GET /api/search: matches every module on record numbers, names, emails, phone numbers, GSTIN, PAN and bank
 * account numbers (hrefs included). Pass React Query's `signal` so a search superseded by further typing is
 * cancelled instead of finishing in the background.
 */
export async function searchCrm(rawQuery: string, options: SearchCrmOptions = {}, signal?: AbortSignal): Promise<GlobalSearchResponse> {
    const q = rawQuery.trim();
    if (!q) return { results: emptySearchResults(), ...(options.totals ? { totals: emptySearchTotals() } : {}) };
    const { limit = 5, category, page, totals, ids, minDigits } = options;
    const res = await apiClient.get<ApiResponse<GlobalSearchResponse>>('/api/search', {
        params: { q, limit, category, page, totals: totals || undefined, ids: ids || undefined, minDigits },
        signal: withTimeout(signal),
    });
    return res.data;
}

/**
 * POST /api/search/records: the list rows (the module's list API shape) of matched records, in `ids` order. Like
 * the search itself, not limited by who owns the records.
 */
export async function fetchSearchRecords<T extends { id: string }>(
    category: GlobalSearchCategory,
    ids: string[],
    signal?: AbortSignal
): Promise<T[]> {
    if (ids.length === 0) return [];
    const res = await apiClient.post<ApiResponse<T[]>>('/api/search/records', { module: category, ids }, { signal: withTimeout(signal) });
    return res.data;
}

/** Link to the full results page. */
export const searchPageHref = (query: string, category?: GlobalSearchCategory) => {
    const params = new URLSearchParams({ q: query.trim() });
    if (category) params.set('module', category);
    return `/search?${params.toString()}`;
};
