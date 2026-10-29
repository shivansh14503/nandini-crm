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
 * text input to uppercase as the user types (PAN, GST, IFSC, codes). Sized `sm` by default; known identifiers
 * (GSTIN 15, PAN 10, TAN 10, IFSC 11, CIN 21) get their exact `maxLength` from the field name.
 */
export function RhfUppercaseField<T extends FieldValues>({
    maxLength,
    fieldType = 'identifier',
    ...props
}: RhfUppercaseFieldProps<T>) {
    return (
        <RhfTextField<T>
            {...props}
            uppercase
            maxLength={maxLength}
            fieldType={fieldType}
        />
    );
}
