import type { ApiResponse } from '../types/api.types';
import { apiClient } from './apiClient';

export type GlobalSearchCategory = 'organizations' | 'contacts' | 'leads' | 'opportunities';

export interface GlobalSearchResult {
    id: string;
    category: GlobalSearchCategory;
    title: string;
    subtitle: string;
    /** Extra right-aligned tag (e.g. opportunity stage). */
    meta?: string;
    href: string;
}

export type GlobalSearchResults = Record<GlobalSearchCategory, GlobalSearchResult[]>;

export const GLOBAL_SEARCH_CATEGORIES: readonly GlobalSearchCategory[] = [
    'organizations',
    'contacts',
    'leads',
    'opportunities',
];

export const emptySearchResults = (): GlobalSearchResults => ({ organizations: [], contacts: [], leads: [], opportunities: [] });

/** GET /api/search: matches organizations, contacts, leads and opportunities (hrefs included). */
export async function searchCrm(rawQuery: string, limitPerCategory = 5): Promise<GlobalSearchResults> {
    const q = rawQuery.trim();
    if (!q) return emptySearchResults();
    const res = await apiClient.get<ApiResponse<GlobalSearchResults>>('/api/search', { params: { q, limit: limitPerCategory } });
    return res.data;
}
