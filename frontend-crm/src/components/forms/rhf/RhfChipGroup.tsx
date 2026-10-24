'use client';

import React from 'react';
import { Box, Chip, FormHelperText } from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import { useController, type FieldPath, type FieldValues } from 'react-hook-form';
import { FormField } from '../FormField';
import { useFormMode } from '@/context/FormModeContext';
import { ReadOnlyField } from '../ReadOnlyField';

export interface RhfChipGroupProps<T extends FieldValues> {
    name: FieldPath<T>;
    label: string;
    options: readonly string[];
    required?: boolean;
    hint?: React.ReactNode;
}

/** React Hook Form bound multi-select chip group (string[] field). */
export function RhfChipGroup<T extends FieldValues>({
    name,
    label,
    options,
    required,
    hint,
}: RhfChipGroupProps<T>) {
    const { field, fieldState } = useController<T>({ name });
    const selected: string[] = Array.isArray(field.value) ? field.value : [];

    const { mode } = useFormMode();
    if (mode === 'view') {
        return (
            <ReadOnlyField
                label={label}
                hideWhenEmpty
                value={
                    selected.length > 0 ? (
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                            {selected.map((option) => (
                                <Chip
                                    key={option}
                                    label={option}
                                    size="small"
                                    sx={{ fontSize: '0.74rem', fontWeight: 600, cursor: 'default', color: '#1d4ed8', backgroundColor: '#eff6ff' }}
                                />
                            ))}
                        </Box>
                    ) : undefined
                }
                sx={{ mb: 2 }}
            />
        );
    }

    const toggle = (option: string) =>
        field.onChange(
            selected.includes(option) ? selected.filter((o) => o !== option) : [...selected, option]
        );

    return (
        <FormField name={name} label={label} required={required} hint={hint}>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.8 }}>
                {options.map((option) => {
                    const active = selected.includes(option);
                    return (
                        <Chip
                            key={option}
                            label={option}
                            size="small"
                            onClick={() => toggle(option)}
                            icon={active ? <CheckIcon sx={{ fontSize: '14px !important' }} /> : undefined}
                            sx={{
                                fontSize: '0.74rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                backgroundColor: active ? '#dcfce7' : '#f1f5f9',
                                color: active ? '#166534' : '#475569',
                                border: `1px solid ${active ? '#86efac' : '#e2e8f0'}`,
                            }}
                        />
                    );
                })}
            </Box>
            {fieldState.error && <FormHelperText error>{fieldState.error.message}</FormHelperText>}
        </FormField>
    );
}
