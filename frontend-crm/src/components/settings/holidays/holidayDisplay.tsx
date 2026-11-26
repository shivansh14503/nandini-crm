'use client';

import React from 'react';
import { Box } from '@mui/material';
import type { HolidayStatus, HolidayType } from '@/types/holiday.types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** `2026-08-15` → `15-Aug-2026` (the CRM's date style). A calendar day, so no time zone is involved. */
export function formatHolidayDate(day: string): string {
    const [y, m, d] = day.split('-').map(Number);
    if (!y || !m || !d) return day;
    return `${String(d).padStart(2, '0')}-${MONTHS[m - 1]}-${y}`;
}

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

const TYPE_STYLE: Record<HolidayType, [string, string, string]> = {
    Public: ['var(--crm-text-blue-700)', 'var(--mui-palette-primary-soft)', 'var(--mui-palette-primary-softBorder)'],
    Optional: ['var(--crm-amber-700)', 'var(--mui-palette-warning-soft)', 'var(--mui-palette-warning-softBorder)'],
    Company: ['var(--mui-palette-info-main)', 'var(--mui-palette-info-soft)', 'var(--mui-palette-info-softBorder)'],
};

export function HolidayTypePill({ type }: { type: HolidayType }) {
    const [color, bg, border] = TYPE_STYLE[type] ?? TYPE_STYLE.Public;
    return (
        <Box component="span" sx={pillSx(color, bg, border)}>
            {type}
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
