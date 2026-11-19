'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Box, IconButton, List, ListItem, ListItemButton, Tooltip, Typography } from '@mui/material';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
import KeyboardDoubleArrowLeftIcon from '@mui/icons-material/KeyboardDoubleArrowLeft';
import { glassSurfaceSx, GLASS_SHADOW, GLASS_SHADOW_RAISED, GLASS_RADIUS, FLOAT_INSET, NAVBAR_HEIGHT } from '@/theme/glass';

export interface RelatedModuleItem {
    id: string;
    label: string;
    icon: React.ReactNode;
    count: number;
    onClick?: () => void;
}

/** Geometry of the floating dock (px). */
export const DOCK = {
    /** Gap between the dock and the viewport edge (same as the floating navbar's, so their left edges line up). */
    inset: FLOAT_INSET,
    /** Below the floating navbar: inset + navbar + inset. */
    top: FLOAT_INSET + NAVBAR_HEIGHT + FLOAT_INSET,
    railWidth: 64,
    expandedWidth: 240,
    /** Gap between the dock and the page content / module table (same 12px as every other floating surface). */
    contentGap: FLOAT_INSET,
} as const;

/** Left space the page content reserves for the dock. */
export function dockContentOffset(expanded: boolean): number {
    return DOCK.inset + (expanded ? DOCK.expandedWidth : DOCK.railWidth) + DOCK.contentGap;
}

export interface RelatedModulesSidebarProps {
    modules: RelatedModuleItem[];
    activeModuleId?: string;
    onModuleSelect?: (moduleId: string) => void;
    /** Pinned: stays expanded and the page makes room for it. Unpinned: an icon rail that peeks open on hover. */
    pinned: boolean;
    onTogglePinned: () => void;
    /** Distance from the viewport top; defaults to just below the floating navbar. */
    top?: number;
}

const PEEK_OPEN_DELAY = 120;
const PEEK_CLOSE_DELAY = 280;
const EASE = 'cubic-bezier(0.2, 0, 0, 1)';

/**
 * Floating glass dock with the record's related modules. Rail (icons + count badges) by default; hovering or
 * focusing it peeks the full panel over the page, revealing a header whose pin button (or Ctrl+\) keeps it open.
 */
