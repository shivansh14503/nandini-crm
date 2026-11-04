import type {
    CreateCategoryPayload,
    CreateFieldPayload,
    CreateOptionPayload,
    CrmModuleKey,
    DropdownCategoryDto,
    DropdownOptionDto,
    FormConfigsPayload,
    FormFieldDefinitionDto,
    ModuleFieldDefault,
    UpdateCategoryPayload,
    UpdateFieldPayload,
    UpdateOptionPayload,
} from '@/types/formConfig.types';
import { CRM_MODULE_KEYS, CRM_MODULE_LABELS, sectionKeyFromLabel } from '@/types/formConfig.types';

/**
 * Unsaved admin changes to the form configuration. Every edit in the builder becomes a `DraftOp`; the draft
 * shown in the builder and Live Preview is the saved configuration with the ops applied in order (mirroring
 * what the API will do), and "Save Changes" replays the ops against the API. Rows created in the draft get
 * temporary ids / keys that the replay maps to the ones the API returns.
 */

export type DraftOp =
    | { kind: 'createCategory'; key: string; optionIds: string[]; payload: CreateCategoryPayload & { options: string[] }; summary: string }
    | { kind: 'addOption'; id: string; categoryKey: string; payload: CreateOptionPayload; summary: string }
    | { kind: 'updateOption'; optionId: string; payload: UpdateOptionPayload; summary: string }
    | { kind: 'reorderOptions'; categoryKey: string; optionIds: string[]; summary: string }
    | {
          kind: 'createField';
          id: string;
          fieldKey: string;
          /** Key of the dropdown created from `newOptions`, with its option ids. */
          categoryKey?: string;
          optionIds?: string[];
          payload: CreateFieldPayload;
          summary: string;
      }
    | { kind: 'updateField'; fieldId: string; payload: UpdateFieldPayload; summary: string }
    | { kind: 'reorderFields'; module: CrmModuleKey; fieldIds: string[]; summary: string }
    | { kind: 'renameSection'; module: CrmModuleKey; sectionKey: string; sectionLabel: string; summary: string }
    /**
     * A new (admin-created) tab. It has no API call of its own: a custom tab is stored through the fields placed on
     * it (their `tabKey` + `tabLabel`), so a tab still empty when the changes are saved is not kept.
     */
    | { kind: 'createTab'; module: CrmModuleKey; tabKey: string; label: string; summary: string }
    | { kind: 'resetModule'; module: CrmModuleKey; defaults: ModuleFieldDefault[]; summary: string }
    | { kind: 'updateCategory'; categoryKey: string; payload: UpdateCategoryPayload; summary: string }
    | { kind: 'deleteCategory'; categoryKey: string; summary: string }
    | { kind: 'deleteOption'; optionId: string; summary: string }
    | { kind: 'deleteField'; fieldId: string; summary: string };

const TEMP_PREFIX = 'draft-';
let tempSeq = 0;
export const newTempId = (kind: string) => `${TEMP_PREFIX}${kind}-${Date.now().toString(36)}-${++tempSeq}`;
export const isTempId = (id: string) => id.startsWith(TEMP_PREFIX);

/** Same rule as the API: appends _2, _3, … until the key is free. */
export function uniqueKey(base: string, taken: (key: string) => boolean, max = 80): string {
    const root = base.slice(0, max - 4) || 'item';
    let candidate = root;
    for (let n = 2; taken(candidate); n++) candidate = `${root}_${n}`;
    return candidate;
}

export const categoryKeyFor = (label: string) => `custom_${sectionKeyFromLabel(label) || 'list'}`;
export const customFieldKeyFor = (label: string) => `cf_${sectionKeyFromLabel(label).replace(/^(\d)/, 'f_$1') || 'field'}`;

// ── Lookups over a (mutable) configuration ──────────────────────────────────

export const allFields = (s: FormConfigsPayload) => CRM_MODULE_KEYS.flatMap((m) => s.fieldsByModule[m] ?? []);
export const findCategoryByKey = (s: FormConfigsPayload, key: string) => s.categories.find((c) => c.key === key);
export const findFieldById = (s: FormConfigsPayload, id: string) => allFields(s).find((f) => f.id === id);
export function findOptionById(s: FormConfigsPayload, id: string): { category: DropdownCategoryDto; option: DropdownOptionDto } | undefined {
    for (const category of s.categories) {
        const option = category.options.find((o) => o.id === id);
        if (option) return { category, option };
    }
    return undefined;
}

