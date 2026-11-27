import { useMemo } from 'react';
import { useDropdownOptions } from '@/hooks/queries/useFormConfigs';
import { LINE_ITEM_TOTAL_LABELS } from '@/lib/line-items';
import type { DefaultScorecard, ScorecardAmount } from './scorecardItems';
import { SCORECARD_PALETTE, scorecardPaletteHex } from './scorecardUtils';

/** A stored money value as a number (Decimal columns can arrive as strings; missing ones count as 0). */
export const scorecardNumber = (value: unknown) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
};

/**
 * Default cards of a list screen: one per active option of a dropdown (a stage / status field), in the admin's
 * order. `colors` maps a stored option value to a scorecard palette name (so an admin sees the same swatches in
 * the scorecard settings); options added by an admin get the next palette color no other option uses.
 */
export function useDropdownScorecard(
    fieldKey: string,
    categoryKey: string,
    fallbackOptions: readonly string[],
    colors: Readonly<Record<string, string>>
): DefaultScorecard {
    const values = useDropdownOptions(categoryKey, fallbackOptions);
    return useMemo(() => {
        const used = new Set(values.map((value) => colors[value]).filter(Boolean));
        const spare = SCORECARD_PALETTE.map((c) => c.name).filter((name) => !used.has(name));
        let next = 0;
        return {
            fieldKey,
            options: values.map((value) => {
                // More options than palette colors: start over ('' is the palette's first color).
                const name = colors[value] ?? spare[next++ % spare.length] ?? '';
                return { value, color: scorecardPaletteHex(name) };
            }),
        };
    }, [values, colors, fieldKey]);
}

/** The totals a record with line items stores (its Line Items box: Total … Grand Total). */
export interface LineItemTotals {
    totalAmount?: number | string | null;
    totalDiscount?: number | string | null;
    subtotal?: number | string | null;
    actualBeforeTax?: number | string | null;
    totalTax?: number | string | null;
    roundOffAmount?: number | string | null;
    grandTotal?: number | string | null;
    lumpSumDiscount?: number | string | null;
}

/**
 * Line-item totals a scorecard can show, labelled as in the record's Line Items box. Keys are what the scorecard
 * saves as `currencyFieldKey`; the API accepts a key only for modules that list it in BUILT_IN_SCORECARD_AMOUNTS
 * (backend scorecard.validator.ts).
 */
export const LINE_ITEM_CARD_AMOUNTS = {
    // Labels of the Summary Breakdown (Jira CRM-111): Total Taxable Amount is `subtotal`, GST is `totalTax`.
    totalAmount: { key: 'builtin.totalAmount', label: LINE_ITEM_TOTAL_LABELS.totalAmount, of: (r) => scorecardNumber(r.totalAmount) },
    subtotal: { key: 'builtin.subtotal', label: LINE_ITEM_TOTAL_LABELS.subtotal, of: (r) => scorecardNumber(r.subtotal) },
    // Saved before CRM-111 without the column: Total Taxable Amount − Lump Sum Discount.
    actualBeforeTax: {
        key: 'builtin.actualBeforeTax',
        label: LINE_ITEM_TOTAL_LABELS.actualBeforeTax,
        of: (r) => (r.actualBeforeTax !== undefined && r.actualBeforeTax !== null ? scorecardNumber(r.actualBeforeTax) : Math.max(0, scorecardNumber(r.subtotal) - scorecardNumber(r.lumpSumDiscount))),
    },
    totalDiscount: { key: 'builtin.totalDiscount', label: LINE_ITEM_TOTAL_LABELS.totalDiscount, of: (r) => scorecardNumber(r.totalDiscount) },
    totalTax: { key: 'builtin.totalTax', label: LINE_ITEM_TOTAL_LABELS.totalTax, of: (r) => scorecardNumber(r.totalTax) },
    grandTotal: { key: 'builtin.grandTotal', label: LINE_ITEM_TOTAL_LABELS.grandTotal, of: (r) => scorecardNumber(r.grandTotal) },
    subtotalPlusTax: {
        key: 'builtin.subtotalPlusTax',
        label: `${LINE_ITEM_TOTAL_LABELS.subtotal} + ${LINE_ITEM_TOTAL_LABELS.totalTax}`,
        of: (r) => scorecardNumber(r.subtotal) + scorecardNumber(r.totalTax),
    },
    lumpSumDiscount: { key: 'builtin.lumpSumDiscount', label: LINE_ITEM_TOTAL_LABELS.lumpSumDiscount, of: (r) => scorecardNumber(r.lumpSumDiscount) },
    roundOffAmount: { key: 'builtin.roundOffAmount', label: LINE_ITEM_TOTAL_LABELS.roundOffAmount, of: (r) => scorecardNumber(r.roundOffAmount) },
} as const satisfies Record<string, ScorecardAmount<LineItemTotals>>;
