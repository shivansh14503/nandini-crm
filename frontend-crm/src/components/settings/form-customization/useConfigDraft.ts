'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { formConfigService } from '@/services/formConfig.service';
import {
    CRM_MODULE_LABELS,
    type CreateCategoryPayload,
    type CreateFieldPayload,
    type CreateOptionPayload,
    tabKeyFromLabel,
    type CrmModuleKey,
    type DropdownCategoryDto,
    type DropdownOptionDto,
    type FormConfigsPayload,
    type UpdateCategoryPayload,
    type UpdateFieldPayload,
    type UpdateOptionPayload,
} from '@/types/formConfig.types';
import {
    allFields,
    applyDraft,
    categoryAfterFieldRemoval,
    categoryKeyFor,
    categoryLockReason,
    customFieldKeyFor,
    findCategoryByKey,
    findFieldById,
    findOptionById,
    isTempId,
    newTempId,
    opRefersTo,
    renameDefaultValue,
    replayOps,
    tabLabelOf,
    uniqueKey,
    withoutDraftOption,
    withoutId,
    withRenamedDraftOption,
    type DraftOp,
    type ReplayResult,
} from './configDraft';

/** Field edits that move a field (kept as their own op so they apply after any reorder staged before them). */
const PLACEMENT_KEYS = ['tabKey', 'tabLabel', 'sectionKey', 'sectionLabel'] as const;

/** Staging actions: same shape as the service's writes, but they only change the unsaved draft. */
export interface ConfigDraftActions {
    createCategory(payload: CreateCategoryPayload): { key: string; label: string };
    addOption(categoryKey: string, payload: CreateOptionPayload): void;
    updateOption(optionId: string, payload: UpdateOptionPayload): void;
    reorderOptions(categoryKey: string, optionIds: string[]): void;
    createField(payload: CreateFieldPayload): { id: string; label: string };
    updateField(fieldId: string, payload: UpdateFieldPayload): void;
    reorderFields(module: CrmModuleKey, fieldIds: string[]): void;
    renameSection(module: CrmModuleKey, sectionKey: string, sectionLabel: string): void;
    /** Adds an admin-created tab to the module's form; returns its key (a slug of the name, unique on the form). */
    createTab(module: CrmModuleKey, label: string): { key: string; label: string };
    updateCategory(categoryKey: string, payload: UpdateCategoryPayload): void;
    /** Permanent deletes (admin-created dropdowns, non-system options, custom fields). */
    deleteCategory(categoryKey: string): void;
    deleteOption(optionId: string): void;
    deleteField(fieldId: string): void;
    /**
     * Deletes every field of a section (custom fields removed, built-in ones tombstoned, as deleteField does).
     * Refused when the section holds a core-locked field.
     */
    deleteSection(module: CrmModuleKey, tabKey: string, sectionKey: string): void;
    /**
     * Deletes a tab with every field on it. Refused for the module's last tab and for a tab holding a core-locked
     * field. Returns the number of fields deleted.
     */
    deleteTab(module: CrmModuleKey, tabKey: string): number;
    /** A module setting (e.g. the new-lead Rating limits); repeated edits of one setting stay one change. */
    setModuleSetting(module: CrmModuleKey, key: string, value: unknown, summary: string): void;
}

export interface ConfigDraft {
    /** Saved configuration with the unsaved changes applied. */
    draft: FormConfigsPayload | null;
    ops: DraftOp[];
    dirty: boolean;
    saving: boolean;
    actions: ConfigDraftActions;
    /** Replays the changes against the API. Resolves with the number saved; on failure the unsaved rest stays staged. */
    save(): Promise<number>;
    discard(): void;
}

const fail = (message: string): never => {
    throw new Error(message);
};

const moduleLabel = (m: string) => CRM_MODULE_LABELS[m as CrmModuleKey] ?? m;

const clash = (label: string, what: string): never => fail(`"${label}" clashes with ${what}. Choose a different name for one of them.`);

/**
 * The key a field added in the builder gets from `label` (same rule as the API: no prefix, no numbering). A name
 * whose key another field of the module has is refused, saying which, so the admin picks the names. (Record columns
 * only the API knows: it refuses those on save.)
 */