const byOrder = <T extends { sortOrder: number }>(rows: T[]) => [...rows].sort((a, b) => a.sortOrder - b.sortOrder);
const renumber = <T extends { sortOrder: number }>(rows: T[]) => rows.forEach((row, i) => (row.sortOrder = (i + 1) * 10));

function newCategory(key: string, label: string, module: DropdownCategoryDto['module'], description: string, values: string[], optionIds: string[]): DropdownCategoryDto {
    const id = `${TEMP_PREFIX}cat-${key}`;
    return {
        id,
        key,
        label,
        module,
        description,
        isSystem: false,
        appRequired: false,
        lockReason: null,
        usedBy: [],
        options: values.map((value, i) => ({
            id: optionIds[i] ?? newTempId('opt'),
            categoryId: id,
            value,
            label: value,
            meta: null,
            sortOrder: (i + 1) * 10,
            isActive: true,
            isSystem: false,
        })),
    };
}

/** Mirrors the API's placeField: after the last field of the same tab + section, else of the tab, else at the end. */
function placeField(s: FormConfigsPayload, module: CrmModuleKey, fieldId: string): void {
    const ordered = byOrder(s.fieldsByModule[module] ?? []);
    const moving = ordered.find((f) => f.id === fieldId);
    if (!moving) return;
    const rest = ordered.filter((f) => f.id !== fieldId);
    const lastIndex = (match: (f: FormFieldDefinitionDto) => boolean) => rest.reduce((idx, f, i) => (match(f) ? i : idx), -1);
    let insertAt = lastIndex((f) => f.tabKey === moving.tabKey && f.sectionKey === moving.sectionKey);
    if (insertAt < 0) insertAt = lastIndex((f) => f.tabKey === moving.tabKey);
    renumber(insertAt < 0 ? [...rest, moving] : [...rest.slice(0, insertAt + 1), moving, ...rest.slice(insertAt + 1)]);
}

/** Adds a tab to the module's tab list if missing (custom tabs appear once something is placed on them). */
function ensureTab(s: FormConfigsPayload, module: CrmModuleKey, tabKey: string, label: string | null | undefined): void {
    const tabs = (s.moduleTabs[module] ??= []);
    if (!tabs.some((t) => t.key === tabKey)) tabs.push({ key: tabKey, label: label || tabKey, isCustom: true });
}

/** Name of a custom tab in the draft (stored on the fields placed on it); undefined for built-in tabs. */
export const tabLabelOf = (s: FormConfigsPayload, module: CrmModuleKey, tabKey: string) => {
    const tab = s.moduleTabs[module]?.find((t) => t.key === tabKey);
    return tab?.isCustom ? tab.label : undefined;
};

function setCategoryLink(s: FormConfigsPayload, field: FormFieldDefinitionDto, key: string | null): void {
    field.dropdownCategoryKey = key;
    field.dropdownCategoryId = key ? (findCategoryByKey(s, key)?.id ?? null) : null;
}

/**
 * What happens to a dropdown when `removed` (a field linked to it) is deleted. Same rule as the API's deleteField:
 * an admin-created dropdown no other field uses is deleted; one other modules still use is handed over to them
 * (their module, or `shared` when several), so it stops listing under the removed field's module.
 */
export function categoryAfterFieldRemoval(
    s: FormConfigsPayload,
    removed: Pick<FormFieldDefinitionDto, 'id' | 'module' | 'dropdownCategoryKey'>,
): { action: 'none' } | { action: 'delete'; key: string } | { action: 'move'; key: string; module: DropdownCategoryDto['module'] } {
    const key = removed.dropdownCategoryKey;
    const category = key ? findCategoryByKey(s, key) : undefined;
    if (!key || !category || category.isSystem) return { action: 'none' };
    const remaining = allFields(s).filter((f) => f.id !== removed.id && f.dropdownCategoryKey === key);
    if (remaining.length === 0) return { action: 'delete', key };
    const modules = [...new Set(remaining.map((f) => f.module))];
    if (category.module === removed.module && !modules.includes(removed.module)) {
        return { action: 'move', key, module: modules.length > 1 ? 'shared' : modules[0] };
    }
    return { action: 'none' };
}

