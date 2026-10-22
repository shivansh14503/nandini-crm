'use client';

import React from 'react';
import type { FieldValues } from 'react-hook-form';
import { RhfTextField, type RhfTextFieldProps } from './RhfTextField';

export type RhfUppercaseFieldProps<T extends FieldValues> = Omit<
    RhfTextFieldProps<T>,
    'uppercase'
>;

/**
 * Specialized Uppercase input component that automatically transforms
 * text input to uppercase as the user types (PAN, GST, IFSC, codes).
 */
export function RhfUppercaseField<T extends FieldValues>({
    maxLength,
    ...props
}: RhfUppercaseFieldProps<T>) {
    return (
        <RhfTextField<T>
            {...props}
            uppercase
            maxLength={maxLength}
        />
    );
}