function fieldKeyFor(s: FormConfigsPayload, module: CrmModuleKey, label: string, selfId?: string): string {
    const key = customFieldKeyFor(label);
    const other = (s.fieldsByModule[module] ?? []).find((f) => f.id !== selfId && f.fieldKey.toLowerCase() === key);
    if (other) clash(label, `${other.isSystem ? 'the built-in field' : 'the field'} "${other.label}" on ${moduleLabel(module)}`);
    return key;
}

/** The key a dropdown added in the builder gets from `label`; refused (saying which) when another dropdown has it. */
function dropdownKeyFor(s: FormConfigsPayload, label: string, selfKey?: string): string {
    const key = categoryKeyFor(label);
    const other = s.categories.find((c) => c.key !== selfKey && c.key.toLowerCase() === key);
    if (other) clash(label, `${other.isSystem ? 'the built-in dropdown' : 'the dropdown'} "${other.label}"`);
    return key;
}

/** Fields of a tab that are not deleted (archived ones included). */
const liveFieldsOn = (s: FormConfigsPayload, module: CrmModuleKey, tabKey: string) =>
    (s.fieldsByModule[module] ?? []).filter((f) => f.tabKey === tabKey && !f.isDeleted);

/**
 * Holds the builder's unsaved changes as a list of ops over the saved configuration (`base`). Edits are
 * validated against the draft the way the API would, so most problems surface while editing, not on save.
 * `refetch` reloads the saved configuration once a save finishes.
 */
