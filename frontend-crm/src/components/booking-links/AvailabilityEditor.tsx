'use client';

import React from 'react';
import { Box, Button, IconButton, Switch, TextField, Tooltip, Typography } from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import { inputSx } from '@/components/settings/form-customization/builderUi';
import {
    BOOKING_MAX_WINDOWS_PER_DAY,
    BOOKING_WEEKDAYS,
    BOOKING_WEEKDAY_LABELS,
    type BookingWeekday,
    type TimeWindow,
    type WeeklyAvailability,
} from '@/types/bookingLink.types';

/** `'09:30'` → 570 (`'24:00'` → 1440); NaN when unreadable. */
export const minutesOf = (value: string): number => {
    if (value === '24:00') return 24 * 60;
    const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
    return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
};

/** What is wrong with the week, per weekday ('' = fine), plus a week-level message. Mirrors the API rules. */
export function availabilityIssues(value: WeeklyAvailability): { days: Partial<Record<BookingWeekday, string>>; week: string } {
    const days: Partial<Record<BookingWeekday, string>> = {};
    let any = false;
    for (const day of BOOKING_WEEKDAYS) {
        const windows = [...(value[day] ?? [])].sort((a, b) => minutesOf(a.start) - minutesOf(b.start));
        if (windows.length) any = true;
        for (let i = 0; i < windows.length; i += 1) {
            const w = windows[i];
            const s = minutesOf(w.start);
            const e = minutesOf(w.end);
            if (Number.isNaN(s) || Number.isNaN(e)) days[day] = 'Enter times such as 09:30.';
            else if (e <= s) days[day] = 'Each range must end after it starts.';
            else if (i > 0 && s < minutesOf(windows[i - 1].end)) days[day] = 'Time ranges must not overlap.';
        }
    }
    return { days, week: any ? '' : 'Add at least one time range.' };
}

const timeInputSx = { ...inputSx, width: { xs: '100%', sm: 128 }, minWidth: 0 } as const;

/**
 * Weekly hours of a booking link: each weekday on / off with up to three time ranges (business time zone). Works on
 * touch: every control is a tap target of at least 36 px; no hover-only actions.
 */
