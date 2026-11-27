'use client';

import React from 'react';
import { Autocomplete, Box, TextField } from '@mui/material';
import { useController, type FieldPath, type FieldValues } from 'react-hook-form';
import { FormField, fieldSx } from '../FormField';
import { resolveFieldMaxLength, resolveFieldSize, type FieldSize } from '../fieldSizing';
import { useFieldOverride } from '@/context/FormConfigContext';

/** One value offered while typing, with an optional note on the right (e.g. "3 products"). */
export interface SuggestOption {
    value: string;
    detail?: string;
}

export interface RhfSuggestFieldProps<T extends FieldValues> {
    name: FieldPath<T>;
    label: string;
    /** Values offered as the user types; any other typed value is kept as it is. */
    suggestions: readonly SuggestOption[];
    loading?: boolean;
    required?: boolean;
    hint?: React.ReactNode;
    placeholder?: string;
    maxLength?: number;
    fieldSize?: FieldSize;
}

const optionRowSx = { display: 'flex', alignItems: 'center', gap: 1, fontSize: '0.84rem', minHeight: 36 } as const;
const detailSx = { ml: 'auto', flexShrink: 0, fontSize: '0.72rem', color: 'var(--mui-palette-text-muted)' } as const;

/**
 * Free text with suggestions (React Hook Form): typing filters the `suggestions` (any part of the value, ignoring
 * case) and picking one fills it in, while a brand-new value is kept exactly as typed. Inside a FormConfigProvider the
 * admin's label / required / hint / placeholder / visibility apply, as on a text field.
 */
export function RhfSuggestField<T extends FieldValues>({
    name,
    label,
    suggestions,
    loading,
    required,
    hint,
    placeholder,
    maxLength,
    fieldSize,
}: RhfSuggestFieldProps<T>) {
    const { field, fieldState } = useController<T>({ name });
    const override = useFieldOverride(name, { label, placeholder });
    const value: string = typeof field.value === 'string' ? field.value : '';
    const limit = resolveFieldMaxLength(name, maxLength);
    const size = resolveFieldSize(name, 'text', fieldSize);

    const details = React.useMemo(() => new Map(suggestions.map((s) => [s.value.toLowerCase(), s.detail])), [suggestions]);
    const options = React.useMemo(() => suggestions.map((s) => s.value), [suggestions]);

    return (
        <FormField name={name} label={label} required={required} hint={hint} size={size} viewValue={value} fit={limit ? { chars: limit } : undefined}>
            <Autocomplete<string, false, false, true>
                freeSolo
                autoHighlight={false}
                options={options}
                loading={loading}
                value={value}
                inputValue={value}
                onInputChange={(_, next, reason) => {
                    if (reason !== 'reset') field.onChange(limit ? next.slice(0, limit) : next);
                }}
                onChange={(_, next) => field.onChange(typeof next === 'string' ? next : '')}
                // The typed value itself isn't repeated in the list; everything else containing it is offered.
                filterOptions={(opts, state) => {
                    const q = state.inputValue.trim().toLowerCase();
                    return opts.filter((o) => (q ? o.toLowerCase().includes(q) && o.toLowerCase() !== q : true));
                }}
                renderOption={(props, option) => {
                    const { key, ...rest } = props as React.HTMLAttributes<HTMLLIElement> & { key: React.Key };
                    const detail = details.get(option.toLowerCase());
                    return (
                        <Box component="li" key={key} {...rest} sx={optionRowSx}>
                            <Box component="span" sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                                {option}
                            </Box>
                            {detail && (
                                <Box component="span" sx={detailSx}>
                                    {detail}
                                </Box>
                            )}
                        </Box>
                    );
                }}
                renderInput={(params) => (
                    <TextField
                        {...params}
                        inputRef={field.ref}
                        onBlur={() => {
                            // Stray spaces around a typed value would read as a different manufacturer.
                            const trimmed = value.trim();
                            if (trimmed !== value) field.onChange(trimmed);
                            field.onBlur();
                        }}
                        size="small"
                        placeholder={override ? override.placeholder : placeholder}
                        error={Boolean(fieldState.error)}
                        helperText={fieldState.error?.message}
                        slotProps={{ ...params.slotProps, htmlInput: { ...params.slotProps?.htmlInput, ...(limit ? { maxLength: limit } : {}) } }}
                        sx={fieldSx}
                    />
                )}
            />
        </FormField>
    );
}
