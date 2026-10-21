'use client';

import React from 'react';
import { TextField, type TextFieldProps } from '@mui/material';
import { useController, type FieldPath, type FieldValues } from 'react-hook-form';
import { FormField, fieldSx } from '../FormField';

export interface RhfTextFieldProps<T extends FieldValues>
    extends Pick<
        TextFieldProps,
        'type' | 'multiline' | 'minRows' | 'maxRows' | 'placeholder' | 'disabled' | 'slotProps' | 'sx'
    > {
    name: FieldPath<T>;
    label: string;
    required?: boolean;
    hint?: React.ReactNode;
}

/**
 * React Hook Form bound text input rendered inside the shared {@link FormField} shell.
 * Must be rendered inside a `FormProvider`.
 */
export function RhfTextField<T extends FieldValues>({
    name,
    label,
    required,
    hint,
    sx,
    ...inputProps
}: RhfTextFieldProps<T>) {
    const { field, fieldState } = useController<T>({ name });

    return (
        <FormField label={label} required={required} hint={hint}>
            <TextField
                {...inputProps}
                {...field}
                value={field.value ?? ''}
                fullWidth
                size="small"
                error={Boolean(fieldState.error)}
                helperText={fieldState.error?.message}
                sx={{ ...fieldSx, ...sx }}
            />
        </FormField>
    );
}
