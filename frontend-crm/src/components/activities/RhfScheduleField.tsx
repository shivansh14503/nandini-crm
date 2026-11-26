'use client';

import React from 'react';
import { Box, FormHelperText, TextField } from '@mui/material';
import { useController, useWatch, type FieldPath, type FieldValues } from 'react-hook-form';
import { FormField, fieldSx } from '@/components/forms/FormField';
import { DATE_TIME_COLUMNS, TimePicker } from '@/components/forms/TimePicker';
import { useFormMode } from '@/context/FormModeContext';
import { formatFormValue } from './activityTime';
import { HolidayNotice } from './HolidayNotice';

export interface RhfScheduleFieldProps<T extends FieldValues> {
    /** `startAt` / `endAt`: the Form Builder field, in both modes. */
    name: FieldPath<T>;
    label: string;
    required?: boolean;
    hint?: React.ReactNode;
    /** All-day: the value is a day (`YYYY-MM-DD`) and the time part is hidden. */
    allDay: boolean;
    /** The business wall clock now (`YYYY-MM-DDTHH:mm`): days before it and times before it today are greyed out. */
    now: string;
    /** Past values can be picked (Completed / Cancelled activities record what already happened). */
    allowPast?: boolean;
    /** Time filled in when only a day is picked (timed mode). */
    defaultTime?: (day: string) => string;
    /** Called after the user changes the value, with the new value and the one it replaced. */
    onValueChange?: (next: string, previous: string) => void;
    /**
     * The field whose day this one usually shares (End passes `startAt`): the holiday note is left to that field
     * when both fall on the same day, so it isn't shown twice.
     */
    sameDayAs?: FieldPath<T>;
}

/**
 * Start / End of an activity in the business timezone: a date plus a time (`YYYY-MM-DDTHH:mm`), or the day alone
 * when All Day is on. The pickers read the business clock, not the device's, so "today" is the business day.
 * A day that is a company holiday (Admin › Holidays) gets an amber note; it can still be picked.
 */
export function RhfScheduleField<T extends FieldValues>({
    name,
    label,
    required,
    hint,
    allDay,
    now,
    allowPast = false,
    defaultTime = () => '09:00',
    onValueChange,
    sameDayAs,
}: RhfScheduleFieldProps<T>) {
    const { field, fieldState } = useController<T>({ name });
    const { mode } = useFormMode();
    const raw = typeof field.value === 'string' ? field.value : '';
    const other = useWatch<T>({ name: (sameDayAs ?? name) as FieldPath<T> });

    if (mode === 'view') {
        return (
            <FormField name={name} label={label} viewValue={raw ? formatFormValue(raw) : undefined}>
                {null}
            </FormField>
        );
    }

    const set = (next: string) => {
        if (next === raw) return;
        field.onChange(next);
        onValueChange?.(next, raw);
    };
    const datePart = /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : '';
    const timePart = /^\d{2}:\d{2}$/.test(raw.slice(11, 16)) ? raw.slice(11, 16) : '';
    const today = now.slice(0, 10);
    const error = fieldState.error?.message;
    const otherDay = sameDayAs && typeof other === 'string' ? other.slice(0, 10) : '';
    const holidayDay = datePart && datePart !== otherDay ? datePart : '';

    const dateInput = (
        <TextField
            name={field.name}
            inputRef={field.ref}
            onBlur={field.onBlur}
            value={datePart}
            onChange={(e) => {
                const day = e.target.value;
                if (allDay) set(day);
                else set(day ? `${day}T${timePart || defaultTime(day)}` : '');
            }}
            type="date"
            fullWidth
            size="small"
            error={Boolean(error)}
            slotProps={{ htmlInput: { min: allowPast ? undefined : today, 'aria-label': allDay ? label : `${label} date` } }}
            sx={fieldSx}
        />
    );

    return (
        <FormField name={name} label={label} required={required} hint={hint} size={allDay ? 'sm' : 'md'} fit={null}>
            {allDay ? (
                dateInput
            ) : (
                <Box sx={{ display: 'grid', gridTemplateColumns: DATE_TIME_COLUMNS, gap: 1, minWidth: 0 }}>
                    {dateInput}
                    <TimePicker
                        value={timePart}
                        valueFormat="24h"
                        onChange={(t) => set(t ? `${datePart || today}T${t}` : datePart)}
                        onBlur={field.onBlur}
                        date={datePart}
                        now={allowPast ? null : now}
                        error={Boolean(error)}
                        ariaLabel={`${label} time`}
                    />
                </Box>
            )}
            {error && <FormHelperText error>{error}</FormHelperText>}
            {holidayDay && <HolidayNotice day={holidayDay} />}
        </FormField>
    );
}
