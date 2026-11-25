'use client';

import React, { useState } from 'react';
import { Badge, Box, Button, IconButton, ListItemIcon, ListItemText, Menu, MenuItem, Tooltip, Typography } from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import AddIcon from '@mui/icons-material/Add';
import TuneIcon from '@mui/icons-material/Tune';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckIcon from '@mui/icons-material/Check';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

/** The calendar's views (the `view` query value). */
export type CalendarViewKey = 'month' | 'week' | '3day' | 'day' | 'agenda';

export const CALENDAR_VIEW_LABELS: Record<CalendarViewKey, string> = {
    month: 'Month',
    week: 'Week',
    '3day': '3 days',
    day: 'Day',
    agenda: 'Agenda',
};

/** Outlined toolbar button / icon button (CLAUDE.md §3.1). */
export const toolbarOutlinedSx = {
    height: 40,
    minWidth: 40,
    borderRadius: '8px',
    border: '1px solid var(--mui-palette-border-main)',
    color: 'var(--crm-slate-700)',
    backgroundColor: 'var(--mui-palette-background-paper)',
    textTransform: 'none',
    fontWeight: 600,
    fontSize: '0.82rem',
    transition: 'all 0.15s ease',
    '&:hover': {
        borderColor: 'var(--crm-blue-300)',
        backgroundColor: 'var(--mui-palette-primary-soft)',
        color: 'var(--crm-text-blue-700)',
    },
} as const;

/** Brand gradient with its own hover gradient (CLAUDE.md §2.D, §4.4). */
export const brandGradientButtonSx = {
    height: 40,
    px: 2,
    borderRadius: '8px',
    textTransform: 'none',
    fontWeight: 700,
    fontSize: '0.84rem',
    color: '#ffffff',
    boxShadow: 'none',
    whiteSpace: 'nowrap',
    background: 'linear-gradient(135deg, var(--crm-fill-blue-700) 0%, var(--crm-fill-blue-600) 100%)',
    '&:hover': {
        background: 'linear-gradient(135deg, var(--crm-fill-blue-800) 0%, var(--crm-fill-blue-700) 100%)',
        boxShadow: '0 4px 14px rgb(var(--crm-accent-rgb) / 0.28)',
    },
} as const;

export interface CalendarToolbarProps {
    title: string;
    view: CalendarViewKey;
    /** Views offered at this width. */
    views: CalendarViewKey[];
    onViewChange: (view: CalendarViewKey) => void;
    onPrev: () => void;
    onNext: () => void;
    onToday: () => void;
    onNew: () => void;
    onRefresh: () => void;
    refreshing?: boolean;
    /** Shown when the filter rail is collapsed (tablet, phone). */
    onOpenFilters?: () => void;
    /** Filters that differ from the defaults (badge on the Filters button). */
    activeFilterCount?: number;
    /** Phone: compact toolbar with a view menu (the FAB creates activities). */
    compact?: boolean;
}

