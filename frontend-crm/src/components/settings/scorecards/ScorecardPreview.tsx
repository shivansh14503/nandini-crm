'use client';

import React, { useMemo, useState } from 'react';
import NextLink from 'next/link';
import { Box, Typography } from '@mui/material';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import { StatusSummaryCards, StatusSummaryCardsSkeleton, type StatusSummaryItem } from '@/components/common/StatusSummaryCards';
import { SCORECARD_MODULES, scorecardAmountsOf } from '@/components/common/scorecard/scorecardModules';
import { SCORECARD_ALL_ID, buildScorecardCards, defaultScorecardConfig, type DefaultScorecard } from '@/components/common/scorecard/scorecardItems';
import { resolveScorecard } from '@/components/common/scorecard/scorecardUtils';
import { leadStatusSummaryItems } from '@/components/leads/master/leadStatusCards';
import { ROUTES } from '@/config/constants';
import {
    useActivities,
    useContacts,
    useContracts,
    useLeads,
    useOpportunities,
    useOrganizations,
    usePartnerCompanies,
    useProducts,
    useQuotations,
    useTickets,
    useReferrals,
} from '@/hooks/queries';
import { CRM_MODULE_LABELS, type CrmModuleKey, type FormConfigsPayload } from '@/types/formConfig.types';
import { panelHeaderSx, surfaceSx } from '../form-customization/builderUi';
import { draftConfig, type DraftMode, type ScorecardDraft } from './scorecardDraft';
import { fmtCount, useDisplayFormats } from '@/utils/formats';

/** Each module's list screen. */
const LIST_ROUTE: Record<CrmModuleKey, string> = {
    leads: ROUTES.LEADS,
    opportunities: ROUTES.OPPORTUNITIES,
    quotations: ROUTES.QUOTATIONS,
    organizations: ROUTES.ORGANIZATIONS,
    contacts: ROUTES.CONTACTS,
    products: ROUTES.PRODUCTS,
    tickets: ROUTES.TICKETS,
    'partner-companies': ROUTES.PARTNER_COMPANIES,
    contracts: ROUTES.CONTRACTS,
    activities: ROUTES.ACTIVITIES,
    referrals: ROUTES.REFERRALS,
};

const NO_ROWS: readonly unknown[] = [];

/** "opportunities" → "opportunity", "leads" → "lead". */
const singular = (noun: string) => (noun.endsWith('ies') ? `${noun.slice(0, -3)}y` : noun.replace(/s$/, ''));

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Activities grow fastest of all modules, so the preview loads a window around today (30 days back, 60 ahead)
 * rather than every activity. Fixed for the life of the preview so the query key stays stable.
 */
function activityPreviewWindow(): { from: string; to: string } {
    const now = Date.now();
    return { from: new Date(now - 30 * DAY_MS).toISOString(), to: new Date(now + 60 * DAY_MS).toISOString() };
}

/**
 * The module's records, from the same cache as its list screen. Every hook runs (so the hook order never
 * changes), but only the selected module's list is fetched.
 */
function usePreviewRecords(module: CrmModuleKey): { rows: readonly unknown[]; loading: boolean; failed: boolean } {
    const [activityWindow] = useState(activityPreviewWindow);
    const queries = {
        leads: useLeads(undefined, { enabled: module === 'leads' }),
        opportunities: useOpportunities(undefined, { enabled: module === 'opportunities' }),
        quotations: useQuotations(undefined, { enabled: module === 'quotations' }),
        organizations: useOrganizations(undefined, { enabled: module === 'organizations' }),
        contacts: useContacts(undefined, { enabled: module === 'contacts' }),
        products: useProducts(undefined, { enabled: module === 'products' }),
        tickets: useTickets(undefined, { enabled: module === 'tickets' }),
        'partner-companies': usePartnerCompanies(undefined, { enabled: module === 'partner-companies' }),
        contracts: useContracts(undefined, { enabled: module === 'contracts' }),
        activities: useActivities(activityWindow, { enabled: module === 'activities' }),
        referrals: useReferrals(undefined, { enabled: module === 'referrals' }),
    } satisfies Record<CrmModuleKey, unknown>;
    const query = queries[module];
    return { rows: (query.data as readonly unknown[] | undefined) ?? NO_ROWS, loading: query.isPending, failed: query.isError };
}

export interface ScorecardPreviewProps {
    module: CrmModuleKey;
    configs: FormConfigsPayload | null;
    draft: ScorecardDraft;
    mode: DraftMode;
    /** The screen's built-in cards (Opportunities, Quotations, Contracts), for the "built-in" preview. */
    defaults: DefaultScorecard | null;
}

/**
 * Live preview of the draft: the cards the module's list would show with these settings, counted over the
 * module's real records (built with the list screens' own code, so it can't drift from them).
 */
