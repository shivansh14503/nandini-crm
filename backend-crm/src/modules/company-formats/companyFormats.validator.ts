import { z } from 'zod';
import { DATE_FORMATS, NUMBER_GROUPINGS, TIME_FORMATS } from './core/displayFormats.js';

/**
 * Body of PUT /api/company-formats. All three settings are required: a save replaces the whole setting (there is
 * nothing to merge with), and unknown keys are refused so a typo never saves silently.
 */
export const saveCompanyFormatsSchema = z.strictObject({
    dateFormat: z.enum(DATE_FORMATS, { error: 'Pick a date format from the list.' }),
    timeFormat: z.enum(TIME_FORMATS, { error: 'Pick 12-hour or 24-hour time.' }),
    numberGrouping: z.enum(NUMBER_GROUPINGS, { error: 'Pick Indian or International number grouping.' }),
});

export type SaveCompanyFormatsPayload = z.infer<typeof saveCompanyFormatsSchema>;
