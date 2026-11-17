'use client';

import React from 'react';
import { Box, ButtonBase, Typography } from '@mui/material';

/** Colour family of a card; each maps to theme tokens so light (blue) / dark (green) stay consistent. */
export type StatusSummaryTone = 'brand' | 'warning' | 'success' | 'error' | 'neutral';

export interface StatusSummaryItem<TId extends string = string> {
    id: TId;
    label: string;
    count: number;
    icon?: React.ReactNode;
    tone?: StatusSummaryTone;
    /** Short hint under the count, e.g. which statuses the card covers. */
    hint?: string;
}

export interface StatusSummaryCardsProps<TId extends string = string> {
    items: StatusSummaryItem<TId>[];
    activeId: TId;
    onChange: (id: TId) => void;
    /** Count the share percentages against (defaults to the first item's count, i.e. "All"). */
    total?: number;
    /** Id of the card that means "no status filter"; clicking the active card returns to it. */
    allId?: TId;
}

/** Theme colour per tone: `-main` tokens already switch for dark mode (brand = blue / green). */
const TONE_COLOR: Record<StatusSummaryTone, string> = {
    brand: 'var(--mui-palette-primary-main)',
    warning: 'var(--mui-palette-warning-main)',
    success: 'var(--mui-palette-success-main)',
    error: 'var(--mui-palette-error-main)',
    neutral: 'var(--mui-palette-text-muted)',
};

const PAPER = 'var(--mui-palette-background-paper)';
const mix = (color: string, pct: number, base = 'transparent') => `color-mix(in srgb, ${color} ${pct}%, ${base})`;
const tint = (color: string, pct: number) => `linear-gradient(145deg, ${mix(color, pct, PAPER)} 0%, ${PAPER} 72%)`;

const formatCount = (n: number) => n.toLocaleString('en-IN');
const formatShare = (share: number) => (share > 0 && share < 0.1 ? '<0.1' : share.toFixed(1).replace(/\.0$/, ''));

/**
 * Status summary cards (KPI tiles) shown above a master list: one card per status bucket with its count and
 * share of the total. Clicking a card filters the list to that bucket; clicking the active card clears it.
 */
