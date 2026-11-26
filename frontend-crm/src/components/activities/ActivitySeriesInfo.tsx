'use client';

import React from 'react';
import { Box, Button, Typography } from '@mui/material';
import RepeatIcon from '@mui/icons-material/Repeat';
import type { Activity } from '@/types/activity.types';

const ordinal = (n: number) => {
    const tens = n % 100;
    if (tens >= 11 && tens <= 13) return `${n}th`;
    return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
};

/** "3rd of 10", "3rd event", or '' when the position is unknown. */
export function seriesPositionText(series: NonNullable<Activity['series']>): string {
    if (!series.index) return '';
    return series.total ? `${ordinal(series.index)} of ${series.total}` : `${ordinal(series.index)} event`;
}

/**
 * The drawer's "Repeats …" line of an occurrence of a recurring activity (Calendar Phase 4): the rule summary, its
 * position, whether it was changed on its own, and "Edit series" (opens the edit form; saving asks this / following /
 * all) for whoever may change it. Renders nothing for a single activity.
 */
export function ActivitySeriesInfo({ activity, canEdit, onEditSeries }: { activity: Activity; canEdit: boolean; onEditSeries?: () => void }) {
    const series = activity.series;
    if (!series) return null;
    const position = seriesPositionText(series);
    const notes = [position, series.exception ? 'changed on its own' : '', series.ended ? 'no more events are added' : ''].filter(Boolean).join(' · ');
    return (
        <Box
            sx={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 1,
                mt: 1.2,
                p: 1,
                borderRadius: '8px',
                border: '1px solid var(--mui-palette-border-light)',
                backgroundColor: 'var(--mui-palette-background-subtle)',
                flexWrap: 'wrap',
                minWidth: 0,
            }}
        >
            <RepeatIcon sx={{ fontSize: 18, mt: '2px', color: 'var(--crm-text-blue-600)', flexShrink: 0 }} aria-hidden />
            <Box sx={{ flex: 1, minWidth: 160 }}>
                <Typography sx={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--crm-slate-900)', overflowWrap: 'anywhere' }}>{`Repeats ${series.summary.charAt(0).toLowerCase()}${series.summary.slice(1)}`}</Typography>
                {notes && <Typography sx={{ fontSize: '0.74rem', color: 'var(--mui-palette-text-secondary)' }}>{notes}</Typography>}
            </Box>
            {canEdit && onEditSeries && (
                <Button
                    size="small"
                    onClick={onEditSeries}
                    sx={{
                        textTransform: 'none',
                        fontWeight: 600,
                        fontSize: '0.78rem',
                        minHeight: 32,
                        px: 1.25,
                        borderRadius: '8px',
                        border: '1px solid var(--mui-palette-border-main)',
                        color: 'var(--crm-slate-700)',
                        backgroundColor: 'var(--mui-palette-background-paper)',
                        transition: 'all 0.15s ease',
                        '&:hover': { borderColor: 'var(--crm-blue-300)', backgroundColor: 'var(--mui-palette-primary-soft)', color: 'var(--crm-text-blue-700)' },
                    }}
                >
                    Edit series
                </Button>
            )}
        </Box>
    );
}
