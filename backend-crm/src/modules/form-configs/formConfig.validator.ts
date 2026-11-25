import { z } from 'zod';
import { booleanQuery } from '../../validators/common.js';
import { CATEGORY_MODULES, CRM_MODULES, CUSTOM_FIELD_TYPES, FIELD_SIZES } from './formConfig.defaults.js';
import { CLOSES_LEAD_META_KEY, RATING_RULE_META_KEY, ratingLimitsSchema, ratingRuleSchema } from '../leads/lead.rating.js';
import { NO_FOLLOW_UP_META_KEY, OPPORTUNITY_STAGES_META_KEY, opportunityStagesSchema } from '../opportunities/opportunity.followUp.js';

/**
 * Request schemas for /api/form-configs. Rules that depend on the stored row (system options can't be renamed or
 * deleted, core-locked fields can't be hidden, made optional or deleted)
 * are enforced in formConfig.service.ts, where the row is known.
 */

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

/**
 * A field's placeholder / hint: null resets it to the form's own (coded) text, while '' is kept and blanks it
 * (the admin cleared the text, so the form shows none).
 */
const blankableText = (max: number) => z.string().trim().max(max).nullable().optional();

const label = (field: string, max: number) =>
    z.string({ error: `${field} is required.` }).trim().min(1, { message: `${field} is required.` }).max(max, { message: `${field} cannot exceed ${max} characters.` });

/**
 * Free-form option meta, except the keys the app reads: a Customer Response option's Rating rule (`ratingRule`),
 * Sales Stages (`opportunityStages`) and "No follow-up" switch (`noFollowUp`), and a Status option's "Closes the
 * lead" switch (`closesLead`). docs/lead-rating-rules.md, docs/api-plan.md (Opportunities).
 */
const metaSchema = z
    .record(z.string(), z.unknown())
    .nullable()
    .optional()
    .superRefine((meta, ctx) => {
        if (!meta) return;
        if (RATING_RULE_META_KEY in meta) {
            const rule = ratingRuleSchema.safeParse(meta[RATING_RULE_META_KEY]);
            if (!rule.success) ctx.addIssue({ code: 'custom', path: [RATING_RULE_META_KEY], message: rule.error.issues[0]?.message ?? 'Invalid Rating rule.' });
        }
        if (CLOSES_LEAD_META_KEY in meta && typeof meta[CLOSES_LEAD_META_KEY] !== 'boolean') {
            ctx.addIssue({ code: 'custom', path: [CLOSES_LEAD_META_KEY], message: '"Closes the lead" must be on or off.' });
        }
        if (OPPORTUNITY_STAGES_META_KEY in meta && !opportunityStagesSchema.safeParse(meta[OPPORTUNITY_STAGES_META_KEY]).success) {
            ctx.addIssue({ code: 'custom', path: [OPPORTUNITY_STAGES_META_KEY], message: 'Sales Stages must be a list of stage names.' });
        }
        if (NO_FOLLOW_UP_META_KEY in meta && typeof meta[NO_FOLLOW_UP_META_KEY] !== 'boolean') {
            ctx.addIssue({ code: 'custom', path: [NO_FOLLOW_UP_META_KEY], message: '"No follow-up" must be on or off.' });
        }
    });

/** Key of a Convert Lead section: a record's form section key, or `convert_…` for one made on Convert Lead. */
const CONVERT_SECTION_KEY = /^[a-z][a-z0-9_]{0,79}$/;

/**
 * Convert Lead's own sections of a contact / organization / opportunity (setting `convertSections`): renamed and
 * deleted sections of the record's form (by its section key) and sections made on Convert Lead (`custom`). Sections
 * not listed show as on the record's form. Deleting a section never deletes its fields.
 */
export const convertSectionsSchema = z
    .array(
        z.object({
            key: z.string().trim().regex(CONVERT_SECTION_KEY, { message: KEY_MESSAGE }),
            label: label('Section', 120),
            /** Made on Convert Lead (not a section of the record's form). */
            custom: z.boolean().optional(),
            /** A section of the record's form that Convert Lead doesn't show (its fields were moved to another one). */
            deleted: z.boolean().optional(),
        }),
    )
    .max(200)
    .superRefine((sections, ctx) => {
        const seen = new Set<string>();
        sections.forEach((s, i) => {
            if (seen.has(s.key)) ctx.addIssue({ code: 'custom', path: [i, 'key'], message: `Section key '${s.key}' is listed twice.` });
            seen.add(s.key);
        });
    });

/** Module settings an admin can change (`PUT /modules/:module/settings/:settingKey`), by `module:settingKey`. */
export const MODULE_SETTING_SCHEMAS: Readonly<Record<string, z.ZodType>> = {
    'leads:ratingNewLead': ratingLimitsSchema,
    'contacts:convertSections': convertSectionsSchema,
    'organizations:convertSections': convertSectionsSchema,
    'opportunities:convertSections': convertSectionsSchema,
};

export const moduleSchema = z.enum(CRM_MODULES, { error: `module must be one of: ${CRM_MODULES.join(', ')}.` });