export function AvailabilityEditor({
    value,
    onChange,
    timeZone,
    disabled,
}: {
    value: WeeklyAvailability;
    onChange: (next: WeeklyAvailability) => void;
    timeZone: string;
    disabled?: boolean;
}) {
    const issues = availabilityIssues(value);
    const setDay = (day: BookingWeekday, windows: TimeWindow[]) => {
        const next: WeeklyAvailability = { ...value };
        if (windows.length) next[day] = windows;
        else delete next[day];
        onChange(next);
    };
    const copyToWeekdays = (day: BookingWeekday) => {
        const windows = value[day] ?? [];
        const next: WeeklyAvailability = { ...value };
        for (const d of BOOKING_WEEKDAYS.slice(0, 5)) next[d] = windows.map((w) => ({ ...w }));
        onChange(next);
    };

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: '0.74rem', color: 'var(--mui-palette-text-secondary)' }}>
                Times are in {timeZone}. Visitors see them in their own time zone.
            </Typography>
            {BOOKING_WEEKDAYS.map((day) => {
                const windows = value[day] ?? [];
                const on = windows.length > 0;
                return (
                    <Box
                        key={day}
                        sx={{
                            display: 'flex',
                            flexDirection: { xs: 'column', sm: 'row' },
                            alignItems: { xs: 'stretch', sm: 'flex-start' },
                            gap: { xs: 0.5, sm: 1.5 },
                            py: 0.75,
                            borderBottom: '1px solid var(--mui-palette-border-light)',
                            minWidth: 0,
                        }}
                    >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, width: { sm: 150 }, flexShrink: 0, minHeight: 40 }}>
                            <Switch
                                size="small"
                                checked={on}
                                disabled={disabled}
                                onChange={(e) => setDay(day, e.target.checked ? [{ start: '10:00', end: '18:00' }] : [])}
                                slotProps={{ input: { 'aria-label': `${BOOKING_WEEKDAY_LABELS[day]} available` } }}
                            />
                            <Typography sx={{ fontSize: '0.84rem', fontWeight: 600, color: on ? 'var(--crm-slate-900)' : 'var(--mui-palette-text-muted)' }}>
                                {BOOKING_WEEKDAY_LABELS[day]}
                            </Typography>
                        </Box>
                        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                            {!on && <Typography sx={{ fontSize: '0.8rem', color: 'var(--mui-palette-text-muted)', minHeight: { sm: 40 }, display: 'flex', alignItems: 'center' }}>Not available</Typography>}
                            {windows.map((w, i) => (
                                <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: { xs: 'wrap', sm: 'nowrap' }, minWidth: 0 }}>
                                    <TextField
                                        type="time"
                                        size="small"
                                        value={w.start}
                                        disabled={disabled}
                                        onChange={(e) => setDay(day, windows.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))}
                                        slotProps={{ htmlInput: { step: 300, 'aria-label': `${BOOKING_WEEKDAY_LABELS[day]} from` } }}
                                        sx={{ ...timeInputSx, flex: { xs: '1 1 0', sm: '0 0 auto' } }}
                                    />
                                    <Typography sx={{ fontSize: '0.8rem', color: 'var(--mui-palette-text-secondary)' }}>to</Typography>
                                    <TextField
                                        type="time"
                                        size="small"
                                        value={w.end === '24:00' ? '23:59' : w.end}
                                        disabled={disabled}
                                        onChange={(e) => setDay(day, windows.map((x, j) => (j === i ? { ...x, end: e.target.value === '23:59' ? '24:00' : e.target.value } : x)))}
                                        slotProps={{ htmlInput: { step: 300, 'aria-label': `${BOOKING_WEEKDAY_LABELS[day]} to` } }}
                                        sx={{ ...timeInputSx, flex: { xs: '1 1 0', sm: '0 0 auto' } }}
                                    />
                                    <Tooltip title="Remove this range">
                                        <span>
                                            <IconButton
                                                size="small"
                                                disabled={disabled}
                                                onClick={() => setDay(day, windows.filter((_, j) => j !== i))}
                                                aria-label="Remove this range"
                                                sx={{
                                                    width: 36,
                                                    height: 36,
                                                    color: 'var(--mui-palette-text-secondary)',
                                                    '&:hover': { color: 'var(--mui-palette-error-main)', backgroundColor: 'var(--mui-palette-error-soft)' },
                                                }}
                                            >
                                                <CloseRoundedIcon fontSize="small" />
                                            </IconButton>
                                        </span>
                                    </Tooltip>
                                </Box>
                            ))}
                            {on && (
                                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                                    {windows.length < BOOKING_MAX_WINDOWS_PER_DAY && (
                                        <Button
                                            size="small"
                                            startIcon={<AddRoundedIcon fontSize="small" />}
                                            disabled={disabled}
                                            onClick={() => {
                                                const last = windows[windows.length - 1];
                                                const startMin = last ? Math.min(minutesOf(last.end) + 60, 22 * 60) : 14 * 60;
                                                const hh = (n: number) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
                                                setDay(day, [...windows, { start: hh(startMin), end: hh(Math.min(startMin + 120, 23 * 60 + 55)) }]);
                                            }}
                                            sx={{ textTransform: 'none', fontSize: '0.78rem', minHeight: 36, color: 'var(--crm-text-blue-700)', '&:hover': { backgroundColor: 'var(--mui-palette-primary-soft)' } }}
                                        >
                                            Add a range
                                        </Button>
                                    )}
                                    {day === '1' && (
                                        <Button
                                            size="small"
                                            startIcon={<ContentCopyRoundedIcon fontSize="small" />}
                                            disabled={disabled}
                                            onClick={() => copyToWeekdays(day)}
                                            sx={{ textTransform: 'none', fontSize: '0.78rem', minHeight: 36, color: 'var(--crm-text-blue-700)', '&:hover': { backgroundColor: 'var(--mui-palette-primary-soft)' } }}
                                        >
                                            Same for Monday to Friday
                                        </Button>
                                    )}
                                </Box>
                            )}
                            {issues.days[day] && <Typography sx={{ fontSize: '0.74rem', color: 'var(--mui-palette-error-main)' }}>{issues.days[day]}</Typography>}
                        </Box>
                    </Box>
                );
            })}
            {issues.week && <Typography sx={{ fontSize: '0.76rem', color: 'var(--mui-palette-error-main)' }}>{issues.week}</Typography>}
        </Box>
    );
}
