'use client';

import React from 'react';
import Link from 'next/link';
import { Box, Chip, Skeleton, Tooltip, Typography } from '@mui/material';
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';
import type { ProductUsage } from '@/types/product.types';
import { productOpportunitiesHref, usageStatusOf, type OpportunityOutcome } from '@/utils/productUsage';

/**
 * Product usage: how many opportunities carry the product on a line item (quotations don't count), split into
 * won / lost / open. The chip (Used blue in light mode, green in dark mode; Unused grey) shows on the list, the
 * drawer header and the view page; every count opens the Opportunities list filtered to the product and outcome.
 */

/** Outcome colours: won green, lost red, open amber (semantic, the same in both themes). */
const OUTCOME_STYLE: Record<OpportunityOutcome, { main: string; text: string; soft: string; border: string }> = {
    Won: {
        main: 'var(--mui-palette-success-main)',
        text: 'var(--crm-green-700)',
        soft: 'var(--mui-palette-success-soft)',
        border: 'var(--mui-palette-success-softBorder)',
    },
    Lost: {
        main: 'var(--mui-palette-error-main)',
        text: 'var(--crm-red-700)',
        soft: 'var(--mui-palette-error-soft)',
        border: 'var(--mui-palette-error-softBorder)',
    },
    Open: {
        main: 'var(--mui-palette-warning-main)',
        text: 'var(--crm-amber-700)',
        soft: 'var(--mui-palette-warning-soft)',
        border: 'var(--mui-palette-warning-softBorder)',
    },
};

const OUTCOME_COUNT: Record<OpportunityOutcome, keyof ProductUsage> = { Won: 'won', Lost: 'lost', Open: 'open' };
const OUTCOMES: OpportunityOutcome[] = ['Won', 'Lost', 'Open'];

const plural = (n: number) => `${n} ${n === 1 ? 'opportunity' : 'opportunities'}`;

export function ProductUsageChip({ usage, size = 'small' }: { usage: ProductUsage | undefined; size?: 'small' | 'medium' }) {
    const status = usageStatusOf(usage);
    if (!status) return null;
    const used = status === 'Used';
    return (
        <Tooltip title={used ? `On ${plural(usage!.total)}` : 'Not on any opportunity yet'} arrow disableInteractive>
            <Chip
                label={status}
                size="small"
                sx={{
                    height: size === 'medium' ? 24 : 20,
                    fontSize: size === 'medium' ? '0.74rem' : '0.7rem',
                    fontWeight: 700,
                    flexShrink: 0,
                    backgroundColor: used ? 'var(--mui-palette-primary-soft)' : 'var(--mui-palette-background-hover)',
                    color: used ? 'var(--crm-text-blue-700)' : 'var(--mui-palette-text-secondary)',
                    border: `1px solid ${used ? 'var(--mui-palette-primary-softBorder)' : 'var(--mui-palette-border-main)'}`,
                }}
            />
        </Tooltip>
    );
}

const linkSx = {
    color: 'inherit',
    textDecoration: 'none',
    borderRadius: '4px',
    '&:hover': { textDecoration: 'underline' },
    '&:focus-visible': { outline: 'none', boxShadow: '0 0 0 3px rgb(var(--crm-accent-rgb) / 0.22)' },
} as const;

/**
 * The drawer's one line: "Used in 12 · 7 won · 3 lost · 2 open" (each part a link), or "Not used in any
 * opportunity yet".
 */
export function ProductUsageLine({ productId, usage }: { productId: string; usage: ProductUsage | undefined }) {
    if (!usage) return null;
    if (usage.total === 0) {
        return <Typography sx={{ fontSize: '0.76rem', color: 'var(--mui-palette-text-muted)', mt: 0.4 }}>Not used in any opportunity yet</Typography>;
    }
    return (
        <Typography component="div" sx={{ fontSize: '0.76rem', color: 'var(--mui-palette-text-secondary)', mt: 0.4, display: 'flex', flexWrap: 'wrap', columnGap: 0.6, rowGap: 0.2 }}>
            <Box component={Link} href={productOpportunitiesHref(productId)} sx={{ ...linkSx, fontWeight: 700, color: 'var(--crm-text-blue-700)' }}>
                Used in {usage.total}
            </Box>
            {OUTCOMES.map((outcome) => (
                <React.Fragment key={outcome}>
                    <span aria-hidden>·</span>
                    <Box
                        component={Link}
                        href={productOpportunitiesHref(productId, outcome)}
                        sx={{ ...linkSx, fontWeight: 600, color: OUTCOME_STYLE[outcome].text }}
                    >
                        {usage[OUTCOME_COUNT[outcome]]} {outcome.toLowerCase()}
                    </Box>
                </React.Fragment>
            ))}
        </Typography>
    );
}

