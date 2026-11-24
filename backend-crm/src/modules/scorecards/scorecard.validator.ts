import { z } from 'zod';
import { moduleSchema } from '../form-configs/formConfig.validator.js';

/** Most cards a scorecard can configure (one per dropdown option). */
export const MAX_SCORECARD_OPTIONS = 60;

/** Prefix of a `currencyFieldKey` that names a total the list computes itself instead of a form field. */
export const BUILT_IN_AMOUNT_PREFIX = 'builtin.';

/**
 * Totals each module's list screen works out from its records (not form fields) that a scorecard can total per
 * card. Keep in step with the frontend's `amounts` for that module (OPPORTUNITY_CARD_AMOUNTS,
 * QUOTATION_CARD_AMOUNTS). The screen's default total is saved as `currencyFieldKey: null`, so it isn't listed.
 */
export const BUILT_IN_SCORECARD_AMOUNTS: Readonly<Record<string, readonly string[]>> = {
    // Default: Actual (Before Tax).
    opportunities: [
        'builtin.totalAmount',
        'builtin.subtotal',
        'builtin.totalDiscount',
        'builtin.totalTax',
        'builtin.grandTotal',
        'builtin.subtotalPlusTax',
        'builtin.commissionAmount',
        'builtin.lumpSumDiscount',
    ],
    // Default: Grand Total.
    quotations: [
        'builtin.totalAmount',
        'builtin.subtotal',
        'builtin.totalDiscount',
        'builtin.totalTax',
        'builtin.subtotalPlusTax',
        'builtin.lumpSumDiscount',
    ],
};

/** True when `key` names a built-in total (`builtin.…`), whether or not the module offers it. */
export const isBuiltInAmountKey = (key: string) => key.startsWith(BUILT_IN_AMOUNT_PREFIX);

/** True when the module's list offers this built-in total. */
export const moduleHasBuiltInAmount = (module: string, key: string) => (BUILT_IN_SCORECARD_AMOUNTS[module] ?? []).includes(key);

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Colors must be hex values such as #2563EB.');

export const scorecardOptionSchema = z.object({
    /** Stored option value of the field's dropdown. */
    value: z.string().trim().min(1).max(200),
    color: hexColor,
    /** Kept in the config (with its color) but no card is shown for it. */
    hidden: z.boolean().optional(),
});

export type ScorecardOption = z.infer<typeof scorecardOptionSchema>;

export const scorecardOptionsSchema = z.array(scorecardOptionSchema).max(MAX_SCORECARD_OPTIONS);

export const saveScorecardSchema = z.object({
    fieldKey: z.string().trim().min(1, 'Select a dropdown field.').max(80),
    currencyFieldKey: z.string().trim().min(1).max(80).nullable().optional(),
    options: scorecardOptionsSchema.refine(
        (options) => new Set(options.map((o) => o.value)).size === options.length,
        'Each option can appear only once.'
    ),
    listViewColor: z.boolean(),
    drawerViewColor: z.boolean(),
});

export type SaveScorecardInput = z.infer<typeof saveScorecardSchema>;

export const scorecardModuleParamSchema = z.object({ module: moduleSchema });