/** Applies categoryAfterFieldRemoval to the draft state (the field is already gone from `s`). */
function releaseCategory(s: FormConfigsPayload, removed: FormFieldDefinitionDto): void {
    const next = categoryAfterFieldRemoval(s, removed);
    if (next.action === 'delete') s.categories = s.categories.filter((c) => c.key !== next.key);
    if (next.action === 'move') {
        const category = findCategoryByKey(s, next.key);
        if (category) category.module = next.module;
    }
}

// ── Applying ops ─────────────────────────────────────────────────────────────

function applyOp(s: FormConfigsPayload, op: DraftOp): void {
    switch (op.kind) {
        case 'createCategory': {
            const { label, module, description, options } = op.payload;
            s.categories.push(newCategory(op.key, label, module, description ?? '', options, op.optionIds));
            return;
        }
        case 'addOption': {
            const category = findCategoryByKey(s, op.categoryKey);
            if (!category) return;
            const max = category.options.reduce((m, o) => Math.max(m, o.sortOrder), 0);
            category.options.push({
                id: op.id,
                categoryId: category.id,
                value: op.payload.value,
                label: op.payload.label ?? op.payload.value,
                meta: op.payload.meta ?? null,
                sortOrder: max + 10,
                isActive: true,
                isSystem: false,
            });
            return;
        }
        case 'updateOption': {
            const found = findOptionById(s, op.optionId);
            if (!found) return;
            const { option } = found;
            if (op.payload.value !== undefined) option.value = op.payload.value;
            if (op.payload.label !== undefined) option.label = op.payload.label;
            if (op.payload.meta !== undefined) option.meta = op.payload.meta;
            if (op.payload.isActive !== undefined) option.isActive = op.payload.isActive;
            return;
        }
        case 'reorderOptions': {
            const category = findCategoryByKey(s, op.categoryKey);
            if (!category) return;
            const listed = op.optionIds.map((id) => category.options.find((o) => o.id === id)).filter((o): o is DropdownOptionDto => Boolean(o));
            renumber([...listed, ...byOrder(category.options).filter((o) => !listed.includes(o))]);
            return;
        }
        case 'createField': {
            const p = op.payload;
            if (op.categoryKey) {
                s.categories.push(
                    newCategory(op.categoryKey, p.label, p.module, `Options for the custom field "${p.label}".`, p.newOptions ?? [], op.optionIds ?? []),
                );
            }
            const fields = (s.fieldsByModule[p.module] ??= []);
            const sectionKey = p.sectionKey || sectionKeyFromLabel(p.sectionLabel) || 'custom_fields';
            const existingSection = fields.find((f) => f.tabKey === p.tabKey && f.sectionKey === sectionKey);
            const field: FormFieldDefinitionDto = {
                id: op.id,
                module: p.module,
                fieldKey: op.fieldKey,
                label: p.label,
                fieldType: p.fieldType,
                tabKey: p.tabKey,
                tabLabel: p.tabLabel ?? null,
                sectionKey,
                sectionLabel: existingSection?.sectionLabel ?? p.sectionLabel,
                defaultSectionKey: null,
                sortOrder: 2_000_000_000,
                fieldSize: p.fieldSize ?? null,
                placeholder: p.placeholder ?? null,
                hint: p.hint ?? null,
                defaultValue: p.defaultValue ?? null,
                isRequired: p.isRequired ?? false,
                isCoreLocked: false,
                isSystem: false,
                isActive: true,
                isVisibleInForm: p.isVisibleInForm ?? true,
                isVisibleInDrawer: p.isVisibleInDrawer ?? true,
                dropdownCategoryId: null,
                dropdownCategoryKey: null,
                validationRules: null,
            };
            setCategoryLink(s, field, p.dropdownCategoryKey ?? op.categoryKey ?? null);
            ensureTab(s, p.module, p.tabKey, p.tabLabel);
            fields.push(field);
            placeField(s, p.module, field.id);
            return;
        }
        case 'updateField': {
            const field = findFieldById(s, op.fieldId);
            if (!field) return;
            const p = op.payload;
            const before = { tabKey: field.tabKey, sectionKey: field.sectionKey };
            if (p.label !== undefined) field.label = p.label;
            if (p.fieldType !== undefined) field.fieldType = p.fieldType;
            if (p.tabKey !== undefined) field.tabKey = p.tabKey;
            if (p.tabLabel !== undefined) field.tabLabel = p.tabLabel;
            if (field.tabKey !== before.tabKey) ensureTab(s, field.module, field.tabKey, p.tabLabel);
            if (p.sectionKey !== undefined) field.sectionKey = p.sectionKey;
            if (p.sectionLabel !== undefined) field.sectionLabel = p.sectionLabel;
            if (p.fieldSize !== undefined) field.fieldSize = p.fieldSize;
            if (p.placeholder !== undefined) field.placeholder = p.placeholder;
            if (p.hint !== undefined) field.hint = p.hint;
            if (p.defaultValue !== undefined) field.defaultValue = p.defaultValue;
            if (p.isRequired !== undefined) field.isRequired = p.isRequired;
            if (p.isVisibleInForm !== undefined) field.isVisibleInForm = p.isVisibleInForm;
            if (p.isVisibleInDrawer !== undefined) field.isVisibleInDrawer = p.isVisibleInDrawer;
            if (p.isActive !== undefined) field.isActive = p.isActive;
            if (p.dropdownCategoryKey !== undefined) setCategoryLink(s, field, p.dropdownCategoryKey);
            if (field.tabKey !== before.tabKey || field.sectionKey !== before.sectionKey) {
                const target = s.fieldsByModule[field.module].find((f) => f.id !== field.id && f.tabKey === field.tabKey && f.sectionKey === field.sectionKey);
                if (target && p.sectionLabel === undefined) field.sectionLabel = target.sectionLabel;
                placeField(s, field.module, field.id);
            }
            return;
        }
        case 'reorderFields': {
            const fields = s.fieldsByModule[op.module] ?? [];
            const listed = op.fieldIds.map((id) => fields.find((f) => f.id === id)).filter((f): f is FormFieldDefinitionDto => Boolean(f));
            renumber([...listed, ...byOrder(fields).filter((f) => !listed.includes(f))]);
            return;
        }
        case 'renameSection': {
            for (const field of s.fieldsByModule[op.module] ?? []) if (field.sectionKey === op.sectionKey) field.sectionLabel = op.sectionLabel;
            return;
        }
        case 'createTab': {
            ensureTab(s, op.module, op.tabKey, op.label);
            return;
        }
        case 'resetModule': {
            const fields = s.fieldsByModule[op.module] ?? [];
            for (const def of op.defaults) {
                const field = fields.find((f) => f.isSystem && f.fieldKey === def.fieldKey);
                if (!field) continue;
                Object.assign(field, {
                    label: def.label,
                    sectionLabel: def.sectionLabel,
                    sectionKey: def.sectionKey,
                    tabKey: def.tabKey,
                    sortOrder: def.sortOrder,
                    fieldSize: null,
                    placeholder: null,
                    hint: null,
                    defaultValue: null,
                    isRequired: def.isRequired,
                    isCoreLocked: def.isCoreLocked,
                    isActive: true,
                    isVisibleInForm: true,
                    isVisibleInDrawer: true,
                });
                setCategoryLink(s, field, def.dropdownCategoryKey);
            }
            for (const custom of byOrder(fields.filter((f) => !f.isSystem))) placeField(s, op.module, custom.id);
            return;
        }
        case 'updateCategory': {
            const category = findCategoryByKey(s, op.categoryKey);
            if (!category) return;
            if (op.payload.label !== undefined) category.label = op.payload.label;
            if (op.payload.description !== undefined) category.description = op.payload.description ?? '';
            if (op.payload.module !== undefined) category.module = op.payload.module;
            return;
        }
        case 'deleteCategory': {
            // Mirrors the API: the dropdown goes with its options, custom fields using it are deleted, and built-in
            // fields using it are unlinked and hidden.
            s.categories = s.categories.filter((c) => c.key !== op.categoryKey);
            for (const m of CRM_MODULE_KEYS) {
                const fields = s.fieldsByModule[m];
                if (!fields) continue;
                s.fieldsByModule[m] = fields.filter((f) => f.isSystem || f.dropdownCategoryKey !== op.categoryKey);
                for (const f of s.fieldsByModule[m]) {
                    if (f.dropdownCategoryKey !== op.categoryKey) continue;
                    f.dropdownCategoryKey = null;
                    f.dropdownCategoryId = null;
                    f.isVisibleInForm = false;
                }
            }
            return;
        }
        case 'deleteOption': {
            const found = findOptionById(s, op.optionId);
            if (found) found.category.options = found.category.options.filter((o) => o.id !== op.optionId);
            return;
        }
        case 'deleteField': {
            const field = findFieldById(s, op.fieldId);
            if (!field) return;
            if (field.isSystem) {
                // Mirrors the API: a built-in field stays as a hidden tombstone so the hand-built form hides its input.
                const released = { ...field };
                Object.assign(field, {
                    isDeleted: true,
                    isActive: false,
                    isVisibleInForm: false,
                    isVisibleInDrawer: false,
                    isRequired: false,
                    dropdownCategoryKey: null,
                    dropdownCategoryId: null,
                    validationRules: { _deleted: true },
                });
                releaseCategory(s, released);
            } else {
                s.fieldsByModule[field.module] = s.fieldsByModule[field.module].filter((f) => f.id !== op.fieldId);
                releaseCategory(s, field);
            }
            return;
        }
    }
}

