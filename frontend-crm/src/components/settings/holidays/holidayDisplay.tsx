'use client';

import React from 'react';
import { Box } from '@mui/material';
import type { HolidayStatus } from '@/types/holiday.types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * `2026-08-15` → `15-Aug-2026` (the CRM's date style); a yearly holiday's `08-15` → `15-Aug`. A calendar day, so no
 * time zone is involved.
 */
export function formatHolidayDate(day: string): string {
    const yearly = /^(\d{2})-(\d{2})$/.exec(day);
    if (yearly) return `${yearly[2]}-${MONTHS[Number(yearly[1]) - 1] ?? yearly[1]}`;
    const [y, m, d] = day.split('-').map(Number);
    if (!y || !m || !d) return day;
    return `${String(d).padStart(2, '0')}-${MONTHS[m - 1]}-${y}`;
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
