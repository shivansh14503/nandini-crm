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
    /** Short hint under the label, e.g. which statuses the card covers. */
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

const TONES: Record<StatusSummaryTone, { soft: string; fg: string; bar: string }> = {
    brand: { soft: 'var(--mui-palette-primary-soft)', fg: 'var(--crm-text-blue-600)', bar: 'var(--crm-text-blue-600)' },
    warning: { soft: 'var(--mui-palette-warning-soft)', fg: 'var(--crm-amber-700)', bar: 'var(--mui-palette-warning-main)' },
    success: { soft: 'var(--mui-palette-success-soft)', fg: 'var(--crm-emerald-700)', bar: 'var(--mui-palette-success-main)' },
    error: { soft: 'var(--mui-palette-error-soft)', fg: 'var(--crm-red-700)', bar: 'var(--mui-palette-error-main)' },
    neutral: { soft: 'var(--mui-palette-background-hover)', fg: 'var(--mui-palette-text-secondary)', bar: 'var(--mui-palette-text-muted)' },
};

const formatCount = (n: number) => n.toLocaleString('en-IN');

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
                gap: 1.5,
                mb: 2,
                minWidth: 0,
                // Phones: one swipeable row. Wider screens: equal columns.
                gridAutoFlow: { xs: 'column', md: 'row' },
                gridAutoColumns: { xs: 'minmax(150px, 1fr)', md: 'unset' },
                gridTemplateColumns: { xs: 'none', md: `repeat(${items.length}, minmax(0, 1fr))` },
                overflowX: { xs: 'auto', md: 'visible' },
                pb: { xs: 0.5, md: 0 },
            }}
        >
            {items.map((item) => {
                const tone = TONES[item.tone ?? 'brand'];
                const isActive = item.id === activeId;
                const isAll = item.id === resetId;
                const share = base > 0 ? (item.count / base) * 100 : 0;

                return (
                    <ButtonBase
                        key={item.id}
                        aria-pressed={isActive}
                        onClick={() => onChange(isActive && resetId !== undefined ? resetId : item.id)}
                        sx={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'stretch',
                            textAlign: 'left',
                            gap: 0.75,
                            p: 1.5,
                            borderRadius: '10px',
                            backgroundColor: 'var(--mui-palette-background-paper)',
                            border: '1px solid',
                            borderColor: isActive ? 'var(--mui-palette-primary-main)' : 'var(--mui-palette-border-main)',
                            boxShadow: isActive
                                ? '0 0 0 3px rgb(var(--crm-accent-rgb) / 0.16)'
                                : '0 1px 3px rgba(0,0,0,0.04)',
                            transition: 'all 0.15s ease',
                            '&:hover': {
                                borderColor: isActive ? 'var(--mui-palette-primary-main)' : 'var(--crm-blue-300)',
                            },
                            '&.Mui-focusVisible': {
                                boxShadow: '0 0 0 3px rgb(var(--crm-accent-rgb) / 0.22)',
                            },
                        }}
                    >
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                            <Box
                                sx={{
                                    width: 30,
                                    height: 30,
                                    borderRadius: '8px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    backgroundColor: tone.soft,
                                    color: tone.fg,
                                    '& svg': { fontSize: 18 },
                                }}
                            >
                                {item.icon}
                            </Box>
                            {!isAll && (
                                <Typography
                                    component="span"
                                    sx={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--mui-palette-text-muted)' }}
                                >
                                    {share > 0 && share < 0.1 ? '<0.1' : share.toFixed(1).replace(/\.0$/, '')}%
                                </Typography>
                            )}
                        </Box>

                        <Box sx={{ minWidth: 0 }}>
                            <Typography
                                sx={{
                                    fontSize: '0.78rem',
                                    fontWeight: 600,
                                    color: isActive ? 'var(--crm-text-blue-900)' : 'var(--mui-palette-text-secondary)',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                }}
                            >
                                {item.label}
                            </Typography>
                            <Typography
                                sx={{
                                    fontSize: '1.45rem',
                                    fontWeight: 700,
                                    lineHeight: 1.2,
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
                                        fontSize: '0.7rem',
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

                        <Box
                            sx={{
                                height: 4,
                                borderRadius: 2,
                                overflow: 'hidden',
                                backgroundColor: 'var(--mui-palette-background-hover)',
                            }}
                        >
                            <Box
                                sx={{
                                    height: '100%',
                                    width: `${Math.min(isAll ? 100 : share, 100)}%`,
                                    backgroundColor: tone.bar,
                                    borderRadius: 2,
                                    transition: 'width 0.3s ease',
                                }}
                            />
                        </Box>
                    </ButtonBase>
                );
            })}
        </Box>
    );
}
