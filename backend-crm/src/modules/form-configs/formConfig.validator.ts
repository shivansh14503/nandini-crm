import { z } from 'zod';
import { booleanQuery } from '../../validators/common.js';
import { CATEGORY_MODULES, CRM_MODULES, CUSTOM_FIELD_TYPES, FIELD_SIZES } from './formConfig.defaults.js';

/**
 * Request schemas for /api/form-configs. Rules that depend on the stored row (system options can't be archived
 * or renamed, core-locked fields can't be hidden or made optional, built-in fields keep their type and place)
 * are enforced in formConfig.service.ts, where the row is known.
 */

const KEY_PATTERN = /^[a-z][a-z0-9_]*$/;
const KEY_MESSAGE = 'Use lowercase letters, digits and underscores, starting with a letter.';

/** Blank / null → undefined, otherwise trimmed and bounded. */
const optionalTrimmed = (max: number) =>
    z.preprocess(
        (value) => (value === null || (typeof value === 'string' && value.trim() === '') ? undefined : value),
        z.string().trim().max(max).optional(),
    );

/** Like `optionalTrimmed`, but an explicit '' / null clears the stored value (→ null) instead of meaning "unchanged". */
const clearableText = (max: number) =>
    z.preprocess(
        (value) => (value === '' || value === null ? null : value),
        z.string().trim().max(max).nullable().optional(),
    );

const label = (field: string, max: number) =>
    z.string({ error: `${field} is required.` }).trim().min(1, { message: `${field} is required.` }).max(max, { message: `${field} cannot exceed ${max} characters.` });

const metaSchema = z.record(z.string(), z.unknown()).nullable().optional();

export const moduleSchema = z.enum(CRM_MODULES, { error: `module must be one of: ${CRM_MODULES.join(', ')}.` });

// ── Params & query ───────────────────────────────────────────────────────────

export const categoryKeyParamSchema = z.object({ categoryKey: z.string().trim().min(1).max(80) });
export const optionIdParamSchema = z.object({ optionId: z.string().trim().min(1).max(50) });
export const fieldIdParamSchema = z.object({ fieldId: z.string().trim().min(1).max(50) });
export const moduleParamSchema = z.object({ module: moduleSchema });
export const sectionParamSchema = z.object({ module: moduleSchema, sectionKey: z.string().trim().min(1).max(80) });

export const formConfigQuerySchema = z.object({ includeInactive: booleanQuery });

// ── Dropdown categories ──────────────────────────────────────────────────────

export const createCategorySchema = z.object({
    /** Optional: derived from the label (prefixed `custom_`) when omitted. */
    key: z.string().trim().toLowerCase().max(80).regex(KEY_PATTERN, { message: KEY_MESSAGE }).optional(),
    label: label('Label', 120),
    module: z.enum(CATEGORY_MODULES).default('shared'),
    description: optionalTrimmed(300),
    /** Initial option values (labels default to the values). */
    options: z.array(label('Option', 200)).max(200).default([]),
});

export const updateCategorySchema = z
    .object({
        label: label('Label', 120).optional(),
        description: clearableText(300),
        /** Owning module, or 'shared' (lists it under every module's Dropdowns). */
        module: z.enum(CATEGORY_MODULES).optional(),
    })
    .refine((body) => Object.keys(body).length > 0, { message: 'Nothing to update.' });

// ── Dropdown options ─────────────────────────────────────────────────────────

export const createOptionSchema = z.object({
    value: label('Option value', 200),
    /** Display label; defaults to the value. */
    label: optionalTrimmed(200),
    meta: metaSchema,
});

export const updateOptionSchema = z
    .object({
        /** Blocked for system options. */
        value: label('Option value', 200).optional(),
        label: label('Option label', 200).optional(),
        meta: metaSchema,
        /** false archives the option (blocked for system options); true restores it. */
        isActive: z.boolean().optional(),
    })
    .refine((body) => Object.keys(body).length > 0, { message: 'Nothing to update.' });

export const reorderOptionsSchema = z.object({
    optionIds: z.array(z.string().trim().min(1).max(50)).min(1).max(500),
});

// ── Form fields ──────────────────────────────────────────────────────────────

