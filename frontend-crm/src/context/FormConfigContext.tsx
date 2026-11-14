'use client';

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useFormConfigs, resolveConfiguredFieldProps, type ConfiguredFieldDefaults, type ConfiguredFieldProps } from '@/hooks/queries/useFormConfigs';
import { sectionKeyFromLabel, type CrmModuleKey, type FormConfigsPayload, type FormFieldDefinitionDto } from '@/types/formConfig.types';
import { allModuleFieldsIncludingDeleted, moduleFields } from '@/utils/formConfig';
import { useCodedDefaultsRecorder } from './CodedFieldDefaultsContext';

/**
 * Applies admin form customizations to the hand-built module forms without rewriting them: a form wraps its
 * fields in `<FormConfigProvider module="leads">`, and the shared primitives (FormField, StyledSelect,
 * RhfChipGroup, RhfTextField, SectionLabel) look up the built-in field matching their `name` and apply its
 * label / required / hint / placeholder / size / visibility / dropdown options. Outside a provider (or for
 * names with no definition) everything renders exactly as coded.
 */

interface FormConfigContextValue {
    module: CrmModuleKey;
    configs: FormConfigsPayload | null;
    /** Built-in field definitions by RHF name. */
    systemFields: Map<string, FormFieldDefinitionDto>;
    /** Current section label by section key (built-in sections). */
    sectionLabels: Map<string, string>;
    /**
     * Built-in sections an admin deleted: at least one of the built-in fields the form places there was deleted, the
     * rest are deleted or hidden, and no visible field (built-in or custom) is left in the section. Their hand-built
     * heading and grids render nothing.
     */
    deletedSectionKeys: Set<string>;
    /** Custom fields of the module (archived included), in admin order. */
    customFields: FormFieldDefinitionDto[];
    /** Grids showing each section (`tabKey::sectionKey`), in mount order: the first one also shows its custom fields. */
    sectionClaims: Record<string, string[]>;
    /** Registers a grid as showing a section; returns the release function. */
    claimSection: (sectionId: string, gridId: string) => () => void;
    /** Elements of built-in fields an admin moved to another section, handed from their home grid to the new one. */
    movedFields: MovedFieldStore;
}

/** `tabKey::sectionKey` of a field's section. */
export const sectionIdOf = (field: Pick<FormFieldDefinitionDto, 'tabKey' | 'sectionKey'>) => `${field.tabKey}::${field.sectionKey}`;

/** Section the hand-built form renders a field in: a built-in field's default tab + section, else its configured ones. */
export const homeSectionIdOf = (field: Pick<FormFieldDefinitionDto, 'tabKey' | 'sectionKey' | 'defaultSectionKey' | 'defaultTabKey'>) =>
    `${field.defaultTabKey ?? field.tabKey}::${field.defaultSectionKey ?? field.sectionKey}`;

/** Claim id of a DynamicModuleCustomFields block: it renders a tab's sections that no grid shows. */
export const dynamicHostIdOf = (tabKey: string) => `dyn::${tabKey}`;

/** A built-in field the admin moved to another tab than the one the form's JSX places it on. */
export const isMovedAcrossTabs = (field: FormFieldDefinitionDto) =>
    field.isSystem && Boolean(field.defaultTabKey) && field.defaultTabKey !== field.tabKey;

/** A built-in field the admin dragged out of the section (or tab) the form's JSX places it in. */
export const isMovedBuiltIn = (field: FormFieldDefinitionDto) =>
    field.isSystem &&
    !field.isDeleted &&
    ((Boolean(field.defaultSectionKey) && field.defaultSectionKey !== field.sectionKey) || isMovedAcrossTabs(field));

/** Whether something on the mounted form can show a field's (new) section: its grid, or the tab's custom-field block. */
export const hasHostFor = (claims: Record<string, string[]>, field: FormFieldDefinitionDto) =>
    Boolean(claims[sectionIdOf(field)]?.length || claims[dynamicHostIdOf(field.tabKey)]?.length);

/**
 * Hand-off of moved built-in fields between grids. The grid whose JSX holds the field publishes the element (each
 * render, after commit); the grid (or custom-field block) showing the field's new section renders it there. It is
 * a tiny external store so publishing never re-renders the form itself, only the receivers (and only on change).
 */
export interface MovedFieldStore {
    publish(fieldKey: string, node: React.ReactNode): void;
    unpublish(fieldKey: string, node: React.ReactNode): void;
    get(fieldKey: string): React.ReactNode | undefined;
    subscribe(listener: () => void): () => void;
    getVersion(): number;
}

function createMovedFieldStore(): MovedFieldStore {
    const nodes = new Map<string, React.ReactNode>();
    const listeners = new Set<() => void>();
    let version = 0;
    const emit = () => {
        version++;
        listeners.forEach((l) => l());
    };
    return {
        publish(fieldKey, node) {
            if (nodes.get(fieldKey) === node) return;
            nodes.set(fieldKey, node);
            emit();
        },
        unpublish(fieldKey, node) {
            if (nodes.get(fieldKey) !== node) return;
            nodes.delete(fieldKey);
            emit();
        },
        get: (fieldKey) => nodes.get(fieldKey),
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        getVersion: () => version,
    };
}