export function useConfigDraft(base: FormConfigsPayload | undefined, refetch: () => Promise<unknown>): ConfigDraft {
    const queryClient = useQueryClient();
    const [ops, setOps] = useState<DraftOp[]>([]);
    const [saving, setSaving] = useState(false);
    // While saving, each API write refreshes `base`; the draft keeps using the snapshot the ops were made on.
    const [frozenBase, setFrozenBase] = useState<FormConfigsPayload | null>(null);
    const effectiveBase = frozenBase ?? base ?? null;

    const draft = useMemo(() => (effectiveBase ? applyDraft(effectiveBase, ops) : null), [effectiveBase, ops]);

    // Latest values for the action callbacks (one user action may stage several ops before re-rendering).
    const opsRef = useRef(ops);
    const baseRef = useRef(effectiveBase);
    useEffect(() => {
        opsRef.current = ops;
        baseRef.current = effectiveBase;
    }, [ops, effectiveBase]);

    const current = () => {
        const b = baseRef.current;
        if (!b) return fail('The form configuration has not loaded yet.');
        return applyDraft(b, opsRef.current);
    };
    const commit = (next: DraftOp[]) => {
        opsRef.current = next;
        setOps(next);
    };
    const push = (op: DraftOp) => commit([...opsRef.current, op]);
    /** Removes the ops matching `drop`, and the given ids from reorder lists. */
    const prune = (drop: (op: DraftOp) => boolean, ids: string[]) =>
        commit(opsRef.current.filter((op) => !drop(op)).map((op) => ids.reduce((acc, id) => withoutId(acc, id), op)));
    /** Drops a row created in this draft, with every op touching it. */
    const dropTemp = (id: string) => prune((op) => opRefersTo(op, id), [id]);
    /** Drops every op that creates or edits the dropdown `key` (and the given option / field ids). */
    const pruneCategoryOps = (key: string, ids: string[]) =>
        prune(
            (op) =>
                (op.kind === 'createCategory' && op.key === key) ||
                ((op.kind === 'addOption' || op.kind === 'reorderOptions' || op.kind === 'updateCategory') && op.categoryKey === key) ||
                ids.some((id) => opRefersTo(op, id)),
            ids,
        );

    /**
     * A dropdown created inline by a draft field (its `newOptions`) is named after that field and can't be edited on
     * its own. Editing it turns it into a createCategory op of its own, staged just before the field, which then
     * links to it; option ids are kept, so staged option edits still apply.
     */
    const promoteInlineCategory = (key: string) => {
        const ops = opsRef.current;
        const at = ops.findIndex((op) => op.kind === 'createField' && op.categoryKey === key);
        const fieldOp = ops[at];
        if (fieldOp?.kind !== 'createField') return;
        const { newOptions, ...fieldPayload } = fieldOp.payload;
        const category: DraftOp = {
            kind: 'createCategory',
            key,
            optionIds: fieldOp.optionIds ?? [],
            payload: {
                label: fieldPayload.label,
                module: fieldPayload.module,
                description: `Options for the custom field "${fieldPayload.label}".`,
                options: newOptions ?? [],
            },
            summary: `New dropdown '${fieldPayload.label}'`,
        };
        const field: DraftOp = { ...fieldOp, categoryKey: undefined, optionIds: undefined, payload: { ...fieldPayload, dropdownCategoryKey: key } };
        commit([...ops.slice(0, at), category, field, ...ops.slice(at + 1)]);
    };

    /** Stages a dropdown edit: folded into its createCategory op when the dropdown is new in this draft. */
    const stageCategoryUpdate = (key: string, payload: UpdateCategoryPayload) => {
        const category = findCategoryByKey(current(), key) ?? fail('Dropdown not found.');
        promoteInlineCategory(key);
        const ops = opsRef.current;
        const createdAt = ops.findIndex((op) => op.kind === 'createCategory' && op.key === key);
        const created = ops[createdAt];
        if (created?.kind === 'createCategory') {
            const p = created.payload;
            const merged = {
                ...p,
                ...(payload.label !== undefined ? { label: payload.label } : {}),
                ...(payload.description !== undefined ? { description: payload.description ?? undefined } : {}),
                ...(payload.module !== undefined ? { module: payload.module } : {}),
            };
            commit(ops.map((op, i) => (i === createdAt ? { ...created, payload: merged, summary: `New dropdown '${merged.label}'` } : op)));
            return;
        }
        const last = ops.at(-1);
        if (last?.kind === 'updateCategory' && last.categoryKey === key) {
            commit([...ops.slice(0, -1), { ...last, payload: { ...last.payload, ...payload } }]);
            return;
        }
        push({ kind: 'updateCategory', categoryKey: key, payload, summary: `${category.label}: dropdown updated` });
    };

    /**
     * Drops a field created in this draft. The API's rule for its dropdown applies to a dropdown also new in this
     * draft: unused afterwards → not created at all; still used only by other modules → handed over to them.
     * Otherwise a dropdown the field created inline (from `newOptions`) is kept as a new dropdown of its own.
     * A saved dropdown is left alone: the field never reached the API, so nothing about it changes there.
     */
    const dropTempField = (id: string) => {
        const s = current();
        const field = findFieldById(s, id);
        const key = field?.dropdownCategoryKey ?? null;
        const category = key ? findCategoryByKey(s, key) : undefined;
        const draftCategory = Boolean(category && isTempId(category.id));
        const next = field && draftCategory ? categoryAfterFieldRemoval(s, field) : { action: 'none' as const };

        if (next.action !== 'delete') {
            commit(
                opsRef.current.map((op): DraftOp => {
                    if (op.kind !== 'createField' || op.id !== id || !op.categoryKey) return op;
                    const p = op.payload;
                    return {
                        kind: 'createCategory',
                        key: op.categoryKey,
                        optionIds: op.optionIds ?? [],
                        payload: { label: p.label, module: p.module, description: `Options for the custom field "${p.label}".`, options: p.newOptions ?? [] },
                        summary: `New dropdown '${p.label}'`,
                    };
                }),
            );
        }
        dropTemp(id);
        if (next.action === 'delete' && category) pruneCategoryOps(next.key, category.options.map((o) => o.id));
        if (next.action === 'move') stageCategoryUpdate(next.key, { module: next.module });
    };

    /**
     * Folds edits of an option created in this draft into the op creating it: its addOption op, or the option list
     * of a dropdown new in this draft (createCategory / a field's inline `newOptions`). An option's name is its
     * value, so a rename renames both, and staged field defaults using the old value follow it. Returns what can't be
     * folded (the default flag, or meta for an inline option), or null when nothing is left.
     */
    const foldIntoDraftOption = (category: DropdownCategoryDto, option: DropdownOptionDto, payload: UpdateOptionPayload): UpdateOptionPayload | null => {
        const s = current();
        // The default flag can't be sent when creating an option: it stays an update, saved right after it.
        const { isDefault, ...edit } = payload;
        const value = edit.label ?? option.value;
        const renamed = value !== option.value;
        const viaAddOption = opsRef.current.some((op) => op.kind === 'addOption' && op.id === option.id);
        const leftover: UpdateOptionPayload = {
            ...(isDefault !== undefined ? { isDefault } : {}),
            ...(!viaAddOption && edit.meta !== undefined ? { meta: edit.meta } : {}),
        };
        const renameDefault = <T extends string | null | undefined>(defaultValue: T, fieldType: string | undefined, key: string | null | undefined) =>
            renamed && key === category.key ? renameDefaultValue(defaultValue, fieldType, option.value, value) : defaultValue;

        commit(
            opsRef.current.map((op): DraftOp => {
                switch (op.kind) {
                    case 'addOption': {
                        if (op.id !== option.id) return op;
                        const p = { ...op.payload, value, ...(edit.meta !== undefined ? { meta: edit.meta } : {}) };
                        return { ...op, payload: p, summary: `${category.label}: added '${p.value}'` };
                    }
                    case 'createCategory':
                        return renamed ? withRenamedDraftOption(op, option.id, value) : op;
                    case 'createField': {
                        const next = renamed ? withRenamedDraftOption(op, option.id, value) : op;
                        if (next.kind !== 'createField' || next.payload.defaultValue === undefined) return next;
                        const key = next.payload.dropdownCategoryKey ?? next.categoryKey;
                        return { ...next, payload: { ...next.payload, defaultValue: renameDefault(next.payload.defaultValue, next.payload.fieldType, key) } };
                    }
                    case 'updateField': {
                        if (typeof op.payload.defaultValue !== 'string') return op;
                        const field = findFieldById(s, op.fieldId);
                        const key = op.payload.dropdownCategoryKey !== undefined ? op.payload.dropdownCategoryKey : field?.dropdownCategoryKey;
                        const defaultValue = renameDefault(op.payload.defaultValue, op.payload.fieldType ?? field?.fieldType, key);
                        return defaultValue === op.payload.defaultValue ? op : { ...op, payload: { ...op.payload, defaultValue } };
                    }
                    default:
                        return op;
                }
            }),
        );
        return Object.keys(leftover).length > 0 ? leftover : null;
    };

    /**
     * Folds edits of a field created in this draft into its createField op, so it is saved once, already edited.
     * Placement (tab / section) stays a separate updateField op so it still lands after any reorder staged in
     * between, as does re-linking a field that created its dropdown inline. Returns what is left to stage, or null.
     */
    const foldIntoDraftField = (fieldId: string, payload: UpdateFieldPayload): UpdateFieldPayload | null => {
        const ops = opsRef.current;
        const at = ops.findIndex((op) => op.kind === 'createField' && op.id === fieldId);
        const created = ops[at];
        if (created?.kind !== 'createField') return payload;

        const leftover: UpdateFieldPayload = {};
        for (const key of PLACEMENT_KEYS) if (payload[key] !== undefined) leftover[key] = payload[key];
        if (payload.dropdownCategoryKey !== undefined && created.categoryKey) leftover.dropdownCategoryKey = payload.dropdownCategoryKey;

        const next: CreateFieldPayload = { ...created.payload };
        // The key follows the label (the API derives it the same way when the field is saved).
        let fieldKey = created.fieldKey;
        if (payload.label !== undefined && payload.label !== created.payload.label) {
            fieldKey = fieldKeyFor(current(), created.payload.module, payload.label, fieldId);
        }
        if (payload.label !== undefined) next.label = payload.label;
        if (payload.fieldType !== undefined) next.fieldType = payload.fieldType;
        if (payload.fieldSize !== undefined) next.fieldSize = payload.fieldSize;
        if (payload.isRequired !== undefined) next.isRequired = payload.isRequired;
        if (payload.isVisibleInForm !== undefined) next.isVisibleInForm = payload.isVisibleInForm;
        if (payload.isVisibleInDrawer !== undefined) next.isVisibleInDrawer = payload.isVisibleInDrawer;
        // Cleared (null) on an update = never set on a create.
        if (payload.placeholder !== undefined) next.placeholder = payload.placeholder ?? undefined;
        if (payload.hint !== undefined) next.hint = payload.hint ?? undefined;
        if (payload.defaultValue !== undefined) next.defaultValue = payload.defaultValue ?? undefined;
        if (payload.dropdownCategoryKey !== undefined && !created.categoryKey) next.dropdownCategoryKey = payload.dropdownCategoryKey ?? undefined;

        commit(ops.map((op, i) => (i === at ? { ...created, fieldKey, payload: next, summary: `${moduleLabel(next.module)}: new field '${next.label}'` } : op)));
        return Object.keys(leftover).length > 0 ? leftover : null;
    };

    const actions = useMemo<ConfigDraftActions>(
        () => ({
            createCategory(payload) {
                const key = dropdownKeyFor(current(), payload.label);
                const options = [...new Set(payload.options ?? [])];
                push({
                    kind: 'createCategory',
                    key,
                    optionIds: options.map(() => newTempId('opt')),
                    payload: { ...payload, options },
                    summary: `New dropdown '${payload.label}'`,
                });
                return { key, label: payload.label };
            },

            addOption(categoryKey, payload) {
                const s = current();
                const category = findCategoryByKey(s, categoryKey) ?? fail('Dropdown not found.');
                const existing = category.options.find((o) => o.value.toLowerCase() === payload.value.toLowerCase());
                if (existing) fail(`'${payload.value}' is already in ${category.label}.`);
                push({ kind: 'addOption', id: newTempId('opt'), categoryKey, payload, summary: `${category.label}: added '${payload.value}'` });
            },

            updateOption(optionId, input) {
                const s = current();
                const { category, option } = findOptionById(s, optionId) ?? fail('Option not found.');
                let payload: UpdateOptionPayload = input.label !== undefined ? { ...input, label: input.label.trim() } : input;
                if (option.isSystem && payload.label !== undefined && payload.label !== option.label) fail(`'${option.label}' drives CRM logic and cannot be renamed.`);
                if (payload.label !== undefined) {
                    // An option's name is also its stored value: unique per dropdown, ignoring case (as the API checks).
                    const name = payload.label;
                    if (!name) fail('Option name is required.');
                    const duplicate = category.options.find((o) => o.id !== optionId && o.value.toLowerCase() === name.toLowerCase());
                    if (duplicate) fail(`'${name}' is already in ${category.label}.`);
                }
                // An option new in this draft: its edits go into the op creating it, so it is saved once, already renamed.
                if (isTempId(optionId)) {
                    const leftover = foldIntoDraftOption(category, option, payload);
                    if (!leftover) return;
                    payload = leftover;
                }
                const last = opsRef.current.at(-1);
                if (last?.kind === 'updateOption' && last.optionId === optionId) {
                    commit([...opsRef.current.slice(0, -1), { ...last, payload: { ...last.payload, ...payload } }]);
                    return;
                }
                const renamedTo = payload.label;
                const meta = payload.meta ?? undefined;
                const what =
                    renamedTo !== undefined && renamedTo !== option.label
                        ? `renamed '${option.label}' to '${renamedTo}'`
                        : payload.isDefault !== undefined
                          ? `${payload.isDefault ? 'set' : 'removed'} '${option.label}' as default`
                          : meta && 'ratingRule' in meta && JSON.stringify(meta.ratingRule) !== JSON.stringify(option.meta?.ratingRule)
                            ? `Rating rule of '${option.label}'`
                            : meta && 'closesLead' in meta && meta.closesLead !== option.meta?.closesLead
                              ? `'${option.label}' ${meta.closesLead ? 'closes' : 'no longer closes'} the lead`
                              : `updated '${option.label}'`;
                push({ kind: 'updateOption', optionId, payload, summary: `${category.label}: ${what}` });
            },

            reorderOptions(categoryKey, optionIds) {
                const category = findCategoryByKey(current(), categoryKey) ?? fail('Dropdown not found.');
                const rest = opsRef.current.filter((op) => !(op.kind === 'reorderOptions' && op.categoryKey === categoryKey));
                commit([...rest, { kind: 'reorderOptions', categoryKey, optionIds, summary: `${category.label}: reordered options` }]);
            },

            createField(payload) {
                const s = current();
                // The key the API derives from the label (the draft refers to the field by it until saved).
                const fieldKey = fieldKeyFor(s, payload.module, payload.label);
                const newOptions = payload.dropdownCategoryKey ? [] : [...new Set(payload.newOptions ?? [])];
                // A dropdown created with the field takes the field's name.
                const categoryKey = newOptions.length ? dropdownKeyFor(s, payload.label) : undefined;
                const id = newTempId('field');
                // Custom tabs are stored through their fields: each one carries the tab's name.
                const tabLabel = payload.tabLabel ?? tabLabelOf(s, payload.module, payload.tabKey);
                push({
                    kind: 'createField',
                    id,
                    fieldKey,
                    categoryKey,
                    optionIds: categoryKey ? newOptions.map(() => newTempId('opt')) : undefined,
                    payload: { ...payload, ...(tabLabel ? { tabLabel } : {}), newOptions: newOptions.length ? newOptions : undefined },
                    summary: `${moduleLabel(payload.module)}: new field '${payload.label}'`,
                });
                return { id, label: payload.label };
            },

            updateField(fieldId, input) {
                const s = current();
                const field = findFieldById(s, fieldId) ?? fail('Field not found.');
                // A field moved to another tab carries that tab's name (custom tabs are stored through their fields).
                const movedTab = input.tabKey !== undefined && input.tabKey !== field.tabKey;
                const tabLabel = movedTab && input.tabLabel === undefined ? tabLabelOf(s, field.module, input.tabKey!) : undefined;
                let payload = tabLabel ? { ...input, tabLabel } : input;
                if (field.isCoreLocked && payload.isRequired === false) fail(`${field.label} is a core field and must stay required.`);
                if (field.isCoreLocked && payload.isVisibleInForm === false) fail(`${field.label} is a core field and cannot be hidden.`);
                // A renamed builder-added field takes a key from its new label: refused when another field has it.
                if (!field.isSystem && payload.label !== undefined && payload.label !== field.label) {
                    fieldKeyFor(s, field.module, payload.label, field.id);
                }
                if (payload.fieldType !== undefined && payload.fieldType !== field.fieldType) {
                    if (field.isSystem) fail(`${field.label} is a built-in field; its type can't be changed.`);
                    if (field.fieldType !== 'select' && field.fieldType !== 'multiselect') fail('Only select / multi-select fields can switch between the two.');
                }
                if (field.isSystem && payload.dropdownCategoryKey !== undefined && payload.dropdownCategoryKey !== field.dropdownCategoryKey) {
                    fail(`${field.label} is a built-in field; its dropdown list can't be changed. Edit the list's options instead.`);
                }
                // A field new in this draft: its edits go into the op creating it.
                if (isTempId(fieldId)) {
                    const leftover = foldIntoDraftField(fieldId, payload);
                    if (!leftover) return;
                    payload = leftover;
                }
                const last = opsRef.current.at(-1);
                if (last?.kind === 'updateField' && last.fieldId === fieldId) {
                    commit([...opsRef.current.slice(0, -1), { ...last, payload: { ...last.payload, ...payload } }]);
                    return;
                }
                push({ kind: 'updateField', fieldId, payload, summary: `${moduleLabel(field.module)}: updated '${field.label}'` });
            },

            reorderFields(module, fieldIds) {
                const rest = opsRef.current.filter((op) => !(op.kind === 'reorderFields' && op.module === module));
                commit([...rest, { kind: 'reorderFields', module, fieldIds, summary: `${moduleLabel(module)}: reordered fields` }]);
            },

            renameSection(module, sectionKey, sectionLabel) {
                const s = current();
                if (!(s.fieldsByModule[module] ?? []).some((f) => f.sectionKey === sectionKey)) fail('Section not found.');
                const rest = opsRef.current.filter((op) => !(op.kind === 'renameSection' && op.module === module && op.sectionKey === sectionKey));
                commit([...rest, { kind: 'renameSection', module, sectionKey, sectionLabel, summary: `${moduleLabel(module)}: section renamed to '${sectionLabel}'` }]);
            },

            createTab(module, label) {
                const name = label.trim();
                if (!name) fail('Enter a name for the new tab.');
                const s = current();
                const tabs = s.moduleTabs[module] ?? [];
                if (tabs.some((t) => t.label.trim().toLowerCase() === name.toLowerCase())) fail(`The ${moduleLabel(module)} form already has a tab named '${name}'.`);
                const key = uniqueKey(tabKeyFromLabel(name), (k) => tabs.some((t) => t.key === k), 40);
                push({ kind: 'createTab', module, tabKey: key, label: name, summary: `${moduleLabel(module)}: new tab '${name}'` });
                return { key, label: name };
            },

            updateCategory(categoryKey, payload) {
                const s = current();
                const category = findCategoryByKey(s, categoryKey) ?? fail('Dropdown not found.');
                if (payload.label !== undefined && !payload.label.trim()) fail('Dropdown name is required.');
                // A renamed builder-added dropdown takes a key from its new name: refused when another dropdown has it.
                if (payload.label !== undefined && !category.isSystem) dropdownKeyFor(s, payload.label, categoryKey);
                stageCategoryUpdate(categoryKey, payload);
            },

            deleteCategory(categoryKey) {
                const s = current();
                const category = findCategoryByKey(s, categoryKey) ?? fail('Dropdown not found.');
                const lockReason = categoryLockReason(s, category);
                if (lockReason) fail(`'${category.label}' can't be deleted: ${lockReason}`);
                // Built-in fields using it are unlinked and hidden (applyOp / the API); custom ones go with it.
                const linked = allFields(s).filter((f) => f.dropdownCategoryKey === categoryKey && !f.isSystem);
                const createdInDraft = isTempId(category.id);
                const tempFieldIds = linked.filter((f) => isTempId(f.id)).map((f) => f.id);
                const savedFieldIds = linked.filter((f) => !isTempId(f.id)).map((f) => f.id);
                const strip = [...category.options.map((o) => o.id), ...tempFieldIds, ...(createdInDraft ? savedFieldIds : [])];
                pruneCategoryOps(categoryKey, strip);
                if (!createdInDraft) {
                    push({ kind: 'deleteCategory', categoryKey, summary: `Deleted dropdown '${category.label}'` });
                    return;
                }
                // A draft dropdown never reaches the API: built-in fields re-linked to it go back to their own dropdown.
                commit(
                    opsRef.current.flatMap((op): DraftOp[] => {
                        if (op.kind !== 'updateField' || op.payload.dropdownCategoryKey !== categoryKey) return [op];
                        const rest = { ...op.payload };
                        delete rest.dropdownCategoryKey;
                        return Object.keys(rest).length > 0 ? [{ ...op, payload: rest }] : [];
                    }),
                );
                // A draft dropdown never reaches the API; saved custom fields that were linked to it still go.
                for (const field of linked.filter((f) => savedFieldIds.includes(f.id))) {
                    push({ kind: 'deleteField', fieldId: field.id, summary: `${moduleLabel(field.module)}: deleted field '${field.label}'` });
                }
            },

            deleteOption(optionId) {
                const { category, option } = findOptionById(current(), optionId) ?? fail('Option not found.');
                if (option.isSystem) fail('System-protected options cannot be deleted.');
                if (isTempId(optionId)) {
                    const inlineOwner = opsRef.current.find((op) => op.kind === 'createField' && op.optionIds?.includes(optionId));
                    if (inlineOwner?.kind === 'createField' && (inlineOwner.optionIds?.length ?? 0) <= 1) {
                        fail(`The new field '${inlineOwner.payload.label}' needs at least one option in its dropdown.`);
                    }
                    commit(opsRef.current.map((op) => withoutDraftOption(op, optionId)));
                    dropTemp(optionId);
                    return;
                }
                dropTemp(optionId); // earlier edits of the option are moot
                push({ kind: 'deleteOption', optionId, summary: `${category.label}: deleted '${option.label}'` });
            },

            deleteField(fieldId) {
                const field = findFieldById(current(), fieldId) ?? fail('Field not found.');
                if (field.isCoreLocked) fail(`${field.label} is a core field and cannot be deleted.`);
                if (isTempId(fieldId)) {
                    dropTempField(fieldId);
                    return;
                }
                dropTemp(fieldId); // earlier edits of the field are moot
                push({ kind: 'deleteField', fieldId, summary: `${moduleLabel(field.module)}: deleted field '${field.label}'` });
            },

            deleteSection(module, tabKey, sectionKey) {
                const fields = liveFieldsOn(current(), module, tabKey).filter((f) => f.sectionKey === sectionKey);
                if (fields.length === 0) fail('Section not found.');
                const locked = fields.filter((f) => f.isCoreLocked);
                if (locked.length > 0) fail(`The section holds core field(s) that cannot be deleted: ${locked.map((f) => f.label).join(', ')}.`);
                for (const field of fields) actions.deleteField(field.id);
            },

            deleteTab(module, tabKey) {
                const s = current();
                const tabs = s.moduleTabs[module] ?? [];
                const tab = tabs.find((t) => t.key === tabKey) ?? fail('Tab not found.');
                if (tabs.length <= 1) fail(`The ${moduleLabel(module)} form needs at least one tab.`);
                const fields = liveFieldsOn(s, module, tabKey);
                const locked = fields.filter((f) => f.isCoreLocked);
                if (locked.length > 0) fail(`'${tab.label}' holds core field(s) that cannot be deleted: ${locked.map((f) => f.label).join(', ')}.`);
                // A tab added in this draft is simply not created.
                prune((op) => op.kind === 'createTab' && op.module === module && op.tabKey === tabKey, []);
                // Drafted fields are dropped, saved custom fields deleted, built-in ones tombstoned.
                for (const field of fields) actions.deleteField(field.id);
                if (current().moduleTabs[module]?.some((t) => t.key === tabKey)) {
                    push({ kind: 'deleteTab', module, tabKey, label: tab.label, summary: `${moduleLabel(module)}: deleted tab '${tab.label}'` });
                }
                return fields.length;
            },

            setModuleSetting(module, key, value, summary) {
                const others = opsRef.current.filter((op) => !(op.kind === 'setModuleSetting' && op.module === module && op.key === key));
                // Back to the saved value: nothing left to save for it.
                const saved = baseRef.current?.moduleSettings?.[module]?.[key];
                if (JSON.stringify(saved ?? null) === JSON.stringify(value)) {
                    commit(others);
                    return;
                }
                commit([...others, { kind: 'setModuleSetting', module, key, value, summary: `${moduleLabel(module)}: ${summary}` }]);
            },
        }),
        // eslint-disable-next-line react-hooks/exhaustive-deps -- the actions read the latest state through refs
        [],
    );

    const discard = useCallback(() => commit([]), []);

    const save = useCallback(async (): Promise<number> => {
        const pending = opsRef.current;
        if (pending.length === 0 || !baseRef.current) return 0;
        setSaving(true);
        setFrozenBase(baseRef.current);

        let result: ReplayResult | undefined;
        try {
            result = await replayOps(pending, formConfigService);
            if (result.error) {
                const message = result.error instanceof Error ? result.error.message : 'Save failed';
                throw new SaveError(`${pending[result.saved]?.summary ?? 'A change'} couldn't be saved: ${message}`, result.saved);
            }
            return result.saved;
        } finally {
            // Renaming a custom field or an option moves record values and saved filters on the server (the stored
            // key / value follows the name): reload every cached copy.
            const renamedKey = pending
                .slice(0, result?.saved ?? 0)
                .some((op) => (op.kind === 'updateField' || op.kind === 'updateOption') && op.payload.label !== undefined);
            if (renamedKey) void queryClient.invalidateQueries();
            // Whatever was saved is now part of `base`; anything left (after a failure) stays staged on top of it.
            await refetch().catch(() => undefined);
            commit(result?.remaining ?? pending);
            setFrozenBase(null);
            setSaving(false);
        }
    }, [refetch, queryClient]);

    return { draft, ops, dirty: ops.length > 0, saving, actions, save, discard };
}

