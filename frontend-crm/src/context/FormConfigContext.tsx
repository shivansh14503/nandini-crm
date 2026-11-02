'use client';

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useFormConfigs, resolveConfiguredFieldProps, type ConfiguredFieldDefaults, type ConfiguredFieldProps } from '@/hooks/queries/useFormConfigs';
import { sectionKeyFromLabel, type CrmModuleKey, type FormConfigsPayload, type FormFieldDefinitionDto } from '@/types/formConfig.types';
import { moduleFields } from '@/utils/formConfig';

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
    /** Custom fields of the module (archived included), in admin order. */
    customFields: FormFieldDefinitionDto[];
    /** Grids showing each section (`tabKey::sectionKey`), in mount order: the first one also shows its custom fields. */
    sectionClaims: Record<string, string[]>;
    /** Registers a grid as showing a section; returns the release function. */
    claimSection: (sectionId: string, gridId: string) => () => void;
}

/** `tabKey::sectionKey` of a field's section. */
export const sectionIdOf = (field: Pick<FormFieldDefinitionDto, 'tabKey' | 'sectionKey'>) => `${field.tabKey}::${field.sectionKey}`;

const FormConfigContext = createContext<FormConfigContextValue | null>(null);

export function FormConfigProvider({ module, children }: { module: CrmModuleKey; children: React.ReactNode }) {
    const configs = useFormConfigs();
    const [sectionClaims, setSectionClaims] = useState<Record<string, string[]>>({});
    const claimSection = useCallback((sectionId: string, gridId: string) => {
        setSectionClaims((c) => (c[sectionId]?.includes(gridId) ? c : { ...c, [sectionId]: [...(c[sectionId] ?? []), gridId] }));
        return () => setSectionClaims((c) => ({ ...c, [sectionId]: (c[sectionId] ?? []).filter((id) => id !== gridId) }));
    }, []);
    const value = useMemo<FormConfigContextValue>(() => {
        const all = moduleFields(configs, module);
        const fields = all.filter((f) => f.isSystem);
        return {
            module,
            configs,
            systemFields: new Map(fields.map((f) => [f.fieldKey, f])),
            sectionLabels: new Map(fields.map((f) => [f.sectionKey, f.sectionLabel])),
            customFields: all.filter((f) => !f.isSystem),
            sectionClaims,
            claimSection,
        };
    }, [configs, module, sectionClaims, claimSection]);
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
    if (!ctx || !name) return undefined;
    const field = ctx.systemFields.get(name);
    if (!field) return undefined;
    return resolveConfiguredFieldProps(ctx.configs, field, defaults);
}

/** Admin-renamed label of a built-in section, matched by the slug of the label the form hard-codes. */
export function useSectionLabelOverride(label: string): string {
    const ctx = useContext(FormConfigContext);
    return ctx?.sectionLabels.get(sectionKeyFromLabel(label)) ?? label;
}

// ── Current field name (lets StyledSelect find its field without a `name` prop) ──

const FieldNameContext = createContext<string | undefined>(undefined);

export function FieldNameProvider({ name, children }: { name?: string; children: React.ReactNode }) {
    return <FieldNameContext.Provider value={name}>{children}</FieldNameContext.Provider>;
}

export function useCurrentFieldName(): string | undefined {
    return useContext(FieldNameContext);
}