/** The saved configuration with the unsaved ops applied (the input is not modified). */
export function applyDraft(base: FormConfigsPayload, ops: DraftOp[]): FormConfigsPayload {
    if (ops.length === 0) return base;
    const s = structuredClone(base);
    for (const op of ops) applyOp(s, op);
    const fields = allFields(s);
    for (const category of s.categories) {
        category.usedBy = fields
            .filter((f) => f.dropdownCategoryKey === category.key && f.isActive)
            .map((f) => ({ module: f.module, fieldKey: f.fieldKey, label: f.label }));
        category.lockReason = categoryLockReason(s, category);
    }
    return s;
}

/**
 * Why a dropdown must stay (null → an admin may delete it, built-in or not). Same rule as the API's
 * categoryLockReason: options that drive CRM logic, a core field taking its options from it, or CRM screens
 * reading it directly (`appRequired`, decided by the API).
 */
export function categoryLockReason(s: FormConfigsPayload, category: DropdownCategoryDto): string | null {
    const systemOption = category.options.find((o) => o.isSystem);
    if (systemOption) return `Its option '${systemOption.label}' drives CRM logic.`;
    const core = allFields(s).find((f) => f.isSystem && f.isCoreLocked && f.dropdownCategoryKey === category.key);
    if (core) return `The core field '${core.label}' (${CRM_MODULE_LABELS[core.module]}) takes its options from it.`;
    if (category.appRequired) return 'CRM screens (lead conversion, quick create, quotations) read it directly.';
    return null;
}

