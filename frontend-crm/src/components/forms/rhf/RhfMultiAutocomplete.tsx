'use client';

import React from 'react';
import { Autocomplete, Box, Checkbox, Chip, FormHelperText, TextField, Tooltip } from '@mui/material';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import { useController, type FieldPath, type FieldValues } from 'react-hook-form';
import { FormField, fieldSx } from '../FormField';
import type { FieldSize } from '../fieldSizing';
import { useFormMode } from '@/context/FormModeContext';
import { useFieldOverride } from '@/context/FormConfigContext';
import { ReadOnlyField } from '../ReadOnlyField';
import { useTabSelect } from '../useTabSelect';

const chipSx = { fontSize: '0.74rem', fontWeight: 600, height: 24, color: '#1d4ed8', backgroundColor: '#eff6ff' } as const;
const archivedChipSx = { ...chipSx, color: '#b45309', backgroundColor: '#fef3c7', border: '1px dashed #fde68a' } as const;

/** Read-only chips of a multi-select value (view mode). */
export function MultiSelectChips({ values, optionLabels }: { values: readonly string[]; optionLabels?: Record<string, string> }) {
    return (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
            {values.map((option) => (
                <Chip key={option} label={optionLabels?.[option] ?? option} size="small" sx={chipSx} />
            ))}
        </Box>
    );
}

export interface MultiAutocompleteInputProps {
    value: readonly string[];
    onChange: (value: string[]) => void;
    onBlur?: () => void;
    /** Options currently offered. Saved values missing from it are shown as archived chips (removable, not offered). */
    options: readonly string[];
    /** Display labels for values whose label differs from the stored value. */
    optionLabels?: Record<string, string>;
    placeholder?: string;
    error?: boolean;
    inputRef?: React.Ref<HTMLInputElement>;
}

/**
 * Multi-select autocomplete (string[] value): type to search, pick several (the list stays open, each option has a
 * checkbox), selections show as removable chips. Not bound to a form library; see RhfMultiAutocomplete for RHF.
 */
export function MultiAutocompleteInput({
    value,
    onChange,
    onBlur,
    options,
    optionLabels,
    placeholder = 'Search and select...',
    error,
    inputRef,
}: MultiAutocompleteInputProps) {
    const display = (v: string) => optionLabels?.[v] ?? v;
    const isArchived = (v: string) => !options.includes(v);
    // Archived values must be options too, or MUI can't render them as selected.
    const allOptions = [...options, ...value.filter((v) => !options.includes(v))];
    // Tab after typing adds the highlighted option and stays here for the next one; Tab on an empty input moves on.
    const tabSelect = useTabSelect({ stayAfterPick: true });

    return (
        <Autocomplete<string, true, false, false>
            {...tabSelect}
            multiple
            disableCloseOnSelect
            options={allOptions}
            value={[...value]}
            onChange={(_, next) => onChange(next)}
            onBlur={onBlur}
            getOptionLabel={display}
            // Archived values stay selectable for removal (as chips) but are never offered in the list.
            filterOptions={(opts, state) => {
                const q = state.inputValue.trim().toLowerCase();
                return opts.filter((o) => !isArchived(o) && (!q || display(o).toLowerCase().includes(q)));
            }}
            size="small"
            renderOption={(props, option, { selected: isSelected }) => {
                const { key, ...rest } = props as React.HTMLAttributes<HTMLLIElement> & { key: string };
                return (
                    <Box component="li" key={key} {...rest} sx={{ fontSize: '0.84rem', gap: 0.5 }}>
                        <Checkbox
                            size="small"
                            icon={<CheckBoxOutlineBlankIcon sx={{ fontSize: 18 }} />}
                            checkedIcon={<CheckBoxIcon sx={{ fontSize: 18 }} />}
                            checked={isSelected}
                            tabIndex={-1}
                            disableRipple
                            sx={{ p: 0.25, mr: 0.5 }}
                        />
                        {display(option)}
                    </Box>
                );
            }}
            renderValue={(values, getItemProps) =>
                values.map((option, index) => {
                    const { key, ...itemProps } = getItemProps({ index });
                    const archived = isArchived(option);
                    const chip = (
                        <Chip
                            key={key}
                            {...itemProps}
                            size="small"
                            label={archived ? `${display(option)} (archived)` : display(option)}
                            sx={archived ? archivedChipSx : chipSx}
                        />
                    );
                    return archived ? (
                        <Tooltip key={key} title="No longer offered for new records. Remove it with ×." arrow>
                            {chip}
                        </Tooltip>
                    ) : (
                        chip
                    );
                })
            }
            renderInput={(params) => (
                <TextField
                    {...params}
                    inputRef={inputRef}
                    placeholder={value.length === 0 ? placeholder : undefined}
                    error={error}
                    sx={fieldSx}
                />
            )}
        />
    );
}

export interface RhfMultiAutocompleteProps<T extends FieldValues> {
    name: FieldPath<T>;
    label: string;
    options: readonly string[];
    /** Display labels for values whose label differs from the stored value. */
    optionLabels?: Record<string, string>;
    required?: boolean;
    hint?: React.ReactNode;
    placeholder?: string;
    size?: FieldSize;
}

/**
 * React Hook Form bound MultiAutocompleteInput. Same configuration behaviour as RhfChipGroup: inside a
 * FormConfigProvider the options, labels and required flag come from the admin's dropdown.
 */
export function RhfMultiAutocomplete<T extends FieldValues>({
    name,
    label: baseLabel,
    options: baseOptions,
    optionLabels: baseOptionLabels,
    required,
    hint,
    placeholder = 'Search and select...',
    size = 'full',
}: RhfMultiAutocompleteProps<T>) {
    const { field, fieldState } = useController<T>({ name });
    const selected: string[] = Array.isArray(field.value) ? field.value : [];
    const override = useFieldOverride(name, { label: baseLabel, options: baseOptions, required, hint, placeholder });
    const label = override?.label ?? baseLabel;
    const options = override?.options ?? baseOptions;
    const optionLabels = override?.optionLabels ?? baseOptionLabels;

    const { mode } = useFormMode();
    if (override?.hidden) return null;
    if (mode === 'view') {
        return (
            <ReadOnlyField
                label={label}
                hideWhenEmpty
                value={selected.length > 0 ? <MultiSelectChips values={selected} optionLabels={optionLabels} /> : undefined}
                sx={{ mb: 2 }}
            />
        );
    }

    return (
        <FormField name={name} label={baseLabel} required={required} hint={hint} size={size}>
            <MultiAutocompleteInput
                value={selected}
                onChange={field.onChange}
                onBlur={field.onBlur}
                options={options}
                optionLabels={optionLabels}
                placeholder={override?.placeholder ?? placeholder}
                error={Boolean(fieldState.error)}
                inputRef={field.ref}
            />
            {fieldState.error && <FormHelperText error>{fieldState.error.message}</FormHelperText>}
        </FormField>
    );
}
