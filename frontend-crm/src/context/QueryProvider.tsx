'use client';

import React, { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { subscribeCrmUpdates } from '@/services/crmSync';
import { queryKeys, queryEntityFromSync } from '@/hooks/queries/queryKeys';
import { auditLogKeys } from '@/hooks/queries/useAuditLogs';
import { MASTER_DATA_QUERY_KEY } from '@/hooks/queries/useMasterData';

export function QueryProvider({ children }: { children: React.ReactNode }) {
    const [queryClient] = useState(
        () =>
            new QueryClient({
                defaultOptions: {
                    queries: {
                        staleTime: 60 * 1000,
                        gcTime: 5 * 60 * 1000,
                        refetchOnWindowFocus: false,
                        retry: 1,
                    },
                },
            })
    );

    // Bridge: every notifyCrmUpdate (this tab or another) invalidates the matching cache. Updates from an
    // entity without its own keys (e.g. lead conversion, which writes several entities) invalidate everything.
    // Any write also adds audit entries, so revision trails refetch too.
    useEffect(
        () =>
            subscribeCrmUpdates(({ entity }) => {
                const key = queryEntityFromSync(entity);
                queryClient.invalidateQueries(key ? { queryKey: queryKeys[key].all } : undefined);
                if (key) queryClient.invalidateQueries({ queryKey: auditLogKeys.all });
                // Partner companies also feed the master data behind the Partner Company lookups.
                if (key === 'partnerCompanies') queryClient.invalidateQueries({ queryKey: MASTER_DATA_QUERY_KEY });
            }),
        [queryClient]
    );

    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