// ── Modules an op affects (for "unsaved" markers per form) ──────────────────

/**
 * Forms each unsaved op changes. Rows are looked up in the draft and, for rows the draft already removed, in the
 * saved configuration. A dropdown op counts for its owning module and every module whose fields use it.
 */
export function modulesTouchedBy(ops: DraftOp[], base: FormConfigsPayload, draft: FormConfigsPayload): Set<CrmModuleKey> {
    const touched = new Set<CrmModuleKey>();
    const isModule = (m: string): m is CrmModuleKey => (CRM_MODULE_KEYS as readonly string[]).includes(m);
    const field = (id: string) => findFieldById(draft, id) ?? findFieldById(base, id);
    const addCategory = (key: string) => {
        for (const s of [draft, base]) {
            const category = findCategoryByKey(s, key);
            if (!category) continue;
            if (isModule(category.module)) touched.add(category.module);
            for (const u of category.usedBy) if (isModule(u.module)) touched.add(u.module);
            for (const f of allFields(s)) if (f.dropdownCategoryKey === key) touched.add(f.module);
        }
    };
    const addOption = (id: string) => {
        const found = findOptionById(draft, id) ?? findOptionById(base, id);
        if (found) addCategory(found.category.key);
    };
    for (const op of ops) {
        switch (op.kind) {
            case 'createCategory':
                if (isModule(op.payload.module)) touched.add(op.payload.module);
                addCategory(op.key);
                break;
            case 'updateCategory':
            case 'deleteCategory':
            case 'reorderOptions':
                addCategory(op.categoryKey);
                break;
            case 'addOption':
                addCategory(op.categoryKey);
                break;
            case 'updateOption':
            case 'deleteOption':
                addOption(op.optionId);
                break;
            case 'createField':
                touched.add(op.payload.module);
                break;
            case 'updateField':
            case 'deleteField': {
                const f = field(op.fieldId);
                if (f) touched.add(f.module);
                break;
            }
            case 'reorderFields':
            case 'renameSection':
            case 'resetModule':
            case 'createTab':
                touched.add(op.module);
                break;
        }
    }
    return touched;
}

