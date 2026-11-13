'use client';

import React, { useEffect, useRef } from 'react';
import { useFormContext, useWatch, type FieldValues } from 'react-hook-form';
import { useFormMode } from '@/context/FormModeContext';
import { useFormConfigs } from '@/hooks/queries/useFormConfigs';
import type { FormFieldDefinitionDto } from '@/types/formConfig.types';
import { activeOptionValues, defaultOptionValues, fieldFormName, findCategory, optionLabelMap, parseDefaultValue } from '@/utils/formConfig';
import type { FieldSize } from './fieldSizing';
import { FieldAutoSizeProvider } from './FormField';
import {
    RhfAmountField,
    RhfCheckbox,
    RhfChipGroup,
    RhfEmailField,
    RhfEmailList,
    RhfPercentageField,
    RhfPhoneField,
    RhfPinCodeField,
    RhfSelect,
    RhfTextField,
    RhfUppercaseField,
} from './rhf';

export interface DynamicFormFieldProps {
    field: FormFieldDefinitionDto;
    /** Overrides `field.isRequired` (archived fields are shown but never required). */
    required?: boolean;
    /** Applies `field.defaultValue` to an empty value in create mode (default true). */
    applyDefault?: boolean;
}

/** Default width per control type when the admin hasn't picked one. */
const TYPE_SIZE: Partial<Record<FormFieldDefinitionDto['fieldType'], FieldSize>> = {
    textarea: 'full',
    multiselect: 'full',
    percentage: 'xs',
    pincode: 'xs',
    number: 'sm',
    phone: 'sm',
    date: 'sm',
    uppercase: 'sm',
    amount: 'md',
    email: 'md',
    select: 'md',
};

/**
 * Renders one configured field with the matching React Hook Form control. Custom fields bind to
 * `customFields.<fieldKey>`; built-in fields (used by the admin live preview) bind to `<fieldKey>`.
 * Must be rendered inside a `FormProvider`.
 */
export function DynamicFormField({ field, required, applyDefault = true }: DynamicFormFieldProps) {
    const configs = useFormConfigs();
    const { mode } = useFormMode();
    const { getValues, setValue } = useFormContext<FieldValues>();
    const name = fieldFormName(field);
    const category = findCategory(configs, field.dropdownCategoryKey);
    // The dropdown's default options, as a stable dependency for the effect below.
    const categoryDefaults = defaultOptionValues(category).join('\u0000');

    // Last default this field applied: while the value still equals it (nobody changed it), a changed default
    // replaces it, and a removed one clears it so the placeholder shows (e.g. in the admin Live Preview).
    const appliedDefault = useRef<string | undefined>(undefined);
    useEffect(() => {
        if (!applyDefault || mode !== 'create') return;
        const current = getValues(name);
        const fallback = parseDefaultValue(field, category);
        const isEmpty = current === undefined || current === '' || current === null || (Array.isArray(current) && current.length === 0);
        const stillApplied = appliedDefault.current !== undefined && JSON.stringify(current) === appliedDefault.current;
        if (!isEmpty && !stillApplied) return;
        if (fallback !== undefined) {
            setValue(name, fallback, { shouldDirty: false });
            appliedDefault.current = JSON.stringify(fallback);
        } else if (stillApplied) {
            setValue(name, field.fieldType === 'multiselect' ? [] : field.fieldType === 'checkbox' ? false : '', { shouldDirty: false });
            appliedDefault.current = undefined;
        }
        // Only on mount / when the definition changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [field.id, field.defaultValue, field.fieldType, categoryDefaults, mode]);

    // A field switched between select and multi-select keeps the values records already hold: a single pick
    // becomes a one-item list, and a list keeps its first pick, so the control never gets the wrong shape.
    // Watched (not read once) so values loaded later by `reset()` for an existing record are fixed up too.
    const watched: unknown = useWatch({ name });
    useEffect(() => {
        if (field.fieldType === 'multiselect' && typeof watched === 'string') {
            setValue(name, watched.split(',').map((v) => v.trim()).filter(Boolean), { shouldDirty: false });
        } else if (field.fieldType === 'select' && Array.isArray(watched)) {
            setValue(name, watched.length > 0 ? String(watched[0]) : '', { shouldDirty: false });
        }
    }, [field.fieldType, name, setValue, watched]);

    const common = {
        name,
        label: field.label,
        required: required ?? field.isRequired,
        hint: field.hint ?? undefined,
    };
    const placeholder = field.placeholder ?? undefined;
    const fieldSize = (field.fieldSize as FieldSize | null) ?? TYPE_SIZE[field.fieldType];

    const control = ((): React.ReactNode => {
        switch (field.fieldType) {
            case 'textarea':
                return <RhfTextField {...common} placeholder={placeholder} multiline minRows={3} maxRows={6} fieldSize={fieldSize} maxLength={4000} />;
            case 'number':
                return <RhfTextField {...common} placeholder={placeholder} type="number" fieldSize={fieldSize} />;
            case 'amount':
                return <RhfAmountField {...common} placeholder={placeholder} fieldSize={fieldSize} />;
            case 'percentage':
                return <RhfPercentageField {...common} placeholder={placeholder} fieldSize={fieldSize} />;
            case 'phone':
                return <RhfPhoneField {...common} placeholder={placeholder} fieldSize={fieldSize} setsFormDefault={false} />;
            case 'email':
                // Built-in email lists (lead / contact / partner `emailAddresses`) hold several addresses.
                return field.isSystem && field.fieldKey === 'emailAddresses' ? (
                    <RhfEmailList
                        name={name}
                        label={field.label}
                        required={common.required}
                        hint={common.hint}
                        placeholder={placeholder}
                        fieldSize={field.fieldSize as FieldSize | null}
                    />
                ) : (
                    <RhfEmailField {...common} placeholder={placeholder} fieldSize={fieldSize} />
                );
            case 'date':
                return <RhfTextField {...common} type="date" fieldSize={fieldSize} slotProps={{ inputLabel: { shrink: true } }} />;
            case 'select':
            case 'multiselect': {
                const category = findCategory(configs, field.dropdownCategoryKey);
                const options = activeOptionValues(category);
                const optionLabels = optionLabelMap(category);
                return field.fieldType === 'select' ? (
                    <RhfSelect {...common} options={options} optionLabels={optionLabels} placeholder={placeholder} fieldSize={fieldSize} />
                ) : (
                    <RhfChipGroup {...common} options={options} optionLabels={optionLabels} />
                );
            }
            case 'checkbox':
                return <RhfCheckbox name={name} label={common.required ? `${field.label} *` : field.label} />;
            case 'uppercase':
                return <RhfUppercaseField {...common} placeholder={placeholder} fieldSize={fieldSize} maxLength={50} />;
            case 'pincode':
                return <RhfPinCodeField {...common} placeholder={placeholder} fieldSize={fieldSize} />;
            case 'text':
            case 'lookup':
            case 'datetime':
            default:
                return <RhfTextField {...common} placeholder={placeholder} fieldSize={fieldSize ?? 'lg'} maxLength={500} />;
        }
    })();

    // Lets the control size itself to its content when the admin left Width on "Auto".
    return <FieldAutoSizeProvider auto={!field.fieldSize}>{control}</FieldAutoSizeProvider>;
}

