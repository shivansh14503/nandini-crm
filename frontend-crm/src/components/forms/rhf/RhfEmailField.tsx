'use client';

import React from 'react';
import type { FieldValues } from 'react-hook-form';
import { RhfTextField, type RhfTextFieldProps } from './RhfTextField';
import { FIELD_MAX_LENGTH } from '../fieldSizing';

export type RhfEmailFieldProps<T extends FieldValues> = RhfTextFieldProps<T>;

/**
 * Specialized Email input component that enforces type="email",
 * automatically lowercases and trims whitespace as the user types. Sized `md`, 120 chars by default.
 */
export function RhfEmailField<T extends FieldValues>({
    placeholder = 'name@company.com',
    maxLength = FIELD_MAX_LENGTH.email,
    fieldType = 'email',
    ...props
}: RhfEmailFieldProps<T>) {
    return (
        <RhfTextField<T>
            {...props}
            type="email"
            lowercase
            placeholder={placeholder}
            maxLength={maxLength}
            fieldType={fieldType}
        />
    );
}
