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

const num = (value: unknown) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
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
    { key: 'builtin.totalAmount', label: 'Total', of: (o) => num(o.totalAmount) },
    { key: 'builtin.subtotal', label: 'Subtotal', of: (o) => num(o.subtotal) },
    { key: 'builtin.totalDiscount', label: 'Discount', of: (o) => num(o.totalDiscount) },
    { key: 'builtin.totalTax', label: 'Tax', of: (o) => num(o.totalTax) },
    { key: 'builtin.grandTotal', label: 'Grand Total', of: (o) => num(o.grandTotal) },
    { key: 'builtin.subtotalPlusTax', label: 'Subtotal + Tax', of: (o) => num(o.subtotal) + num(o.totalTax) },
    {
        key: 'builtin.commissionAmount',
        label: 'Commission Amount',
        // The deal's value before tax × the percentage in its Commission option.
        of: (o) => Math.round((opportunityAmountBeforeTax(o) * commissionPercent(o.commission)) / 100),
    },
    { key: 'builtin.lumpSumDiscount', label: 'Lump Sum Discount', of: (o) => num(o.lumpSumDiscount) },
];

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
