'use client';

import React from 'react';
import { Box, Typography } from '@mui/material';
import type { SvgIconComponent } from '@mui/icons-material';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import { getModuleColor } from '@/theme/moduleColors';
import { CANCELLED_STATUS, COMPLETED_STATUS, type CalendarItem } from '@/types/activity.types';
import type { CalendarHoliday } from '@/types/holiday.types';
import { relatedModuleLabel } from '../activityLinks';
import { SeriesRepeatMark } from './SeriesRepeatMark';

export interface EventContentProps {
    item: CalendarItem;
    /** Icon of the item's Followup Type (resolved by the calendar, which has the option meta). */
    Icon: SvgIconComponent;
    /** FullCalendar's time text ("10:30 – 11:30 AM"); '' for all-day items. */
    timeText: string;
    /** Agenda (list) row instead of a grid chip. */
    list?: boolean;
    /** A short block in the time grid: one line only. */
    compact?: boolean;
}

/** Where an item comes from, under its title in the agenda. */
const SOURCE_LABELS: Record<CalendarItem['source'], string> = {
    activity: '',
    leadFollowup: 'Lead follow-up',
    opportunityFollowup: 'Opportunity follow-up',
    contractRenewal: 'Contract renewal',
};

/** Tint of an item: its module's colour; an overdue planned activity is red. */
function itemColors(item: CalendarItem) {
    if (item.overdue) {
        return {
            soft: 'var(--mui-palette-error-soft)',
            border: 'var(--mui-palette-error-softBorder)',
            strip: 'var(--mui-palette-error-main)',
            text: 'var(--mui-palette-error-main)',
            icon: 'var(--mui-palette-error-main)',
        };
    }
    // A follow-up activity (P2-4) keeps its record's follow-up tint (Leads / Opportunities), like the derived entry it replaces.
    const tint = item.module === 'activities' && item.origin === 'followup' && (item.relatedModule === 'leads' || item.relatedModule === 'opportunities') ? item.relatedModule : item.module;
    const color = getModuleColor(tint);
    return { soft: color.soft, border: color.border, strip: color.main, text: color.text, icon: color.main };
}

/**
 * One calendar entry: a chip tinted with its source's module colour (activities, lead and opportunity follow-ups,
 * contract renewals), its type icon, time and title. Completed entries fade with a check; cancelled ones are struck
 * through; overdue planned ones turn red.
 */
/** A red dot on an activity whose calendar copy was refused (P2-3c; `syncState` is sent to its owner and editors only). */
function SyncErrorDot({ size }: { size: number }) {
    return (
        <Box
            component="span"
            role="img"
            aria-label="Calendar sync error"
            title="The calendar refused the last change: open the activity to retry."
            sx={{ width: size, height: size, borderRadius: '50%', backgroundColor: 'var(--mui-palette-error-main)', flexShrink: 0 }}
        />
    );
}