/** A save that stopped part-way: `saved` changes went through, the rest are still staged. */
export class SaveError extends Error {
    constructor(
        message: string,
        readonly saved: number,
    ) {
        super(message);
        this.name = 'SaveError';
    }
}

// ── Context ──────────────────────────────────────────────────────────────────

export const ConfigDraftActionsContext = createContext<ConfigDraftActions | null>(null);

export function useConfigDraftActions(): ConfigDraftActions {
    const actions = useContext(ConfigDraftActionsContext);
    if (!actions) throw new Error('useConfigDraftActions must be used inside the form customization builder');
    return actions;
}

/** Ids of fields and options with unsaved changes (provided by the builder). */
export const ConfigDraftChangesContext = createContext<Set<string>>(new Set());

export const useHasUnsavedChanges = (id: string) => useContext(ConfigDraftChangesContext).has(id);

/** Ids of fields and options changed (or created) in the draft, for "unsaved" markers. */
export function changedIds(ops: DraftOp[]): Set<string> {
    const set = new Set<string>();
    for (const op of ops) {
        if (op.kind === 'addOption' || op.kind === 'createField') set.add(op.id);
        if (op.kind === 'updateOption') set.add(op.optionId);
        if (op.kind === 'updateField') set.add(op.fieldId);
        if (op.kind === 'createCategory') op.optionIds.forEach((id) => set.add(id));
    }
    return set;
}

