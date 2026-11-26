'use client';

import React from 'react';
import { FieldNotice } from '@/components/forms/FieldNotice';
import { formatHolidayDate } from '@/components/settings/holidays/holidayDisplay';
import { useCalendarHolidays } from '@/hooks/queries/useHolidays';

/** First and last day of the month of `day` (`YYYY-MM-DD`): holidays are read a month at a time, so they're cached. */
function monthOf(day: string): { from: string; to: string } {
    const [y, m] = day.split('-').map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const month = day.slice(0, 7);
    return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

/**
 * An amber note when `day` is a company holiday (Admin › Holidays, Active ones only): "15-Aug-2026 is a holiday:
 * Independence Day." It only warns; the day can still be picked.
 */
export function HolidayNotice({ day }: { day: string }) {
    const valid = /^\d{4}-\d{2}-\d{2}$/.test(day);
    const month = valid ? monthOf(day) : null;
    const { data } = useCalendarHolidays(month?.from, month?.to);
    const names = (data ?? []).filter((h) => h.holidayDate === day).map((h) => h.occasion);
    if (!valid || names.length === 0) return null;
    return (
        <FieldNotice>
            {formatHolidayDate(day)} is a holiday: {names.join(', ')}.
        </FieldNotice>
    );
}
