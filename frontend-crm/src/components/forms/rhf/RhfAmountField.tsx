'use client';

import React from 'react';
import type { FieldValues } from 'react-hook-form';
import { RhfTextField, type RhfTextFieldProps } from './RhfTextField';

export type RhfAmountFieldProps<T extends FieldValues> = Omit<
    RhfTextFieldProps<T>,
    'type'
>;

/**
 * Specialized Amount input component that enforces non-negative numerical inputs (min=0).
 */
export function RhfAmountField<T extends FieldValues>({
    min = 0,
    step = 'any',
    placeholder = '0.00',
    ...props
}: RhfAmountFieldProps<T>) {
    return (
        <RhfTextField<T>
            {...props}
            type="number"
            min={min}
            step={step}
            placeholder={placeholder}
        />
    );
}
