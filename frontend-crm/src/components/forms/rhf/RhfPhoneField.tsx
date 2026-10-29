'use client';

import React from 'react';
import type { FieldValues } from 'react-hook-form';
import { RhfTextField, type RhfTextFieldProps } from './RhfTextField';
import { FIELD_MAX_LENGTH } from '../fieldSizing';

export type RhfPhoneFieldProps<T extends FieldValues> = Omit<
    RhfTextFieldProps<T>,
    'numericOnly'
>;

/**
 * Specialized Phone input component that enforces numeric-only masking,
 * 10-digit max length, and numeric inputMode for mobile keyboards. Sized `sm` by default.
 */
export function RhfPhoneField<T extends FieldValues>({
    maxLength = FIELD_MAX_LENGTH.phone,
    placeholder = 'e.g. 9811234567',
    fieldType = 'phone',
    ...props
}: RhfPhoneFieldProps<T>) {
    return (
        <RhfTextField<T>
            {...props}
            type="tel"
            numericOnly
            maxLength={maxLength}
            placeholder={placeholder}
            fieldType={fieldType}
        />
    );
}
