'use client';

import React, { useState } from 'react';
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Switch, TextField } from '@mui/material';
import { errorMessage, inputSx, primaryButtonSx, secondaryButtonSx } from '@/components/settings/form-customization/builderUi';
import { useCreateHoliday, useUpdateHoliday } from '@/hooks/queries/useHolidays';
import { HOLIDAY_STATUSES, OCCASION_MAX_LENGTH, type Holiday, type HolidayFormData } from '@/types/holiday.types';
import { MONTH_NAMES, daysInMonth, formatHolidayDate, holidayWeekday } from './holidayDisplay';

const EMPTY: HolidayFormData = { occasion: '', holidayDate: '', repeatsYearly: false, status: 'Active' };
const pad = (n: number) => String(n).padStart(2, '0');

/** Switching a full date to a yearly day keeps its day and month; switching back puts it in the current year. */
function switchRepeat(values: HolidayFormData, repeatsYearly: boolean): HolidayFormData {
    const { holidayDate } = values;
    if (repeatsYearly) return { ...values, repeatsYearly, holidayDate: /^\d{4}-\d{2}-\d{2}$/.test(holidayDate) ? holidayDate.slice(5) : holidayDate };
    const full = /^\d{2}-\d{2}$/.test(holidayDate) ? `${new Date().getFullYear()}-${holidayDate}` : holidayDate;
    // 29 Feb has no place in a year without it: leave the date for the admin to pick.
    const valid = /^\d{4}-\d{2}-\d{2}$/.test(full) && new Date(`${full}T12:00:00Z`).toISOString().slice(0, 10) === full;
    return { ...values, repeatsYearly, holidayDate: valid ? full : '' };
}

export interface HolidayFormDialogProps {
    open: boolean;
    /** The holiday being edited; null adds a new one. */
    holiday: Holiday | null;
    onClose: () => void;
    onSaved: (holiday: Holiday, created: boolean) => void;
}

/** Mounts a fresh form each time it opens. */
export function HolidayFormDialog(props: HolidayFormDialogProps) {
    return props.open ? <HolidayForm {...props} /> : null;
}

