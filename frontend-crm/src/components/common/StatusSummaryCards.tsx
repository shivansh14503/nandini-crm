'use client';

import React from 'react';
import NextLink from 'next/link';
import { Box, ButtonBase, IconButton, Skeleton, Tooltip, Typography } from '@mui/material';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import { fmtCount, useDisplayFormats } from '@/utils/formats';

/** Colour family of a card; each maps to theme tokens so light (blue) / dark (green) stay consistent. */
export type StatusSummaryTone = 'brand' | 'warning' | 'success' | 'error' | 'neutral';

export interface StatusSummaryItem<TId extends string = string> {
    id: TId;
    label: string;
    count: number;
    icon?: React.ReactNode;
    tone?: StatusSummaryTone;
    /** Any CSS color (e.g. an admin-picked scorecard color); overrides `tone`. */
    color?: string;
    /** Short hint under the count, e.g. which statuses the card covers. */
    hint?: string;
    /** Formatted money total of the card's records (e.g. "₹2,28,377"), shown under the count. */
    amount?: string;
    /** What `amount` totals, shown above it (e.g. "Actual (Before Tax)"). */
    amountLabel?: string;
}

export interface StatusSummaryCardsProps<TId extends string = string> {
    items: StatusSummaryItem<TId>[];
    activeId: TId;
    onChange: (id: TId) => void;
    /** Count the share percentages against (defaults to the first item's count, i.e. "All"). */
    total?: number;
    /** Id of the card that means "no status filter"; clicking the active card returns to it. */
    allId?: TId;
    /** Shows a gear on the "All" card that opens these cards' settings (admins: Admin › List Scorecards). */
    settingsHref?: string;
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

const formatCount = (n: number) => fmtCount(n);
const formatShare = (share: number) => (share > 0 && share < 0.1 ? '<0.1' : share.toFixed(1).replace(/\.0$/, ''));

/* ------------------------------------------------------------------------------------------------------------
 * Fit-to-width sizing. The cards share the row equally, and the more cards there are, the smaller each one gets
 * (padding, icon, fonts, gaps). Only when a card would get narrower than a readable minimum does the row wrap
 * onto a second line (phones, or a very long list of cards).
 *
 * Exception: while a record drawer sits beside the list (wide screens, see `CommonMasterView`), the row stays a
 * single line and scrolls sideways instead of wrapping or squashing the cards (`ScorecardScrollContext`).
 * ---------------------------------------------------------------------------------------------------------- */

/**
 * True while a side drawer narrows the list on wide (lg+) screens: the scorecard row then scrolls sideways.
 * Provided by `CommonMasterView`; anywhere else (admin preview, settings pages) the row fits the width as usual.
 */
export const ScorecardScrollContext = React.createContext(false);

/** Size steps from roomy (0) to dense (3). */
type Density = 0 | 1 | 2 | 3;

const SIZES = {
    /** Gap between cards (theme spacing units: 8 px). */
    gap: [1.75, 1.25, 1, 0.75],
    pad: [2, 1.5, 1.25, 1],
    /** Gap between the rows inside a card (theme spacing units). */
    stack: [1.25, 1, 0.75, 0.6],
    radius: ['14px', '12px', '11px', '10px'],
    tile: [38, 32, 28, 24],
    tileRadius: ['11px', '9px', '8px', '7px'],
    tileIcon: [20, 18, 16, 14],
    labelGap: [1.25, 1, 0.75, 0.6],
    label: ['0.74rem', '0.7rem', '0.66rem', '0.62rem'],
    labelSpacing: ['0.05em', '0.045em', '0.035em', '0.03em'],
    count: ['2rem', '1.65rem', '1.4rem', '1.2rem'],
    hint: ['0.74rem', '0.7rem', '0.66rem', '0.62rem'],
    amountLabel: ['0.68rem', '0.64rem', '0.6rem', '0.58rem'],
    amount: ['0.95rem', '0.88rem', '0.8rem', '0.74rem'],
    pill: ['0.7rem', '0.66rem', '0.62rem', '0.6rem'],
    bar: [6, 5, 5, 4],
    watermark: [96, 80, 66, 54],
    /** The settings gear on the "All" card (mouse screens; touch screens keep 32 px). */
    gear: [28, 26, 24, 24],
    gearInset: [10, 8, 7, 6],
} as const;

/** Narrowest a card may get in the sideways-scrolling row (drawer open), per density. */
const SCROLL_CARD_PX = [184, 164, 150, 140] as const;

/** Narrowest a card may get before the row wraps, per breakpoint. */
const MIN_CARD_PX = { xs: 136, sm: 124, md: 104 } as const;

type Bp = 'xs' | 'sm' | 'md' | 'lg';
const BPS: readonly Bp[] = ['xs', 'sm', 'md', 'lg'];

/** Density for a number of cards on a wide (lg+) screen. */
const densityForCount = (count: number): Density => (count <= 4 ? 0 : count <= 6 ? 1 : count <= 8 ? 2 : 3);

/**
 * Density per breakpoint: phones and small tablets wrap into a grid of narrow cards, so they always use a small
 * step; laptops (md) are one step denser than wide screens for the same number of cards.
 */
const densityByBp = (count: number, scroll = false): Record<Bp, Density> => {
    const wide = densityForCount(count);
    const md = Math.min(wide + 1, 3) as Density;
    return {
        xs: count <= 2 ? 1 : 2,
        sm: count <= 3 ? 1 : 2,
        md,
        // With a drawer beside the list the row is about as wide as a laptop's: use the laptop step.
        lg: scroll ? md : wide,
    };
};

/** A responsive `sx` value for one size: `{ xs, sm, md, lg }` picked from `SIZES[key]` by density. */
const sized = <K extends keyof typeof SIZES>(d: Record<Bp, Density>, key: K, map?: (v: (typeof SIZES)[K][number]) => unknown) =>
    Object.fromEntries(BPS.map((bp) => [bp, map ? map(SIZES[key][d[bp]]) : SIZES[key][d[bp]]])) as Record<Bp, never>;

/**
 * The cards' grid: every card gets an equal share of the row (`100% / count`, less the gaps); when that share
 * would be below the breakpoint's minimum card width, columns of the minimum width wrap instead.
 *
 * With `scroll` (a drawer narrows the list on lg+ screens) the cards stay on one line: they still share the row
 * equally while they fit, and past their minimum width the row scrolls sideways (touch, trackpad, shift + wheel
 * or the slim scrollbar) with soft snapping to each card. Phones and tablets keep the wrapping grid, since the
 * drawer covers the list there instead of narrowing it.
 */
const gridSx = (count: number, d: Record<Bp, Density>, scroll = false) => {
    const n = Math.max(count, 1);
    const columns = (bp: Bp) => {
        const gapPx = SIZES.gap[d[bp]] * 8;
        const min = MIN_CARD_PX[bp === 'lg' ? 'md' : bp];
        // 0.5 px of slack so rounding never pushes the last card onto a new line.
        return `repeat(auto-fit, minmax(max(${min}px, calc((100% - ${(n - 1) * gapPx}px) / ${n} - 0.5px)), 1fr))`;
    };
    const base = {
        display: 'grid',
        minWidth: 0,
        mb: 2,
        gap: sized(d, 'gap'),
        gridTemplateColumns: Object.fromEntries(BPS.map((bp) => [bp, columns(bp)])),
        // Room for the hover lift and focus ring.
        pt: 0.5,
    };
    if (!scroll) return base;
    // Only lg+ scrolls; below it the drawer overlays the list, so nothing changes under it (no layout shift).
    const lg = <T, U>(below: T, wide: U) => ({ xs: below, lg: wide });
    return {
        ...base,
        gridTemplateColumns: { ...base.gridTemplateColumns, lg: 'none' },
        gridAutoFlow: lg('row', 'column'),
        gridAutoColumns: lg('auto', `minmax(${SCROLL_CARD_PX[d.lg]}px, 1fr)`),
        overflowX: lg('visible', 'auto'),
        overflowY: lg('visible', 'hidden'),
        overscrollBehaviorX: 'contain',
        WebkitOverflowScrolling: 'touch',
        scrollSnapType: lg('none', 'x proximity'),
        scrollPaddingInline: '4px',
        '& > *': { scrollSnapAlign: 'start' },
        // A scrolling box clips its overflow: keep room around the cards for the hover lift, shadows and focus
        // ring (padding inside the box, cancelled by an equal negative margin so the row doesn't move).
        px: lg(0, '4px'),
        mx: lg(0, '-4px'),
        pb: lg(0, 1.25),
        mb: lg(2, 0.75),
        // Slim scrollbar, only as tall as needed; it is the visible cue that more cards are to the side.
        scrollbarWidth: 'thin',
        scrollbarColor: 'var(--mui-palette-border-strong) transparent',
        '&::-webkit-scrollbar': { height: 6 },
        '&::-webkit-scrollbar-track': { background: 'transparent' },
        '&::-webkit-scrollbar-thumb': { backgroundColor: 'var(--mui-palette-border-strong)', borderRadius: 3 },
        '&::-webkit-scrollbar-thumb:hover': { backgroundColor: 'var(--mui-palette-text-muted)' },
    } as const;
};

const skeletonSx = { bgcolor: 'var(--mui-palette-background-hover)' } as const;

/** Placeholder row of cards while the records / scorecard load. */
export function StatusSummaryCardsSkeleton({
    count = 5,
    withAmount,
}: {
    count?: number;
    /** The cards will show amounts: same shape, so they don't jump when they load. */
    withAmount?: boolean;
}) {
    const scroll = React.useContext(ScorecardScrollContext);
    const d = densityByBp(count, scroll);
    return (
        <Box sx={gridSx(count, d, scroll)} aria-busy="true" aria-label="Loading summary">
            {Array.from({ length: count }, (_, i) => (
                <Box
                    key={i}
                    sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        minWidth: 0,
                        gap: sized(d, 'stack'),
                        p: sized(d, 'pad'),
                        borderRadius: sized(d, 'radius'),
                        border: '1px solid var(--mui-palette-border-main)',
                        backgroundColor: 'var(--mui-palette-background-paper)',
                    }}
                >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: sized(d, 'labelGap') }}>
                        <Skeleton
                            variant="rounded"
                            sx={{ ...skeletonSx, width: sized(d, 'tile'), height: sized(d, 'tile'), borderRadius: sized(d, 'tileRadius'), flexShrink: 0 }}
                        />
                        <Skeleton variant="rounded" height={12} width="45%" sx={skeletonSx} />
                    </Box>
                    <Skeleton variant="rounded" width="40%" sx={{ ...skeletonSx, height: sized(d, 'count', (v) => `calc(${v} * 1.1)`) }} />
                    {withAmount ? (
                        <Skeleton variant="rounded" height={12} width="70%" sx={skeletonSx} />
                    ) : (
                        <Skeleton variant="rounded" height={10} width="60%" sx={skeletonSx} />
                    )}
                    <Skeleton variant="rounded" sx={{ ...skeletonSx, height: sized(d, 'bar'), mt: 'auto' }} />
                </Box>
            ))}
        </Box>
    );
}

