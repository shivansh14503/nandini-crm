import { prisma, type TransactionClient } from '../../config/prisma.js';
import type { DropdownCategory, DropdownOption, FormFieldDefinition } from '../../generated/prisma/client.js';
import { auditService, diffRecords } from '../../services/audit.service.js';
import { CACHE_KEYS, cacheService } from '../../services/cache.service.js';
import type { AuthUser } from '../../types/user.types.js';
import { z } from 'zod';
import { HttpError } from '../../utils/httpError.js';
import { activityOnlyDefaultIssues } from '../shared/followupTypes.js';
import { runInTransaction } from '../shared/transactions.js';
import { throwFieldIssues } from './customFieldValidator.js';
import { dropdownKeyFromLabel, fieldKeyFromLabel } from './derivedKeys.js';
import { countRecordsWithKey, describeMigration, lockModuleFields, migrateFieldKey, moduleColumnNames } from './fieldKeyRename.js';
import { describeOptionMigration, migrateOptionValue } from './optionValueRename.js';
import {
    APP_REQUIRED_CATEGORY_KEYS,
    CONVERT_FIELD_NAMES,
    convertFieldUnavailableReason,
    CRM_MODULES,
    DEFAULT_FIELDS,
    FIXED_OPTION_CATEGORY_KEYS,
    isConvertModule,
    isFieldTombstoned,
    MODULE_TABS,
    sectionKeyFromLabel,
    type ConvertModuleKey,
    type CrmModuleKey,
} from './formConfig.defaults.js';
import {
    createCategorySchema,
    createFieldSchema,
    createOptionSchema,
    formConfigQuerySchema,
    MODULE_SETTING_SCHEMAS,
    reorderConvertFieldsSchema,
    reorderFieldsSchema,
    reorderOptionsSchema,
    renameSectionSchema,
    TAB_KEY_PATTERN,
    updateCategorySchema,
    updateFieldSchema,
    updateOptionSchema,
} from './formConfig.validator.js';

export { isFieldTombstoned };

const CONFIG_TTL_SECONDS = 60 * 60;
const configCacheKey = (includeInactive: boolean) => CACHE_KEYS.lookups(`form-configs:${includeInactive ? 'all' : 'active'}`);
const CHOICE_TYPES = new Set(['select', 'multiselect']);

// ── DTOs (frontend-crm/src/types/formConfig.types.ts) ────────────────────────

export interface DropdownOptionDto {
    id: string;
    categoryId: string;
    value: string;
    label: string;
    meta: Record<string, unknown> | null;
    sortOrder: number;
    isActive: boolean;
    isSystem: boolean;
    /** Pre-selected on new records (a single-choice field takes the first one in order). */
    isDefault: boolean;
}

export interface DropdownCategoryDto {
    id: string;
    key: string;
    label: string;
    module: string;
    description: string;
    isSystem: boolean;
    /** CRM screens read it directly by key (see APP_REQUIRED_CATEGORY_KEYS). */
    appRequired: boolean;
    /** Its options are fixed (the API validates the values against them): no options can be added. */
    fixedOptions: boolean;
    /** Why it can't be deleted, or null when an admin may delete it (built-in or not). */
    lockReason: string | null;
    options: DropdownOptionDto[];
    /** Fields (any module) whose options come from this category. */
    usedBy: { module: string; fieldKey: string; label: string }[];
}

export interface FormFieldDefinitionDto {
    id: string;
    module: string;
    /**
     * Built-in fields: the column the field maps to (what forms and code read). Custom fields: the key their values
     * are stored under, derived from the label (snake_case, see derivedKeys.ts) and following it.
     */
    fieldKey: string;
    label: string;
    fieldType: string;
    tabKey: string;
    /** Name of an admin-created tab (null on built-in tabs). */
    tabLabel: string | null;
    sectionKey: string;
    sectionLabel: string;
    /** Built-in fields: the section the hand-built form renders them in (they may have been moved since). */
    defaultSectionKey: string | null;
    /** Built-in fields: the tab the hand-built form renders them on (they may have been moved since). */
    defaultTabKey: string | null;
    sortOrder: number;
    fieldSize: string | null;
    placeholder: string | null;
    hint: string | null;
    defaultValue: string | null;
    isRequired: boolean;
    isCoreLocked: boolean;
    isSystem: boolean;
    isActive: boolean;
    isVisibleInForm: boolean;
    isVisibleInDrawer: boolean;
    /** Shown on the Convert Lead form (contacts / organizations / opportunities only). */
    isVisibleInConvert: boolean;
    /** Convert Lead's own "required" (null → isRequired, the record's form setting). */
    convertIsRequired: boolean | null;
    /** Convert Lead's own width: a size, 'auto' (no width), or null → fieldSize, the record's form setting. */
    convertFieldSize: string | null;
    /** Convert Lead order (null → the field keeps the place it has on the record's form). */
    convertSortOrder: number | null;
    /** Convert Lead section (setting `convertSections`); null → the field's section on the record's form. */
    convertSectionKey: string | null;
    dropdownCategoryId: string | null;
    dropdownCategoryKey: string | null;
    validationRules: Record<string, unknown> | null;
    /** A built-in field an admin deleted (kept as a tombstone so seeding does not recreate it). */
    isDeleted: boolean;
}

export interface FormConfigsPayload {
    categories: DropdownCategoryDto[];
    fieldsByModule: Record<CrmModuleKey, FormFieldDefinitionDto[]>;
    /** Built-in tabs of each module, followed by its admin-created tabs (from the fields placed on them). */
    moduleTabs: Record<CrmModuleKey, { key: string; label: string; isCustom?: boolean }[]>;
    /** Module settings (`ModuleSetting`) by module, then key, e.g. `leads.ratingNewLead`. Missing = default. */
    moduleSettings: Partial<Record<CrmModuleKey, Record<string, unknown>>>;
}

/** Section each built-in field has on the hand-built form, by `module:fieldKey`. */
const DEFAULT_SECTION_KEYS = new Map(DEFAULT_FIELDS.map((f) => [`${f.module}:${f.fieldKey}`, sectionKeyFromLabel(f.sectionLabel)]));
/** Tab each built-in field has on the hand-built form, by `module:fieldKey`. */
const DEFAULT_TAB_KEYS = new Map(DEFAULT_FIELDS.map((f) => [`${f.module}:${f.fieldKey}`, f.tabKey as string]));

/** `compliance_legal` → `Compliance Legal` (fallback name of a custom tab saved without one). */
const titleCaseFromKey = (key: string) =>
    key
        .split('_')
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

const isBuiltInTab = (module: CrmModuleKey, tabKey: string) => MODULE_TABS[module].some((tab) => tab.key === tabKey);

/**
 * A built-in tab an admin deleted: it had seeded built-in fields, every one of them is now a tombstone, and no
 * live field (built-in or custom) sits on it. Built-in tabs without seeded fields are never dropped. Deletion is
 * permanent. Mirrored by the admin draft (configDraft.ts).
 */
function isBuiltInTabDeleted(
    module: CrmModuleKey,
    tabKey: string,
    rows: Pick<FormFieldDefinition, 'module' | 'fieldKey' | 'tabKey' | 'isSystem' | 'validationRulesJson'>[],
): boolean {
    const seeded = DEFAULT_FIELDS.filter((d) => d.module === module && d.tabKey === tabKey);
    if (seeded.length === 0) return false;
    const moduleRows = rows.filter((r) => r.module === module);
    const allSeededDeleted = seeded.every((d) => {
        const row = moduleRows.find((r) => r.isSystem && r.fieldKey === d.fieldKey);
        return !row || isFieldTombstoned(row.validationRulesJson);
    });
    if (!allSeededDeleted) return false;
    return !moduleRows.some((r) => r.tabKey === tabKey && !isFieldTombstoned(r.validationRulesJson));
}

