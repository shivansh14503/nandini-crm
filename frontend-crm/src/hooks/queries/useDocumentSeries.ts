import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { documentSeriesService } from '@/services/documentSeries.service';
import type { SaveDocumentSeriesPayload } from '@/types/documentSeries.types';

export const DOCUMENT_SERIES_QUERY_KEY = ['document-series'] as const;

export function useDocumentSeries() {
    return useQuery({ queryKey: DOCUMENT_SERIES_QUERY_KEY, queryFn: () => documentSeriesService.get(), staleTime: 30 * 1000 });
}

export function useSaveDocumentSeries() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (payload: SaveDocumentSeriesPayload) => documentSeriesService.save(payload),
        onSuccess: (config) => queryClient.setQueryData(DOCUMENT_SERIES_QUERY_KEY, config),
    });
}
