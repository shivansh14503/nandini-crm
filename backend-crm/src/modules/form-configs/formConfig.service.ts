import { prisma, type TransactionClient } from '../../config/prisma.js';
import type { DropdownCategory, DropdownOption, FormFieldDefinition } from '../../generated/prisma/client.js';
import { auditService, diffRecords } from '../../services/audit.service.js';
import { CACHE_KEYS, cacheService } from '../../services/cache.service.js';
import type { AuthUser } from '../../types/user.types.js';
import { HttpError } from '../../utils/httpError.js';
import { runInTransaction } from '../shared/transactions.js';
import {
    APP_REQUIRED_CATEGORY_KEYS,
    CRM_MODULES,
    DEFAULT_FIELDS,
    MODULE_TABS,
    sectionKeyFromLabel,
    type CrmModuleKey,
} from './formConfig.defaults.js';
import {
    createCategorySchema,
    createFieldSchema,
    createOptionSchema,
    formConfigQuerySchema,
    reorderFieldsSchema,
    reorderOptionsSchema,
    renameSectionSchema,
    TAB_KEY_PATTERN,
    updateCategorySchema,
    updateFieldSchema,
    updateOptionSchema,
} from './formConfig.validator.js';

const CONFIG_TTL_SECONDS = 60 * 60;
const configCacheKey = (includeInactive: boolean) => CACHE_KEYS.lookups(`form-configs:${includeInactive ? 'all' : 'active'}`);
const CUSTOM_PREFIX = 'cf_';
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
    /** Why it can't be deleted, or null when an admin may delete it (built-in or not). */
    lockReason: string | null;
    options: DropdownOptionDto[];
    /** Fields (any module) whose options come from this category. */
    usedBy: { module: string; fieldKey: string; label: string }[];
}

export interface FormFieldDefinitionDto {
    id: string;
    module: string;
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
    dropdownCategoryId: string | null;
    dropdownCategoryKey: string | null;
    validationRules: Record<string, unknown> | null;
}

export interface FormConfigsPayload {
    categories: DropdownCategoryDto[];
    fieldsByModule: Record<CrmModuleKey, FormFieldDefinitionDto[]>;
    /** Built-in tabs of each module, followed by its admin-created tabs (from the fields placed on them). */
    moduleTabs: Record<CrmModuleKey, { key: string; label: string; isCustom?: boolean }[]>;
}

/** Section each built-in field has on the hand-built form, by `module:fieldKey`. */
const DEFAULT_SECTION_KEYS = new Map(DEFAULT_FIELDS.map((f) => [`${f.module}:${f.fieldKey}`, sectionKeyFromLabel(f.sectionLabel)]));

/** `compliance_legal` → `Compliance Legal` (fallback name of a custom tab saved without one). */
const titleCaseFromKey = (key: string) =>
    key
        .split('_')
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

const isBuiltInTab = (module: CrmModuleKey, tabKey: string) => MODULE_TABS[module].some((tab) => tab.key === tabKey);

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
    dropdownCategoryId: f.dropdownCategoryId,
    dropdownCategoryKey: f.dropdownCategoryId ? (categoryKeys.get(f.dropdownCategoryId) ?? null) : null,
    validationRules: parseJsonObject(f.validationRulesJson),
});

// ── Helpers ──────────────────────────────────────────────────────────────────

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

/** Keeps a generated key unique by appending _2, _3, … */
async function uniqueKey(base: string, exists: (key: string) => Promise<boolean>, max: number): Promise<string> {
    const root = base.slice(0, max - 4) || 'item';
    let candidate = root;
    for (let n = 2; await exists(candidate); n++) candidate = `${root}_${n}`;
    return candidate;
}

/** `cf_` + a snake_case key from the label, unique within the module. */
async function customFieldKey(tx: TransactionClient, module: string, label: string): Promise<string> {
    const slug = sectionKeyFromLabel(label).replace(/^(\d)/, 'f_$1') || 'field';
    return uniqueKey(
        `${CUSTOM_PREFIX}${slug}`,
        async (fieldKey) => (await tx.formFieldDefinition.count({ where: { module, fieldKey } })) > 0,
        80,
    );
}