/** A built-in address Country field (`primaryCountry`, `billingCountry`, …): picks from the fixed ISO country list. */
function isBuiltInCountryField(field: { isSystem: boolean; fieldKey: string; dropdownCategoryId: string | null }): boolean {
    return field.isSystem && !field.dropdownCategoryId && /Country$/.test(field.fieldKey);
}

/**
 * A field's stored default with option value `from` renamed to `to`: a select default is the value itself,
 * a multi-select default a comma-separated list of values. Mirrored by the builder's draft (configDraft.ts).
 */
function renameDefaultValue(defaultValue: string | null, fieldType: string, from: string, to: string): string | null {
    if (defaultValue === null || from === to) return defaultValue;
    if (fieldType === 'multiselect') {
        const parts = defaultValue.split(',').map((v) => v.trim());
        return parts.includes(from) ? parts.map((v) => (v === from ? to : v)).join(', ') : defaultValue;
    }
    return defaultValue.trim() === from ? to : defaultValue;
}

/**
 * Gives `option` the stored value `nextValue`, in the caller's transaction: the defaults of the fields using its
 * dropdown, and every record and table filter storing the old value, follow. Returns a note on what moved (for the
 * audit trail), or undefined when the value is unchanged. Values are unique per dropdown (case-insensitive under
 * the database's default collation).
 */
export async function changeOptionValue(tx: TransactionClient, option: DropdownOption, nextValue: string): Promise<string | undefined> {
    if (nextValue === option.value) return undefined;
    const clash = await tx.dropdownOption.findFirst({
        where: { categoryId: option.categoryId, value: nextValue, id: { not: option.id } },
        select: { id: true },
    });
    if (clash) {
        throw HttpError.conflict(`Option '${nextValue}' already exists in this dropdown.`, [{ message: 'Duplicate option', path: ['label'] }]);
    }
    const linkedFields = await tx.formFieldDefinition.findMany({
        where: { dropdownCategoryId: option.categoryId },
        select: { id: true, module: true, fieldKey: true, fieldType: true, isSystem: true, defaultValue: true },
    });
    for (const field of linkedFields) {
        const defaultValue = renameDefaultValue(field.defaultValue, field.fieldType, option.value, nextValue);
        if (defaultValue !== field.defaultValue) await tx.formFieldDefinition.update({ where: { id: field.id }, data: { defaultValue } });
    }
    const note = describeOptionMigration(await migrateOptionValue(tx, linkedFields, option.value, nextValue));
    await tx.dropdownOption.update({ where: { id: option.id }, data: { value: nextValue } });
    return note;
}

function parseJsonObject(json: string | null): Record<string, unknown> | null {
    if (!json) return null;
    try {
        const parsed: unknown = JSON.parse(json);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
    } catch {
        return null;
    }
}

const toOptionDto = (o: DropdownOption): DropdownOptionDto => ({
    id: o.id,
    categoryId: o.categoryId,
    value: o.value,
    label: o.label,
    meta: parseJsonObject(o.metaJson),
    sortOrder: o.sortOrder,
    isActive: o.isActive,
    isSystem: o.isSystem,
    isDefault: o.isDefault,
});

const toFieldDto = (f: FormFieldDefinition, categoryKeys: Map<string, string>): FormFieldDefinitionDto => ({
    id: f.id,
    module: f.module,
    fieldKey: f.fieldKey,
    label: f.label,
    fieldType: f.fieldType,
    tabKey: f.tabKey,
    tabLabel: f.tabLabel,
    sectionKey: f.sectionKey,
    sectionLabel: f.sectionLabel,
    defaultSectionKey: f.isSystem ? (DEFAULT_SECTION_KEYS.get(`${f.module}:${f.fieldKey}`) ?? null) : null,
    defaultTabKey: f.isSystem ? (DEFAULT_TAB_KEYS.get(`${f.module}:${f.fieldKey}`) ?? null) : null,
    sortOrder: f.sortOrder,
    fieldSize: f.fieldSize,
    placeholder: f.placeholder,
    hint: f.hint,
    defaultValue: f.defaultValue,
    isRequired: f.isRequired,
    isCoreLocked: f.isCoreLocked,
    isSystem: f.isSystem,
    isActive: f.isActive,
    isVisibleInForm: f.isVisibleInForm,
    isVisibleInDrawer: f.isVisibleInDrawer,
    isVisibleInConvert: f.isVisibleInConvert,
    convertIsRequired: f.convertIsRequired,
    convertFieldSize: f.convertFieldSize,
    convertSortOrder: f.convertSortOrder,
    convertSectionKey: f.convertSectionKey,
    dropdownCategoryId: f.dropdownCategoryId,
    dropdownCategoryKey: f.dropdownCategoryId ? (categoryKeys.get(f.dropdownCategoryId) ?? null) : null,
    validationRules: parseJsonObject(f.validationRulesJson),
    isDeleted: isFieldTombstoned(f.validationRulesJson),
});

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Context stored on every form-config audit entry as `changes._meta`, so the admin Changes timeline
 * (modules/audit/audit.service.ts) can title entries and filter them by module. `diffRecords` diffs stay
 * alongside it; `_meta` is not a `{ from, to }` pair, so diff readers skip it.
 */
export interface FormConfigAuditMeta {
    /** CRM module key, or `shared` for dropdowns several forms use. */
    module: string;
    categoryKey?: string;
    categoryLabel?: string;
    fieldKey?: string;
    fieldLabel?: string;
    optionLabel?: string;
    sectionKey?: string;
    /** Role of the admin at the time of the change (roles can change later). */
    actorRole: string;
}

const withMeta = <T extends object>(changes: T, user: AuthUser, meta: Omit<FormConfigAuditMeta, 'actorRole'>) => ({
    ...changes,
    _meta: { ...meta, actorRole: user.role } satisfies FormConfigAuditMeta,
});

/** Audit context of a dropdown option: its category's module, key and label. */
async function optionAuditMeta(tx: TransactionClient, option: DropdownOption): Promise<Omit<FormConfigAuditMeta, 'actorRole'>> {
    const category = await tx.dropdownCategory.findUnique({ where: { id: option.categoryId }, select: { key: true, label: true, module: true } });
    return {
        module: category?.module ?? 'shared',
        categoryKey: category?.key,
        categoryLabel: category?.label,
        optionLabel: option.label,
    };
}

async function invalidate(): Promise<void> {
    await cacheService.invalidatePattern(`${CACHE_KEYS.lookups('form-configs')}*`);
}

/** A live (not deleted) category by key. */
async function findCategory(tx: TransactionClient | typeof prisma, key: string): Promise<DropdownCategory> {
    const category = await tx.dropdownCategory.findUnique({ where: { key } });
    if (!category || category.deletedAt) throw HttpError.notFound(`Dropdown category '${key}' not found`);
    return category;
}

/**
 * Why a dropdown must stay (null → an admin may delete it, built-in or not): it has options that drive CRM
 * logic, a core field (required by the API / record identity) takes its options from it, or CRM screens read it
 * directly. Mirrored by `categoryLockReason` in the frontend draft.
 */
function categoryLockReason(
    key: string,
    options: { isSystem: boolean; label: string }[],
    linkedFields: { isSystem: boolean; isCoreLocked: boolean; label: string; module: string }[],
): string | null {
    const systemOption = options.find((o) => o.isSystem);
    if (systemOption) return `Its option '${systemOption.label}' drives CRM logic.`;
    const core = linkedFields.find((f) => f.isSystem && f.isCoreLocked);
    if (core) return `The core field '${core.label}' (${core.module}) takes its options from it.`;
    if (APP_REQUIRED_CATEGORY_KEYS.has(key)) return 'CRM screens (lead conversion, quick create, quotations) read it directly.';
    return null;
}

