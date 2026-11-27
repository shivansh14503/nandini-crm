import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { COMPANY_SETTINGS_SYNC_ENTITY, companySettingsService } from '@/services/companySettings.service';
import { notifyCrmUpdate } from '@/services/crmSync';
import type { CompanySettingsDto, SaveCompanySettingsPayload } from '@/types/companySettings.types';

export const COMPANY_SETTINGS_QUERY_KEY = ['company-settings'] as const;
/** Other users pick up an admin's change within this time (or on reload); tabs of the same browser at once (QueryProvider). */
const COMPANY_SETTINGS_STALE_MS = 30 * 60 * 1000;

/** The company details (Company State). */
export function useCompanySettings({ enabled = true }: { enabled?: boolean } = {}) {
    return useQuery({
        queryKey: COMPANY_SETTINGS_QUERY_KEY,
        queryFn: () => companySettingsService.get(),
        staleTime: COMPANY_SETTINGS_STALE_MS,
        enabled,
    });
}

/** Our company's state ('' while not set or loading): line items charge IGST outside it, CGST + SGST within it. */
export function useCompanyState(): string {
    return useCompanySettings().data?.companyState ?? '';
}

export function useSaveCompanySettings() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (payload: SaveCompanySettingsPayload) => companySettingsService.save(payload),
        onSuccess: (dto: CompanySettingsDto) => {
            queryClient.setQueryData(COMPANY_SETTINGS_QUERY_KEY, dto);
            // QueryProvider also refetches opportunities and quotations: records saved without a company state took the GST split.
            notifyCrmUpdate(COMPANY_SETTINGS_SYNC_ENTITY);
        },
    });
}
