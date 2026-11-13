'use client';

import React, { useMemo } from 'react';
import { Box, FormControl, InputAdornment, MenuItem, Select } from '@mui/material';
import AccessTimeOutlinedIcon from '@mui/icons-material/AccessTimeOutlined';
import { isTimeOptionPast, localNow } from '@/utils/pastDates';
import { fieldSx } from './FormField';

const pad = (n: number) => String(n).padStart(2, '0');

/** `09:30 AM`-style labels every 30 minutes of the day (the format follow-up times are stored in). */
export const TIME_SLOTS: string[] = Array.from({ length: 48 }, (_, i) => {
    const hours = Math.floor(i / 2);
    const minutes = (i % 2) * 30;
    const h12 = hours % 12 === 0 ? 12 : hours % 12;
    return `${pad(h12)}:${pad(minutes)} ${hours < 12 ? 'AM' : 'PM'}`;
});

/** First slot shown when the menu opens with nothing selected: the start of the working day. */
const DEFAULT_SCROLL_SLOT = '09:00 AM';

export interface TimeSlotSelectProps {
    value: string;
    onChange: (value: string) => void;
    /** The date the time belongs to (`YYYY-MM-DD`): on today, slots that have passed are disabled. */
    date?: string | null;
    error?: boolean;
    ariaLabel?: string;
    onBlur?: () => void;
    name?: string;
}

/**
 * Time-of-day picker: pick a 30-minute slot instead of typing. Slots earlier than now are disabled when the date
 * is today. A stored value that isn't a slot (older free-text entries) stays selectable so records keep it.
 */
export function TimeSlotSelect({ value, onChange, date, error, ariaLabel = 'Time', onBlur, name }: TimeSlotSelectProps) {
    const now = localNow();
    const options = useMemo(() => (value && !TIME_SLOTS.includes(value) ? [value, ...TIME_SLOTS] : TIME_SLOTS), [value]);

    return (
        <FormControl size="small" fullWidth sx={fieldSx} error={error}>
            <Select
                name={name}
                value={value || ''}
                displayEmpty
                onBlur={onBlur}
                onChange={(e) => onChange(String(e.target.value))}
                renderValue={(v) => (v ? String(v) : <Box component="span" sx={{ color: '#9ca3af' }}>Select time</Box>)}
                inputProps={{ 'aria-label': ariaLabel }}
                startAdornment={
                    <InputAdornment position="start">
                        <AccessTimeOutlinedIcon sx={{ fontSize: 16, color: '#64748b' }} />
                    </InputAdornment>
                }
                MenuProps={{
                    slotProps: { paper: { sx: { maxHeight: 300 } } },
                    // Open near the selected time, or the start of the working day when empty.
                    autoFocus: true,
                }}
            >
                {options.map((slot) => {
                    const past = slot !== value && isTimeOptionPast(date, slot, now);
                    return (
                        <MenuItem
                            key={slot}
                            value={slot}
                            disabled={past}
                            autoFocus={!value && slot === DEFAULT_SCROLL_SLOT}
                            sx={{ fontSize: '0.85rem' }}
                        >
                            {slot}
                        </MenuItem>
                    );
                })}
            </Select>
        </FormControl>
    );
}