async function findOption(tx: TransactionClient, id: string): Promise<DropdownOption> {
    const option = await tx.dropdownOption.findUnique({ where: { id } });
    if (!option) throw HttpError.notFound('Dropdown option not found');
    return option;
}

async function findField(tx: TransactionClient, id: string): Promise<FormFieldDefinition> {
    const field = await tx.formFieldDefinition.findUnique({ where: { id } });
    if (!field) throw HttpError.notFound('Form field not found');
    return field;
}

/** "partner-companies" → "Partner Companies", for messages. */
const moduleName = (module: string) =>
    module
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');

/** A name the admin chose can't be used because its key is taken: says by what, so they can pick another name. */
function nameClash(label: string, what: string): HttpError {
    const message = `"${label}" clashes with ${what}. Choose a different name for one of them.`;
    return HttpError.conflict(message, [{ message, path: ['label'] }]);
}

/**
 * The key a field added in the form builder has: its label in snake_case (see derivedKeys.ts). `self` (a field
 * being renamed) keeps its key when the label still gives it. A name is refused, saying what it clashes with, when
 * its key is another field's of the module, a built-in field's or record column's (it would be mistaken for one in
 * filters and imports), or one records still hold a deleted field's values under (the field would take over that
 * old data). Case is ignored, as SQL Server compares keys.
 */
export async function customFieldKey(
    tx: TransactionClient,
    module: CrmModuleKey,
    label: string,
    self?: { id: string; fieldKey: string },
): Promise<string> {
    const key = fieldKeyFromLabel(label);
    if (self && self.fieldKey.toLowerCase() === key) return self.fieldKey;
    const other = await tx.formFieldDefinition.findFirst({
        where: { module, fieldKey: key, ...(self ? { id: { not: self.id } } : {}) },
        select: { label: true, isSystem: true, validationRulesJson: true },
    });
    if (other) {
        const kind = other.isSystem ? (isFieldTombstoned(other.validationRulesJson) ? 'the deleted built-in field' : 'the built-in field') : 'the field';
        throw nameClash(label, `${kind} "${other.label}" on ${moduleName(module)}`);
    }
    const builtIn = DEFAULT_FIELDS.find((f) => f.module === module && f.fieldKey.toLowerCase() === key);
    if (builtIn) throw nameClash(label, `the built-in field "${builtIn.label}" on ${moduleName(module)}`);
    if ((await moduleColumnNames(tx, module)).has(key)) throw nameClash(label, `a built-in property of ${moduleName(module)} records`);
    if ((await countRecordsWithKey(tx, module, key)) > 0) {
        throw nameClash(label, `values a deleted field of that name left on ${moduleName(module)} records`);
    }
    return key;
}

/**
 * The key a dropdown named `label` has. A dropdown added in the form builder takes its name in snake_case (it keeps
 * its key when the name still gives it); a name whose key another dropdown has is refused, saying which. Nothing
 * stores the key itself: fields link to the dropdown by id, so a new key moves nothing. Built-in dropdowns keep their
 * key: the app's code and start-up seeding look them up by it.
 */
export async function categoryKeyForLabel(tx: TransactionClient, category: { id?: string; key?: string; isSystem: boolean }, label: string): Promise<string> {
    if (category.isSystem && category.key) return category.key;
    const key = dropdownKeyFromLabel(label);
    if (category.key && category.key.toLowerCase() === key) return category.key;
    const other = await tx.dropdownCategory.findFirst({
        where: { key, ...(category.id ? { id: { not: category.id } } : {}) },
        select: { label: true, isSystem: true, deletedAt: true },
    });
    if (other) {
        const kind = other.deletedAt ? 'the deleted built-in dropdown' : other.isSystem ? 'the built-in dropdown' : 'the dropdown';
        throw nameClash(label, `${kind} "${other.label}"`);
    }
    return key;
}

async function createCategoryWithOptions(
    tx: TransactionClient,
    input: { label: string; module: string; description?: string; options: string[] },
    user: AuthUser,
): Promise<DropdownCategory> {
    // The key comes from the name (admins never choose one).
    const key = await categoryKeyForLabel(tx, { isSystem: false }, input.label);
    const category = await tx.dropdownCategory.create({
        data: { key, label: input.label, module: input.module, description: input.description ?? null, isSystem: false },
    });
    const values = [...new Set(input.options)];
    if (values.length > 0) {
        await tx.dropdownOption.createMany({
            data: values.map((value, index) => ({ categoryId: category.id, value, label: value, sortOrder: (index + 1) * 10 })),
        });
    }
    await auditService.record(tx, {
        entityType: 'DropdownCategory',
        entityId: category.id,
        action: 'CREATE',
        changedBy: user.username,
        changes: withMeta({ key, label: input.label, module: input.module, options: values }, user, {
            module: input.module,
            categoryKey: key,
            categoryLabel: input.label,
        }),
    });
    return category;
}

/**
 * Moves a field to just after the last other field of its tab + section (or, for a new section, after the last
 * field of its tab, else at the end), then renumbers the module's fields 10, 20, … so the order stays unambiguous.
 */
/**
 * After `field` was deleted (or tombstoned and unlinked): its admin-created dropdown follows it off this form —
 * deleted when no other field uses it, otherwise handed over to the module(s) that still do.
 */
async function releaseFieldCategory(
    tx: TransactionClient,
    field: Pick<FormFieldDefinition, 'module' | 'fieldKey' | 'label' | 'dropdownCategoryId'>,
    user: AuthUser,
): Promise<void> {
    if (!field.dropdownCategoryId) return;
    const category = await tx.dropdownCategory.findUnique({ where: { id: field.dropdownCategoryId } });
    if (!category || category.isSystem) return;
    const remaining = await tx.formFieldDefinition.findMany({ where: { dropdownCategoryId: category.id }, select: { module: true } });
    if (remaining.length === 0) {
        await tx.dropdownCategory.delete({ where: { id: category.id } }); // options cascade
        await auditService.record(tx, {
            entityType: 'DropdownCategory',
            entityId: category.id,
            action: 'DELETE',
            changedBy: user.username,
            changes: withMeta(
                { key: category.key, label: category.label, module: category.module, reason: `Last field using it ('${field.label}', ${field.module}) deleted` },
                user,
                { module: category.module, categoryKey: category.key, categoryLabel: category.label, fieldKey: field.fieldKey, fieldLabel: field.label },
            ),
        });
        return;
    }
    const modules = [...new Set(remaining.map((f) => f.module))];
    if (category.module === field.module && !modules.includes(field.module)) {
        const module = modules.length > 1 ? 'shared' : modules[0];
        await tx.dropdownCategory.update({ where: { id: category.id }, data: { module } });
        await auditService.record(tx, {
            entityType: 'DropdownCategory',
            entityId: category.id,
            action: 'UPDATE',
            changedBy: user.username,
            changes: withMeta({ module: { from: category.module, to: module } }, user, {
                module: field.module,
                categoryKey: category.key,
                categoryLabel: category.label,
            }),
        });
    }
}

