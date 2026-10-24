'use client';

import React from 'react';
import { Checkbox, FormControlLabel, FormHelperText, Typography } from '@mui/material';
import { useController, type FieldPath, type FieldValues } from 'react-hook-form';
import { useFormMode } from '@/context/FormModeContext';
import { ReadOnlyField } from '../ReadOnlyField';

export interface RhfCheckboxProps<T extends FieldValues> {
    name: FieldPath<T>;
    label: string;
}

/** React Hook Form bound boolean checkbox. */
export function RhfCheckbox<T extends FieldValues>({ name, label }: RhfCheckboxProps<T>) {
    const { field, fieldState } = useController<T>({ name });
    const { mode } = useFormMode();
    if (mode === 'view') {
        return <ReadOnlyField label={label} value={field.value ? 'Yes' : undefined} hideWhenEmpty sx={{ mb: 1 }} />;
    }

    return (
        <>
            <FormControlLabel
                sx={{ m: 0, mb: 1 }}
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
                    <Typography sx={{ fontSize: '0.84rem', fontWeight: 600, color: '#374151' }}>
                        {label}
                    </Typography>
                }
            />
            {fieldState.error && <FormHelperText error>{fieldState.error.message}</FormHelperText>}
        </>
    );
}
