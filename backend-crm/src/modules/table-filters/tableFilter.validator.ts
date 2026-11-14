import { z } from 'zod';
import { moduleSchema } from '../form-configs/formConfig.validator.js';

/** Operators the frontend filter engine understands (frontend-crm/src/components/common/TableFilter/types.ts). */
export const FILTER_OPERATORS = [
    'in',
    'contains',
    'equals',
    'before',
    'after',
    'between',
    'today',
    'yesterday',
    'tomorrow',
    'this_week',
    'this_month',
    'last_7_days',
    'last_30_days',
    'next_7_days',
    'gte',
    'lte',
    'is',
] as const;

const conditionSchema = z.object({
    op: z.enum(FILTER_OPERATORS),
    values: z.array(z.string().max(200)).max(200).optional(),
    value: z.string().max(200).optional(),
    value2: z.string().max(200).optional(),
});

export const criteriaSchema = z.object({
    /** Keyed by filter field key (a form field key, or a pseudo field such as `ageDays`). */
    conditions: z
        .record(z.string().min(1).max(100), conditionSchema)
        .refine((c) => Object.keys(c).length > 0 && Object.keys(c).length <= 50, 'Add between 1 and 50 filter conditions.'),
    sort: z.object({ field: z.string().min(1).max(100), order: z.enum(['asc', 'desc']) }).optional(),
});

export type TableFilterCriteria = z.infer<typeof criteriaSchema>;

export const listQuerySchema = z.object({ module: moduleSchema });

export const recordRecentSchema = z.object({ module: moduleSchema, criteria: criteriaSchema });

export const saveFilterSchema = z.object({
    module: moduleSchema,
    name: z.string().trim().min(1, 'Enter a name for the filter.').max(120),
    criteria: criteriaSchema,
});