/** A field that shows nothing on the form (deleted, archived or hidden). */
export const isHiddenField = (field: FormFieldDefinitionDto) => Boolean(field.isDeleted) || !field.isActive || !field.isVisibleInForm;

/** See FormConfigContextValue.deletedSectionKeys. */
function deletedSections(systemFields: FormFieldDefinitionDto[], live: FormFieldDefinitionDto[]): Set<string> {
    const shown = new Set(live.filter((f) => !isHiddenField(f)).map((f) => f.sectionKey));
    const byHome = new Map<string, FormFieldDefinitionDto[]>();
    for (const field of systemFields) {
        const home = field.defaultSectionKey ?? field.sectionKey;
        byHome.set(home, [...(byHome.get(home) ?? []), field]);
    }
    const deleted = new Set<string>();
    for (const [sectionKey, fields] of byHome) {
        if (shown.has(sectionKey)) continue;
        if (fields.some((f) => f.isDeleted) && fields.every(isHiddenField)) deleted.add(sectionKey);
    }
    return deleted;
}

const FormConfigContext = createContext<FormConfigContextValue | null>(null);

export function FormConfigProvider({ module, children }: { module: CrmModuleKey; children: React.ReactNode }) {
    const configs = useFormConfigs();
    const [movedFields] = useState(createMovedFieldStore);
    const [sectionClaims, setSectionClaims] = useState<Record<string, string[]>>({});
    const claimSection = useCallback((sectionId: string, gridId: string) => {
        setSectionClaims((c) => (c[sectionId]?.includes(gridId) ? c : { ...c, [sectionId]: [...(c[sectionId] ?? []), gridId] }));
        return () => setSectionClaims((c) => ({ ...c, [sectionId]: (c[sectionId] ?? []).filter((id) => id !== gridId) }));
    }, []);
    const value = useMemo<FormConfigContextValue>(() => {
        const live = moduleFields(configs, module);
        // Deleted built-in fields stay in systemFields so their hand-built inputs resolve to hidden (useFieldOverride).
        const systemFields = allModuleFieldsIncludingDeleted(configs, module).filter((f) => f.isSystem);
        return {
            module,
            configs,
            systemFields: new Map(systemFields.map((f) => [f.fieldKey, f])),
            sectionLabels: new Map(live.filter((f) => f.isSystem).map((f) => [f.sectionKey, f.sectionLabel])),
            deletedSectionKeys: deletedSections(systemFields, live),
            customFields: live.filter((f) => !f.isSystem),
            sectionClaims,
            claimSection,
            movedFields,
        };
    }, [configs, module, sectionClaims, claimSection, movedFields]);
    return <FormConfigContext.Provider value={value}>{children}</FormConfigContext.Provider>;
}

/** The whole form configuration context (null outside a FormConfigProvider). */
export function useFormConfigContext(): FormConfigContextValue | null {
    return useContext(FormConfigContext);
}

/** The module whose configuration applies here, if any. */
export function useFormConfigModule(): CrmModuleKey | undefined {
    return useContext(FormConfigContext)?.module;
}

/**
 * Admin overrides for the built-in field bound to `name` (undefined outside a provider or with no definition,
 * so callers keep their own props).
 */
export function useFieldOverride(name: string | undefined, defaults: ConfiguredFieldDefaults): ConfiguredFieldProps | undefined {
    const ctx = useContext(FormConfigContext);
    const recorder = useCodedDefaultsRecorder();
    if (recorder) {
        // Form builder harvest: report the coded texts and render the form exactly as coded.
        if (name) {
            recorder.record(name, {
                placeholder: defaults.placeholder || undefined,
                hint: typeof defaults.hint === 'string' && defaults.hint ? defaults.hint : undefined,
            });
        }
        return undefined;
    }
    if (!ctx || !name) return undefined;
    const field = ctx.systemFields.get(name);
    if (!field) return undefined;
    return resolveConfiguredFieldProps(ctx.configs, field, defaults);
}

/**
 * The placeholder to show for the built-in field bound to `name`: the admin's override, else the coded one.
 * For controls whose placeholder isn't otherwise run through {@link useFieldOverride} (phone, lookup, address…).
 */
export function useConfiguredPlaceholder(name: string | undefined, coded: string | undefined): string | undefined {
    const override = useFieldOverride(name, { label: '', placeholder: coded });
    return override ? override.placeholder : coded;
}

/** Admin-renamed label of a built-in section, matched by the slug of the label the form hard-codes. */
export function useSectionLabelOverride(label: string): string {
    const ctx = useContext(FormConfigContext);
    return ctx?.sectionLabels.get(sectionKeyFromLabel(label)) ?? label;
}

/** Whether an admin deleted the built-in section the form hard-codes as `label` (false outside a provider). */
export function useIsSectionDeleted(label: string): boolean {
    const ctx = useContext(FormConfigContext);
    return Boolean(ctx?.deletedSectionKeys.has(sectionKeyFromLabel(label)));
}

// ── Current field name (lets StyledSelect find its field without a `name` prop) ──

const FieldNameContext = createContext<string | undefined>(undefined);

export function FieldNameProvider({ name, children }: { name?: string; children: React.ReactNode }) {
    return <FieldNameContext.Provider value={name}>{children}</FieldNameContext.Provider>;
}

export function useCurrentFieldName(): string | undefined {
    return useContext(FieldNameContext);
}