async function placeField(tx: TransactionClient, module: string, fieldId: string): Promise<void> {
    const all = await tx.formFieldDefinition.findMany({
        where: { module },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, tabKey: true, sectionKey: true, sortOrder: true },
    });
    const moving = all.find((f) => f.id === fieldId);
    if (!moving) return;
    const rest = all.filter((f) => f.id !== fieldId);
    const lastIndex = (match: (f: (typeof rest)[number]) => boolean) => rest.reduce((idx, f, i) => (match(f) ? i : idx), -1);
    let insertAt = lastIndex((f) => f.tabKey === moving.tabKey && f.sectionKey === moving.sectionKey);
    if (insertAt < 0) insertAt = lastIndex((f) => f.tabKey === moving.tabKey);
    const ordered = insertAt < 0 ? [...rest, moving] : [...rest.slice(0, insertAt + 1), moving, ...rest.slice(insertAt + 1)];
    for (const [index, field] of ordered.entries()) {
        const sortOrder = (index + 1) * 10;
        if (field.sortOrder !== sortOrder) await tx.formFieldDefinition.update({ where: { id: field.id }, data: { sortOrder } });
    }
}

function assertModule(module: string): asserts module is CrmModuleKey {
    if (!(CRM_MODULES as readonly string[]).includes(module)) throw HttpError.badRequest(`Unknown module '${module}'.`);
}

/** A built-in tab of the module, or a valid key for an admin-created one. */
function assertTab(module: CrmModuleKey, tabKey: string): void {
    if (isBuiltInTab(module, tabKey)) return;
    if (!TAB_KEY_PATTERN.test(tabKey)) {
        throw HttpError.badRequest(`'${tabKey}' is not a valid tab of the ${module} form.`, [
            { message: 'Use lowercase letters, digits and underscores, starting with a letter.', path: ['tabKey'] },
        ]);
    }
}

/**
 * The stored name for a field's tab: null on a built-in tab; on a custom tab, the name given, else the name
 * other fields of that tab already carry, else one derived from the key.
 */
async function resolveTabLabel(tx: TransactionClient, module: CrmModuleKey, tabKey: string, given: string | undefined): Promise<string | null> {
    if (isBuiltInTab(module, tabKey)) return null;
    if (given) return given;
    const sibling = await tx.formFieldDefinition.findFirst({ where: { module, tabKey, tabLabel: { not: null } }, select: { tabLabel: true } });
    return sibling?.tabLabel ?? titleCaseFromKey(tabKey);
}

// ── Service ──────────────────────────────────────────────────────────────────

