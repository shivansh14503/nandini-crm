'use client';

import React from 'react';
import type { FieldValues } from 'react-hook-form';
import { RhfTextField, type RhfTextFieldProps } from './RhfTextField';

export type RhfPercentageFieldProps<T extends FieldValues> = Omit<
    RhfTextFieldProps<T>,
    'type'
>;

/**
 * Specialized Percentage input component that enforces numeric inputs between 0 and 100.
 * Automatically clamps inputs exceeding 100 or below 0. Sized `xs` by default.
 */
export function RhfPercentageField<T extends FieldValues>({
    min = 0,
    max = 100,
    step = 'any',
    placeholder = '0',
    fieldType = 'percentage',
    ...props
}: RhfPercentageFieldProps<T>) {
    return (
        <RhfTextField<T>
            {...props}
            type="number"
            fieldType={fieldType}
            min={min}
            max={max}
            step={step}
            placeholder={placeholder}
        />
    );
}