/**
 * Status summary cards (KPI tiles) shown above a master list: one card per status bucket with its count and
 * share of the total. Clicking a card filters the list to that bucket; clicking the active card clears it.
 * The cards fit the width (more cards means smaller cards), except while a side drawer narrows the list on wide
 * screens: the row then stays on one line and scrolls sideways (`ScorecardScrollContext`).
 */
export function StatusSummaryCards<TId extends string = string>({
    items,
    activeId,
    onChange,
    total,
    allId,
    settingsHref,
}: StatusSummaryCardsProps<TId>) {
    useDisplayFormats();
    const base = total ?? items[0]?.count ?? 0;
    const resetId = allId ?? items[0]?.id;
    const scroll = React.useContext(ScorecardScrollContext);
    const d = densityByBp(items.length, scroll);

    return (
        <Box sx={gridSx(items.length, d, scroll)} role="group" aria-label="Status summary">
            {items.map((item) => {
                const c = item.color ?? TONE_COLOR[item.tone ?? 'brand'];
                const isActive = item.id === activeId;
                const isAll = item.id === resetId;
                const showGear = isAll && Boolean(settingsHref);
                const share = base > 0 ? (item.count / base) * 100 : 0;
                const multiWord = /[\s/]/.test(item.label.trim());

                return (
                    <Box key={item.id} sx={{ position: 'relative', display: 'flex', minWidth: 0 }}>
                    <ButtonBase
                        aria-pressed={isActive}
                        onClick={() => onChange(isActive && resetId !== undefined ? resetId : item.id)}
                        sx={{
                            position: 'relative',
                            overflow: 'hidden',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'stretch',
                            // Cards without a hint are shorter than the row; keep their content at the top.
                            justifyContent: 'flex-start',
                            textAlign: 'left',
                            gap: sized(d, 'stack'),
                            p: sized(d, 'pad'),
                            borderRadius: sized(d, 'radius'),
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
                            flex: 1,
                            minWidth: 0,
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
                                '& svg': { fontSize: sized(d, 'watermark') },
                                '.MuiButtonBase-root:hover > &': { transform: 'rotate(-8deg) scale(1.05)' },
                            }}
                        >
                            {item.icon}
                        </Box>

                        {/* Icon tile + label */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: sized(d, 'labelGap'), position: 'relative', minWidth: 0 }}>
                            <Box
                                sx={{
                                    width: sized(d, 'tile'),
                                    height: sized(d, 'tile'),
                                    flexShrink: 0,
                                    borderRadius: sized(d, 'tileRadius'),
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: c,
                                    backgroundColor: mix(c, 15),
                                    border: `1px solid ${mix(c, 26)}`,
                                    '& svg': { fontSize: sized(d, 'tileIcon') },
                                }}
                            >
                                {item.icon}
                            </Box>
                            <Typography
                                title={item.label}
                                sx={{
                                    flex: 1,
                                    minWidth: 0,
                                    fontSize: sized(d, 'label'),
                                    fontWeight: 700,
                                    lineHeight: 1.3,
                                    letterSpacing: sized(d, 'labelSpacing'),
                                    textTransform: 'uppercase',
                                    color: isActive ? 'var(--crm-slate-900)' : 'var(--mui-palette-text-secondary)',
                                    overflow: 'hidden',
                                    // A name of several words ("Proposal/Price Quote") may take a second line beside
                                    // the icon tile; a single word stays on one line and ends in an ellipsis.
                                    ...(multiWord
                                        ? { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflowWrap: 'break-word' }
                                        : { whiteSpace: 'nowrap', textOverflow: 'ellipsis' }),
                                }}
                            >
                                {/* A slash is a place to wrap, like a space. */}
                                {multiWord ? item.label.replace(/\//g, '/​') : item.label}
                            </Typography>
                            {/* Room for the settings gear, which sits over this corner. */}
                            {showGear && <Box sx={{ width: { ...sized(d, 'gear', (v) => v + 2), xs: 30, sm: 30 }, flexShrink: 0 }} />}
                        </Box>

                        {/* Count + hint, with the money total beside the count (below it when the card is narrow) */}
                        <Box
                            sx={{
                                position: 'relative',
                                minWidth: 0,
                                display: 'flex',
                                flexWrap: 'wrap',
                                alignItems: 'flex-end',
                                columnGap: 1.5,
                                rowGap: 0.25,
                            }}
                        >
                            <Box sx={{ minWidth: 0, maxWidth: '100%' }}>
                                <Typography
                                    sx={{
                                        fontSize: sized(d, 'count'),
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
                                            fontSize: sized(d, 'hint'),
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

                            {item.amount !== undefined && (
                                <Box sx={{ ml: 'auto', minWidth: 0, maxWidth: '100%', textAlign: 'right', pb: 0.25 }}>
                                    {item.amountLabel && (
                                        <Typography
                                            sx={{
                                                fontSize: sized(d, 'amountLabel'),
                                                fontWeight: 600,
                                                lineHeight: 1.3,
                                                color: 'var(--mui-palette-text-muted)',
                                                whiteSpace: 'nowrap',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                            }}
                                        >
                                            {item.amountLabel}
                                        </Typography>
                                    )}
                                    <Typography
                                        title={item.amountLabel ? `${item.amountLabel}: ${item.amount}` : item.amount}
                                        sx={{
                                            fontSize: sized(d, 'amount'),
                                            fontWeight: 700,
                                            lineHeight: 1.3,
                                            color: 'var(--crm-slate-900)',
                                            fontVariantNumeric: 'tabular-nums',
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                        }}
                                    >
                                        {item.amount}
                                    </Typography>
                                </Box>
                            )}
                        </Box>

                        {/* Share bar, pinned to the bottom so bars line up across cards, with the share pill at its
                            end (leaving the label the full width of the card). */}
                        <Box sx={{ position: 'relative', mt: 'auto', display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                            <Box
                                sx={{
                                    position: 'relative',
                                    flex: 1,
                                    minWidth: 0,
                                    height: sized(d, 'bar'),
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
                            {!isAll && (
                                <Box
                                    component="span"
                                    sx={{
                                        flexShrink: 0,
                                        px: 0.75,
                                        py: 0.2,
                                        borderRadius: '999px',
                                        fontSize: sized(d, 'pill'),
                                        fontWeight: 700,
                                        lineHeight: 1.4,
                                        color: c,
                                        backgroundColor: mix(c, 13),
                                        fontVariantNumeric: 'tabular-nums',
                                    }}
                                >
                                    {formatShare(share)}%
                                </Box>
                            )}
                        </Box>
                    </ButtonBase>
                    {showGear && settingsHref && (
                        <Tooltip title="Scorecard settings">
                            <IconButton
                                component={NextLink}
                                href={settingsHref}
                                size="small"
                                aria-label="Scorecard settings"
                                sx={{
                                    position: 'absolute',
                                    top: { ...sized(d, 'gearInset'), xs: 8, sm: 8 },
                                    right: { ...sized(d, 'gearInset'), xs: 8, sm: 8 },
                                    // At least 32 px to tap on touch screens.
                                    width: { ...sized(d, 'gear'), xs: 32, sm: 32 },
                                    height: { ...sized(d, 'gear'), xs: 32, sm: 32 },
                                    border: '1px solid var(--mui-palette-border-main)',
                                    color: 'var(--mui-palette-text-secondary)',
                                    backgroundColor: 'var(--mui-palette-background-paper)',
                                    transition: 'all 0.15s ease',
                                    '&:hover': {
                                        borderColor: 'var(--crm-blue-300)',
                                        backgroundColor: 'var(--mui-palette-primary-soft)',
                                        color: 'var(--crm-text-blue-700)',
                                    },
                                }}
                            >
                                <SettingsOutlinedIcon sx={{ fontSize: 15 }} />
                            </IconButton>
                        </Tooltip>
                    )}
                    </Box>
                );
            })}
        </Box>
    );
}
