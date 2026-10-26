'use client';

import React from 'react';
import { FormHelperText, type SxProps, type Theme } from '@mui/material';
import { useController, type FieldPath, type FieldValues } from 'react-hook-form';
import { FormField } from '../FormField';
import { StyledSelect } from '../StyledSelect';

export interface RhfSelectProps<T extends FieldValues> {
    name: FieldPath<T>;
    label: string;
    options: string[];
    required?: boolean;
    hint?: React.ReactNode;
    placeholder?: string;
    disabled?: boolean;
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
    sx,
}: RhfSelectProps<T>) {
    const { field, fieldState } = useController<T>({ name });

    return (
        <FormField name={name} label={label} required={required} hint={hint} sx={sx}>
            <StyledSelect
                value={(field.value as string) ?? ''}
                onChange={field.onChange}
                options={options}
                placeholder={placeholder}
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