export function EventContent({ item, Icon, timeText, list = false, compact = false }: EventContentProps) {
    const colors = itemColors(item);
    const syncError = item.module === 'activities' && item.syncState === 'error';
    const completed = item.module === 'activities' && item.status === COMPLETED_STATUS;
    const cancelled = item.module === 'activities' && item.status === CANCELLED_STATUS;
    const StatusIcon = completed ? CheckCircleOutlinedIcon : null;
    const titleSx = {
        fontSize: 'inherit',
        fontWeight: 700,
        color: cancelled ? 'var(--mui-palette-text-muted)' : 'inherit',
        textDecoration: cancelled ? 'line-through' : 'none',
        minWidth: 0,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
    } as const;

    if (list) {
        const secondary = [SOURCE_LABELS[item.source], item.relatedTo ? `${relatedModuleLabel(item.relatedModule)}: ${item.relatedTo}` : '', item.location]
            .filter(Boolean)
            .join(' · ');
        return (
            <Box
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.25,
                    width: '100%',
                    minWidth: 0,
                    minHeight: 40,
                    py: 0.5,
                    opacity: completed ? 0.65 : 1,
                }}
            >
                <Box sx={{ width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: colors.strip, flexShrink: 0 }} />
                {/* Phones: a range across noon ("11:30am – 12:30pm") is wider than the column, so it wraps under itself. */}
                <Typography
                    component="span"
                    sx={{
                        width: { xs: 92, sm: 132 },
                        flexShrink: 0,
                        minWidth: 0,
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        lineHeight: 1.35,
                        color: 'var(--mui-palette-text-secondary)',
                        whiteSpace: { xs: 'normal', sm: 'nowrap' },
                        overflowWrap: 'anywhere',
                    }}
                >
                    {timeText || 'All day'}
                </Typography>
                <Box
                    sx={{
                        width: 28,
                        height: 28,
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: colors.soft,
                        border: `1px solid ${colors.border}`,
                        flexShrink: 0,
                    }}
                >
                    <Icon sx={{ fontSize: 16, color: colors.icon }} />
                </Box>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography component="div" sx={{ ...titleSx, fontSize: '0.84rem', color: cancelled ? titleSx.color : 'var(--crm-slate-900)' }}>
                        {item.title}
                    </Typography>
                    {secondary && (
                        <Typography component="div" noWrap sx={{ fontSize: '0.72rem', color: 'var(--mui-palette-text-secondary)' }}>
                            {secondary}
                        </Typography>
                    )}
                </Box>
                <SeriesRepeatMark item={item} size={14} />
                {syncError && <SyncErrorDot size={8} />}
                {StatusIcon && <StatusIcon sx={{ fontSize: 16, color: 'var(--mui-palette-success-main)', flexShrink: 0 }} />}
            </Box>
        );
    }

    return (
        <Box
            sx={{
                position: 'relative',
                display: 'flex',
                flexDirection: compact ? 'row' : 'column',
                alignItems: compact ? 'center' : 'stretch',
                gap: compact ? 0.5 : 0.1,
                width: '100%',
                height: '100%',
                minWidth: 0,
                minHeight: 18,
                overflow: 'hidden',
                pl: '7px',
                pr: 0.5,
                py: '1px',
                borderRadius: '5px',
                fontSize: '0.72rem',
                lineHeight: 1.3,
                color: colors.text,
                backgroundColor: colors.soft,
                border: `1px solid ${colors.border}`,
                opacity: completed ? 0.65 : 1,
                '&::before': {
                    content: '""',
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: 3,
                    backgroundColor: colors.strip,
                },
            }}
        >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
                <Icon sx={{ fontSize: 13, color: colors.icon, flexShrink: 0 }} />
                <SeriesRepeatMark item={item} size={11} />
                {timeText && (compact || !item.allDay) && (
                    <Box component="span" sx={{ fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 }}>
                        {timeText}
                    </Box>
                )}
                {compact || item.allDay ? (
                    <Box component="span" sx={titleSx}>
                        {item.title}
                    </Box>
                ) : null}
                {syncError && (
                    <Box component="span" sx={{ display: 'inline-flex', ml: 'auto', flexShrink: 0 }}>
                        <SyncErrorDot size={7} />
                    </Box>
                )}
                {StatusIcon && <StatusIcon sx={{ fontSize: 12, color: 'var(--mui-palette-success-main)', flexShrink: 0, ml: syncError ? 0 : 'auto' }} />}
            </Box>
            {!compact && !item.allDay && (
                <Box component="span" sx={{ ...titleSx, whiteSpace: 'normal', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
                    {item.title}
                </Box>
            )}
        </Box>
    );
}

const HOLIDAY_COLORS = {
    soft: 'var(--mui-palette-warning-soft)',
    border: 'var(--mui-palette-warning-softBorder)',
    strip: 'var(--mui-palette-warning-main)',
    text: 'var(--crm-amber-700)',
} as const;

/** A company holiday (Admin › Holidays) on the calendar: an amber all-day chip, or an agenda row. Not clickable. */
export function HolidayEventContent({ holiday, Icon, list = false }: { holiday: CalendarHoliday; Icon: SvgIconComponent; list?: boolean }) {
    const label = 'Holiday';
    if (list) {
        return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, width: '100%', minWidth: 0, minHeight: 40, py: 0.5 }}>
                <Box sx={{ width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: HOLIDAY_COLORS.strip, flexShrink: 0 }} />
                <Typography
                    component="span"
                    sx={{ width: { xs: 92, sm: 132 }, flexShrink: 0, fontSize: '0.78rem', fontWeight: 600, color: 'var(--mui-palette-text-secondary)' }}
                >
                    All day
                </Typography>
                <Box
                    sx={{
                        width: 28,
                        height: 28,
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: HOLIDAY_COLORS.soft,
                        border: `1px solid ${HOLIDAY_COLORS.border}`,
                        flexShrink: 0,
                    }}
                >
                    <Icon sx={{ fontSize: 16, color: HOLIDAY_COLORS.text }} />
                </Box>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography component="div" noWrap sx={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--crm-slate-900)' }}>
                        {holiday.occasion}
                    </Typography>
                    <Typography component="div" noWrap sx={{ fontSize: '0.72rem', color: 'var(--mui-palette-text-secondary)' }}>
                        {label}
                    </Typography>
                </Box>
            </Box>
        );
    }
    return (
        <Box
            title={`${label}: ${holiday.occasion}`}
            sx={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                width: '100%',
                minWidth: 0,
                minHeight: 18,
                overflow: 'hidden',
                pl: '7px',
                pr: 0.5,
                py: '1px',
                borderRadius: '5px',
                fontSize: '0.72rem',
                lineHeight: 1.3,
                fontWeight: 700,
                cursor: 'default',
                color: HOLIDAY_COLORS.text,
                backgroundColor: HOLIDAY_COLORS.soft,
                border: `1px solid ${HOLIDAY_COLORS.border}`,
                '&::before': { content: '""', position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: HOLIDAY_COLORS.strip },
            }}
        >
            <Icon sx={{ fontSize: 13, flexShrink: 0 }} />
            <Box component="span" sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {holiday.occasion}
            </Box>
        </Box>
    );
}
