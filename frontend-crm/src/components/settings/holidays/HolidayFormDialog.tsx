'use client';

import React, { useState } from 'react';
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField } from '@mui/material';
import { errorMessage, inputSx, primaryButtonSx, secondaryButtonSx } from '@/components/settings/form-customization/builderUi';
import { useCreateHoliday, useUpdateHoliday } from '@/hooks/queries/useHolidays';
import { HOLIDAY_STATUSES, HOLIDAY_TYPES, OCCASION_MAX_LENGTH, type Holiday, type HolidayFormData } from '@/types/holiday.types';
import { formatHolidayDate, holidayWeekday } from './holidayDisplay';

const EMPTY: HolidayFormData = { occasion: '', holidayDate: '', holidayType: 'Public', status: 'Active' };

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
        holiday ? { occasion: holiday.occasion, holidayDate: holiday.holidayDate, holidayType: holiday.holidayType, status: holiday.status } : EMPTY
    );
    const [touched, setTouched] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const create = useCreateHoliday();
    const update = useUpdateHoliday();
    const saving = create.isPending || update.isPending;

    const occasionError = touched && !values.occasion.trim() ? 'Occasion is required.' : '';
    const dateError = touched && !values.holidayDate ? 'Holiday Date is required.' : '';
    const set = <K extends keyof HolidayFormData>(key: K, value: HolidayFormData[K]) => setValues((v) => ({ ...v, [key]: value }));

    const save = async () => {
        setTouched(true);
        if (!values.occasion.trim() || !values.holidayDate) return;
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
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
                        <TextField select label="Holiday Type" size="small" value={values.holidayType} onChange={(e) => set('holidayType', e.target.value as HolidayFormData['holidayType'])} sx={inputSx}>
                            {HOLIDAY_TYPES.map((t) => (
                                <MenuItem key={t} value={t} sx={{ fontSize: '0.85rem' }}>
                                    {t}
                                </MenuItem>
                            ))}
                        </TextField>
                        <TextField select label="Status" size="small" value={values.status} onChange={(e) => set('status', e.target.value as HolidayFormData['status'])} sx={inputSx}>
                            {HOLIDAY_STATUSES.map((s) => (
                                <MenuItem key={s} value={s} sx={{ fontSize: '0.85rem' }}>
                                    {s}
                                </MenuItem>
                            ))}
                        </TextField>
                    </Box>
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
