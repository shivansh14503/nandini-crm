import { z } from 'zod';
import { FY_FORMATS, SEPARATORS, SERIES_MODULE_LABELS, SERIES_MODULES } from './documentSeries.format.js';

/**
 * Body of PUT /api/document-series. `series` is the full list of admin-added series: a module left out goes back to
 * its original numbering. Every series includes the financial year and restarts each year, so neither is an input.
 * Part lengths are capped so the longest possible number (10 + 10 + 9 + 8 + 8 characters + 4 separators = 49)
 * fits the 50-character code columns.
 */

const ALNUM = /^[A-Za-z0-9]*$/;
const ALNUM_MESSAGE = 'Use letters and digits only.';

const text = (field: string, max: number) =>
    z.string().trim().max(max, { message: `${field} cannot exceed ${max} characters.` }).regex(ALNUM, { message: ALNUM_MESSAGE });

const seriesSchema = z.object({
    module: z.enum(SERIES_MODULES),
    // Starting with a letter keeps numbers from being read as phone numbers by search.
    modulePrefix: text('Module prefix', 10)
        .min(1, { message: 'Module prefix is required.' })
        .regex(/^[A-Za-z]/, { message: 'Module prefix must start with a letter.' }),
    includeCompanyPrefix: z.boolean(),
    suffix: text('Suffix', 8).default(''),
    padLength: z.number().int().min(1, { message: 'Digits must be between 1 and 8.' }).max(8, { message: 'Digits must be between 1 and 8.' }),
    startingNumber: z
        .number()
        .int()
        .min(1, { message: 'Starting number must be at least 1.' })
        .max(99_999_999, { message: 'Starting number cannot exceed 99,999,999.' }),
});

export const saveDocumentSeriesSchema = z
    .object({
        companyPrefix: text('Company prefix', 10).default(''),
        separator: z.enum(SEPARATORS),
        fyStartMonth: z.number().int().min(1).max(12),
        fyFormat: z.enum(FY_FORMATS),
        series: z.array(seriesSchema).max(SERIES_MODULES.length),
    })
    .superRefine((body, ctx) => {
        const seenModules = new Set<string>();
        const prefixOwner = new Map<string, string>();
        body.series.forEach((series, index) => {
            const label = SERIES_MODULE_LABELS[series.module];
            if (seenModules.has(series.module)) {
                ctx.addIssue({ code: 'custom', message: `${label} is listed more than once.`, path: ['series', index, 'module'] });
            }
            seenModules.add(series.module);

            const prefix = series.modulePrefix.toUpperCase();
            const owner = prefixOwner.get(prefix);
            if (owner) {
                ctx.addIssue({ code: 'custom', message: `${label} uses the same prefix as ${owner}.`, path: ['series', index, 'modulePrefix'] });
            } else {
                prefixOwner.set(prefix, label);
            }

            if (series.includeCompanyPrefix && !body.companyPrefix) {
                ctx.addIssue({
                    code: 'custom',
                    message: `Set a company prefix before including it in ${label} numbers.`,
                    path: ['series', index, 'includeCompanyPrefix'],
                });
            }
        });
    });

export type SaveDocumentSeriesInput = z.infer<typeof saveDocumentSeriesSchema>;
