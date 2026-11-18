import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
    emptySearchResults,
    searchCrm,
    type GlobalSearchResponse,
    type GlobalSearchResults,
    type GlobalSearchTotals,
    type SearchCrmOptions,
} from '@/services/globalSearch.service';

/** Global search results for a (debounced) query; previous results stay visible while the next query loads. */
export function useGlobalSearch(
    query: string,
    options: SearchCrmOptions = {}
): {
    results: GlobalSearchResults;
    totals?: GlobalSearchTotals;
    ids?: GlobalSearchResponse['ids'];
    isFetching: boolean;
    isLoading: boolean;
    isError: boolean;
} {
    const trimmed = query.trim();
    const { limit = 5, category, page, totals, ids, minDigits } = options;
    const remote = useQuery({
        queryKey: ['globalSearch', trimmed.toLowerCase(), limit, category ?? 'all', page ?? 1, Boolean(totals), Boolean(ids), minDigits ?? 3],
        // Using the signal lets React Query abort a search that further typing has superseded.
        queryFn: ({ signal }) => searchCrm(trimmed, { limit, category, page, totals, ids, minDigits }, signal),
        enabled: trimmed.length > 0,
        placeholderData: keepPreviousData,
        staleTime: 30 * 1000,
    });

    if (!trimmed) return { results: emptySearchResults(), isFetching: false, isLoading: false, isError: false };
    return {
        results: remote.data?.results ?? emptySearchResults(),
        totals: remote.data?.totals,
        ids: remote.data?.ids,
        isFetching: remote.isFetching,
        isLoading: remote.isLoading,
        isError: remote.isError,
    };
}
