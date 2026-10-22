'use client';

import React from 'react';
import type { FieldValues } from 'react-hook-form';
import { RhfTextField, type RhfTextFieldProps } from './RhfTextField';

export type RhfEmailFieldProps<T extends FieldValues> = RhfTextFieldProps<T>;

/**
 * Specialized Email input component that enforces type="email",
 * automatically lowercases and trims whitespace as the user types.
 */
export function RhfEmailField<T extends FieldValues>({
    placeholder = 'name@company.com',
    ...props
}: RhfEmailFieldProps<T>) {
    return (
        <RhfTextField<T>
            {...props}
            type="email"
            lowercase
            placeholder={placeholder}
        />
    );
}