async function createCategoryWithOptions(
    tx: TransactionClient,
    input: { key?: string; label: string; module: string; description?: string; options: string[] },
    user: AuthUser,
): Promise<DropdownCategory> {
    const key =
        input.key ??
        (await uniqueKey(
            `custom_${sectionKeyFromLabel(input.label) || 'list'}`,
            async (candidate) => (await tx.dropdownCategory.count({ where: { key: candidate } })) > 0,
            80,
        ));
    if (input.key && (await tx.dropdownCategory.count({ where: { key } })) > 0) {
        throw HttpError.conflict(`A dropdown category with key '${key}' already exists.`, [{ message: 'Key already in use.', path: ['key'] }]);
    }
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
        changes: { key, label: input.label, module: input.module, options: values },
    });
    return category;
}

/**
 * Moves a field to just after the last other field of its tab + section (or, for a new section, after the last
 * field of its tab, else at the end), then renumbers the module's fields 10, 20, … so the order stays unambiguous.
 */
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
            const [categories, fields] = await Promise.all([
                prisma.dropdownCategory.findMany({
                    where: { deletedAt: null },
                    include: {
                        options: { where: includeInactive ? {} : { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }] },
                    },
                    orderBy: [{ module: 'asc' }, { label: 'asc' }],
                }),
                prisma.formFieldDefinition.findMany({
                    where: includeInactive ? {} : { isActive: true },
                    orderBy: [{ module: 'asc' }, { sortOrder: 'asc' }, { label: 'asc' }],
                }),
            ]);
            const categoryKeys = new Map(categories.map((c) => [c.id, c.key]));
            const fieldsByModule = Object.fromEntries(CRM_MODULES.map((m) => [m, [] as FormFieldDefinitionDto[]])) as Record<
                CrmModuleKey,
                FormFieldDefinitionDto[]
            >;
            const moduleTabs = Object.fromEntries(CRM_MODULES.map((m) => [m, [...MODULE_TABS[m]]])) as FormConfigsPayload['moduleTabs'];
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
            };
        });
    },

    /** Built-in field defaults of a module (what resetModule restores), so the admin UI can preview a reset. */
    getModuleDefaults(module: CrmModuleKey) {
        assertModule(module);
        return DEFAULT_FIELDS.filter((f) => f.module === module).map((f) => ({
            fieldKey: f.fieldKey,
            label: f.label,
            tabKey: f.tabKey,
            sectionKey: sectionKeyFromLabel(f.sectionLabel),
            sectionLabel: f.sectionLabel,
            sortOrder: f.sortOrder,
            isRequired: f.isRequired,
            isCoreLocked: f.isCoreLocked,
            dropdownCategoryKey: f.dropdownCategoryKey ?? null,
        }));
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
        await runInTransaction(async (tx) => {
            const before = await findCategory(tx, categoryKey);
            const after = await tx.dropdownCategory.update({
                where: { id: before.id },
                data: {
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
                changes: diffRecords(before, after),
            });
        });
        await invalidate();
        return formConfigService.getCategory(categoryKey);
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
                        changes: { dropdown: { from: category.key, to: null }, isVisibleInForm: { from: true, to: false } },
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
                        changes: { module: f.module, fieldKey: f.fieldKey, label: f.label, reason: `dropdown '${category.key}' deleted` },
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
                changes: {
                    key: category.key,
                    label: category.label,
                    module: category.module,
                    builtIn: category.isSystem,
                    removedFields: custom.map((f) => `${f.module}:${f.fieldKey}`),
                    hiddenFields: builtIn.map((f) => `${f.module}:${f.fieldKey}`),
                },
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

    /** Adds an option; re-adding an archived value restores it instead of failing. */
    async addOption(categoryKey: string, body: unknown, user: AuthUser): Promise<DropdownOptionDto> {
        const input = createOptionSchema.parse(body);
        const option = await runInTransaction(async (tx) => {
            const category = await findCategory(tx, categoryKey);
            const existing = await tx.dropdownOption.findUnique({ where: { categoryId_value: { categoryId: category.id, value: input.value } } });
            if (existing?.isActive) {
                throw HttpError.conflict(`'${input.value}' is already an option of ${category.label}.`, [
                    { message: 'This option already exists.', path: ['value'] },
                ]);
            }
            const last = await tx.dropdownOption.aggregate({ where: { categoryId: category.id }, _max: { sortOrder: true } });
            const saved = existing
                ? await tx.dropdownOption.update({
                      where: { id: existing.id },
                      data: { isActive: true, label: input.label ?? existing.label, ...(input.meta !== undefined ? { metaJson: input.meta ? JSON.stringify(input.meta) : null } : {}) },
                  })
                : await tx.dropdownOption.create({
                      data: {
                          categoryId: category.id,
                          value: input.value,
                          label: input.label ?? input.value,
                          metaJson: input.meta ? JSON.stringify(input.meta) : null,
                          sortOrder: (last._max.sortOrder ?? 0) + 10,
                      },
                  });
            await auditService.record(tx, {
                entityType: 'DropdownOption',
                entityId: saved.id,
                action: existing ? 'STATUS_CHANGE' : 'CREATE',
                changedBy: user.username,
                changes: { category: category.key, value: saved.value, label: saved.label, ...(existing ? { restored: true } : {}) },
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
            if (before.isSystem) {
                if (input.value !== undefined && input.value !== before.value) {
                    throw HttpError.badRequest('System options cannot be renamed.', [
                        { message: `'${before.value}' drives CRM business logic; change its label instead.`, path: ['value'] },
                    ]);
                }
                if (input.isActive === false) {
                    throw HttpError.badRequest('System options cannot be archived.', [
                        { message: `'${before.value}' drives CRM business logic and must stay available.`, path: ['isActive'] },
                    ]);
                }
            }
            if (input.value !== undefined && input.value !== before.value) {
                const clash = await tx.dropdownOption.count({ where: { categoryId: before.categoryId, value: input.value, id: { not: before.id } } });
                if (clash > 0) throw HttpError.conflict(`'${input.value}' already exists in this dropdown.`, [{ message: 'Duplicate option.', path: ['value'] }]);
            }
            const after = await tx.dropdownOption.update({
                where: { id: before.id },
                data: {
                    ...(input.value !== undefined ? { value: input.value } : {}),
                    ...(input.label !== undefined ? { label: input.label } : {}),
                    ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
                    ...(input.meta !== undefined ? { metaJson: input.meta ? JSON.stringify(input.meta) : null } : {}),
                },
            });
            const changes = diffRecords(before, after);
            if (Object.keys(changes).length > 0) {
                await auditService.record(tx, {
                    entityType: 'DropdownOption',
                    entityId: before.id,
                    action: input.isActive !== undefined && input.isActive !== before.isActive ? 'STATUS_CHANGE' : 'UPDATE',
                    changedBy: user.username,
                    changes,
                });
            }
            return after;
        });
        await invalidate();
        return toOptionDto(option);
    },

    /**
     * Permanent delete. Records that stored this value keep the raw text (they no longer resolve to a label);
     * archive (`PATCH isActive:false`) instead when that matters. Blocked for system options.
     */
    async deleteOption(optionId: string, user: AuthUser): Promise<{ id: string }> {
        await runInTransaction(async (tx) => {
            const option = await findOption(tx, optionId);
            if (option.isSystem) throw HttpError.badRequest('System-protected options cannot be deleted.');
            await tx.dropdownOption.delete({ where: { id: option.id } });
            await auditService.record(tx, {
                entityType: 'DropdownOption',
                entityId: option.id,
                action: 'DELETE',
                changedBy: user.username,
                changes: { categoryId: option.categoryId, value: option.value, label: option.label },
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
                changes: { reordered: ordered.length },
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

            const created = await tx.formFieldDefinition.create({
                data: {
                    module: input.module,
                    fieldKey: await customFieldKey(tx, input.module, input.label),
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
                changes: { module: created.module, fieldKey: created.fieldKey, label: created.label, fieldType: created.fieldType },
            });
            return created;
        });
        await invalidate();
        return formConfigService.getField(field.id);
    },

    async updateField(fieldId: string, body: unknown, user: AuthUser): Promise<FormFieldDefinitionDto> {
        const input = updateFieldSchema.parse(body);
        await runInTransaction(async (tx) => {
            const before = await findField(tx, fieldId);
            assertModule(before.module);
            const reject = (path: string, message: string) => {
                throw HttpError.badRequest(message, [{ message, path: [path] }]);
            };

            if (before.isCoreLocked) {
                if (input.isRequired === false && before.isRequired) reject('isRequired', `${before.label} is a core field and must stay required.`);
                if (input.isVisibleInForm === false) reject('isVisibleInForm', `${before.label} is a core field and cannot be hidden.`);
            }
            if (before.isSystem) {
                if (input.isActive === false) reject('isActive', 'Built-in fields cannot be removed; hide them instead.');
                // Built-in fields may move between the sections of their tab (the forms render them there), but
                // not to another tab: a hand-built form only mounts the grids of the tab being shown.
                if (input.tabKey !== undefined && input.tabKey !== before.tabKey) reject('tabKey', 'Built-in fields stay on their original tab.');
            }
            if (input.tabKey !== undefined) assertTab(before.module, input.tabKey);
            const nextTabKey = input.tabKey ?? before.tabKey;
            const tabLabel =
                nextTabKey !== before.tabKey || input.tabLabel !== undefined
                    ? await resolveTabLabel(tx, before.module, nextTabKey, input.tabLabel)
                    : undefined;
            if (input.fieldType !== undefined && input.fieldType !== before.fieldType) {
                if (before.isSystem) reject('fieldType', 'Built-in fields keep their control type.');
                if (!CHOICE_TYPES.has(before.fieldType)) reject('fieldType', 'Only select / multi-select fields can switch between the two.');
            }

            let dropdownCategoryId: string | null | undefined;
            if (input.dropdownCategoryKey !== undefined) {
                if (!CHOICE_TYPES.has(before.fieldType)) reject('dropdownCategoryKey', 'Only select / multi-select fields have dropdown options.');
                dropdownCategoryId = input.dropdownCategoryKey === null ? null : (await findCategory(tx, input.dropdownCategoryKey)).id;
            }

            const after = await tx.formFieldDefinition.update({
                where: { id: before.id },
                data: {
                    ...(input.label !== undefined ? { label: input.label } : {}),
                    ...(input.fieldType !== undefined ? { fieldType: input.fieldType } : {}),
                    ...(input.tabKey !== undefined ? { tabKey: input.tabKey } : {}),
                    ...(tabLabel !== undefined ? { tabLabel } : {}),
                    ...(input.sectionKey !== undefined ? { sectionKey: input.sectionKey } : {}),
                    ...(input.sectionLabel !== undefined ? { sectionLabel: input.sectionLabel } : {}),
                    ...(input.fieldSize !== undefined ? { fieldSize: input.fieldSize } : {}),
                    ...(input.placeholder !== undefined ? { placeholder: input.placeholder } : {}),
                    ...(input.hint !== undefined ? { hint: input.hint } : {}),
                    ...(input.defaultValue !== undefined ? { defaultValue: input.defaultValue } : {}),
                    ...(input.isRequired !== undefined ? { isRequired: input.isRequired } : {}),
                    ...(input.isVisibleInForm !== undefined ? { isVisibleInForm: input.isVisibleInForm } : {}),
                    ...(input.isVisibleInDrawer !== undefined ? { isVisibleInDrawer: input.isVisibleInDrawer } : {}),
                    ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
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

            const changes = diffRecords(before, after);
            if (Object.keys(changes).length > 0) {
                await auditService.record(tx, {
                    entityType: 'FormField',
                    entityId: before.id,
                    action: input.isActive !== undefined && input.isActive !== before.isActive ? 'STATUS_CHANGE' : 'UPDATE',
                    changedBy: user.username,
                    changes,
                });
            }
        });
        await invalidate();
        return formConfigService.getField(fieldId);
    },

    /**
     * Permanently deletes a custom field (values already stored on records are left as they are). Its admin-created
     * dropdown follows the field off this form: deleted when no other field uses it, otherwise handed over to the
     * module(s) that still do, so it no longer lists under this module.
     */
    async deleteField(fieldId: string, user: AuthUser): Promise<{ id: string }> {
        await runInTransaction(async (tx) => {
            const field = await findField(tx, fieldId);
            if (field.isSystem) throw HttpError.badRequest('Built-in system fields cannot be deleted; hide them instead.');
            await tx.formFieldDefinition.delete({ where: { id: field.id } });
            await auditService.record(tx, {
                entityType: 'FormField',
                entityId: field.id,
                action: 'DELETE',
                changedBy: user.username,
                changes: { module: field.module, fieldKey: field.fieldKey, label: field.label, fieldType: field.fieldType },
            });

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
                    changes: { key: category.key, label: category.label, reason: `last field '${field.module}:${field.fieldKey}' deleted` },
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
                    changes: { module: { from: category.module, to: module } },
                });
            }
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
            await auditService.record(tx, { entityType: 'FormField', entityId: module, action: 'UPDATE', changedBy: user.username, changes: { reordered: ordered.length } });
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
                changes: { sectionLabel },
            });
        });
        await invalidate();
        return (await formConfigService.getAllConfigs(true)).fieldsByModule[module];
    },

    /**
     * Restores the module's built-in fields to their defaults (label, section label, order, size, texts,
     * required / visibility, linked dropdown). Custom fields are kept, since records may hold their values.
     */
    async resetModule(module: CrmModuleKey, user: AuthUser): Promise<FormFieldDefinitionDto[]> {
        await runInTransaction(async (tx) => {
            const categories = await tx.dropdownCategory.findMany({ where: { deletedAt: null }, select: { id: true, key: true } });
            const categoryIds = new Map(categories.map((c) => [c.key, c.id]));
            for (const def of DEFAULT_FIELDS.filter((f) => f.module === module)) {
                // A field whose default dropdown an admin deleted stays unlinked and hidden.
                const dropdownGone = Boolean(def.dropdownCategoryKey && !categoryIds.has(def.dropdownCategoryKey));
                await tx.formFieldDefinition.updateMany({
                    where: { module, fieldKey: def.fieldKey, isSystem: true },
                    data: {
                        label: def.label,
                        sectionLabel: def.sectionLabel,
                        sectionKey: sectionKeyFromLabel(def.sectionLabel),
                        tabKey: def.tabKey,
                        tabLabel: null,
                        sortOrder: def.sortOrder,
                        fieldSize: null,
                        placeholder: null,
                        hint: null,
                        defaultValue: null,
                        isRequired: def.isRequired,
                        isCoreLocked: def.isCoreLocked,
                        isActive: true,
                        isVisibleInForm: !dropdownGone,
                        isVisibleInDrawer: true,
                        dropdownCategoryId: def.dropdownCategoryKey ? (categoryIds.get(def.dropdownCategoryKey) ?? null) : null,
                    },
                });
            }
            // Custom fields keep their sections; re-place them after the restored built-in order.
            const customFields = await tx.formFieldDefinition.findMany({ where: { module, isSystem: false }, orderBy: { sortOrder: 'asc' }, select: { id: true } });
            for (const field of customFields) await placeField(tx, module, field.id);
            await auditService.record(tx, { entityType: 'FormField', entityId: module, action: 'UPDATE', changedBy: user.username, changes: { reset: true } });
        });
        await invalidate();
        return (await formConfigService.getAllConfigs(true)).fieldsByModule[module];
    },
};