function HolidayForm({ open, holiday, onClose, onSaved }: HolidayFormDialogProps) {
    const [values, setValues] = useState<HolidayFormData>(() =>
        holiday ? { occasion: holiday.occasion, holidayDate: holiday.holidayDate, repeatsYearly: holiday.repeatsYearly, status: holiday.status } : EMPTY
    );
    const [touched, setTouched] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const create = useCreateHoliday();
    const update = useUpdateHoliday();
    const saving = create.isPending || update.isPending;

    const occasionError = touched && !values.occasion.trim() ? 'Occasion is required.' : '';
    // A yearly holiday's date is `MM-DD`, built from the Month and Day pickers (either may still be blank: `-05`, `08-`).
    const [month = '', day = ''] = values.repeatsYearly ? values.holidayDate.split('-') : [];
    const dateComplete = values.repeatsYearly ? Boolean(month && day) : Boolean(values.holidayDate);
    const dateError = touched && !dateComplete ? (values.repeatsYearly ? 'Pick the day and month.' : 'Holiday Date is required.') : '';
    const setMonthDay = (nextMonth: string, nextDay: string) => {
        // Keep the day inside the month (31 Jan → Feb becomes 29 Feb).
        const max = nextMonth ? daysInMonth(Number(nextMonth)) : 31;
        const clamped = nextDay && Number(nextDay) > max ? pad(max) : nextDay;
        set('holidayDate', nextMonth || clamped ? `${nextMonth}-${clamped}` : '');
    };
    const set = <K extends keyof HolidayFormData>(key: K, value: HolidayFormData[K]) => setValues((v) => ({ ...v, [key]: value }));

    const save = async () => {
        setTouched(true);
        if (!values.occasion.trim() || !dateComplete) return;
        setError(null);
        try {
            const payload = { ...values, occasion: values.occasion.trim() };
            const saved = holiday ? await update.mutateAsync({ id: holiday.id, data: payload }) : await create.mutateAsync(payload);
            onSaved(saved, !holiday);
        } catch (err) {
            setError(errorMessage(err, 'Could not save the holiday.'));
        }
    };

    return (
        <Dialog
            open={open}
            onClose={saving ? undefined : onClose}
            fullWidth
            maxWidth="xs"
            slotProps={{ paper: { sx: { borderRadius: '12px', m: { xs: 1.5, sm: 4 }, width: { xs: 'calc(100% - 24px)', sm: undefined } } } }}
        >
            <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', color: 'var(--crm-slate-900)' }}>{holiday ? 'Edit Holiday' : 'Add Holiday'}</DialogTitle>
            <DialogContent>
                <Box
                    component="form"
                    noValidate
                    onSubmit={(e) => {
                        e.preventDefault();
                        void save();
                    }}
                    sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}
                >
                    <TextField
                        label="Occasion"
                        required
                        size="small"
                        autoFocus
                        value={values.occasion}
                        onChange={(e) => set('occasion', e.target.value)}
                        error={Boolean(occasionError)}
                        helperText={occasionError || 'e.g. Independence Day, Diwali'}
                        sx={inputSx}
                        slotProps={{ htmlInput: { maxLength: OCCASION_MAX_LENGTH } }}
                    />
                    <FormControlLabel
                        control={<Switch size="small" checked={values.repeatsYearly} onChange={(e) => setValues((v) => switchRepeat(v, e.target.checked))} />}
                        label="Repeats every year"
                        sx={{ mx: 0, gap: 1, minHeight: 32, '& .MuiFormControlLabel-label': { fontSize: '0.85rem', color: 'var(--crm-slate-900)' } }}
                    />
                    {values.repeatsYearly ? (
                        <Box>
                            <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.6fr)', gap: 2 }}>
                                <TextField
                                    select
                                    label="Day"
                                    required
                                    size="small"
                                    value={day ? Number(day) : ''}
                                    onChange={(e) => setMonthDay(month, pad(Number(e.target.value)))}
                                    error={Boolean(dateError) && !day}
                                    sx={inputSx}
                                    slotProps={{ select: { MenuProps: { slotProps: { paper: { sx: { maxHeight: 280 } } } } } }}
                                >
                                    {Array.from({ length: month ? daysInMonth(Number(month)) : 31 }, (_, i) => i + 1).map((d) => (
                                        <MenuItem key={d} value={d} sx={{ fontSize: '0.85rem' }}>
                                            {d}
                                        </MenuItem>
                                    ))}
                                </TextField>
                                <TextField
                                    select
                                    label="Month"
                                    required
                                    size="small"
                                    value={month ? Number(month) : ''}
                                    onChange={(e) => setMonthDay(pad(Number(e.target.value)), day)}
                                    error={Boolean(dateError) && !month}
                                    sx={inputSx}
                                    slotProps={{ select: { MenuProps: { slotProps: { paper: { sx: { maxHeight: 280 } } } } } }}
                                >
                                    {MONTH_NAMES.map((name, i) => (
                                        <MenuItem key={name} value={i + 1} sx={{ fontSize: '0.85rem' }}>
                                            {name}
                                        </MenuItem>
                                    ))}
                                </TextField>
                            </Box>
                            <Box
                                component="p"
                                sx={{ m: 0, mt: 0.5, mx: 1.75, fontSize: '0.75rem', lineHeight: 1.66, color: dateError ? 'var(--mui-palette-error-main)' : 'var(--mui-palette-text-secondary)' }}
                            >
                                {dateError ||
                                    (values.holidayDate === '02-29'
                                        ? 'Shows on the calendar every year; on 28 Feb in years without 29 Feb.'
                                        : 'Shows on the calendar on this day every year.')}
                            </Box>
                        </Box>
                    ) : (
                        <TextField
                            label="Holiday Date"
                            required
                            size="small"
                            type="date"
                            value={values.holidayDate}
                            onChange={(e) => set('holidayDate', e.target.value)}
                            error={Boolean(dateError)}
                            helperText={dateError || (values.holidayDate ? `${holidayWeekday(values.holidayDate)}, ${formatHolidayDate(values.holidayDate)}` : ' ')}
                            sx={inputSx}
                            slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: '2000-01-01', max: '2100-12-31' } }}
                        />
                    )}
                    <TextField select label="Status" size="small" value={values.status} onChange={(e) => set('status', e.target.value as HolidayFormData['status'])} sx={inputSx}>
                        {HOLIDAY_STATUSES.map((s) => (
                            <MenuItem key={s} value={s} sx={{ fontSize: '0.85rem' }}>
                                {s}
                            </MenuItem>
                        ))}
                    </TextField>
                    {error && (
                        <Alert severity="error" sx={{ fontSize: '0.8rem' }}>
                            {error}
                        </Alert>
                    )}
                    {/* Enter in a field submits. */}
                    <button type="submit" hidden aria-hidden tabIndex={-1} />
                </Box>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button variant="outlined" sx={secondaryButtonSx} onClick={onClose} disabled={saving}>
                    Cancel
                </Button>
                <Button
                    variant="contained"
                    sx={primaryButtonSx}
                    onClick={() => void save()}
                    disabled={saving}
                    startIcon={saving ? <CircularProgress size={14} color="inherit" /> : undefined}
                >
                    {holiday ? 'Save' : 'Add Holiday'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
