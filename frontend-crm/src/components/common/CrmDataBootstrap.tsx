'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { MASTER_DATA_QUERY_KEY, MASTER_DATA_STALE_MS } from '@/hooks/queries/useMasterData';
import { loadMasterData } from '@/services/masterData.service';
import { clearMasterData } from '@/services/masterData.store';

/**
 * After sign-in, loads the lightweight masters (users, Nature of Call, partners) that lookups and validation
 * use; entity data is fetched on demand by the views that need it. On sign-out, clears every client-side copy
 * of CRM data so the next user starts clean.
 */
export function CrmDataBootstrap() {
    const { user, loading } = useAuth();
    const queryClient = useQueryClient();
    const userId = user?.id;

    useEffect(() => {
        if (loading) return;
        if (userId === undefined) {
            queryClient.clear();
            clearMasterData();
            return;
        }
        void queryClient.prefetchQuery({ queryKey: MASTER_DATA_QUERY_KEY, queryFn: loadMasterData, staleTime: MASTER_DATA_STALE_MS });
    }, [userId, loading, queryClient]);

    return null;
}