// ── Params & query ───────────────────────────────────────────────────────────

export const categoryKeyParamSchema = z.object({ categoryKey: z.string().trim().min(1).max(80) });
export const optionIdParamSchema = z.object({ optionId: z.string().trim().min(1).max(50) });
export const fieldIdParamSchema = z.object({ fieldId: z.string().trim().min(1).max(50) });
export const moduleParamSchema = z.object({ module: moduleSchema });
export const sectionParamSchema = z.object({ module: moduleSchema, sectionKey: z.string().trim().min(1).max(80) });
export const moduleSettingParamSchema = z.object({ module: moduleSchema, settingKey: z.string().trim().min(1).max(80) });

export const formConfigQuerySchema = z.object({ includeInactive: booleanQuery });

// ── Dropdown categories ──────────────────────────────────────────────────────

export const createCategorySchema = z.object({
    /** The dropdown's key is derived from it (snake_case) and follows renames. */
    label: label('Label', 120),
    module: z.enum(CATEGORY_MODULES).default('shared'),
    description: optionalTrimmed(300),
    /** Initial option values (labels default to the values). */
    options: z.array(label('Option', 200)).max(200).default([]),
});

export const updateCategorySchema = z
    .object({
        /** An admin-created dropdown's key follows it; a built-in dropdown keeps its key. */
        label: label('Label', 120).optional(),
        description: clearableText(300),
        /** Owning module, or 'shared' (lists it under every module's Dropdowns). */
        module: z.enum(CATEGORY_MODULES).optional(),
    })
    .refine((body) => Object.keys(body).length > 0, { message: 'Nothing to update.' });

// ── Dropdown options ─────────────────────────────────────────────────────────

export const createOptionSchema = z.object({
    /** The option's name: shown in forms and stored on records (an option's value is its label). */
    value: label('Option', 200),
    meta: metaSchema,
});

export const updateOptionSchema = z
    .object({
        /** Renames the option; its stored value follows (records too). Blocked for system options. */
        label: label('Option', 200).optional(),
        meta: metaSchema,
        /** Pre-selected on new records; false leaves the field empty (its placeholder shows). */
        isDefault: z.boolean().optional(),
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
        /** The field's key is derived from it (derivedKeys.ts). */
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
        /** A custom field's key follows it, moving stored values, filters and PDF paths with it. */
        label: label('Label', 120).optional(),
        /** Select / multi-select fields only: switches between the two. */
        fieldType: z.enum(['select', 'multiselect']).optional(),
        /** Any field may move to another tab. */
        tabKey: tabKey.optional(),
        tabLabel,
        /** Any field may move to another section. */
        sectionKey: z.string().trim().min(1).max(80).optional(),
        sectionLabel: label('Section', 120).optional(),
        fieldSize,
        placeholder: blankableText(200),
        hint: blankableText(200),
        defaultValue: clearableText(500),
        /** Blocked (false) for core-locked fields. */
        isRequired: z.boolean().optional(),
        /** Blocked (false) for core-locked fields. */
        isVisibleInForm: z.boolean().optional(),
        isVisibleInDrawer: z.boolean().optional(),
        /** Contacts / organizations / opportunities: shown on Convert Lead. Core Convert Lead fields can't be hidden. */
        isVisibleInConvert: z.boolean().optional(),
        /** Convert Lead's own "required"; null → the record's form setting. Blocked (false) for core-locked fields. */
        convertIsRequired: z.boolean().nullable().optional(),
        /** Convert Lead's own width ('auto' = no width); null → the record's form setting. */
        convertFieldSize: z.enum([...FIELD_SIZES, 'auto']).nullable().optional(),
        /** The field's section on Convert Lead (see convertSectionsSchema); null → its section on the record's form. */
        convertSectionKey: z.string().trim().regex(CONVERT_SECTION_KEY, { message: KEY_MESSAGE }).nullable().optional(),
        /** null unlinks; select / multiselect fields only. */
        dropdownCategoryKey: z.string().trim().min(1).max(80).nullable().optional(),
        validationRules: z.record(z.string(), z.unknown()).nullable().optional(),
    })
    .refine((body) => Object.keys(body).length > 0, { message: 'Nothing to update.' });

export const reorderFieldsSchema = z.object({
    fieldIds: z.array(z.string().trim().min(1).max(50)).min(1).max(1000),
});

/** Convert Lead's own field order (contacts / organizations / opportunities); an empty list clears it. */
export const reorderConvertFieldsSchema = z.object({
    fieldIds: z.array(z.string().trim().min(1).max(50)).max(1000),
});

export const renameSectionSchema = z.object({ sectionLabel: label('Section', 120) });

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CreateOptionInput = z.infer<typeof createOptionSchema>;
export type UpdateOptionInput = z.infer<typeof updateOptionSchema>;
export type CreateFieldInput = z.infer<typeof createFieldSchema>;
export type UpdateFieldInput = z.infer<typeof updateFieldSchema>;
