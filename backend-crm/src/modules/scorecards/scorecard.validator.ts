import { z } from 'zod';
import { moduleSchema } from '../form-configs/formConfig.validator.js';

/** Most cards a scorecard can configure (one per dropdown option). */
export const MAX_SCORECARD_OPTIONS = 60;

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
    detailViewColor: z.boolean(),
});

export type SaveScorecardInput = z.infer<typeof saveScorecardSchema>;

export const scorecardModuleParamSchema = z.object({ module: moduleSchema });
