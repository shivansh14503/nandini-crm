import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { scorecardService } from '@/services/scorecard.service';
import type { CrmModuleKey } from '@/types/formConfig.types';
import type { SaveScorecardPayload, ScorecardConfig } from '@/types/scorecard.types';

export const SCORECARDS_QUERY_KEY = ['scorecards'] as const;
const SCORECARDS_STALE_MS = 5 * 60 * 1000;

/** Every module's scorecard (one small request shared by list screens, columns and drawers). */
export function useScorecards() {
    return useQuery({
        queryKey: SCORECARDS_QUERY_KEY,
        queryFn: () => scorecardService.listAll(),
        staleTime: SCORECARDS_STALE_MS,
    });
}

/** The module's scorecard; null when the admin hasn't configured one (the screen keeps its built-in cards). */
export function useScorecard(module: CrmModuleKey | undefined): ScorecardConfig | null {
    const { data } = useScorecards();
    return (module && data?.[module]) || null;
}

export function useSaveScorecard(module: CrmModuleKey) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (payload: SaveScorecardPayload) => scorecardService.save(module, payload),
        onSuccess: (saved) => {
            queryClient.setQueryData<Partial<Record<CrmModuleKey, ScorecardConfig>>>(SCORECARDS_QUERY_KEY, (prev) => ({
                ...prev,
                [module]: saved,
            }));
        },
    });
}

export function useResetScorecard(module: CrmModuleKey) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: () => scorecardService.reset(module),
        onSuccess: () => {
            queryClient.setQueryData<Partial<Record<CrmModuleKey, ScorecardConfig>>>(SCORECARDS_QUERY_KEY, (prev) => {
                const next = { ...prev };
                delete next[module];
                return next;
            });
        },
    });
}