export const formConfigService = {
    /** Every category (with options) and every field grouped by module. Inactive rows only with `includeInactive`. */
    async getAllConfigs(includeInactive = false): Promise<FormConfigsPayload> {
        return cacheService.getOrSet(configCacheKey(includeInactive), CONFIG_TTL_SECONDS, async () => {
            const [categories, allRows, settingRows] = await Promise.all([
                prisma.dropdownCategory.findMany({
                    where: { deletedAt: null },
                    include: {
                        options: { where: includeInactive ? {} : { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }] },
                    },
                    orderBy: [{ module: 'asc' }, { label: 'asc' }],
                }),
                // Every row (tombstones included) so deleted built-in tabs can be detected; filtered below.
                prisma.formFieldDefinition.findMany({
                    orderBy: [{ module: 'asc' }, { sortOrder: 'asc' }, { label: 'asc' }],
                }),
                prisma.moduleSetting.findMany(),
            ]);
            const moduleSettings: FormConfigsPayload['moduleSettings'] = {};
            for (const row of settingRows) {
                if (!(CRM_MODULES as readonly string[]).includes(row.module)) continue;
                try {
                    (moduleSettings[row.module as CrmModuleKey] ??= {})[row.key] = JSON.parse(row.valueJson);
                } catch {
                    // A malformed value reads as unset (the default applies).
                }
            }
            const fields = includeInactive ? allRows : allRows.filter((f) => f.isActive);
            const categoryKeys = new Map(categories.map((c) => [c.id, c.key]));
            const fieldsByModule = Object.fromEntries(CRM_MODULES.map((m) => [m, [] as FormFieldDefinitionDto[]])) as Record<
                CrmModuleKey,
                FormFieldDefinitionDto[]
            >;
            const moduleTabs = Object.fromEntries(
                CRM_MODULES.map((m) => [m, MODULE_TABS[m].filter((tab) => !isBuiltInTabDeleted(m, tab.key, allRows))]),
            ) as FormConfigsPayload['moduleTabs'];
            for (const field of fields) {
                if (!(CRM_MODULES as readonly string[]).includes(field.module)) continue;
                const module = field.module as CrmModuleKey;
                fieldsByModule[module].push(toFieldDto(field, categoryKeys));
                // Custom tabs exist through the fields placed on them (first seen in field order).
                if (!moduleTabs[module].some((tab) => tab.key === field.tabKey)) {
                    moduleTabs[module].push({ key: field.tabKey, label: field.tabLabel || titleCaseFromKey(field.tabKey), isCustom: true });
                }
            }
            return {
                categories: categories.map((c) => ({
                    id: c.id,
                    key: c.key,
                    label: c.label,
                    module: c.module,
                    description: c.description ?? '',
                    isSystem: c.isSystem,
                    appRequired: APP_REQUIRED_CATEGORY_KEYS.has(c.key),
                    fixedOptions: FIXED_OPTION_CATEGORY_KEYS.has(c.key),
                    lockReason: categoryLockReason(
                        c.key,
                        c.options,
                        fields.filter((f) => f.dropdownCategoryId === c.id),
                    ),
                    options: c.options.map(toOptionDto),
                    usedBy: fields
                        .filter((f) => f.dropdownCategoryId === c.id && f.isActive)
                        .map((f) => ({ module: f.module, fieldKey: f.fieldKey, label: f.label })),
                })),
                fieldsByModule,
                moduleTabs,
                moduleSettings,
            };
        });
    },

    /** Sets one module setting (Form Builder, e.g. the new-lead Rating limits). Audited in the Form Builder trail. */
    async updateModuleSetting(module: CrmModuleKey, settingKey: string, body: unknown, user: AuthUser): Promise<unknown> {
        const schema = MODULE_SETTING_SCHEMAS[`${module}:${settingKey}`];
        if (!schema) throw HttpError.notFound(`${moduleName(module)} has no setting "${settingKey}".`);
        const { value } = z.object({ value: schema }).parse(body);
        const valueJson = JSON.stringify(value);
        await runInTransaction(async (tx) => {
            const where = { module_key: { module, key: settingKey } };
            const before = await tx.moduleSetting.findUnique({ where });
            if (before?.valueJson === valueJson) return;
            await tx.moduleSetting.upsert({
                where,
                create: { module, key: settingKey, valueJson, updatedBy: user.username },
                update: { valueJson, updatedBy: user.username },
            });
            await auditService.record(tx, {
                entityType: 'ModuleSetting',
                entityId: `${module}:${settingKey}`,
                action: before ? 'UPDATE' : 'CREATE',
                changedBy: user.username,
                changes: withMeta({ setting: settingKey, value: { from: before ? JSON.parse(before.valueJson) : null, to: value } }, user, { module }),
            });
        });
        await invalidate();
        return value;
    },

    async getConfigs(query: unknown): Promise<FormConfigsPayload> {
        const { includeInactive } = formConfigQuerySchema.parse(query ?? {});
        return formConfigService.getAllConfigs(Boolean(includeInactive));
    },

    // ── Categories ──

    async createCategory(body: unknown, user: AuthUser): Promise<DropdownCategoryDto> {
        const input = createCategorySchema.parse(body);
        const category = await runInTransaction((tx) => createCategoryWithOptions(tx, input, user));
        await invalidate();
        return formConfigService.getCategory(category.key);
    },

    async updateCategory(categoryKey: string, body: unknown, user: AuthUser): Promise<DropdownCategoryDto> {
        const input = updateCategorySchema.parse(body);
        let renamedTo = categoryKey;
        await runInTransaction(async (tx) => {
            const before = await findCategory(tx, categoryKey);
            // Renaming an admin-created dropdown renames its key to match.
            const key = input.label !== undefined && input.label !== before.label ? await categoryKeyForLabel(tx, before, input.label) : before.key;
            const after = await tx.dropdownCategory.update({
                where: { id: before.id },
                data: {
                    ...(key !== before.key ? { key } : {}),
                    ...(input.label !== undefined ? { label: input.label } : {}),
                    ...(input.description !== undefined ? { description: input.description } : {}),
                    ...(input.module !== undefined ? { module: input.module } : {}),
                },
            });
            await auditService.record(tx, {
                entityType: 'DropdownCategory',
                entityId: before.id,
                action: 'UPDATE',
                changedBy: user.username,
                changes: withMeta(diffRecords(before, after), user, { module: after.module, categoryKey: after.key, categoryLabel: after.label }),
            });
            renamedTo = after.key;
        });
        await invalidate();
        return formConfigService.getCategory(renamedTo);
    },

    /**
     * Permanently deletes a dropdown — admin-created or built-in — unless it is locked (categoryLockReason).
     * Its options go, custom fields using it are deleted, and built-in fields using it are unlinked and hidden
     * (left visible, the form would fall back to its hard-coded list). An admin-created dropdown's row is deleted;
     * a built-in one stays as a tombstone (`deletedAt`) so start-up seeding doesn't bring it back.
     */
    async deleteCategory(categoryKey: string, user: AuthUser): Promise<{ key: string }> {
        await runInTransaction(async (tx) => {
            const category = await findCategory(tx, categoryKey);
            const options = await tx.dropdownOption.findMany({ where: { categoryId: category.id }, select: { isSystem: true, label: true } });
            const linked = await tx.formFieldDefinition.findMany({
                where: { dropdownCategoryId: category.id },
                select: { id: true, module: true, fieldKey: true, label: true, isSystem: true, isCoreLocked: true },
            });
            const lockReason = categoryLockReason(category.key, options, linked);
            if (lockReason) throw HttpError.badRequest(`'${category.label}' can't be deleted: ${lockReason}`);

            const builtIn = linked.filter((f) => f.isSystem);
            if (builtIn.length > 0) {
                await tx.formFieldDefinition.updateMany({
                    where: { id: { in: builtIn.map((f) => f.id) } },
                    data: { dropdownCategoryId: null, isVisibleInForm: false },
                });
                await auditService.recordMany(
                    tx,
                    builtIn.map((f) => ({
                        entityType: 'FormField',
                        entityId: f.id,
                        action: 'UPDATE' as const,
                        changedBy: user.username,
                        changes: withMeta(
                            { dropdown: { from: category.key, to: null }, isVisibleInForm: { from: true, to: false } },
                            user,
                            { module: f.module, fieldKey: f.fieldKey, fieldLabel: f.label, categoryKey: category.key, categoryLabel: category.label },
                        ),
                    })),
                );
            }
            const custom = linked.filter((f) => !f.isSystem);
            if (custom.length > 0) {
                await tx.formFieldDefinition.deleteMany({ where: { id: { in: custom.map((f) => f.id) } } });
                await auditService.recordMany(
                    tx,
                    custom.map((f) => ({
                        entityType: 'FormField',
                        entityId: f.id,
                        action: 'DELETE' as const,
                        changedBy: user.username,
                        changes: withMeta(
                            { module: f.module, fieldKey: f.fieldKey, label: f.label, reason: `Dropdown '${category.label}' deleted` },
                            user,
                            { module: f.module, fieldKey: f.fieldKey, fieldLabel: f.label, categoryKey: category.key, categoryLabel: category.label },
                        ),
                    })),
                );
            }
            if (category.isSystem) {
                await tx.dropdownOption.deleteMany({ where: { categoryId: category.id } });
                await tx.dropdownCategory.update({ where: { id: category.id }, data: { deletedAt: new Date() } });
            } else {
                await tx.dropdownCategory.delete({ where: { id: category.id } }); // options cascade
            }
            await auditService.record(tx, {
                entityType: 'DropdownCategory',
                entityId: category.id,
                action: 'DELETE',
                changedBy: user.username,
                changes: withMeta(
                    {
                        key: category.key,
                        label: category.label,
                        module: category.module,
                        builtIn: category.isSystem,
                        removedFields: custom.map((f) => `${f.module}:${f.fieldKey}`),
                        hiddenFields: builtIn.map((f) => `${f.module}:${f.fieldKey}`),
                    },
                    user,
                    { module: category.module, categoryKey: category.key, categoryLabel: category.label },
                ),
            });
        });
        await invalidate();
        return { key: categoryKey };
    },

    async getCategory(categoryKey: string): Promise<DropdownCategoryDto> {
        const { categories } = await formConfigService.getAllConfigs(true);
        const category = categories.find((c) => c.key === categoryKey);
        if (!category) throw HttpError.notFound(`Dropdown category '${categoryKey}' not found`);
        return category;
    },

    // ── Options ──

    /** Adds an option. */
    async addOption(categoryKey: string, body: unknown, user: AuthUser): Promise<DropdownOptionDto> {
        const input = createOptionSchema.parse(body);
        const option = await runInTransaction(async (tx) => {
            const category = await findCategory(tx, categoryKey);
            if (FIXED_OPTION_CATEGORY_KEYS.has(category.key)) {
                throw HttpError.badRequest(`${category.label} has fixed options; new ones can't be added.`, [
                    { message: 'This dropdown has fixed options.', path: ['value'] },
                ]);
            }
            const existing = await tx.dropdownOption.findUnique({ where: { categoryId_value: { categoryId: category.id, value: input.value } } });
            if (existing) {
                throw HttpError.conflict(`'${input.value}' is already an option of ${category.label}.`, [
                    { message: 'This option already exists.', path: ['value'] },
                ]);
            }
            const last = await tx.dropdownOption.aggregate({ where: { categoryId: category.id }, _max: { sortOrder: true } });
            const saved = await tx.dropdownOption.create({
                data: {
                    categoryId: category.id,
                    value: input.value,
                    label: input.value,
                    metaJson: input.meta ? JSON.stringify(input.meta) : null,
                    sortOrder: (last._max.sortOrder ?? 0) + 10,
                },
            });
            await auditService.record(tx, {
                entityType: 'DropdownOption',
                entityId: saved.id,
                action: 'CREATE',
                changedBy: user.username,
                changes: withMeta({ category: category.key, value: saved.value, label: saved.label }, user, {
                    module: category.module,
                    categoryKey: category.key,
                    categoryLabel: category.label,
                    optionLabel: saved.label,
                }),
            });
            return saved;
        });
        await invalidate();
        return toOptionDto(option);
    },

    async updateOption(optionId: string, body: unknown, user: AuthUser): Promise<DropdownOptionDto> {
        const input = updateOptionSchema.parse(body);
        const option = await runInTransaction(async (tx) => {
            const before = await findOption(tx, optionId);
            // Task / Note of the Followup Type list are hidden on new Lead / Opportunity forms (and refused by their
            // APIs), so they can't be what those forms start on.
            if (input.isDefault === true) {
                const category = await tx.dropdownCategory.findUnique({ where: { id: before.categoryId }, select: { key: true } });
                throwFieldIssues(activityOnlyDefaultIssues(category?.key ?? '', before.value, input.isDefault));
            }
            const renamed = input.label !== undefined && input.label !== before.label;
            // The app's code compares records against a system option's value (e.g. lead 'Converted'), and an
            // option's name and value are one, so a system option can't be renamed.
            if (before.isSystem && renamed) {
                throw HttpError.badRequest('System options cannot be renamed.', [
                    { message: `'${before.label}' drives CRM business logic, so its name is fixed.`, path: ['label'] },
                ]);
            }
            // An option's stored value is its name: renaming it renames the value, and records follow.
            let migrationNote: string | undefined;
            if (renamed) migrationNote = await changeOptionValue(tx, before, input.label!);
            const after = await tx.dropdownOption.update({
                where: { id: before.id },
                data: {
                    ...(renamed ? { label: input.label } : {}),
                    ...(input.meta !== undefined ? { metaJson: input.meta ? JSON.stringify(input.meta) : null } : {}),
                    ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
                },
            });
            const changes: Record<string, unknown> = diffRecords(before, after);
            if (migrationNote) changes.reason = migrationNote;
            if (Object.keys(changes).length > 0) {
                await auditService.record(tx, {
                    entityType: 'DropdownOption',
                    entityId: before.id,
                    action: 'UPDATE',
                    changedBy: user.username,
                    changes: withMeta(changes, user, await optionAuditMeta(tx, after)),
                });
            }
            return after;
        });
        await invalidate();
        return toOptionDto(option);
    },

    /**
     * Permanent delete. Records that stored this value keep the raw text (forms show it tagged "Removed").
     * Blocked for system options.
     */
    async deleteOption(optionId: string, user: AuthUser): Promise<{ id: string }> {
        await runInTransaction(async (tx) => {
            const option = await findOption(tx, optionId);
            if (option.isSystem) throw HttpError.badRequest('System-protected options cannot be deleted.');
            const meta = await optionAuditMeta(tx, option);
            await tx.dropdownOption.delete({ where: { id: option.id } });
            await auditService.record(tx, {
                entityType: 'DropdownOption',
                entityId: option.id,
                action: 'DELETE',
                changedBy: user.username,
                changes: withMeta({ categoryId: option.categoryId, value: option.value, label: option.label }, user, meta),
            });
        });
        await invalidate();
        return { id: optionId };
    },

    async reorderOptions(categoryKey: string, body: unknown, user: AuthUser): Promise<DropdownCategoryDto> {
        const { optionIds } = reorderOptionsSchema.parse(body);
        await runInTransaction(async (tx) => {
            const category = await findCategory(tx, categoryKey);
            const options = await tx.dropdownOption.findMany({ where: { categoryId: category.id }, orderBy: { sortOrder: 'asc' } });
            const known = new Set(options.map((o) => o.id));
            const unknown = optionIds.filter((id) => !known.has(id));
            if (unknown.length > 0) throw HttpError.badRequest('Some options do not belong to this dropdown.', [{ message: unknown.join(', '), path: ['optionIds'] }]);
            // Listed options first (in the given order), then any not listed (e.g. archived), keeping their order.
            const ordered = [...new Set(optionIds), ...options.map((o) => o.id).filter((id) => !optionIds.includes(id))];
            for (const [index, id] of ordered.entries()) {
                await tx.dropdownOption.update({ where: { id }, data: { sortOrder: (index + 1) * 10 } });
            }
            await auditService.record(tx, {
                entityType: 'DropdownCategory',
                entityId: category.id,
                action: 'UPDATE',
                changedBy: user.username,
                changes: withMeta({ reordered: ordered.length }, user, {
                    module: category.module,
                    categoryKey: category.key,
                    categoryLabel: category.label,
                }),
            });
        });
        await invalidate();
        return formConfigService.getCategory(categoryKey);
    },

    // ── Fields ──

    async createField(body: unknown, user: AuthUser): Promise<FormFieldDefinitionDto> {
        const input = createFieldSchema.parse(body);
        assertTab(input.module, input.tabKey);
        const field = await runInTransaction(async (tx) => {
            let categoryId: string | null = null;
            if (input.dropdownCategoryKey) {
                categoryId = (await findCategory(tx, input.dropdownCategoryKey)).id;
            } else if (input.newOptions?.length) {
                const category = await createCategoryWithOptions(
                    tx,
                    { label: input.label, module: input.module, description: `Options for the custom field "${input.label}".`, options: input.newOptions },
                    user,
                );
                categoryId = category.id;
            }

            const sectionKey = input.sectionKey || sectionKeyFromLabel(input.sectionLabel) || 'custom_fields';
            // An existing section keeps its label; a new one takes the label given.
            const existingSection = await tx.formFieldDefinition.findFirst({
                where: { module: input.module, tabKey: input.tabKey, sectionKey },
                select: { sectionLabel: true },
            });
            const sortOrder = 2_000_000_000; // temporary; placeField puts it at the end of its section
            // The key comes from the label (admins never choose one). The module's fields are locked so two fields
            // created at once can't take the same key.
            await lockModuleFields(tx, input.module);
            const fieldKey = await customFieldKey(tx, input.module, input.label);

            const created = await tx.formFieldDefinition.create({
                data: {
                    module: input.module,
                    fieldKey,
                    label: input.label,
                    fieldType: input.fieldType,
                    tabKey: input.tabKey,
                    tabLabel: await resolveTabLabel(tx, input.module, input.tabKey, input.tabLabel),
                    sectionKey,
                    sectionLabel: existingSection?.sectionLabel ?? input.sectionLabel,
                    sortOrder,
                    fieldSize: input.fieldSize ?? null,
                    placeholder: input.placeholder ?? null,
                    hint: input.hint ?? null,
                    defaultValue: input.defaultValue ?? null,
                    isRequired: input.isRequired,
                    isCoreLocked: false,
                    isSystem: false,
                    isActive: true,
                    isVisibleInForm: input.isVisibleInForm,
                    isVisibleInDrawer: input.isVisibleInDrawer,
                    // A field added to the contact / organization / opportunity form shows on Convert Lead too.
                    isVisibleInConvert: isConvertModule(input.module),
                    dropdownCategoryId: categoryId,
                    validationRulesJson: input.validationRules ? JSON.stringify(input.validationRules) : null,
                },
            });
            await placeField(tx, input.module, created.id);
            await auditService.record(tx, {
                entityType: 'FormField',
                entityId: created.id,
                action: 'CREATE',
                changedBy: user.username,
                changes: withMeta({ module: created.module, fieldKey: created.fieldKey, label: created.label, fieldType: created.fieldType }, user, {
                    module: created.module,
                    fieldKey: created.fieldKey,
                    fieldLabel: created.label,
                }),
            });
            return created;
        });
        await invalidate();
        return formConfigService.getField(field.id);
    },

    async updateField(fieldId: string, body: unknown, user: AuthUser): Promise<FormFieldDefinitionDto> {
        const input = updateFieldSchema.parse(body);
        let keyRenamedIn: CrmModuleKey | null = null;
        await runInTransaction(async (tx) => {
            const before = await findField(tx, fieldId);
            assertModule(before.module);
            const reject = (path: string, message: string) => {
                throw HttpError.badRequest(message, [{ message, path: [path] }]);
            };

            if (isFieldTombstoned(before.validationRulesJson)) throw HttpError.notFound('Form field not found');
            // Only core-locked fields are protected; every other field (built-in or custom) is freely editable.
            if (before.isCoreLocked) {
                if (input.isRequired === false && before.isRequired) reject('isRequired', `${before.label} is a core field and must stay required.`);
                if (input.isVisibleInForm === false) reject('isVisibleInForm', `${before.label} is a core field and cannot be hidden.`);
            }
            if (input.isVisibleInConvert !== undefined) {
                if (!isConvertModule(before.module)) reject('isVisibleInConvert', 'Only contact, organization and opportunity fields can be shown on Convert Lead.');
                const convertModule = before.module as ConvertModuleKey;
                if (input.isVisibleInConvert) {
                    const reason = convertFieldUnavailableReason(convertModule, { ...before, dropdownCategoryKey: undefined });
                    if (reason) reject('isVisibleInConvert', `${before.label} can't be shown on Convert Lead: ${reason.toLowerCase()}.`);
                } else if (before.isCoreLocked && before.fieldKey in CONVERT_FIELD_NAMES[convertModule]) {
                    reject('isVisibleInConvert', `${before.label} is a core field and must stay on Convert Lead.`);
                }
            }
            const convertSetting = input.convertIsRequired !== undefined || input.convertFieldSize !== undefined || input.convertSectionKey !== undefined;
            if (convertSetting && !isConvertModule(before.module)) {
                reject('convertIsRequired', 'Only contact, organization and opportunity fields have Convert Lead settings.');
            }
            if (before.isCoreLocked && input.convertIsRequired === false) reject('convertIsRequired', `${before.label} is a core field and must stay required.`);
            if (input.tabKey !== undefined) assertTab(before.module, input.tabKey);
            const nextTabKey = input.tabKey ?? before.tabKey;
            const tabLabel =
                nextTabKey !== before.tabKey || input.tabLabel !== undefined
                    ? await resolveTabLabel(tx, before.module, nextTabKey, input.tabLabel)
                    : undefined;
            // Address Country fields use the fixed ISO country list (no dropdown of their own): the only thing an
            // admin sets is the default, which must be one of those countries, stored as its ISO2 code.
            let defaultValue = input.defaultValue;
            if (isBuiltInCountryField(before) && defaultValue) {
                const iso2 = defaultValue.trim().toUpperCase();
                const country = await tx.country.findUnique({ where: { iso2Code: iso2 }, select: { iso2Code: true } });
                if (!country) reject('defaultValue', 'Choose the default country from the list.');
                defaultValue = iso2;
            }
            if (input.dropdownCategoryKey && isBuiltInCountryField(before)) {
                reject('dropdownCategoryKey', `${before.label} uses the fixed country list; it can't be given a dropdown.`);
            }

            if (input.fieldType !== undefined && input.fieldType !== before.fieldType) {
                // A built-in field maps to a fixed column shape (e.g. lead Status holds one value), so its type is fixed.
                if (before.isSystem) reject('fieldType', `${before.label} is a built-in field; its type can't be changed.`);
                if (!CHOICE_TYPES.has(before.fieldType)) reject('fieldType', 'Only select / multi-select fields can switch between the two.');
            }

            let dropdownCategoryId: string | null | undefined;
            if (input.dropdownCategoryKey !== undefined) {
                if (!CHOICE_TYPES.has(before.fieldType)) reject('dropdownCategoryKey', 'Only select / multi-select fields have dropdown options.');
                dropdownCategoryId = input.dropdownCategoryKey === null ? null : (await findCategory(tx, input.dropdownCategoryKey)).id;
                // Built-in fields keep their option list (system options such as lead 'Converted' live in it);
                // edit that list's options instead.
                if (before.isSystem && dropdownCategoryId !== before.dropdownCategoryId) {
                    reject('dropdownCategoryKey', `${before.label} is a built-in field; its dropdown list can't be changed. Edit the list's options instead.`);
                }
            }

            // A custom field's key follows its label ("PO Number" → po_number): renaming the field moves every
            // record's value, saved filters and PDF template paths to the new key. A built-in field keeps its column.
            let renameKey: string | null = null;
            let migrationNote: string | undefined;
            if (!before.isSystem && input.label !== undefined && input.label !== before.label) {
                await lockModuleFields(tx, before.module);
                const next = await customFieldKey(tx, before.module, input.label, before);
                if (next !== before.fieldKey) {
                    renameKey = next;
                    migrationNote = describeMigration(await migrateFieldKey(tx, before.module, before.fieldKey, next));
                    keyRenamedIn = before.module;
                }
            }

            const after = await tx.formFieldDefinition.update({
                where: { id: before.id },
                data: {
                    ...(renameKey ? { fieldKey: renameKey } : {}),
                    ...(input.label !== undefined ? { label: input.label } : {}),
                    ...(input.fieldType !== undefined ? { fieldType: input.fieldType } : {}),
                    ...(input.tabKey !== undefined ? { tabKey: input.tabKey } : {}),
                    ...(tabLabel !== undefined ? { tabLabel } : {}),
                    ...(input.sectionKey !== undefined ? { sectionKey: input.sectionKey } : {}),
                    ...(input.sectionLabel !== undefined ? { sectionLabel: input.sectionLabel } : {}),
                    ...(input.fieldSize !== undefined ? { fieldSize: input.fieldSize } : {}),
                    ...(input.placeholder !== undefined ? { placeholder: input.placeholder } : {}),
                    ...(input.hint !== undefined ? { hint: input.hint } : {}),
                    ...(defaultValue !== undefined ? { defaultValue } : {}),
                    ...(input.isRequired !== undefined ? { isRequired: input.isRequired } : {}),
                    ...(input.isVisibleInForm !== undefined ? { isVisibleInForm: input.isVisibleInForm } : {}),
                    ...(input.isVisibleInDrawer !== undefined ? { isVisibleInDrawer: input.isVisibleInDrawer } : {}),
                    ...(input.isVisibleInConvert !== undefined ? { isVisibleInConvert: input.isVisibleInConvert } : {}),
                    ...(input.convertIsRequired !== undefined ? { convertIsRequired: input.convertIsRequired } : {}),
                    ...(input.convertFieldSize !== undefined ? { convertFieldSize: input.convertFieldSize } : {}),
                    ...(input.convertSectionKey !== undefined ? { convertSectionKey: input.convertSectionKey } : {}),
                    ...(dropdownCategoryId !== undefined ? { dropdownCategoryId } : {}),
                    ...(input.validationRules !== undefined
                        ? { validationRulesJson: input.validationRules ? JSON.stringify(input.validationRules) : null }
                        : {}),
                },
            });
            // A custom field moved to another tab / section goes to the end of its new section.
            if (after.tabKey !== before.tabKey || after.sectionKey !== before.sectionKey) {
                const target = await tx.formFieldDefinition.findFirst({
                    where: { module: before.module, tabKey: after.tabKey, sectionKey: after.sectionKey, id: { not: before.id } },
                    select: { sectionLabel: true },
                });
                if (target && input.sectionLabel === undefined) {
                    await tx.formFieldDefinition.update({ where: { id: before.id }, data: { sectionLabel: target.sectionLabel } });
                }
                await placeField(tx, before.module, before.id);
            }

            const changes: Record<string, unknown> = diffRecords(before, after);
            if (migrationNote) changes.reason = migrationNote;

            // A dropdown list named after this field and used by it alone (e.g. a custom "Lead Type" field's list)
            // follows the field's rename, keeping the Dropdowns tab in step. Lists with a name of their own
            // (e.g. "GST Registration Type") or shared with other fields (e.g. Lead Source) keep it.
            if (after.label !== before.label && after.dropdownCategoryId) {
                const category = await tx.dropdownCategory.findUnique({
                    where: { id: after.dropdownCategoryId },
                    select: { id: true, key: true, label: true, isSystem: true },
                });
                const sharedWith = await tx.formFieldDefinition.count({ where: { dropdownCategoryId: after.dropdownCategoryId, id: { not: after.id } } });
                if (category && sharedWith === 0 && category.label.trim().toLowerCase() === before.label.trim().toLowerCase()) {
                    const key = await categoryKeyForLabel(tx, category, after.label);
                    await tx.dropdownCategory.update({ where: { id: category.id }, data: { label: after.label, ...(key !== category.key ? { key } : {}) } });
                    changes.dropdownLabel = { from: category.label, to: after.label };
                    if (key !== category.key) changes.dropdownKey = { from: category.key, to: key };
                }
            }

            // Record the linked dropdown by name (readable in the timeline) rather than by row id.
            if (changes.dropdownCategoryId) {
                const ids = [before.dropdownCategoryId, after.dropdownCategoryId].filter((id): id is string => Boolean(id));
                const names = new Map(
                    (await tx.dropdownCategory.findMany({ where: { id: { in: ids } }, select: { id: true, label: true } })).map((c) => [c.id, c.label]),
                );
                const nameOf = (id: string | null) => (id ? (names.get(id) ?? id) : null);
                delete changes.dropdownCategoryId;
                changes.dropdown = { from: nameOf(before.dropdownCategoryId), to: nameOf(after.dropdownCategoryId) };
            }
            if (Object.keys(changes).length > 0) {
                await auditService.record(tx, {
                    entityType: 'FormField',
                    entityId: before.id,
                    action: 'UPDATE',
                    changedBy: user.username,
                    changes: withMeta(changes, user, { module: after.module, fieldKey: after.fieldKey, fieldLabel: after.label }),
                });
            }
        });
        await invalidate();
        // Cached records, search results and dashboards still hold values under the old API name.
        if (keyRenamedIn) await cacheService.invalidateEntityCaches(keyRenamedIn);
        return formConfigService.getField(fieldId);
    },

    /**
     * Deletes a field (values already stored on records are left as they are). Core-locked fields cannot be deleted.
     * A custom field's row is removed; a built-in field's row is kept as a tombstone (inactive, hidden, unlinked,
     * `validationRulesJson: {"_deleted":true}`) so start-up seeding does not recreate it and the hand-built form hides
     * its input. Either way an admin-created dropdown follows the field off this form (see releaseFieldCategory).
     */
    async deleteField(fieldId: string, user: AuthUser): Promise<{ id: string }> {
        await runInTransaction(async (tx) => {
            const field = await findField(tx, fieldId);
            if (field.isCoreLocked) throw HttpError.badRequest('Core locked fields cannot be deleted.');
            if (isFieldTombstoned(field.validationRulesJson)) throw HttpError.notFound('Form field not found');
            if (field.isSystem) {
                await tx.formFieldDefinition.update({
                    where: { id: field.id },
                    data: {
                        isActive: false,
                        isVisibleInForm: false,
                        isVisibleInDrawer: false,
                        isVisibleInConvert: false,
                        isRequired: false,
                        convertIsRequired: null,
                        convertFieldSize: null,
                        convertSortOrder: null,
                        convertSectionKey: null,
                        dropdownCategoryId: null,
                        validationRulesJson: JSON.stringify({ _deleted: true }),
                    },
                });
            } else {
                await tx.formFieldDefinition.delete({ where: { id: field.id } });
            }
            await auditService.record(tx, {
                entityType: 'FormField',
                entityId: field.id,
                action: 'DELETE',
                changedBy: user.username,
                changes: withMeta({ module: field.module, fieldKey: field.fieldKey, label: field.label, fieldType: field.fieldType }, user, {
                    module: field.module,
                    fieldKey: field.fieldKey,
                    fieldLabel: field.label,
                }),
            });
            await releaseFieldCategory(tx, field, user);
        });
        await invalidate();
        return { id: fieldId };
    },

    async getField(fieldId: string): Promise<FormFieldDefinitionDto> {
        const { fieldsByModule } = await formConfigService.getAllConfigs(true);
        const field = Object.values(fieldsByModule)
            .flat()
            .find((f) => f.id === fieldId);
        if (!field) throw HttpError.notFound('Form field not found');
        return field;
    },

    /** Applies the given order to a module's fields (ids not listed keep their relative order, after the listed ones). */
    async reorderFields(module: CrmModuleKey, body: unknown, user: AuthUser): Promise<FormFieldDefinitionDto[]> {
        const { fieldIds } = reorderFieldsSchema.parse(body);
        await runInTransaction(async (tx) => {
            const fields = await tx.formFieldDefinition.findMany({ where: { module }, orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }] });
            const known = new Set(fields.map((f) => f.id));
            const unknown = fieldIds.filter((id) => !known.has(id));
            if (unknown.length > 0) throw HttpError.badRequest(`Some fields do not belong to ${module}.`, [{ message: unknown.join(', '), path: ['fieldIds'] }]);
            const ordered = [...new Set(fieldIds), ...fields.map((f) => f.id).filter((id) => !fieldIds.includes(id))];
            for (const [index, id] of ordered.entries()) {
                await tx.formFieldDefinition.update({ where: { id }, data: { sortOrder: (index + 1) * 10 } });
            }
            await auditService.record(tx, {
                entityType: 'FormField',
                entityId: module,
                action: 'UPDATE',
                changedBy: user.username,
                changes: withMeta({ reordered: ordered.length }, user, { module }),
            });
        });
        await invalidate();
        return (await formConfigService.getAllConfigs(true)).fieldsByModule[module];
    },

    /**
     * Sets Convert Lead's own field order for contacts / organizations / opportunities (the record's form keeps its
     * order). The listed fields fill, in the given order, the places they hold on the record's form; the others keep
     * theirs (so a field added to the form later shows where it sits there). An empty list clears it: Convert Lead
     * follows the record's form order again.
     */
    async reorderConvertFields(module: CrmModuleKey, body: unknown, user: AuthUser): Promise<FormFieldDefinitionDto[]> {
        const { fieldIds } = reorderConvertFieldsSchema.parse(body);
        if (!isConvertModule(module)) throw HttpError.badRequest('Only contact, organization and opportunity fields have a Convert Lead order.');
        await runInTransaction(async (tx) => {
            const fields = await tx.formFieldDefinition.findMany({ where: { module }, select: { id: true, convertSortOrder: true } });
            const known = new Set(fields.map((f) => f.id));
            const unknown = fieldIds.filter((id) => !known.has(id));
            if (unknown.length > 0) throw HttpError.badRequest(`Some fields do not belong to ${module}.`, [{ message: unknown.join(', '), path: ['fieldIds'] }]);
            const rank = new Map([...new Set(fieldIds)].map((id, index) => [id, (index + 1) * 10]));
            for (const field of fields) {
                const convertSortOrder = rank.get(field.id) ?? null;
                if (field.convertSortOrder !== convertSortOrder) await tx.formFieldDefinition.update({ where: { id: field.id }, data: { convertSortOrder } });
            }
            await auditService.record(tx, {
                entityType: 'FormField',
                entityId: module,
                action: 'UPDATE',
                changedBy: user.username,
                changes: withMeta(rank.size > 0 ? { convertReordered: rank.size } : { convertOrderReset: true }, user, { module }),
            });
        });
        await invalidate();
        return (await formConfigService.getAllConfigs(true)).fieldsByModule[module];
    },

    /** Renames a section: every field in it (built-in or custom) gets the new label. */
    async renameSection(module: CrmModuleKey, sectionKey: string, body: unknown, user: AuthUser): Promise<FormFieldDefinitionDto[]> {
        const { sectionLabel } = renameSectionSchema.parse(body);
        await runInTransaction(async (tx) => {
            const result = await tx.formFieldDefinition.updateMany({ where: { module, sectionKey }, data: { sectionLabel } });
            if (result.count === 0) throw HttpError.notFound(`Section '${sectionKey}' not found in ${module}.`);
            await auditService.record(tx, {
                entityType: 'FormField',
                entityId: `${module}:${sectionKey}`,
                action: 'UPDATE',
                changedBy: user.username,
                changes: withMeta({ sectionLabel }, user, { module, sectionKey }),
            });
        });
        await invalidate();
        return (await formConfigService.getAllConfigs(true)).fieldsByModule[module];
    },
};