const fieldSize = z.enum(FIELD_SIZES).nullable().optional();
/** Built-in tab keys and admin-created tab slugs (e.g. `compliance_legal`). */
export const TAB_KEY_PATTERN = /^[a-z][a-z0-9_]{1,39}$/;
const tabKey = z.string().trim().max(40).regex(TAB_KEY_PATTERN, { message: KEY_MESSAGE });
/** Display name of a custom tab (ignored on built-in tabs, whose names are fixed). */
const tabLabel = optionalTrimmed(120);

export const createFieldSchema = z
    .object({
        module: moduleSchema,
        label: label('Label', 120),
        fieldType: z.enum(CUSTOM_FIELD_TYPES, { error: `fieldType must be one of: ${CUSTOM_FIELD_TYPES.join(', ')}.` }),
        tabKey,
        tabLabel,
        /** Existing section to join; omitted → derived from `sectionLabel` (a new section). */
        sectionKey: z.string().trim().max(80).optional(),
        sectionLabel: label('Section', 120),
        fieldSize,
        placeholder: optionalTrimmed(200),
        hint: optionalTrimmed(200),
        defaultValue: optionalTrimmed(500),
        isRequired: z.boolean().default(false),
        isVisibleInForm: z.boolean().default(true),
        isVisibleInDrawer: z.boolean().default(true),
        /** select / multiselect: an existing category … */
        dropdownCategoryKey: optionalTrimmed(80),
        /** … or options for a new category created with the field. */
        newOptions: z.array(label('Option', 200)).max(200).optional(),
        validationRules: z.record(z.string(), z.unknown()).optional(),
    })
    .superRefine((field, ctx) => {
        const isChoice = field.fieldType === 'select' || field.fieldType === 'multiselect';
        if (isChoice && !field.dropdownCategoryKey && !(field.newOptions && field.newOptions.length > 0)) {
            ctx.addIssue({
                code: 'custom',
                path: ['dropdownCategoryKey'],
                message: 'Choose a dropdown category or add at least one option.',
            });
        }
        if (!isChoice && (field.dropdownCategoryKey || field.newOptions?.length)) {
            ctx.addIssue({ code: 'custom', path: ['fieldType'], message: 'Only select / multi-select fields have dropdown options.' });
        }
    });

export const updateFieldSchema = z
    .object({
        label: label('Label', 120).optional(),
        /** Custom select / multi-select fields only: switches between the two. */
        fieldType: z.enum(['select', 'multiselect']).optional(),
        /** Custom fields only (built-in fields stay on their tab). */
        tabKey: tabKey.optional(),
        tabLabel,
        /** Any field: built-in fields may move between the sections of their tab. */
        sectionKey: z.string().trim().min(1).max(80).optional(),
        sectionLabel: label('Section', 120).optional(),
        fieldSize,
        placeholder: clearableText(200),
        hint: clearableText(200),
        defaultValue: clearableText(500),
        /** Blocked (false) for core-locked fields. */
        isRequired: z.boolean().optional(),
        /** Blocked (false) for core-locked fields. */
        isVisibleInForm: z.boolean().optional(),
        isVisibleInDrawer: z.boolean().optional(),
        /** false archives a custom field; built-in fields can only be hidden. */
        isActive: z.boolean().optional(),
        /** null unlinks; select / multiselect fields only. */
        dropdownCategoryKey: z.string().trim().min(1).max(80).nullable().optional(),
        validationRules: z.record(z.string(), z.unknown()).nullable().optional(),
    })
    .refine((body) => Object.keys(body).length > 0, { message: 'Nothing to update.' });

export const reorderFieldsSchema = z.object({
    fieldIds: z.array(z.string().trim().min(1).max(50)).min(1).max(1000),
});

export const renameSectionSchema = z.object({ sectionLabel: label('Section', 120) });

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CreateOptionInput = z.infer<typeof createOptionSchema>;
export type UpdateOptionInput = z.infer<typeof updateOptionSchema>;
export type CreateFieldInput = z.infer<typeof createFieldSchema>;
export type UpdateFieldInput = z.infer<typeof updateFieldSchema>;