/**
 * Tabs of `module` with unsaved changes: fields created, edited, moved (in or out), deleted or reordered on them,
 * sections renamed on them, and tabs created in this draft. A reset counts for every tab whose fields it changes.
 */
export function tabsTouchedBy(ops: DraftOp[], base: FormConfigsPayload | undefined, draft: FormConfigsPayload | undefined, module: CrmModuleKey): Set<string> {
    const tabs = new Set<string>();
    const savedField = (id: string) => (base ? findFieldById(base, id) : undefined);
    const draftField = (id: string) => (draft ? findFieldById(draft, id) : undefined);
    /** Tabs whose fields differ in order, membership or settings between the saved and draft configuration. */
    const changedTabs = () => {
        const before = base?.fieldsByModule[module] ?? [];
        const after = draft?.fieldsByModule[module] ?? [];
        const keys = new Set([...before, ...after].map((f) => f.tabKey));
        for (const tabKey of keys) {
            const sig = (fields: FormFieldDefinitionDto[]) =>
                byOrder(fields.filter((f) => f.tabKey === tabKey))
                    .map((f) => `${f.id}|${f.sectionKey}|${f.label}|${f.isRequired}|${f.isVisibleInForm}|${f.fieldSize}`)
                    .join('\n');
            if (sig(before) !== sig(after)) tabs.add(tabKey);
        }
    };
    for (const op of ops) {
        switch (op.kind) {
            case 'createField':
                if (op.payload.module === module) tabs.add(op.payload.tabKey || 'overview');
                break;
            case 'updateField':
            case 'deleteField': {
                for (const f of [savedField(op.fieldId), draftField(op.fieldId)]) if (f?.module === module) tabs.add(f.tabKey);
                break;
            }
            case 'reorderFields':
            case 'resetModule':
                if (op.module === module) changedTabs();
                break;
            case 'renameSection':
                if (op.module !== module) break;
                for (const f of draft?.fieldsByModule[module] ?? []) if (f.sectionKey === op.sectionKey) tabs.add(f.tabKey);
                break;
            case 'createTab':
                if (op.module === module) tabs.add(op.tabKey);
                break;
            case 'deleteCategory': {
                // Custom fields using the dropdown go with it; built-in ones are hidden.
                for (const f of base?.fieldsByModule[module] ?? []) if (f.dropdownCategoryKey === op.categoryKey) tabs.add(f.tabKey);
                break;
            }
            default:
                break;
        }
    }
    return tabs;
}

/** Which builder views of `module` have unsaved changes: its dropdowns, and its fields / sections / tabs. */
export function viewsTouchedForModule(
    ops: DraftOp[],
    base: FormConfigsPayload | undefined,
    draft: FormConfigsPayload | undefined,
    module: CrmModuleKey,
): { dropdowns: boolean; fields: boolean } {
    /** A dropdown counts for this module if it is scoped to it, shared, or used by one of its fields. */
    const concernsModule = (key: string) =>
        [draft, base].some((s) => {
            const category = s ? findCategoryByKey(s, key) : undefined;
            if (!category) return false;
            if (category.module === module || category.module === 'shared') return true;
            return category.usedBy.some((u) => u.module === module) || (s?.fieldsByModule[module] ?? []).some((f) => f.dropdownCategoryKey === key);
        });
    const optionCategory = (id: string) => (draft && findOptionById(draft, id)) || (base && findOptionById(base, id)) || undefined;
    const dropdowns = ops.some((op) => {
        switch (op.kind) {
            case 'createCategory':
                return op.payload.module === module || op.payload.module === 'shared' || concernsModule(op.key);
            case 'updateCategory':
            case 'deleteCategory':
            case 'reorderOptions':
            case 'addOption':
                return concernsModule(op.categoryKey);
            case 'updateOption':
            case 'deleteOption': {
                const found = optionCategory(op.optionId);
                return found ? concernsModule(found.category.key) : false;
            }
            case 'createField':
                // A dropdown created inline with a new field.
                return Boolean(op.categoryKey) && op.payload.module === module;
            default:
                return false;
        }
    });
    return { dropdowns, fields: tabsTouchedBy(ops, base, draft, module).size > 0 };
}

