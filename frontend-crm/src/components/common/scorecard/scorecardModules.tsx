'use client';

import React from 'react';
import GroupOutlinedIcon from '@mui/icons-material/GroupOutlined';
import TrendingUpOutlinedIcon from '@mui/icons-material/TrendingUpOutlined';
import RequestQuoteOutlinedIcon from '@mui/icons-material/RequestQuoteOutlined';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import ConfirmationNumberOutlinedIcon from '@mui/icons-material/ConfirmationNumberOutlined';
import HandshakeOutlinedIcon from '@mui/icons-material/HandshakeOutlined';
import HistoryEduOutlinedIcon from '@mui/icons-material/HistoryEduOutlined';
import EventNoteOutlinedIcon from '@mui/icons-material/EventNoteOutlined';
import ConnectWithoutContactOutlinedIcon from '@mui/icons-material/ConnectWithoutContactOutlined';
import type { CrmModuleKey } from '@/types/formConfig.types';
// Straight from the files (not the module barrels), so the registry never pulls in a list screen.
import { OPPORTUNITY_CARD_AMOUNTS, useStageScorecard } from '../../opportunities/master/stageScorecard';
import { QUOTATION_CARD_AMOUNTS, useQuoteStageScorecard } from '../../quotations/quoteStageScorecard';
import { CONTRACT_CARD_AMOUNTS, useContractStatusScorecard } from '../../contracts/contractStatusScorecard';
import type { DefaultScorecard, ScorecardAmount } from './scorecardItems';

/**
 * What each module's list screen brings to its scorecard: the "All" card, whether it has cards before an admin
 * saves a scorecard, and the totals it works out itself. Read by the list screens (useModuleScorecard) and by
 * Admin › List Scorecards, so the admin's preview always matches the real screen.
 */
export interface ScorecardModuleInfo {
    /** Wording of the "All" card unless the admin sets another. */
    allLabel: string;
    allIcon: React.ReactNode;
    /**
     * The list shows cards before an admin saves a scorecard: Leads its status buckets, Opportunities and
     * Quotations their stage cards, Contracts its status cards. The other lists show none until an admin switches their scorecard on.
     */
    builtInCards: boolean;
    /**
     * Totals the list works out from each record (not form fields), offered above the form's amount fields in the
     * currency dropdown. The first is the default, saved as no currency field. Keep in step with the API's
     * BUILT_IN_SCORECARD_AMOUNTS (backend scorecard.validator.ts).
     */
    amounts?: readonly ScorecardAmount<never>[];
}

export const SCORECARD_MODULES: Readonly<Record<CrmModuleKey, ScorecardModuleInfo>> = {
    leads: { allLabel: 'All Leads', allIcon: <GroupOutlinedIcon />, builtInCards: true },
    opportunities: {
        allLabel: 'All Opportunities',
        allIcon: <TrendingUpOutlinedIcon />,
        builtInCards: true,
        amounts: OPPORTUNITY_CARD_AMOUNTS as readonly ScorecardAmount<never>[],
    },
    quotations: {
        allLabel: 'All Quotations',
        allIcon: <RequestQuoteOutlinedIcon />,
        builtInCards: true,
        amounts: QUOTATION_CARD_AMOUNTS as readonly ScorecardAmount<never>[],
    },
    organizations: { allLabel: 'All Organizations', allIcon: <BusinessOutlinedIcon />, builtInCards: false },
    contacts: { allLabel: 'All Contacts', allIcon: <PeopleOutlinedIcon />, builtInCards: false },
    products: { allLabel: 'All Products', allIcon: <CategoryOutlinedIcon />, builtInCards: false },
    tickets: { allLabel: 'All Tickets', allIcon: <ConfirmationNumberOutlinedIcon />, builtInCards: false },
    'partner-companies': { allLabel: 'All Partner Companies', allIcon: <HandshakeOutlinedIcon />, builtInCards: false },
    referrals: { allLabel: 'All Referrals', allIcon: <ConnectWithoutContactOutlinedIcon />, builtInCards: false },
    contracts: {
        allLabel: 'All Contracts',
        allIcon: <HistoryEduOutlinedIcon />,
        builtInCards: true,
        amounts: CONTRACT_CARD_AMOUNTS as readonly ScorecardAmount<never>[],
    },
    activities: { allLabel: 'All Activities', allIcon: <EventNoteOutlinedIcon />, builtInCards: false },
};

/** The module's own totals, typed for its records. */
export const scorecardAmountsOf = <T,>(module: CrmModuleKey) => SCORECARD_MODULES[module].amounts as readonly ScorecardAmount<T>[] | undefined;

/**
 * The per-option cards a list shows before an admin saves a scorecard (Opportunities and Quotations: one card per
 * stage; Contracts: one per status), or null. Both stage hooks run every time (they only read the cached dropdown options), so the hook
 * order stays the same whichever module is asked for.
 */
export function useDefaultScorecard(module: CrmModuleKey): DefaultScorecard | null {
    const opportunityStages = useStageScorecard();
    const quoteStages = useQuoteStageScorecard();
    const contractStatuses = useContractStatusScorecard();
    if (module === 'opportunities') return opportunityStages;
    if (module === 'quotations') return quoteStages;
    if (module === 'contracts') return contractStatuses;
    return null;
}
