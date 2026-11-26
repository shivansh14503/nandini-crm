import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { COMPANY_FORMATS_SYNC_ENTITY, companyFormatsService, loadCompanyFormats } from '@/services/companyFormats.service';
import { notifyCrmUpdate } from '@/services/crmSync';
import type { CompanyFormatsDto, SaveCompanyFormatsPayload } from '@/types/companyFormats.types';
import { setCompanyFormats } from '@/utils/formats';

export const COMPANY_FORMATS_QUERY_KEY = ['company-formats'] as const;
/**
 * Other users pick up an admin's change within this time (or on reload); tabs of the same browser at once. Going stale
 * alone never refetches (window-focus refetch is off app-wide), so the query also polls at this interval while visible.
 */
export const COMPANY_FORMATS_STALE_MS = 30 * 60 * 1000;

/** The company display formats. Every load also fills the display store (utils/formats). */
export function useCompanyFormats({ enabled = true }: { enabled?: boolean } = {}) {
    return useQuery({
        queryKey: COMPANY_FORMATS_QUERY_KEY,
        queryFn: loadCompanyFormats,
        staleTime: COMPANY_FORMATS_STALE_MS,
        refetchInterval: COMPANY_FORMATS_STALE_MS,
        refetchIntervalInBackground: false,
        enabled,
    });
}

function useApplyCompanyFormats() {
    const queryClient = useQueryClient();
    return (dto: CompanyFormatsDto) => {
        queryClient.setQueryData(COMPANY_FORMATS_QUERY_KEY, dto);
        setCompanyFormats(dto);
        notifyCrmUpdate(COMPANY_FORMATS_SYNC_ENTITY);
    };
}

export function useSaveCompanyFormats() {
    const apply = useApplyCompanyFormats();
    return useMutation({ mutationFn: (payload: SaveCompanyFormatsPayload) => companyFormatsService.save(payload), onSuccess: apply });
}

/** Back to the CRM defaults (no saved formats). */
export function useResetCompanyFormats() {
    const apply = useApplyCompanyFormats();
    return useMutation({ mutationFn: () => companyFormatsService.reset(), onSuccess: apply });
}