// ── Ids / keys an op refers to (for dropping ops of rows removed before saving) ──

export function opRefersTo(op: DraftOp, id: string): boolean {
    switch (op.kind) {
        case 'addOption':
            return op.id === id;
        case 'updateOption':
            return op.optionId === id;
        case 'createField':
            return op.id === id;
        case 'updateField':
            return op.fieldId === id;
        case 'deleteOption':
            return op.optionId === id;
        case 'deleteField':
            return op.fieldId === id;
        default:
            return false;
    }
}

/** Removes `id` from reorder lists. */
export function withoutId(op: DraftOp, id: string): DraftOp {
    if (op.kind === 'reorderOptions') return { ...op, optionIds: op.optionIds.filter((x) => x !== id) };
    if (op.kind === 'reorderFields') return { ...op, fieldIds: op.fieldIds.filter((x) => x !== id) };
    return op;
}

/** Removes a draft option that was staged as part of a new dropdown (createCategory / inline createField options). */
export function withoutDraftOption(op: DraftOp, id: string): DraftOp {
    if (op.kind === 'createCategory') {
        const i = op.optionIds.indexOf(id);
        if (i < 0) return op;
        return { ...op, optionIds: op.optionIds.filter((_, j) => j !== i), payload: { ...op.payload, options: op.payload.options.filter((_, j) => j !== i) } };
    }
    if (op.kind === 'createField' && op.optionIds && op.payload.newOptions) {
        const i = op.optionIds.indexOf(id);
        if (i < 0) return op;
        return {
            ...op,
            optionIds: op.optionIds.filter((_, j) => j !== i),
            payload: { ...op.payload, newOptions: op.payload.newOptions.filter((_, j) => j !== i) },
        };
    }
    return op;
}

// ── Saving ───────────────────────────────────────────────────────────────────

/** The API writes a replay needs (formConfigService satisfies it). */
export interface ConfigWriter {
    getAllConfigs(): Promise<FormConfigsPayload>;
    createCategory(payload: CreateCategoryPayload): Promise<DropdownCategoryDto>;
    addOption(categoryKey: string, payload: CreateOptionPayload): Promise<DropdownOptionDto>;
    updateOption(optionId: string, payload: UpdateOptionPayload): Promise<unknown>;
    reorderOptions(categoryKey: string, optionIds: string[]): Promise<unknown>;
    createField(payload: CreateFieldPayload): Promise<FormFieldDefinitionDto>;
    updateField(fieldId: string, payload: UpdateFieldPayload): Promise<unknown>;
    reorderFields(module: CrmModuleKey, fieldIds: string[]): Promise<unknown>;
    renameSection(module: CrmModuleKey, sectionKey: string, sectionLabel: string): Promise<unknown>;
    resetModule(module: CrmModuleKey): Promise<unknown>;
    updateCategory(categoryKey: string, payload: UpdateCategoryPayload): Promise<unknown>;
    deleteCategory(categoryKey: string): Promise<unknown>;
    deleteOption(optionId: string): Promise<unknown>;
    deleteField(fieldId: string): Promise<unknown>;
}

export interface ReplayResult {
    /** Ops that went through. */
    saved: number;
    /** Ops not saved (after a failure), pointed at the rows the saved ones created. */
    remaining: DraftOp[];
    error?: unknown;
}

/**
 * Applies the ops to the API in order, mapping draft ids / keys to the ones the API returns. Stops at the
 * first failure: earlier ops stay saved, the failed one and the rest are returned to stay staged.
 */
