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
    numericOnly?: boolean;
    uppercase?: boolean;
    lowercase?: boolean;
    maxLength?: number;
    min?: number | string;
    max?: number | string;
    step?: number | string;
    onChange?: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
}

/**
 * React Hook Form bound text input rendered inside the shared {@link FormField} shell.
 * Must be rendered inside a `FormProvider`.
 * Enforces production-grade enterprise input constraints (numeric-only, uppercase, lowercase, max/min limits).
 */
export function RhfTextField<T extends FieldValues>({
    name,
    label,
    required,
    hint,
    numericOnly,
    uppercase,
    lowercase,
    maxLength,
    min,
    max,
    step,
    sx,
    slotProps,
    ...inputProps
}: RhfTextFieldProps<T>) {
    const { field, fieldState } = useController<T>({ name });

    const isNumeric =
        numericOnly ??
        (inputProps.type === 'tel' ||
            /(mobile|phone)/i.test(name) ||
            /(mobile|phone)/i.test(label));

    const isUppercase =
        uppercase ??
        (/(gst|pan|ifsc)/i.test(name) || /(gst|pan|ifsc)/i.test(label));

    const isEmail =
        lowercase ??
        (inputProps.type === 'email' ||
            /(email)/i.test(name) ||
            /(email)/i.test(label));

    const existingHtmlInput =
        (slotProps?.htmlInput as Record<string, unknown> | undefined) || {};

    const resolvedMaxLength =
        maxLength ??
        (existingHtmlInput.maxLength as number | undefined) ??
        // Postal codes are free text (international formats); country-specific masking lives in the postal field primitive.
        (/(postalcode|pincode|pin code|postal code)/i.test(name) ||
        /(postal code|pin code|pincode)/i.test(label)
            ? 12
            : /(mobile|phone)/i.test(name) || /(mobile|phone)/i.test(label)
            ? 10
            : undefined);

    const handleChange = (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => {
        let val = e.target.value;
        if (isNumeric) {
            val = val.replace(/\D/g, '');
            if (resolvedMaxLength) {
                val = val.slice(0, resolvedMaxLength);
            }
            e.target.value = val;
        } else if (isUppercase) {
            val = val.toUpperCase();
            if (resolvedMaxLength) {
                val = val.slice(0, resolvedMaxLength);
            }
            e.target.value = val;
        } else if (isEmail) {
            val = val.toLowerCase().trim();
            e.target.value = val;
        } else if (inputProps.type === 'number') {
            const num = parseFloat(val);
            if (!isNaN(num)) {
                if (max !== undefined && num > Number(max)) {
                    val = String(max);
                    e.target.value = val;
                } else if (min !== undefined && num < Number(min)) {
                    val = String(min);
                    e.target.value = val;
                }
            }
        }
        field.onChange(val);
        inputProps.onChange?.(e);
    };

    const mergedSlotProps = {
        ...slotProps,
        htmlInput: {
            ...existingHtmlInput,
            ...(min !== undefined ? { min } : {}),
            ...(max !== undefined ? { max } : {}),
            ...(step !== undefined ? { step } : {}),
            ...(isNumeric
                ? {
                      inputMode: 'numeric',
                      pattern: '[0-9]*',
                  }
                : {}),
            ...(resolvedMaxLength ? { maxLength: resolvedMaxLength } : {}),
            onInput: (e: React.FormEvent<HTMLInputElement>) => {
                const target = e.currentTarget;
                if (isNumeric && target.value) {
                    let val = target.value.replace(/\D/g, '');
                    if (resolvedMaxLength) {
                        val = val.slice(0, resolvedMaxLength);
                    }
                    target.value = val;
                } else if (isUppercase && target.value) {
                    let val = target.value.toUpperCase();
                    if (resolvedMaxLength) {
                        val = val.slice(0, resolvedMaxLength);
                    }
                    target.value = val;
                } else if (isEmail && target.value) {
                    let val = target.value.toLowerCase().trim();
                    target.value = val;
                } else if (inputProps.type === 'number' && target.value) {
                    const num = parseFloat(target.value);
                    if (!isNaN(num)) {
                        if (max !== undefined && num > Number(max)) {
                            target.value = String(max);
                        } else if (min !== undefined && num < Number(min)) {
                            target.value = String(min);
                        }
                    }
                }
            },
        },
    };

    return (
        <FormField name={name} label={label} required={required} hint={hint}>
            <TextField
                {...inputProps}
                {...field}
                value={field.value ?? ''}
                onChange={handleChange}
                fullWidth
                size="small"
                slotProps={mergedSlotProps}
                error={Boolean(fieldState.error)}
                helperText={fieldState.error?.message}
                sx={{ ...fieldSx, ...sx }}
            />
        </FormField>
    );
}