/** The view page's Usage card: chip, Won / Lost / Open counts in one row and a thin split bar. */
export function ProductUsageCard({ productId, usage, loading }: { productId: string; usage: ProductUsage | undefined; loading?: boolean }) {
    if (!loading && !usage) return null;
    const total = usage?.total ?? 0;
    return (
        <Box
            component="section"
            aria-label="Usage"
            sx={{
                mt: 2.5,
                p: { xs: 2, sm: 2.5 },
                borderRadius: '12px',
                backgroundColor: 'var(--mui-palette-background-paper)',
                border: '1px solid var(--mui-palette-border-main)',
            }}
        >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1.75 }}>
                <InsightsOutlinedIcon sx={{ fontSize: 18, color: 'var(--crm-text-blue-600)' }} />
                <Typography sx={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--crm-slate-900)' }}>Usage</Typography>
                {loading ? <Skeleton variant="rounded" width={52} height={22} /> : <ProductUsageChip usage={usage} size="medium" />}
                <Box sx={{ flex: 1 }} />
                {!loading && total > 0 && (
                    <Box
                        component={Link}
                        href={productOpportunitiesHref(productId)}
                        sx={{ ...linkSx, fontSize: '0.8rem', fontWeight: 600, color: 'var(--crm-text-blue-700)' }}
                    >
                        Used in {plural(total)}
                    </Box>
                )}
            </Box>

            {loading ? (
                <Skeleton variant="rounded" height={64} />
            ) : total === 0 ? (
                <Typography sx={{ fontSize: '0.82rem', color: 'var(--mui-palette-text-secondary)' }}>
                    This product isn&apos;t on any opportunity yet.
                </Typography>
            ) : (
                <>
                    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: { xs: 1, sm: 1.5 } }}>
                        {OUTCOMES.map((outcome) => {
                            const style = OUTCOME_STYLE[outcome];
                            const count = usage![OUTCOME_COUNT[outcome]];
                            return (
                                <Box
                                    key={outcome}
                                    component={Link}
                                    href={productOpportunitiesHref(productId, outcome)}
                                    aria-label={`${count} ${outcome.toLowerCase()}: open these opportunities`}
                                    sx={{
                                        display: 'block',
                                        minWidth: 0,
                                        minHeight: 40,
                                        px: { xs: 1.25, sm: 1.75 },
                                        py: 1.25,
                                        borderRadius: '10px',
                                        textDecoration: 'none',
                                        backgroundColor: style.soft,
                                        border: `1px solid ${style.border}`,
                                        transition: 'box-shadow 0.15s ease, border-color 0.15s ease',
                                        '&:hover': { borderColor: style.main, boxShadow: `0 2px 8px color-mix(in srgb, ${style.main} 22%, transparent)` },
                                        '&:focus-visible': { outline: 'none', boxShadow: '0 0 0 3px rgb(var(--crm-accent-rgb) / 0.22)' },
                                    }}
                                >
                                    <Typography sx={{ fontSize: { xs: '1.2rem', sm: '1.4rem' }, fontWeight: 800, lineHeight: 1.1, color: style.text }}>{count}</Typography>
                                    <Typography noWrap sx={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--mui-palette-text-secondary)', mt: 0.3 }}>
                                        {outcome}
                                    </Typography>
                                </Box>
                            );
                        })}
                    </Box>
                    <Box
                        role="img"
                        aria-label={`${usage!.won} won, ${usage!.lost} lost, ${usage!.open} open`}
                        sx={{ display: 'flex', height: 6, mt: 1.75, borderRadius: '9999px', overflow: 'hidden', backgroundColor: 'var(--mui-palette-background-hover)', gap: '2px' }}
                    >
                        {OUTCOMES.map((outcome) => {
                            const count = usage![OUTCOME_COUNT[outcome]];
                            return count > 0 ? <Box key={outcome} sx={{ flexGrow: count, flexBasis: 0, backgroundColor: OUTCOME_STYLE[outcome].main }} /> : null;
                        })}
                    </Box>
                </>
            )}
        </Box>
    );
}
