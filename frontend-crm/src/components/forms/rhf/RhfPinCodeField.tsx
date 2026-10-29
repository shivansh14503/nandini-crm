'use client';

import React from 'react';
import { TextField } from '@mui/material';
import {
    useController,
    useFormContext,
    useWatch,
    type FieldPath,
    type FieldValues,
    type Path,
} from 'react-hook-form';
import { FormField, fieldSx } from '../FormField';
import { getPostalCodeConfig } from '../AddressPrimitives';
import type { FieldSize } from '../fieldSizing';

export interface RhfPinCodeFieldProps<T extends FieldValues> {
    name: FieldPath<T>;
    /** Overrides the country-specific default label. */
    label?: string;
    required?: boolean;
    hint?: React.ReactNode;
    placeholder?: string;
    disabled?: boolean;
    /** Country field to follow (ISO2 or legacy name). */
    countryFieldName?: Path<T>;
    /** Fixed country when there is no country field. Defaults to India. */
    countryCode?: string;
    /** Width token (default `xs`). */
    fieldSize?: FieldSize;
}

/**
 * Country-aware postal code input.
 * India: 6-digit numeric PIN. Elsewhere: up to 12 uppercase letters, digits, spaces and hyphens.
 */
export function RhfPinCodeField<T extends FieldValues>({
    name,
    label,
    required,
    hint,
    placeholder,
    disabled,
    countryFieldName,
    countryCode,
    fieldSize = 'xs',
}: RhfPinCodeFieldProps<T>) {
    const { control } = useFormContext<T>();
    const { field, fieldState } = useController<T>({ name });
    // useWatch must always run; it watches this field itself when no country field is configured (value ignored).
    const watchedCountry = useWatch({ control, name: (countryFieldName ?? name) as Path<T> });
    const country = countryFieldName ? (watchedCountry as string | undefined) : countryCode;
    const config = getPostalCodeConfig(country);

    return (
        <FormField name={name} label={label ?? config.label} required={required} hint={hint} size={fieldSize}>
            <TextField
                {...field}
                value={field.value ?? ''}
                onChange={(e) => field.onChange(config.sanitize(e.target.value))}
                fullWidth
                size="small"
                placeholder={placeholder ?? config.placeholder}
                disabled={disabled}
                error={Boolean(fieldState.error)}
                helperText={fieldState.error?.message}
                slotProps={{
                    htmlInput: {
                        maxLength: config.maxLength,
                        inputMode: config.inputMode,
                        ...(config.isIndia ? { pattern: '[0-9]*' } : {}),
                    },
                }}
                sx={fieldSx}
            />
        </FormField>
    );
}