export async function replayOps(ops: DraftOp[], api: ConfigWriter): Promise<ReplayResult> {
    const ids = new Map<string, string>();
    const keys = new Map<string, string>();
    const rid = (id: string) => ids.get(id) ?? id;
    const rkey = (key: string) => keys.get(key) ?? key;
    const realIds = (list: string[]) => list.map(rid).filter((id) => !isTempId(id));
    const rkeyOpt = <T extends string | null | undefined>(key: T): T => (typeof key === 'string' ? (rkey(key) as T) : key);

    /** Maps the draft ids of a new dropdown's options to the saved ones (matched by value). */
    const mapOptions = async (draftKey: string, savedKey: string, values: string[], draftIds: string[]) => {
        keys.set(draftKey, savedKey);
        if (values.length === 0) return;
        const saved = (await api.getAllConfigs()).categories.find((c) => c.key === savedKey);
        values.forEach((value, i) => {
            const option = saved?.options.find((o) => o.value === value);
            if (option && draftIds[i]) ids.set(draftIds[i], option.id);
        });
    };

    const run = async (op: DraftOp): Promise<void> => {
        switch (op.kind) {
            case 'createCategory': {
                const created = await api.createCategory(op.payload);
                await mapOptions(op.key, created.key, op.payload.options, op.optionIds);
                return;
            }
            case 'addOption': {
                const created = await api.addOption(rkey(op.categoryKey), op.payload);
                ids.set(op.id, created.id);
                return;
            }
            case 'updateOption':
                await api.updateOption(rid(op.optionId), op.payload);
                return;
            case 'reorderOptions':
                await api.reorderOptions(rkey(op.categoryKey), realIds(op.optionIds));
                return;
            case 'createField': {
                const created = await api.createField({ ...op.payload, dropdownCategoryKey: rkeyOpt(op.payload.dropdownCategoryKey) });
                ids.set(op.id, created.id);
                if (op.categoryKey && created.dropdownCategoryKey) {
                    await mapOptions(op.categoryKey, created.dropdownCategoryKey, op.payload.newOptions ?? [], op.optionIds ?? []);
                }
                return;
            }
            case 'updateField':
                await api.updateField(rid(op.fieldId), { ...op.payload, dropdownCategoryKey: rkeyOpt(op.payload.dropdownCategoryKey) });
                return;
            case 'reorderFields':
                await api.reorderFields(op.module, realIds(op.fieldIds));
                return;
            case 'renameSection':
                await api.renameSection(op.module, op.sectionKey, op.sectionLabel);
                return;
            case 'createTab':
                // Stored through the fields placed on it (createField / updateField carry its tabKey + tabLabel).
                return;
            case 'resetModule':
                await api.resetModule(op.module);
                return;
            case 'updateCategory':
                await api.updateCategory(rkey(op.categoryKey), op.payload);
                return;
            case 'deleteCategory':
                await api.deleteCategory(rkey(op.categoryKey));
                return;
            case 'deleteOption':
                await api.deleteOption(rid(op.optionId));
                return;
            case 'deleteField':
                await api.deleteField(rid(op.fieldId));
                return;
        }
    };

    const remap = (op: DraftOp): DraftOp => {
        switch (op.kind) {
            case 'addOption':
                return { ...op, categoryKey: rkey(op.categoryKey) };
            case 'updateOption':
                return { ...op, optionId: rid(op.optionId) };
            case 'reorderOptions':
                return { ...op, categoryKey: rkey(op.categoryKey), optionIds: op.optionIds.map(rid) };
            case 'createField':
                return { ...op, payload: { ...op.payload, dropdownCategoryKey: rkeyOpt(op.payload.dropdownCategoryKey) } };
            case 'updateField':
                return { ...op, fieldId: rid(op.fieldId), payload: { ...op.payload, dropdownCategoryKey: rkeyOpt(op.payload.dropdownCategoryKey) } };
            case 'reorderFields':
                return { ...op, fieldIds: op.fieldIds.map(rid) };
            case 'updateCategory':
            case 'deleteCategory':
                return { ...op, categoryKey: rkey(op.categoryKey) };
            case 'deleteOption':
                return { ...op, optionId: rid(op.optionId) };
            case 'deleteField':
                return { ...op, fieldId: rid(op.fieldId) };
            default:
                return op;
        }
    };

    let saved = 0;
    try {
        for (const op of ops) {
            await run(op);
            saved++;
        }
        return { saved, remaining: [] };
    } catch (error) {
        return { saved, remaining: ops.slice(saved).map(remap), error };
    }
}