export function RelatedModulesSidebar({
    modules,
    activeModuleId,
    onModuleSelect,
    pinned,
    onTogglePinned,
    top = DOCK.top,
}: RelatedModulesSidebarProps) {
    const [peek, setPeek] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const expanded = pinned || peek;

    const schedulePeek = (next: boolean) => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setPeek(next), next ? PEEK_OPEN_DELAY : PEEK_CLOSE_DELAY);
    };

    useEffect(() => () => {
        if (timer.current) clearTimeout(timer.current);
    }, []);

    // Pinning/unpinning ends any peek so the dock settles into its new resting state (reset during render).
    const [lastPinned, setLastPinned] = useState(pinned);
    if (pinned !== lastPinned) {
        setLastPinned(pinned);
        setPeek(false);
    }

    const labelSx = {
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        opacity: expanded ? 1 : 0,
        transition: `opacity 0.15s ${EASE} ${expanded ? '0.06s' : '0s'}`,
    } as const;

    return (
        <Box
            component="nav"
            aria-label="Related records"
            onMouseEnter={() => !pinned && schedulePeek(true)}
            onMouseLeave={() => !pinned && schedulePeek(false)}
            onFocus={() => !pinned && setPeek(true)}
            onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPeek(false);
            }}
            onKeyDown={(e) => {
                if (e.key === 'Escape' && peek) {
                    setPeek(false);
                    (document.activeElement as HTMLElement | null)?.blur();
                }
            }}
            sx={{
                ...glassSurfaceSx,
                position: 'fixed',
                top,
                left: DOCK.inset,
                zIndex: 1300,
                width: expanded ? DOCK.expandedWidth : DOCK.railWidth,
                maxHeight: `calc(100vh - ${top + DOCK.inset}px)`,
                display: 'flex',
                flexDirection: 'column',
                p: 1,
                boxSizing: 'border-box',
                overflow: 'hidden',
                borderRadius: GLASS_RADIUS,
                boxShadow: peek && !pinned ? GLASS_SHADOW_RAISED : GLASS_SHADOW,
                transition: `width 0.22s ${EASE}, top 0.22s ${EASE}, box-shadow 0.22s ${EASE}`,
                '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
            }}
        >
            {/* Header: hidden on the resting rail, slides in when the dock opens (peek or pinned). */}
            <Box
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexShrink: 0,
                    height: expanded ? 36 : 0,
                    mb: expanded ? 0.5 : 0,
                    pl: 1.25,
                    overflow: 'hidden',
                    transition: `height 0.22s ${EASE}, margin 0.22s ${EASE}`,
                }}
            >
                <Typography
                    component="span"
                    sx={{
                        ...labelSx,
                        fontSize: '0.66rem',
                        fontWeight: 700,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        color: 'var(--mui-palette-text-muted)',
                    }}
                >
                    Related
                </Typography>
                <Tooltip title={`${pinned ? 'Collapse' : 'Keep open'} (Ctrl+\\)`} placement="right">
                    <IconButton
                        size="small"
                        onClick={onTogglePinned}
                        aria-pressed={pinned}
                        aria-label={pinned ? 'Collapse sidebar' : 'Keep sidebar open'}
                        tabIndex={expanded ? 0 : -1}
                        sx={{
                            ...labelSx,
                            width: 30,
                            height: 30,
                            borderRadius: '9px',
                            border: '1px solid transparent',
                            color: 'var(--mui-palette-text-secondary)',
                            transition: 'all 0.15s ease',
                            '& svg': { fontSize: 17 },
                            '&:hover': {
                                borderColor: 'var(--crm-blue-300)',
                                backgroundColor: 'var(--mui-palette-primary-soft)',
                                color: 'var(--crm-text-blue-700)',
                            },
                            '&.Mui-focusVisible': { boxShadow: '0 0 0 3px rgb(var(--crm-accent-rgb) / 0.22)' },
                        }}
                    >
                        {pinned ? <KeyboardDoubleArrowLeftIcon /> : <PushPinOutlinedIcon />}
                    </IconButton>
                </Tooltip>
            </Box>

            <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
                <List disablePadding sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                    {modules.map((item) => {
                        const isActive = item.id === activeModuleId;
                        const hasCount = item.count > 0;

                        return (
                            <ListItem key={item.id} disablePadding>
                                <ListItemButton
                                    onClick={() => {
                                        item.onClick?.();
                                        onModuleSelect?.(item.id);
                                    }}
                                    selected={isActive}
                                    aria-label={`${item.label} (${item.count})`}
                                    sx={{
                                        borderRadius: '12px',
                                        minHeight: 44,
                                        p: 0,
                                        pr: 1,
                                        color: isActive ? 'var(--crm-text-blue-700)' : 'var(--crm-slate-700)',
                                        backgroundColor: isActive ? 'var(--mui-palette-primary-soft) !important' : 'transparent',
                                        boxShadow: isActive ? 'inset 0 0 0 1px var(--mui-palette-primary-softBorder)' : 'none',
                                        transition: 'background-color 0.15s ease, color 0.15s ease',
                                        '&:hover': {
                                            backgroundColor: 'var(--mui-palette-primary-soft)',
                                            color: 'var(--crm-text-blue-700)',
                                        },
                                        '&.Mui-focusVisible': {
                                            boxShadow: '0 0 0 3px rgb(var(--crm-accent-rgb) / 0.22)',
                                        },
                                    }}
                                >
                                    {/* Fixed 48px icon column so icons don't move while the dock widens. */}
                                    <Box
                                        sx={{
                                            position: 'relative',
                                            width: 48,
                                            minWidth: 48,
                                            height: 44,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            color: isActive ? 'var(--crm-text-blue-700)' : 'inherit',
                                            '& svg': { fontSize: 20 },
                                        }}
                                    >
                                        {item.icon}
                                        {hasCount && (
                                            <Box
                                                aria-hidden
                                                sx={{
                                                    position: 'absolute',
                                                    top: 6,
                                                    right: 6,
                                                    minWidth: 16,
                                                    height: 16,
                                                    px: 0.4,
                                                    borderRadius: '8px',
                                                    fontSize: '0.6rem',
                                                    fontWeight: 700,
                                                    lineHeight: '16px',
                                                    textAlign: 'center',
                                                    color: '#ffffff',
                                                    backgroundColor: 'var(--crm-fill-blue-600)',
                                                    boxShadow: '0 0 0 2px var(--mui-palette-background-paper)',
                                                    opacity: expanded ? 0 : 1,
                                                    transform: expanded ? 'scale(0.6)' : 'scale(1)',
                                                    transition: `opacity 0.15s ${EASE}, transform 0.15s ${EASE}`,
                                                }}
                                            >
                                                {item.count > 99 ? '99+' : item.count}
                                            </Box>
                                        )}
                                    </Box>

                                    <Typography
                                        component="span"
                                        sx={{
                                            ...labelSx,
                                            flex: 1,
                                            minWidth: 0,
                                            textOverflow: 'ellipsis',
                                            fontSize: '0.8rem',
                                            fontWeight: isActive ? 700 : 600,
                                            color: 'inherit',
                                        }}
                                    >
                                        {item.label}
                                    </Typography>

                                    <Box
                                        component="span"
                                        sx={{
                                            ...labelSx,
                                            ml: 1,
                                            minWidth: 24,
                                            height: 20,
                                            px: 0.75,
                                            borderRadius: '6px',
                                            fontSize: '0.68rem',
                                            fontWeight: 700,
                                            lineHeight: '18px',
                                            textAlign: 'center',
                                            boxSizing: 'border-box',
                                            backgroundColor: hasCount ? 'var(--mui-palette-primary-soft)' : 'var(--mui-palette-background-hover)',
                                            color: hasCount ? 'var(--crm-text-blue-600)' : 'var(--mui-palette-text-secondary)',
                                            border: hasCount
                                                ? '1px solid var(--mui-palette-primary-softBorder)'
                                                : '1px solid var(--mui-palette-border-main)',
                                        }}
                                    >
                                        {item.count}
                                    </Box>
                                </ListItemButton>
                            </ListItem>
                        );
                    })}
                </List>
            </Box>

        </Box>
    );
}
