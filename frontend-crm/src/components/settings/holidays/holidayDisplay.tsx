'use client';

import React from 'react';
import { Box } from '@mui/material';
import type { HolidayStatus } from '@/types/holiday.types';
import { fmtDay, fmtYearlyDay } from '@/utils/formats';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * `2026-08-15` → `15-Aug-2026` (the CRM's date style); a yearly holiday's `08-15` → `15-Aug`. Once the company formats
 * are saved, the company date format (without the year for a yearly holiday). A calendar day, so no time zone is
 * involved; anything else comes back unchanged.
 */
export function formatHolidayDate(day: string): string {
    if (/^\d{2}-\d{2}$/.test(day)) return fmtYearlyDay(day);
    return fmtDay(day, { legacy: 'DD-MMM-YYYY' });
}

/** Days in a month (1–12) in a leap year, so a yearly holiday can be on 29 Feb. */
export const daysInMonth = (month: number) => new Date(Date.UTC(2000, month, 0)).getUTCDate();

/** `2026-08-15` → `Saturday`. */
export function holidayWeekday(day: string): string {
    const date = new Date(`${day}T12:00:00Z`);
    return Number.isNaN(date.getTime()) ? '' : WEEKDAYS[date.getUTCDay()];
}

const pillSx = (color: string, backgroundColor: string, borderColor: string) => ({
    display: 'inline-flex',
    alignItems: 'center',
    px: 1,
    py: 0.15,
    borderRadius: '9999px',
    fontSize: '0.7rem',
    fontWeight: 700,
    whiteSpace: 'nowrap',
    color,
    backgroundColor,
    border: `1px solid ${borderColor}`,
});

/** Marks a holiday that repeats every year (in the list next to its day and month). */
export function RepeatsYearlyPill() {
    return (
        <Box component="span" sx={pillSx('var(--crm-text-blue-700)', 'var(--mui-palette-primary-soft)', 'var(--mui-palette-primary-softBorder)')}>
            Every year
        </Box>
    );
}

export function HolidayStatusPill({ status }: { status: HolidayStatus }) {
    const active = status === 'Active';
    return (
        <Box
            component="span"
            sx={
                active
                    ? pillSx('var(--mui-palette-success-main)', 'var(--mui-palette-success-soft)', 'var(--mui-palette-success-softBorder)')
                    : pillSx('var(--mui-palette-text-secondary)', 'var(--mui-palette-background-subtle)', 'var(--mui-palette-border-main)')
            }
        >
            {status}
        </Box>
    );
}
