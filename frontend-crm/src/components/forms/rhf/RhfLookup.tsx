'use client';

import React from 'react';
import { FormHelperText } from '@mui/material';
import { useController, type FieldPath, type FieldValues } from 'react-hook-form';
import { FormField } from '../FormField';
import { LookupField } from '../LookupField';

export interface RhfLookupProps<T extends FieldValues> {
    name: FieldPath<T>;
    label: string;
    options?: string[];
    required?: boolean;
    hint?: React.ReactNode;
    placeholder?: string;
}

/** React Hook Form bound lookup/autocomplete built on the shared {@link LookupField}. */
export function RhfLookup<T extends FieldValues>({
    name,
    label,
    options,
    required,
    hint,
    placeholder,
}: RhfLookupProps<T>) {
    const { field, fieldState } = useController<T>({ name });

    return (
        <FormField label={label} required={required} hint={hint}>
            <LookupField
                value={(field.value as string) ?? ''}
                onChange={field.onChange}
                options={options}
                placeholder={placeholder}
                required={required}
            />
            {fieldState.error && (
                <FormHelperText error sx={{ mx: 1.75 }}>
                    {fieldState.error.message}
                </FormHelperText>
            )}
        </FormField>
    );
}
