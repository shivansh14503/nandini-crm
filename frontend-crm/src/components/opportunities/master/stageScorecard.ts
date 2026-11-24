import { useMemo } from 'react';
import { useDropdownOptions } from '@/hooks/queries/useFormConfigs';
import { OPPORTUNITY_SALES_STAGES, type Opportunity } from '@/types/opportunity.types';
import type { DefaultScorecard, ScorecardAmount } from '../../common/scorecard/useModuleScorecard';
import { SCORECARD_PALETTE, scorecardPaletteHex } from '../../common/scorecard/scorecardUtils';

/** Dropdown category of the Sales Stage field. */
export const SALES_STAGE_CATEGORY = 'opportunity_sales_stage';

/**
 * Card color of each built-in stage (scorecard palette names, so an admin sees the same swatches in the scorecard
 * settings). Keyed by the stored value, which stays the same when an admin renames the option.
 */
const STAGE_COLORS: Readonly<Record<string, string>> = {
    Qualification: 'Pink',
    Demo: 'Yellow',
    'Proposal/Price Quote': 'Violet',
    Negotiation: 'Slate',
    'On Hold': 'Orange',
    'Closed Won': 'Green',
    'Closed Lost': 'Red',
    PO: 'Sky',
    'Advance Received': 'Teal',
};

/** A deal's value after discounts, before tax (the list's "Actual (Before Tax)" column). */
export function opportunityAmountBeforeTax(o: Opportunity): number {
    const value = o.subtotal ?? (Number(o.grandTotal) || 0) - (Number(o.totalTax) || 0);
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

export const OPPORTUNITY_CARD_AMOUNT: ScorecardAmount<Opportunity> = {
    label: 'Actual (Before Tax)',
    of: opportunityAmountBeforeTax,
};

/**
 * The Opportunities list's cards until an admin saves a scorecard: one per active sales stage, in the admin's
 * order. Stages added by an admin get the next palette color no other stage uses.
 */
export function useStageScorecard(): DefaultScorecard {
    const stages = useDropdownOptions(SALES_STAGE_CATEGORY, OPPORTUNITY_SALES_STAGES);
    return useMemo(() => {
        const used = new Set(stages.map((stage) => STAGE_COLORS[stage]).filter(Boolean));
        const spare = SCORECARD_PALETTE.map((c) => c.name).filter((name) => !used.has(name));
        let next = 0;
        return {
            fieldKey: 'salesStage',
            options: stages.map((stage) => {
                // More stages than palette colors: start over ('' is the palette's first color).
                const name = STAGE_COLORS[stage] ?? spare[next++ % spare.length] ?? '';
                return { value: stage, color: scorecardPaletteHex(name) };
            }),
        };
    }, [stages]);
}