/** The calendar's own toolbar: previous / next / today, the period's title, the view switcher and New Activity. */
export function CalendarToolbar({
    title,
    view,
    views,
    onViewChange,
    onPrev,
    onNext,
    onToday,
    onNew,
    onRefresh,
    refreshing = false,
    onOpenFilters,
    activeFilterCount = 0,
    compact = false,
}: CalendarToolbarProps) {
    const [viewMenu, setViewMenu] = useState<HTMLElement | null>(null);

    const filtersButton = onOpenFilters ? (
        <Tooltip title="Filters">
            <IconButton onClick={onOpenFilters} aria-label="Filters" sx={{ ...toolbarOutlinedSx, color: 'var(--mui-palette-text-secondary)' }}>
                <Badge
                    badgeContent={activeFilterCount}
                    invisible={activeFilterCount === 0}
                    sx={{ '& .MuiBadge-badge': { backgroundColor: 'var(--crm-fill-blue-600)', color: '#ffffff', fontWeight: 700, fontSize: '0.65rem', minWidth: 16, height: 16 } }}
                >
                    <TuneIcon sx={{ fontSize: 20 }} />
                </Badge>
            </IconButton>
        </Tooltip>
    ) : null;

    return (
        <Box
            sx={{
                display: 'flex',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 1,
                rowGap: 1,
                minWidth: 0,
            }}
        >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Button onClick={onToday} variant="outlined" sx={{ ...toolbarOutlinedSx, px: 1.75 }}>
                    Today
                </Button>
                <Tooltip title="Previous">
                    <IconButton onClick={onPrev} aria-label="Previous" sx={{ ...toolbarOutlinedSx, color: 'var(--mui-palette-text-secondary)' }}>
                        <ChevronLeftIcon />
                    </IconButton>
                </Tooltip>
                <Tooltip title="Next">
                    <IconButton onClick={onNext} aria-label="Next" sx={{ ...toolbarOutlinedSx, color: 'var(--mui-palette-text-secondary)' }}>
                        <ChevronRightIcon />
                    </IconButton>
                </Tooltip>
            </Box>

            <Typography
                component="h1"
                sx={{
                    flex: '1 1 160px',
                    minWidth: 0,
                    fontSize: { xs: '1rem', sm: '1.15rem' },
                    fontWeight: 800,
                    color: 'var(--crm-slate-900)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                }}
            >
                {title}
            </Typography>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap', minWidth: 0 }}>
                {compact ? (
                    <>
                        <Button
                            onClick={(e) => setViewMenu(e.currentTarget)}
                            variant="outlined"
                            endIcon={<ExpandMoreIcon />}
                            aria-haspopup="menu"
                            sx={{ ...toolbarOutlinedSx, px: 1.5 }}
                        >
                            {CALENDAR_VIEW_LABELS[view]}
                        </Button>
                        <Menu anchorEl={viewMenu} open={Boolean(viewMenu)} onClose={() => setViewMenu(null)}>
                            {views.map((v) => (
                                <MenuItem
                                    key={v}
                                    selected={v === view}
                                    onClick={() => {
                                        setViewMenu(null);
                                        onViewChange(v);
                                    }}
                                    sx={{ minHeight: 40, fontSize: '0.85rem' }}
                                >
                                    <ListItemIcon sx={{ minWidth: 28 }}>{v === view && <CheckIcon sx={{ fontSize: 18, color: 'var(--crm-text-blue-600)' }} />}</ListItemIcon>
                                    <ListItemText disableTypography>{CALENDAR_VIEW_LABELS[v]}</ListItemText>
                                </MenuItem>
                            ))}
                        </Menu>
                    </>
                ) : (
                    <Box
                        role="tablist"
                        aria-label="Calendar view"
                        sx={{
                            display: 'flex',
                            gap: 0.25,
                            p: 0.4,
                            borderRadius: '10px',
                            backgroundColor: 'var(--mui-palette-background-subtle)',
                            border: '1px solid var(--mui-palette-border-main)',
                        }}
                    >
                        {views.map((v) => {
                            const active = v === view;
                            return (
                                <Button
                                    key={v}
                                    role="tab"
                                    aria-selected={active}
                                    onClick={() => onViewChange(v)}
                                    sx={{
                                        height: 32,
                                        minWidth: 0,
                                        px: 1.5,
                                        borderRadius: '8px',
                                        textTransform: 'none',
                                        fontSize: '0.8rem',
                                        fontWeight: active ? 700 : 600,
                                        border: '1px solid',
                                        borderColor: active ? 'var(--mui-palette-border-strong)' : 'transparent',
                                        backgroundColor: active ? 'var(--mui-palette-background-paper)' : 'transparent',
                                        color: active ? 'var(--crm-text-blue-900)' : 'var(--mui-palette-text-secondary)',
                                        '&:hover': active
                                            ? { backgroundColor: 'var(--mui-palette-background-paper)' }
                                            : { backgroundColor: 'var(--mui-palette-primary-soft)', color: 'var(--crm-text-blue-700)' },
                                    }}
                                >
                                    {CALENDAR_VIEW_LABELS[v]}
                                </Button>
                            );
                        })}
                    </Box>
                )}
                <Tooltip title="Refresh">
                    <IconButton onClick={onRefresh} aria-label="Refresh" sx={{ ...toolbarOutlinedSx, color: 'var(--mui-palette-text-secondary)' }}>
                        <RefreshIcon
                            sx={{
                                fontSize: 20,
                                animation: refreshing ? 'crm-cal-spin 0.9s linear infinite' : 'none',
                                '@keyframes crm-cal-spin': { from: { transform: 'rotate(0deg)' }, to: { transform: 'rotate(360deg)' } },
                            }}
                        />
                    </IconButton>
                </Tooltip>
                {filtersButton}
                {!compact && (
                    <Button onClick={onNew} variant="contained" startIcon={<AddIcon />} sx={brandGradientButtonSx}>
                        New Activity
                    </Button>
                )}
            </Box>
        </Box>
    );
}