export function ScorecardPreview({ module, configs, draft, mode, defaults }: ScorecardPreviewProps) {
    const info = SCORECARD_MODULES[module];
    const { rows, loading, failed } = usePreviewRecords(module);
    const [activeId, setActiveId] = useState<string>(SCORECARD_ALL_ID);
    const noun = CRM_MODULE_LABELS[module].toLowerCase();
    useDisplayFormats(); // the record count below follows the company number grouping

    const items = useMemo((): StatusSummaryItem<string>[] | null => {
        if (mode === 'off') return null;
        const amounts = scorecardAmountsOf<unknown>(module);
        if (mode === 'builtin') {
            if (module === 'leads') return leadStatusSummaryItems(rows as readonly { status?: string | null }[]);
            const scorecard = defaults ? resolveScorecard(defaultScorecardConfig(module, defaults), configs, module) : null;
            return scorecard ? buildScorecardCards({ scorecard, rows, allLabel: info.allLabel, allIcon: info.allIcon, amounts }).items : null;
        }
        const scorecard = resolveScorecard(draftConfig(module, draft), configs, module);
        if (!scorecard) return null;
        const allLabel = draft.allLabel.trim() || info.allLabel;
        return buildScorecardCards({ scorecard, rows, allLabel, allIcon: info.allIcon, amounts }).items;
    }, [mode, module, rows, defaults, configs, draft, info]);

    // A card that is no longer shown falls back to the first ("All") card.
    const shownActiveId = items?.some((i) => i.id === activeId) ? activeId : (items?.[0]?.id ?? SCORECARD_ALL_ID);

    let body: React.ReactNode;
    if (mode === 'off') {
        body = (
            <Box sx={{ py: 3, px: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 0.75 }}>
                <VisibilityOffOutlinedIcon sx={{ color: 'var(--mui-palette-text-muted)' }} />
                <Typography sx={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--crm-slate-900)' }}>No cards on the {CRM_MODULE_LABELS[module]} list</Typography>
                <Typography sx={{ fontSize: '0.78rem', color: 'var(--mui-palette-text-secondary)', maxWidth: 420 }}>
                    Switch the cards on to show a summary row above the list.
                    {draft.listViewColor || draft.drawerViewColor ? ' The list column and drawer colors below still apply.' : ''}
                </Typography>
            </Box>
        );
    } else if (loading || !configs) {
        body = <StatusSummaryCardsSkeleton count={Math.min(draft.options.filter((o) => !o.hidden).length + 1, 8) || 5} withAmount={Boolean(info.amounts?.length)} />;
    } else if (!items) {
        body = (
            <Typography sx={{ py: 3, px: 2, textAlign: 'center', fontSize: '0.8rem', color: 'var(--mui-palette-text-secondary)' }}>
                Pick a dropdown field to see the cards.
            </Typography>
        );
    } else {
        body = <StatusSummaryCards<string> items={items} activeId={shownActiveId} onChange={setActiveId} />;
    }

    return (
        <Box component="section" aria-label="Preview" sx={{ ...surfaceSx, overflow: 'hidden', minWidth: 0 }}>
            <Box sx={{ ...panelHeaderSx, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography component="h2" sx={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--crm-slate-900)' }}>
                        Preview
                    </Typography>
                    <Typography sx={{ fontSize: '0.75rem', color: 'var(--mui-palette-text-secondary)' }}>
                        {mode === 'builtin'
                            ? `The list's built-in cards, counted over your ${noun}.`
                            : `How the cards will look on the ${CRM_MODULE_LABELS[module]} list, counted over your ${noun}.`}
                    </Typography>
                </Box>
                <Box
                    component={NextLink}
                    href={LIST_ROUTE[module]}
                    target="_blank"
                    rel="noopener"
                    sx={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 0.5,
                        minHeight: 32,
                        px: 1,
                        borderRadius: '8px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        textDecoration: 'none',
                        color: 'var(--crm-text-blue-700)',
                        '&:hover': { backgroundColor: 'var(--mui-palette-primary-soft)', color: 'var(--crm-text-blue-600)' },
                    }}
                >
                    Open the list
                    <OpenInNewRoundedIcon sx={{ fontSize: 14 }} />
                </Box>
            </Box>
            <Box sx={{ p: { xs: 1.5, md: 2 }, minWidth: 0 }}>{body}</Box>
            {mode !== 'off' && !loading && configs && (
                <Typography sx={{ px: 2, pb: 1.5, mt: -0.5, fontSize: '0.72rem', color: 'var(--mui-palette-text-muted)' }}>
                    {failed
                        ? `Couldn't load the ${noun}, so every card shows 0.`
                        : rows.length === 0
                          ? `No ${noun} yet, so every card shows 0.`
                          : `${fmtCount(rows.length)} ${rows.length === 1 ? singular(noun) : noun}. On the list, the cards count the records in the view you have open.`}
                </Typography>
            )}
        </Box>
    );
}
