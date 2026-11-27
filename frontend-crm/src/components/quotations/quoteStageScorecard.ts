import { QUOTE_STAGES, type Quotation } from '@/types/quotation.types';
import type { DefaultScorecard, ScorecardAmount } from '../common/scorecard/scorecardItems';
import { LINE_ITEM_CARD_AMOUNTS, useDropdownScorecard } from '../common/scorecard/stageScorecard';

/** Dropdown category of the Quote Stage field. */
export const QUOTE_STAGE_CATEGORY = 'quote_stage';

/**
 * Card color of each built-in quote stage (scorecard palette names), close to the old CRM's cards where it had the
 * stage. Keyed by the stored value, which stays the same when an admin renames the option.
 */
const QUOTE_STAGE_COLORS: Readonly<Record<string, string>> = {
    Draft: 'Sky',
    Negotiation: 'Yellow',
    Delivered: 'Violet',
    'On Hold': 'Orange',
    Confirmed: 'Green',
    'Closed Accepted': 'Teal',
    'Closed Lost': 'Red',
    'Closed Dead': 'Slate',
};

/**
 * Totals the quote stage cards can show, in the order of the scorecard's currency dropdown. The first (Grand
 * Total) is the default, saved as no currency field; the API lists the others for `quotations` in
 * BUILT_IN_SCORECARD_AMOUNTS (backend scorecard.validator.ts).
 */
export const QUOTATION_CARD_AMOUNTS: readonly ScorecardAmount<Quotation>[] = [
    LINE_ITEM_CARD_AMOUNTS.grandTotal,
    LINE_ITEM_CARD_AMOUNTS.totalAmount,
    LINE_ITEM_CARD_AMOUNTS.subtotal,
    LINE_ITEM_CARD_AMOUNTS.actualBeforeTax,
    LINE_ITEM_CARD_AMOUNTS.totalDiscount,
    LINE_ITEM_CARD_AMOUNTS.totalTax,
    LINE_ITEM_CARD_AMOUNTS.subtotalPlusTax,
    LINE_ITEM_CARD_AMOUNTS.lumpSumDiscount,
    LINE_ITEM_CARD_AMOUNTS.roundOffAmount,
];

/**
 * The Quotations list's cards until an admin saves a scorecard: one per active quote stage, in the admin's order.
 * Stages added by an admin get the next palette color no other stage uses.
 */
export function useQuoteStageScorecard(): DefaultScorecard {
    return useDropdownScorecard('quoteStage', QUOTE_STAGE_CATEGORY, QUOTE_STAGES, QUOTE_STAGE_COLORS);
}
