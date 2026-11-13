'use client';

import React from 'react';
import { Box, FormHelperText, InputAdornment, TextField } from '@mui/material';
import CalendarTodayOutlinedIcon from '@mui/icons-material/CalendarTodayOutlined';
import { useController, type FieldPath, type FieldValues } from 'react-hook-form';
import { FormField, fieldSx } from '../FormField';
import { useFormMode } from '@/context/FormModeContext';
import { ReadOnlyField } from '../ReadOnlyField';
import type { FieldSize } from '../fieldSizing';
import { TimeSlotSelect } from '../TimeSlotSelect';
import { localNow, localToday } from '@/utils/pastDates';

export interface RhfDateTimeFieldProps<T extends FieldValues> {
    dateName: FieldPath<T>;
    timeName?: FieldPath<T>;
    label: string;
    required?: boolean;
    hint?: React.ReactNode;
    /**
     * Single `datetime-local` input bound to `dateName` (value `YYYY-MM-DDTHH:mm`) instead of a
     * separate date + free-text time pair. `timeName` is ignored.
     */
    combined?: boolean;
    /** Width token; defaults to `sm` for a date alone and `md` for date + time. */
    fieldSize?: FieldSize;
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
    combined = false,
    fieldSize,
}: RhfDateTimeFieldProps<T>) {
    const size = fieldSize ?? (combined || timeName ? 'md' : 'sm');
    const date = useController<T>({ name: dateName });
    // useController requires a name; fall back to the date name when no time field is configured.
    const time = useController<T>({ name: (timeName ?? dateName) as FieldPath<T> });
    const error = date.fieldState.error?.message ?? (timeName && !combined ? time.fieldState.error?.message : undefined);

    const { mode } = useFormMode();
    if (combined) {
        const raw = typeof date.field.value === 'string' ? date.field.value : '';
        if (mode === 'view') {
            const parsed = raw ? new Date(raw) : null;
            const text =
                parsed && !Number.isNaN(parsed.getTime())
                    ? parsed.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
                    : raw;
            return <ReadOnlyField label={label} value={text} hideWhenEmpty sx={{ mb: 2 }} />;
        }
        return (
            <FormField name={dateName} label={label} required={required} hint={hint} size={size}>
                <TextField
                    {...date.field}
                    value={raw}
                    type="datetime-local"
                    fullWidth
                    size="small"
                    error={Boolean(date.fieldState.error)}
                    slotProps={{
                        ...adornment(<CalendarTodayOutlinedIcon sx={{ fontSize: 16, color: '#64748b' }} />),
                        // Past dates and times are greyed out in the picker.
                        htmlInput: { min: localNow() },
                    }}
                    sx={fieldSx}
                />
                {error && <FormHelperText error>{error}</FormHelperText>}
            </FormField>
        );
    }

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
        <FormField name={dateName} label={label} required={required} hint={hint} size={size}>
            <Box sx={{ display: 'grid', gridTemplateColumns: timeName ? '1.4fr 1fr' : '1fr', gap: 1.5 }}>
                <TextField
                    {...date.field}
                    value={date.field.value ?? ''}
                    type="date"
                    fullWidth
                    size="small"
                    error={Boolean(date.fieldState.error)}
                    slotProps={{
                        ...adornment(<CalendarTodayOutlinedIcon sx={{ fontSize: 16, color: '#64748b' }} />),
                        // Past days are greyed out in the picker (the form also rejects a typed past date).
                        htmlInput: { min: localToday() },
                    }}
                    sx={fieldSx}
                />
                {timeName && (
                    <TimeSlotSelect
                        name={time.field.name}
                        value={typeof time.field.value === 'string' ? time.field.value : ''}
                        onChange={time.field.onChange}
                        onBlur={time.field.onBlur}
                        date={typeof date.field.value === 'string' ? date.field.value : ''}
                        error={Boolean(time.fieldState.error)}
                        ariaLabel={`${label} time`}
                    />
                )}
            </Box>
            {error && <FormHelperText error>{error}</FormHelperText>}
        </FormField>
    );
}
