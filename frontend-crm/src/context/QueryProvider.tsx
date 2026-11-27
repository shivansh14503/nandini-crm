'use client';

import React, { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { subscribeCrmUpdates } from '@/services/crmSync';
import { queryKeys, queryEntityFromSync } from '@/hooks/queries/queryKeys';
import { auditLogKeys } from '@/hooks/queries/useAuditLogs';
import { MASTER_DATA_QUERY_KEY } from '@/hooks/queries/useMasterData';
import { FORM_CONFIGS_QUERY_KEY } from '@/hooks/queries/useFormConfigs';
import { FORM_CONFIG_SYNC_ENTITY } from '@/services/formConfig.service';
import { DRAWER_LAYOUT_SYNC_ENTITY } from '@/services/drawerLayout.service';
import { DRAWER_LAYOUTS_QUERY_KEY } from '@/hooks/queries/useDrawerLayouts';
import { MASTER_DATA_SYNC_ENTITY } from '@/services/masterData.service';
import { COMPANY_FORMATS_SYNC_ENTITY } from '@/services/companyFormats.service';
import { COMPANY_FORMATS_QUERY_KEY } from '@/hooks/queries/useCompanyFormats';
import { COMPANY_SETTINGS_SYNC_ENTITY } from '@/services/companySettings.service';
import { COMPANY_SETTINGS_QUERY_KEY } from '@/hooks/queries/useCompanySettings';

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
                // Admin form / dropdown changes only affect the configuration queries.
                if (entity === FORM_CONFIG_SYNC_ENTITY) {
                    queryClient.invalidateQueries({ queryKey: FORM_CONFIGS_QUERY_KEY });
                    return;
                }
                if (entity === DRAWER_LAYOUT_SYNC_ENTITY) {
                    queryClient.invalidateQueries({ queryKey: DRAWER_LAYOUTS_QUERY_KEY });
                    return;
                }
                // Admin › Company formats: refetch even where nothing observes the query, so the display store updates.
                if (entity === COMPANY_FORMATS_SYNC_ENTITY) {
                    queryClient.invalidateQueries({ queryKey: COMPANY_FORMATS_QUERY_KEY, refetchType: 'all' });
                    return;
                }
                // Admin › Company Details: records saved without a company state take the GST split, so their totals change too.
                if (entity === COMPANY_SETTINGS_SYNC_ENTITY) {
                    queryClient.invalidateQueries({ queryKey: COMPANY_SETTINGS_QUERY_KEY });
                    queryClient.invalidateQueries({ queryKey: queryKeys.opportunities.all });
                    queryClient.invalidateQueries({ queryKey: queryKeys.quotations.all });
                    return;
                }
                // Writes that change the user directory / masters behind the lookups (e.g. a user's company email).
                if (entity === MASTER_DATA_SYNC_ENTITY) {
                    queryClient.invalidateQueries({ queryKey: MASTER_DATA_QUERY_KEY });
                    return;
                }
                const key = queryEntityFromSync(entity);
                // The bell's own writes (read / read all) aren't audited and show nowhere else.
                if (key === 'notifications') {
                    queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
                    return;
                }
                queryClient.invalidateQueries(key ? { queryKey: queryKeys[key].all } : undefined);
                if (key) queryClient.invalidateQueries({ queryKey: auditLogKeys.all });
                // Opportunities write their document (Documentation section): the Documents list follows them.
                if (key === 'opportunities') queryClient.invalidateQueries({ queryKey: queryKeys.documents.all });
                // Products show how many opportunities carry them (Usage): line item and stage changes move the counts.
                if (key === 'opportunities') queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
                // Lead / opportunity saves write their follow-up activity (Calendar Phase 2 P2-4): every activity
                // query (lists, Activities tabs, calendar) follows them. The calendar also shows contract renewals.
                if (key === 'leads' || key === 'opportunities') {
                    queryClient.invalidateQueries({ queryKey: queryKeys.activities.all });
                } else if (key === 'contracts') {
                    queryClient.invalidateQueries({ queryKey: [...queryKeys.activities.all, 'calendar'] });
                }
                // Calendar sync rows show on Admin › API Integrations › People, and admin changes (provider, People choice) change the user's own status.
                if (key === 'calendarConnections') queryClient.invalidateQueries({ queryKey: queryKeys.integrations.all });
                if (key === 'integrations') queryClient.invalidateQueries({ queryKey: queryKeys.calendarConnections.all });
                // Partner companies also feed the master data behind the Partner Company lookups.
                if (key === 'partnerCompanies') queryClient.invalidateQueries({ queryKey: MASTER_DATA_QUERY_KEY });
            }),
        [queryClient]
    );

    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
