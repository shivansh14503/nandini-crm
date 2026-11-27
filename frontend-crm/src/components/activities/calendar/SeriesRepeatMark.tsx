'use client';

import React from 'react';
import RepeatIcon from '@mui/icons-material/Repeat';
import type { CalendarItem } from '@/types/activity.types';

/**
 * Repeat icon on a calendar item that is an occurrence of a recurring activity (Calendar Phase 4, `CalendarItem.seriesId`).
 * Inherits the item's text colour; nothing for other items.
 */
export function SeriesRepeatMark({ item, size }: { item: Pick<CalendarItem, 'seriesId'>; size: number }) {
    if (!item.seriesId) return null;
    return <RepeatIcon titleAccess="Repeats" sx={{ fontSize: size, flexShrink: 0, opacity: 0.85 }} />;
}
