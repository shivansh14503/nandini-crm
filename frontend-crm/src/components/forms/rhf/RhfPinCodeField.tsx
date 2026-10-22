'use client';

import React from 'react';
import type { FieldValues } from 'react-hook-form';
import { RhfTextField, type RhfTextFieldProps } from './RhfTextField';

export type RhfPinCodeFieldProps<T extends FieldValues> = Omit<
    RhfTextFieldProps<T>,
    'numericOnly'
>;

/**
 * Specialized Postal PIN code input component that enforces numeric-only masking,
 * 6-digit max length, and numeric inputMode.
 */
export function RhfPinCodeField<T extends FieldValues>({
    maxLength = 6,
    placeholder = 'e.g. 110001',
    label = 'Postal Code (PIN)',
    ...props
}: RhfPinCodeFieldProps<T>) {
    return (
        <RhfTextField<T>
            {...props}
            label={label}
            type="tel"
            numericOnly
            maxLength={maxLength}
            placeholder={placeholder}
        />
    );
}