export function StatusSummaryCards<TId extends string = string>({
    items,
    activeId,
    onChange,
    total,
    allId,
}: StatusSummaryCardsProps<TId>) {
    const base = total ?? items[0]?.count ?? 0;
    const resetId = allId ?? items[0]?.id;

    return (
        <Box
            role="group"
            aria-label="Status summary"
            sx={{
                display: 'grid',
                gap: 1.75,
                mb: 2,
                minWidth: 0,
                // Phones: one swipeable row. Wider screens: equal columns.
                gridAutoFlow: { xs: 'column', md: 'row' },
                gridAutoColumns: { xs: 'minmax(170px, 1fr)', md: 'unset' },
                gridTemplateColumns: { xs: 'none', md: `repeat(${items.length}, minmax(0, 1fr))` },
                overflowX: { xs: 'auto', md: 'visible' },
                // Room for the hover lift and focus ring inside the scroll container.
                pt: 0.5,
                pb: { xs: 1, md: 0.5 },
                px: { xs: 0.25, md: 0 },
            }}
        >
            {items.map((item) => {
                const c = TONE_COLOR[item.tone ?? 'brand'];
                const isActive = item.id === activeId;
                const isAll = item.id === resetId;
                const share = base > 0 ? (item.count / base) * 100 : 0;

                return (
                    <ButtonBase
                        key={item.id}
                        aria-pressed={isActive}
                        onClick={() => onChange(isActive && resetId !== undefined ? resetId : item.id)}
                        sx={{
                            position: 'relative',
                            overflow: 'hidden',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'stretch',
                            textAlign: 'left',
                            gap: 1.25,
                            p: 2,
                            borderRadius: '14px',
                            background: tint(c, isActive ? 16 : 7),
                            border: `1px solid ${isActive ? c : mix(c, 22, 'var(--mui-palette-border-main)')}`,
                            boxShadow: isActive
                                ? `0 0 0 3px ${mix(c, 18)}, 0 10px 24px -14px ${mix(c, 70)}`
                                : '0 1px 2px rgba(15, 23, 42, 0.04)',
                            transition: 'transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease, background 0.18s ease',
                            '&:hover': {
                                background: tint(c, isActive ? 18 : 11),
                                borderColor: isActive ? c : mix(c, 45, 'var(--mui-palette-border-main)'),
                                transform: 'translateY(-2px)',
                                boxShadow: isActive
                                    ? `0 0 0 3px ${mix(c, 18)}, 0 14px 28px -14px ${mix(c, 75)}`
                                    : `0 12px 26px -14px ${mix(c, 60)}`,
                            },
                            '&:active': { transform: 'translateY(0)' },
                            '&.Mui-focusVisible': { boxShadow: `0 0 0 3px ${mix(c, 30)}` },
                        }}
                    >
                        {/* Large faded icon in the corner */}
                        <Box
                            aria-hidden
                            sx={{
                                position: 'absolute',
                                right: -14,
                                bottom: -18,
                                color: c,
                                opacity: isActive ? 0.12 : 0.07,
                                pointerEvents: 'none',
                                transition: 'opacity 0.18s ease, transform 0.25s ease',
                                '& svg': { fontSize: 96 },
                                '.MuiButtonBase-root:hover > &': { transform: 'rotate(-8deg) scale(1.05)' },
                            }}
                        >
                            {item.icon}
                        </Box>

                        {/* Icon tile + label + share */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, position: 'relative' }}>
                            <Box
                                sx={{
                                    width: 38,
                                    height: 38,
                                    flexShrink: 0,
                                    borderRadius: '11px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: c,
                                    backgroundColor: mix(c, 15),
                                    border: `1px solid ${mix(c, 26)}`,
                                    '& svg': { fontSize: 20 },
                                }}
                            >
                                {item.icon}
                            </Box>
                            <Typography
                                sx={{
                                    flex: 1,
                                    minWidth: 0,
                                    fontSize: '0.74rem',
                                    fontWeight: 700,
                                    letterSpacing: '0.05em',
                                    textTransform: 'uppercase',
                                    color: isActive ? 'var(--crm-slate-900)' : 'var(--mui-palette-text-secondary)',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                }}
                            >
                                {item.label}
                            </Typography>
                            {!isAll && (
                                <Box
                                    component="span"
                                    sx={{
                                        flexShrink: 0,
                                        px: 0.9,
                                        py: 0.25,
                                        borderRadius: '999px',
                                        fontSize: '0.7rem',
                                        fontWeight: 700,
                                        color: c,
                                        backgroundColor: mix(c, 13),
                                        fontVariantNumeric: 'tabular-nums',
                                    }}
                                >
                                    {formatShare(share)}%
                                </Box>
                            )}
                        </Box>

                        {/* Count + hint */}
                        <Box sx={{ position: 'relative', minWidth: 0 }}>
                            <Typography
                                sx={{
                                    fontSize: '2rem',
                                    fontWeight: 800,
                                    lineHeight: 1.1,
                                    letterSpacing: '-0.02em',
                                    color: 'var(--crm-slate-900)',
                                    fontVariantNumeric: 'tabular-nums',
                                }}
                            >
                                {formatCount(item.count)}
                            </Typography>
                            {item.hint && (
                                <Typography
                                    title={item.hint}
                                    sx={{
                                        mt: 0.25,
                                        fontSize: '0.74rem',
                                        color: 'var(--mui-palette-text-muted)',
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                    }}
                                >
                                    {item.hint}
                                </Typography>
                            )}
                        </Box>

                        {/* Share bar */}
                        <Box
                            sx={{
                                position: 'relative',
                                height: 6,
                                borderRadius: 3,
                                overflow: 'hidden',
                                backgroundColor: mix(c, 12),
                            }}
                        >
                            <Box
                                sx={{
                                    height: '100%',
                                    width: `${Math.min(isAll ? 100 : share, 100)}%`,
                                    minWidth: item.count > 0 ? 6 : 0,
                                    borderRadius: 3,
                                    background: `linear-gradient(90deg, ${mix(c, 65)} 0%, ${c} 100%)`,
                                    transition: 'width 0.4s ease',
                                }}
                            />
                        </Box>
                    </ButtonBase>
                );
            })}
        </Box>
    );
}
