import { OPPORTUNITY_SALES_STAGES, type Opportunity } from '@/types/opportunity.types';
import type { DefaultScorecard, ScorecardAmount } from '../../common/scorecard/useModuleScorecard';
import { LINE_ITEM_CARD_AMOUNTS, scorecardNumber as num, useDropdownScorecard } from '../../common/scorecard/stageScorecard';

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
    return o.subtotal !== undefined && o.subtotal !== null ? num(o.subtotal) : num(o.grandTotal) - num(o.totalTax);
}

/** The percentage in a Commission option ("Standard (10%)" → 10); 0 when it names none. */
export function commissionPercent(commission: string | undefined): number {
    const match = (commission ?? '').match(/(\d+(?:\.\d+)?)\s*%/);
    return match ? Number(match[1]) : 0;
}

/**
 * Totals the stage cards can show, in the order of the scorecard's currency dropdown. The first is the default
 * (saved as no currency field); the others are saved by key, which the API accepts only for keys it lists in
 * BUILT_IN_SCORECARD_AMOUNTS (backend scorecard.validator.ts). Labels match the deal's Line Items totals.
 */
export const OPPORTUNITY_CARD_AMOUNTS: readonly ScorecardAmount<Opportunity>[] = [
    { key: 'builtin.actualBeforeTax', label: 'Actual (Before Tax)', of: opportunityAmountBeforeTax },
    LINE_ITEM_CARD_AMOUNTS.totalAmount,
    LINE_ITEM_CARD_AMOUNTS.subtotal,
    LINE_ITEM_CARD_AMOUNTS.totalDiscount,
    LINE_ITEM_CARD_AMOUNTS.totalTax,
    LINE_ITEM_CARD_AMOUNTS.grandTotal,
    LINE_ITEM_CARD_AMOUNTS.subtotalPlusTax,
    {
        key: 'builtin.commissionAmount',
        label: 'Commission Amount',
        // The deal's value before tax × the percentage in its Commission option.
        of: (o) => Math.round((opportunityAmountBeforeTax(o) * commissionPercent(o.commission)) / 100),
    },
    LINE_ITEM_CARD_AMOUNTS.lumpSumDiscount,
];

/**
 * The Opportunities list's cards until an admin saves a scorecard: one per active sales stage, in the admin's
 * order. Stages added by an admin get the next palette color no other stage uses.
 */
export function useStageScorecard(): DefaultScorecard {
    return useDropdownScorecard('salesStage', SALES_STAGE_CATEGORY, OPPORTUNITY_SALES_STAGES, STAGE_COLORS);
}
