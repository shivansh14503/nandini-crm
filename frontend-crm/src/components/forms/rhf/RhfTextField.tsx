'use client';

import React from 'react';
import { TextField, type TextFieldProps } from '@mui/material';
import { useController, type FieldPath, type FieldValues } from 'react-hook-form';
import { FormField, fieldSx } from '../FormField';
import { useFieldOverride } from '@/context/FormConfigContext';
import {
    fieldTypeFromInput,
    isTaxIdentifierField,
    resolveFieldMaxLength,
    resolveFieldSize,
    type FieldContentFit,
    type FieldSize,
    type FieldType,
} from '../fieldSizing';
import { localNow, localToday } from '@/utils/pastDates';
import { digitsOnly, emailText, setInputValueIfChanged, upperCase, useUndoSafeSanitizer } from '../undoSafeInput';

/** Native date / time pickers: fixed-length display value plus the picker icon. */
const PICKER_FIT: Record<string, FieldContentFit> = {
    date: { chars: 10, wide: true, chromePx: 32 },
    time: { chars: 8, wide: true, chromePx: 32 },
    'datetime-local': { chars: 18, wide: true, chromePx: 32 },
};

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
    /** Width token; inferred from `name` / `fieldType` when omitted. */
    fieldSize?: FieldSize;
    /** Data shape used for size inference; derived from `type` / `multiline` when omitted. */
    fieldType?: FieldType;
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
    fieldSize,
    fieldType,
    sx,
    slotProps,
    ...inputProps
}: RhfTextFieldProps<T>) {
    const { field, fieldState } = useController<T>({ name });
    // Admin placeholder override (label / required / hint / size are applied by FormField).
    const override = useFieldOverride(name, { label, placeholder: inputProps.placeholder });

    const resolvedType = fieldType ?? fieldTypeFromInput(inputProps.type, inputProps.multiline);
    const resolvedSize = resolveFieldSize(name, resolvedType, fieldSize);

    const isNumeric =
        numericOnly ??
        (resolvedType === 'phone' ||
            /(mobile|phone)/i.test(name) ||
            /(mobile|phone)/i.test(label));

    // Exact-name match: a substring test would uppercase fields like "Principal Company" (com-pan-y).
    const isUppercase = uppercase ?? (isTaxIdentifierField(name) || isTaxIdentifierField(label));

    const isEmail =
        lowercase ??
        (inputProps.type === 'email' ||
            /(email)/i.test(name) ||
            /(email)/i.test(label));

    const existingHtmlInput =
        (slotProps?.htmlInput as Record<string, unknown> | undefined) || {};

    // Postal codes resolve to the international 12-char cap; country-specific masking lives in RhfPinCodeField.
    const resolvedMaxLength =
        resolveFieldMaxLength(name, maxLength ?? (existingHtmlInput.maxLength as number | undefined)) ??
        resolveFieldMaxLength(label);

    // Auto width fits the longest value the input accepts; textareas always span their row.
    const fit: FieldContentFit | undefined = inputProps.multiline
        ? undefined
        : PICKER_FIT[inputProps.type ?? ''] ??
          (resolvedMaxLength ? { chars: resolvedMaxLength, wide: isUppercase || isNumeric } : undefined);

    // Filter typed / pasted text before it's inserted, so the value below rarely needs rewriting and Ctrl+Z
    // keeps working (rewriting an input's value from script clears its undo history).
    const sanitizerRef = useUndoSafeSanitizer(isNumeric ? digitsOnly : isUppercase ? upperCase : isEmail ? emailText : undefined);

    const handleChange = (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => {
        let val = e.target.value;
        if (isNumeric) {
            val = val.replace(/\D/g, '');
            if (resolvedMaxLength) {
                val = val.slice(0, resolvedMaxLength);
            }
            setInputValueIfChanged(e.target, val);
        } else if (isUppercase) {
            val = val.toUpperCase();
            if (resolvedMaxLength) {
                val = val.slice(0, resolvedMaxLength);
            }
            setInputValueIfChanged(e.target, val);
        } else if (isEmail) {
            val = val.toLowerCase().trim();
            setInputValueIfChanged(e.target, val);
        } else if (inputProps.type === 'number') {
            const num = parseFloat(val);
            if (!isNaN(num)) {
                if (max !== undefined && num > Number(max)) {
                    val = String(max);
                    setInputValueIfChanged(e.target, val);
                } else if (min !== undefined && num < Number(min)) {
                    val = String(min);
                    setInputValueIfChanged(e.target, val);
                }
            }
        }
        field.onChange(val);
        inputProps.onChange?.(e);
    };

    // Date pickers start at today: past days can't be picked anywhere in the CRM (forms also reject typed ones).
    const pickerMin = inputProps.type === 'date' ? localToday() : inputProps.type === 'datetime-local' ? localNow() : undefined;
    const resolvedMin = min ?? (existingHtmlInput.min as string | number | undefined) ?? pickerMin;

    const mergedSlotProps = {
        ...slotProps,
        htmlInput: {
            ...existingHtmlInput,
            ...(resolvedMin !== undefined ? { min: resolvedMin } : {}),
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
                    setInputValueIfChanged(target, val);
                } else if (isUppercase && target.value) {
                    let val = target.value.toUpperCase();
                    if (resolvedMaxLength) {
                        val = val.slice(0, resolvedMaxLength);
                    }
                    setInputValueIfChanged(target, val);
                } else if (isEmail && target.value) {
                    setInputValueIfChanged(target, target.value.toLowerCase().trim());
                } else if (inputProps.type === 'number' && target.value) {
                    const num = parseFloat(target.value);
                    if (!isNaN(num)) {
                        if (max !== undefined && num > Number(max)) {
                            setInputValueIfChanged(target, String(max));
                        } else if (min !== undefined && num < Number(min)) {
                            setInputValueIfChanged(target, String(min));
                        }
                    }
                }
            },
        },
    };

    return (
        <FormField name={name} label={label} required={required} hint={hint} size={resolvedSize} fit={fit}>
            <TextField
                {...inputProps}
                placeholder={override ? override.placeholder : inputProps.placeholder}
                {...field}
                value={field.value ?? ''}
                onChange={handleChange}
                inputRef={sanitizerRef}
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
