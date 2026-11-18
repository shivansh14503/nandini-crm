import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { documentSeriesService } from '@/services/documentSeries.service';
import type { SaveDocumentSeriesPayload, SeriesModule } from '@/types/documentSeries.types';

export const DOCUMENT_SERIES_QUERY_KEY = ['document-series'] as const;
export const SHOWN_NUMBER_MODULES_QUERY_KEY = ['document-series', 'shown-modules'] as const;

export function useDocumentSeries() {
    return useQuery({ queryKey: DOCUMENT_SERIES_QUERY_KEY, queryFn: () => documentSeriesService.get(), staleTime: 30 * 1000 });
}

export function useSaveDocumentSeries() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (payload: SaveDocumentSeriesPayload) => documentSeriesService.save(payload),
        onSuccess: (config) => {
            queryClient.setQueryData(DOCUMENT_SERIES_QUERY_KEY, config);
            queryClient.setQueryData<SeriesModule[]>(SHOWN_NUMBER_MODULES_QUERY_KEY, config.series.map((s) => s.module));
        },
    });
}

/**
 * Whether a module's record numbers (LD-…, CON-…) may be shown. Only modules an admin has added a document series
 * for show their numbers; the rest keep them in the backend. Hidden while loading or when the check fails.
 */
export function useShowRecordNumber(): (module: SeriesModule) => boolean {
    const { data } = useQuery({
        queryKey: SHOWN_NUMBER_MODULES_QUERY_KEY,
        queryFn: () => documentSeriesService.getShownModules(),
        staleTime: 60 * 1000,
    });
    return useCallback((module: SeriesModule) => data?.includes(module) ?? false, [data]);
}
