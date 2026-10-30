import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { emptySearchResults, searchCrm, type GlobalSearchResults } from '@/services/globalSearch.service';

/** Global search results for a (debounced) query; previous results stay visible while the next query loads. */
export function useGlobalSearch(query: string, limitPerCategory = 5): { results: GlobalSearchResults; isFetching: boolean } {
    const trimmed = query.trim();
    const remote = useQuery({
        queryKey: ['globalSearch', trimmed.toLowerCase(), limitPerCategory],
        queryFn: () => searchCrm(trimmed, limitPerCategory),
        enabled: trimmed.length > 0,
        placeholderData: keepPreviousData,
        staleTime: 30 * 1000,
    });

    if (!trimmed) return { results: emptySearchResults(), isFetching: false };
    return { results: remote.data ?? emptySearchResults(), isFetching: remote.isFetching };
}
