import { useMemo } from 'react';
import { useDropdownOptions } from '@/hooks/queries/useFormConfigs';
import type { DefaultScorecard, ScorecardAmount } from './useModuleScorecard';
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
    totalTax?: number | string | null;
    grandTotal?: number | string | null;
    lumpSumDiscount?: number | string | null;
}

/**
 * Line-item totals a scorecard can show, labelled as in the record's Line Items box. Keys are what the scorecard
 * saves as `currencyFieldKey`; the API accepts a key only for modules that list it in BUILT_IN_SCORECARD_AMOUNTS
 * (backend scorecard.validator.ts).
 */
export const LINE_ITEM_CARD_AMOUNTS = {
    totalAmount: { key: 'builtin.totalAmount', label: 'Total', of: (r) => scorecardNumber(r.totalAmount) },
    subtotal: { key: 'builtin.subtotal', label: 'Subtotal', of: (r) => scorecardNumber(r.subtotal) },
    totalDiscount: { key: 'builtin.totalDiscount', label: 'Discount', of: (r) => scorecardNumber(r.totalDiscount) },
    totalTax: { key: 'builtin.totalTax', label: 'Tax', of: (r) => scorecardNumber(r.totalTax) },
    grandTotal: { key: 'builtin.grandTotal', label: 'Grand Total', of: (r) => scorecardNumber(r.grandTotal) },
    subtotalPlusTax: {
        key: 'builtin.subtotalPlusTax',
        label: 'Subtotal + Tax',
        of: (r) => scorecardNumber(r.subtotal) + scorecardNumber(r.totalTax),
    },
    lumpSumDiscount: { key: 'builtin.lumpSumDiscount', label: 'Lump Sum Discount', of: (r) => scorecardNumber(r.lumpSumDiscount) },
} as const satisfies Record<string, ScorecardAmount<LineItemTotals>>;
