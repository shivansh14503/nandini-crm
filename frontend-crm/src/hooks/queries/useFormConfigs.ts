import { createContext, useCallback, useContext, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formConfigService } from '@/services/formConfig.service';
import { getFormConfigs } from '@/services/masterData.store';
import type { CrmModuleKey, FieldType, FormConfigsPayload, FormFieldDefinitionDto } from '@/types/formConfig.types';
import type { FieldSize } from '@/components/forms/fieldSizing';
import { activeOptionValues, allModuleFieldsIncludingDeleted, findCategory, groupSections, moduleFields, optionLabelMap } from '@/utils/formConfig';

export const FORM_CONFIGS_QUERY_KEY = ['form-configs'] as const;
const FORM_CONFIGS_STALE_MS = 5 * 60 * 1000;

/**
 * Replaces the saved configuration for everything rendered inside it: the admin builder provides its unsaved
 * draft so the Live Preview (and every hook below) shows changes before they are saved.
 */
export const FormConfigsOverrideContext = createContext<FormConfigsPayload | null>(null);

/**
 * Admin form & dropdown configuration (archived options / fields included). Shared by every form; refreshed
 * when an admin saves a change (QueryProvider invalidates it on the `form-configs` sync event).
 */
export function useFormConfigs(): FormConfigsPayload | null {
    const override = useContext(FormConfigsOverrideContext);
    const { data } = useQuery({
        queryKey: FORM_CONFIGS_QUERY_KEY,
        queryFn: () => formConfigService.getAllConfigs(),
        staleTime: FORM_CONFIGS_STALE_MS,
    });
    return override ?? data ?? getFormConfigs();
}

/** Same query, with loading / error state for the admin builder. */
export function useFormConfigsQuery() {
    return useQuery({
        queryKey: FORM_CONFIGS_QUERY_KEY,
        queryFn: () => formConfigService.getAllConfigs(),
        staleTime: FORM_CONFIGS_STALE_MS,
    });
}

/** Active option values of a dropdown category in admin order, falling back to `fallbackOptions` until it loads. */
export function useDropdownOptions(categoryKey: string, fallbackOptions: readonly string[]): string[] {
    const configs = useFormConfigs();
    return useMemo(() => activeOptionValues(findCategory(configs, categoryKey), fallbackOptions), [configs, categoryKey, fallbackOptions]);
}

/** Non-hook getter for components that need several categories (`getOptions('lead_status', LEAD_STATUSES)`). */
export function useDropdownOptionsGetter(): (categoryKey: string, fallbackOptions: readonly string[]) => string[] {
    const configs = useFormConfigs();
    return useCallback((categoryKey, fallbackOptions) => activeOptionValues(findCategory(configs, categoryKey), fallbackOptions), [configs]);
}

/** An option's `meta` (e.g. a terms template's `description`), archived options included. */
export function useDropdownOptionMeta(categoryKey: string): (value: string) => Record<string, unknown> | undefined {
    const configs = useFormConfigs();
    return useCallback(
        (value: string) => findCategory(configs, categoryKey)?.options.find((o) => o.value === value)?.meta ?? undefined,
        [configs, categoryKey],
    );
}

export interface ConfiguredFieldDefaults {
    label: string;
    required?: boolean;
    hint?: React.ReactNode;
    placeholder?: string;
    fieldSize?: FieldSize;
    options?: readonly string[];
}

export interface ConfiguredFieldProps {
    label: string;
    required?: boolean;
    hint?: React.ReactNode;
    placeholder?: string;
    fieldSize?: FieldSize;
    options?: string[];
    /** value → label for options whose label differs from the stored value. */
    optionLabels?: Record<string, string>;
    hidden: boolean;
}

/**
 * Applies an admin's overrides for a built-in field on top of the form's own props. Built-in requirements can
 * only be tightened (a field the form requires stays required); text overrides of `null` keep the form's text.
 */
export function resolveConfiguredFieldProps(
    configs: FormConfigsPayload | null,
    field: FormFieldDefinitionDto | undefined,
    defaults: ConfiguredFieldDefaults,
): ConfiguredFieldProps {
    if (!field) {
        return { ...defaults, options: defaults.options ? [...defaults.options] : undefined, hidden: false };
    }
    const category = findCategory(configs, field.dropdownCategoryKey);
    return {
        label: field.label || defaults.label,
        required: Boolean(defaults.required) || field.isRequired,
        hint: field.hint === null ? defaults.hint : field.hint || undefined,
        placeholder: field.placeholder === null ? defaults.placeholder : field.placeholder || undefined,
        fieldSize: (field.fieldSize as FieldSize | null) ?? defaults.fieldSize,
        options: category ? activeOptionValues(category) : defaults.options ? [...defaults.options] : undefined,
        optionLabels: optionLabelMap(category),
        hidden: Boolean(field.isDeleted) || !field.isActive || !field.isVisibleInForm,
    };
}

/** Admin overrides for one built-in field of a module (label, required, hint, placeholder, size, visibility, options). */
export function useConfiguredFieldProps(module: CrmModuleKey, fieldKey: string, defaults: ConfiguredFieldDefaults): ConfiguredFieldProps {
    const configs = useFormConfigs();
    // Raw list (deleted built-in fields included), so a deleted field resolves to `hidden` instead of "no config".
    const field = configs?.fieldsByModule[module]?.find((f) => f.fieldKey === fieldKey && f.isSystem);
    return resolveConfiguredFieldProps(configs, field, defaults);
}

/** A module's configured fields, grouped by tab and section, plus helpers. */
export function useModuleFormConfig(module: CrmModuleKey) {
    const configs = useFormConfigs();
    return useMemo(() => {
        const fields = moduleFields(configs, module);
        // Deleted built-in fields included: hand-built inputs must hide them, not fall back to "unconfigured".
        const allFields = allModuleFieldsIncludingDeleted(configs, module);
        const tabs = configs?.moduleTabs[module] ?? [];
        const getField = (fieldKey: string) => fields.find((f) => f.fieldKey === fieldKey);
        return {
            configs,
            loaded: Boolean(configs),
            tabs,
            fields,
            customFields: fields.filter((f) => !f.isSystem),
            sectionsByTab: Object.fromEntries(tabs.map((tab) => [tab.key, groupSections(fields, tab.key)])),
            getField,
            isVisible: (fieldKey: string) => {
                const field = allFields.find((f) => f.fieldKey === fieldKey);
                return !field || (!field.isDeleted && field.isActive && field.isVisibleInForm);
            },
            getFieldProps: (fieldKey: string, defaults: ConfiguredFieldDefaults) =>
                resolveConfiguredFieldProps(configs, allFields.find((f) => f.fieldKey === fieldKey && f.isSystem), defaults),
            getOptions: (categoryKey: string, fallback: readonly string[]) => activeOptionValues(findCategory(configs, categoryKey), fallback),
            fieldTypeOf: (fieldKey: string): FieldType | undefined => getField(fieldKey)?.fieldType,
        };
    }, [configs, module]);
}
