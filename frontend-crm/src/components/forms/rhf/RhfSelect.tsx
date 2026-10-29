'use client';

import React from 'react';
import { FormHelperText, type SxProps, type Theme } from '@mui/material';
import { useController, type FieldPath, type FieldValues } from 'react-hook-form';
import { FormField } from '../FormField';
import { StyledSelect } from '../StyledSelect';
import { resolveFieldSize, resolveOptionsFieldSize, type FieldSize } from '../fieldSizing';

export interface RhfSelectProps<T extends FieldValues> {
    name: FieldPath<T>;
    label: string;
    options: string[];
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
    required,
    hint,
    placeholder,
    disabled,
    fieldSize,
    sx,
}: RhfSelectProps<T>) {
    const { field, fieldState } = useController<T>({ name });
    const size = resolveFieldSize(name, 'select', fieldSize ?? resolveOptionsFieldSize(options));

    return (
        <FormField name={name} label={label} required={required} hint={hint} size={size} sx={sx}>
            <StyledSelect
                value={(field.value as string) ?? ''}
                onChange={field.onChange}
                options={options}
                // "Select <label>" doesn't fit an xs control; a bare "Select" keeps the prompt readable.
                placeholder={placeholder ?? (size === 'xs' ? 'Select' : undefined)}
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
