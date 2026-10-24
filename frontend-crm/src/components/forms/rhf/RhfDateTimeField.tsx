'use client';

import React from 'react';
import { Box, FormHelperText, InputAdornment, TextField } from '@mui/material';
import CalendarTodayOutlinedIcon from '@mui/icons-material/CalendarTodayOutlined';
import AccessTimeOutlinedIcon from '@mui/icons-material/AccessTimeOutlined';
import { useController, type FieldPath, type FieldValues } from 'react-hook-form';
import { FormField, fieldSx } from '../FormField';
import { useFormMode } from '@/context/FormModeContext';
import { ReadOnlyField } from '../ReadOnlyField';

export interface RhfDateTimeFieldProps<T extends FieldValues> {
    dateName: FieldPath<T>;
    timeName?: FieldPath<T>;
    label: string;
    required?: boolean;
    hint?: React.ReactNode;
}

const adornment = (icon: React.ReactNode) => ({
    input: { startAdornment: <InputAdornment position="start">{icon}</InputAdornment> },
});

/** Paired date + optional time input bound to two RHF fields. */
export function RhfDateTimeField<T extends FieldValues>({
    dateName,
    timeName,
    label,
    required,
    hint,
}: RhfDateTimeFieldProps<T>) {
    const date = useController<T>({ name: dateName });
    // useController requires a name; fall back to the date name when no time field is configured.
    const time = useController<T>({ name: (timeName ?? dateName) as FieldPath<T> });
    const error = date.fieldState.error?.message ?? (timeName ? time.fieldState.error?.message : undefined);

    const { mode } = useFormMode();
    if (mode === 'view') {
        const rawDate = typeof date.field.value === 'string' ? date.field.value : '';
        const parsed = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? new Date(`${rawDate}T00:00:00`) : null;
        const dateText = parsed
            ? parsed.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
            : rawDate;
        const timeText = timeName && typeof time.field.value === 'string' ? time.field.value : '';
        return <ReadOnlyField label={label} value={[dateText, timeText].filter(Boolean).join(' • ')} hideWhenEmpty sx={{ mb: 2 }} />;
    }

    return (
        <FormField name={dateName} label={label} required={required} hint={hint}>
            <Box sx={{ display: 'grid', gridTemplateColumns: timeName ? '1.4fr 1fr' : '1fr', gap: 1.5 }}>
                <TextField
                    {...date.field}
                    value={date.field.value ?? ''}
                    type="date"
                    fullWidth
                    size="small"
                    error={Boolean(date.fieldState.error)}
                    slotProps={adornment(<CalendarTodayOutlinedIcon sx={{ fontSize: 16, color: '#64748b' }} />)}
                    sx={fieldSx}
                />
                {timeName && (
                    <TextField
                        {...time.field}
                        value={time.field.value ?? ''}
                        fullWidth
                        size="small"
                        placeholder="e.g. 11:30 AM"
                        error={Boolean(time.fieldState.error)}
                        slotProps={adornment(<AccessTimeOutlinedIcon sx={{ fontSize: 16, color: '#64748b' }} />)}
                        sx={fieldSx}
                    />
                )}
            </Box>
            {error && <FormHelperText error>{error}</FormHelperText>}
        </FormField>
    );
}
