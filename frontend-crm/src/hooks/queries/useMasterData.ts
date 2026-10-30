import { useQuery } from '@tanstack/react-query';
import { loadMasterData } from '@/services/masterData.service';
import { getMasterData, type MasterData } from '@/services/masterData.store';

export const MASTER_DATA_QUERY_KEY = ['masters'] as const;
export const MASTER_DATA_STALE_MS = 10 * 60 * 1000;

/**
 * Users, Nature of Call and partner masters from `/api/lookups/*`, loaded once (shared with CrmDataBootstrap's
 * prefetch). Components re-render when it arrives instead of keeping the empty lists they saw at mount.
 */
export function useMasterData(): MasterData {
    const { data } = useQuery({ queryKey: MASTER_DATA_QUERY_KEY, queryFn: loadMasterData, staleTime: MASTER_DATA_STALE_MS });
    return data ?? getMasterData();
}
