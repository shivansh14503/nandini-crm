'use client';

import React from 'react';
import { Box, FormHelperText, TextField } from '@mui/material';
import { useController, type FieldPath, type FieldValues } from 'react-hook-form';
import { FormField, fieldSx } from '../FormField';
import { useFormMode } from '@/context/FormModeContext';
import type { FieldSize } from '../fieldSizing';
import { DATE_TIME_COLUMNS, TimePicker } from '../TimePicker';
import { localNow, localToday } from '@/utils/pastDates';
import { fmtDay, fmtTime, fmtWallClock, getDisplayFormats, useDisplayFormats } from '@/utils/formats';

const pad = (n: number) => String(n).padStart(2, '0');

/** Time filled in when only a date is picked: 09:00, or (today) the next quarter hour from now. */
function defaultTimeFor(day: string): string {
    const now = localNow();
    if (day !== now.slice(0, 10)) return '09:00';
    const mins = Math.min(23 * 60 + 45, Math.ceil((Number(now.slice(11, 13)) * 60 + Number(now.slice(14, 16)) + 1) / 15) * 15);
    return `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;
}

export interface RhfDateTimeFieldProps<T extends FieldValues> {
    dateName: FieldPath<T>;
    timeName?: FieldPath<T>;
    label: string;
    required?: boolean;
    hint?: React.ReactNode;
    /**
     * Date + time pickers bound to the single `dateName` value (`YYYY-MM-DDTHH:mm`) instead of a
     * separate date + time pair. `timeName` is ignored.
     */
    combined?: boolean;
    /** Width token; defaults to `sm` for a date alone and `md` for date + time. */
    fieldSize?: FieldSize;
    /** Shows the value without letting it change (separate date + time only). */
    disabled?: boolean;
}

/** Paired date + optional time input bound to two RHF fields. */
export function RhfDateTimeField<T extends FieldValues>({
    dateName,
    timeName,
    label,
    required,
    hint,
    combined = false,
    fieldSize,
    disabled = false,
}: RhfDateTimeFieldProps<T>) {
    const size = fieldSize ?? (combined || timeName ? 'md' : 'sm');
    const date = useController<T>({ name: dateName });
    // useController requires a name; fall back to the date name when no time field is configured.
    const time = useController<T>({ name: (timeName ?? dateName) as FieldPath<T> });
    const error = date.fieldState.error?.message ?? (timeName && !combined ? time.fieldState.error?.message : undefined);

    const { mode } = useFormMode();
    // View text is built here, so re-render when the company formats change.
    useDisplayFormats();
    if (combined) {
        const raw = typeof date.field.value === 'string' ? date.field.value : '';
        if (mode === 'view') {
            // `25 Nov 2026, 1:07 pm` until the company formats are saved; anything that isn't a wall clock shows as stored.
            const text = fmtWallClock(raw, { legacyDate: 'DD MMM YYYY', legacyTime: 'h:mm a' });
            // Through FormField so the form builder's label / hidden overrides apply on the view page too.
            return <FormField name={dateName} label={label} viewValue={text}>{null}</FormField>;
        }
        // Date + time pickers side by side, both writing the one `YYYY-MM-DDTHH:mm` value.
        const datePart = /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : '';
        const timePart = /^\d{2}:\d{2}$/.test(raw.slice(11, 16)) ? raw.slice(11, 16) : '';
        const setDate = (d: string) => date.field.onChange(d ? `${d}T${timePart || defaultTimeFor(d)}` : '');
        const setTime = (t: string) => date.field.onChange(t ? `${datePart || localToday()}T${t}` : datePart);
        return (
            <FormField name={dateName} label={label} required={required} hint={hint} size={size}>
                <Box sx={{ display: 'grid', gridTemplateColumns: DATE_TIME_COLUMNS, gap: 1 }}>
                    <TextField
                        name={date.field.name}
                        inputRef={date.field.ref}
                        onBlur={date.field.onBlur}
                        value={datePart}
                        onChange={(e) => setDate(e.target.value)}
                        type="date"
                        fullWidth
                        size="small"
                        error={Boolean(date.fieldState.error)}
                        slotProps={{
                            // Past days are greyed out in the picker (the form also rejects a past date-time).
                            htmlInput: { min: localToday(), 'aria-label': `${label} date` },
                        }}
                        sx={fieldSx}
                    />
                    <TimePicker
                        value={timePart}
                        valueFormat="24h"
                        onChange={setTime}
                        onBlur={date.field.onBlur}
                        date={datePart}
                        error={Boolean(date.fieldState.error)}
                        ariaLabel={`${label} time`}
                    />
                </Box>
                {error && <FormHelperText error>{error}</FormHelperText>}
            </FormField>
        );
    }

    if (mode === 'view') {
        const rawDate = typeof date.field.value === 'string' ? date.field.value : '';
        const dateText = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? fmtDay(rawDate, { legacy: 'DD MMM YYYY' }) : rawDate;
        // The stored time text (`04:15 PM`) shows as stored until the company formats are saved.
        const rawTime = timeName && typeof time.field.value === 'string' ? time.field.value : '';
        const timeText = rawTime && getDisplayFormats().customized ? fmtTime(rawTime) : rawTime;
        return <FormField name={dateName} label={label} viewValue={[dateText, timeText].filter(Boolean).join(' • ')}>{null}</FormField>;
    }

    return (
        <FormField name={dateName} label={label} required={required} hint={hint} size={size}>
            <Box sx={{ display: 'grid', gridTemplateColumns: timeName ? DATE_TIME_COLUMNS : '1fr', gap: 1 }}>
                <TextField
                    {...date.field}
                    value={date.field.value ?? ''}
                    type="date"
                    fullWidth
                    size="small"
                    disabled={disabled}
                    error={Boolean(date.fieldState.error)}
                    slotProps={{
                        // Past days are greyed out in the picker (the form also rejects a typed past date).
                        htmlInput: { min: localToday() },
                    }}
                    sx={fieldSx}
                />
                {timeName && (
                    <TimePicker
                        name={time.field.name}
                        value={typeof time.field.value === 'string' ? time.field.value : ''}
                        onChange={time.field.onChange}
                        onBlur={time.field.onBlur}
                        date={typeof date.field.value === 'string' ? date.field.value : ''}
                        error={Boolean(time.fieldState.error)}
                        ariaLabel={`${label} time`}
                        disabled={disabled}
                    />
                )}
            </Box>
            {error && <FormHelperText error>{error}</FormHelperText>}
        </FormField>
    );
}
