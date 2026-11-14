'use client';

import React from 'react';
import { FormHelperText, type SxProps, type Theme } from '@mui/material';
import { useController, type FieldPath, type FieldValues } from 'react-hook-form';
import { FormField, useFieldAutoSize } from '../FormField';
import { StyledSelect } from '../StyledSelect';
import { useFieldOverride } from '@/context/FormConfigContext';
import { longestOptionChars, resolveFieldSize, resolveOptionsFieldSize, type FieldContentFit, type FieldSize } from '../fieldSizing';

const SELECT_PROMPT = 'Select';
/** Dropdown arrow plus its gap. */
const SELECT_ARROW_PX = 34;

export interface RhfSelectProps<T extends FieldValues> {
    name: FieldPath<T>;
    label: string;
    options: string[];
    /** Display labels for values whose label differs from the stored value. */
    optionLabels?: Record<string, string>;
    required?: boolean;
    hint?: React.ReactNode;
    placeholder?: string;
    disabled?: boolean;
    /** Width token; defaults to the width of the longest option (`xs` for Yes/No … capped at `md`). */
    fieldSize?: FieldSize;
    sx?: SxProps<Theme>;
}

/** React Hook Form bound dropdown built on the shared {@link StyledSelect}. */
export function RhfSelect<T extends FieldValues>({
    name,
    label,
    options,
    optionLabels,
    required,
    hint,
    placeholder,
    disabled,
    fieldSize,
    sx,
}: RhfSelectProps<T>) {
    const { field, fieldState } = useController<T>({ name });
    const size = resolveFieldSize(name, 'select', fieldSize ?? resolveOptionsFieldSize(options));
    // Auto width fits the longest option the dropdown actually shows (admin-managed list when configured).
    const override = useFieldOverride(name, { label, options, placeholder });
    const fit: FieldContentFit = {
        chars: Math.max(SELECT_PROMPT.length, longestOptionChars(override?.options ?? options, override?.optionLabels ?? optionLabels)),
        chromePx: SELECT_ARROW_PX,
    };
    // A long "Select <label>" prompt would be cut off in a fitted / xs control; a bare "Select" stays readable.
    const narrow = useFieldAutoSize(name) || size === 'xs';

    return (
        <FormField name={name} label={label} required={required} hint={hint} size={size} fit={fit} sx={sx}>
            <StyledSelect
                value={(field.value as string) ?? ''}
                onChange={field.onChange}
                options={options}
                optionLabels={optionLabels}
                placeholder={placeholder && !(narrow && placeholder.length > fit.chars) ? placeholder : narrow ? SELECT_PROMPT : undefined}
                disabled={disabled}
            />
            {fieldState.error && (
                <FormHelperText error sx={{ mx: 1.75 }}>
                    {fieldState.error.message}
                </FormHelperText>
            )}
        </FormField>
    );
}
