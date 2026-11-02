'use client';

import React from 'react';
import { Box, Chip, FormHelperText, Tooltip } from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import { useController, type FieldPath, type FieldValues } from 'react-hook-form';
import { FormField } from '../FormField';
import { useFormMode } from '@/context/FormModeContext';
import { useFieldOverride } from '@/context/FormConfigContext';
import { ReadOnlyField } from '../ReadOnlyField';

export interface RhfChipGroupProps<T extends FieldValues> {
    name: FieldPath<T>;
    label: string;
    options: readonly string[];
    /** Display labels for values whose label differs from the stored value. */
    optionLabels?: Record<string, string>;
    required?: boolean;
    hint?: React.ReactNode;
}

/**
 * React Hook Form bound multi-select chip group (string[] field). Inside a FormConfigProvider the options come
 * from the admin-configured dropdown. Saved values that are no longer offered (archived options) still render,
 * flagged as archived, so they stay visible and can be deselected.
 */
export function RhfChipGroup<T extends FieldValues>({
    name,
    label: baseLabel,
    options: baseOptions,
    optionLabels: baseOptionLabels,
    required,
    hint,
}: RhfChipGroupProps<T>) {
    const { field, fieldState } = useController<T>({ name });
    const selected: string[] = Array.isArray(field.value) ? field.value : [];
    const override = useFieldOverride(name, { label: baseLabel, options: baseOptions, required, hint });
    const label = override?.label ?? baseLabel;
    const options = override?.options ?? baseOptions;
    const optionLabels = override?.optionLabels ?? baseOptionLabels;
    const display = (v: string) => optionLabels?.[v] ?? v;
    const archived = selected.filter((v) => !options.includes(v));
    const allOptions = [...options, ...archived];

    const { mode } = useFormMode();
    if (override?.hidden) return null;
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
                                    label={display(option)}
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
        <FormField name={name} label={baseLabel} required={required} hint={hint} size="full">
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.8 }}>
                {allOptions.map((option) => {
                    const active = selected.includes(option);
                    const isArchived = archived.includes(option);
                    const chip = (
                        <Chip
                            key={option}
                            label={isArchived ? `${display(option)} (archived)` : display(option)}
                            size="small"
                            onClick={() => toggle(option)}
                            icon={active ? <CheckIcon sx={{ fontSize: '14px !important' }} /> : undefined}
                            sx={{
                                fontSize: '0.74rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                backgroundColor: isArchived ? '#fef3c7' : active ? '#dcfce7' : '#f1f5f9',
                                color: isArchived ? '#b45309' : active ? '#166534' : '#475569',
                                border: `1px ${isArchived ? 'dashed' : 'solid'} ${isArchived ? '#fde68a' : active ? '#86efac' : '#e2e8f0'}`,
                            }}
                        />
                    );
                    return isArchived ? (
                        <Tooltip key={option} title="No longer offered for new records. Click to remove it from this record." arrow>
                            {chip}
                        </Tooltip>
                    ) : (
                        chip
                    );
                })}
            </Box>
            {fieldState.error && <FormHelperText error>{fieldState.error.message}</FormHelperText>}
        </FormField>
    );
}
