'use client';

import React from 'react';
import { Box, Checkbox, FormControlLabel, FormHelperText, Typography } from '@mui/material';
import { useController, type FieldPath, type FieldValues } from 'react-hook-form';
import { useFormMode } from '@/context/FormModeContext';
import { useFieldOverride } from '@/context/FormConfigContext';
import { ReadOnlyField } from '../ReadOnlyField';

export interface RhfCheckboxProps<T extends FieldValues> {
    name: FieldPath<T>;
    label: string;
    /** In a FormGrid row of inputs: drop the box onto the inputs' line (below their labels) from `sm` up. */
    alignWithInputs?: boolean;
}

/**
 * React Hook Form bound boolean checkbox. Inside a module form it follows the form builder (label, visibility) and
 * is a grid cell like any other field, so it can be ordered and moved between sections.
 */
export function RhfCheckbox<T extends FieldValues>({ name, label: baseLabel, alignWithInputs = false }: RhfCheckboxProps<T>) {
    const { field, fieldState } = useController<T>({ name });
    const { mode } = useFormMode();
    const override = useFieldOverride(name, { label: baseLabel });
    const label = override?.label ?? baseLabel;
    if (override?.hidden) return null;
    if (mode === 'view') {
        return <ReadOnlyField label={label} value={field.value ? 'Yes' : undefined} hideWhenEmpty sx={{ mb: 1 }} />;
    }

    return (
        <Box data-field={name} sx={{ mb: 1, minWidth: 0, pt: alignWithInputs ? { xs: 0, sm: 3.25 } : 0 }}>
            <FormControlLabel
                sx={{ m: 0 }}
                control={
                    <Checkbox
                        size="small"
                        checked={Boolean(field.value)}
                        onChange={(e) => field.onChange(e.target.checked)}
                        onBlur={field.onBlur}
                        slotProps={{ input: { ref: field.ref } }}
                        sx={{ p: 0.5 }}
                    />
                }
                label={
                    <Typography sx={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--crm-gray-700)' }}>
                        {label}
                    </Typography>
                }
            />
            {fieldState.error && <FormHelperText error>{fieldState.error.message}</FormHelperText>}
        </Box>
    );
}
