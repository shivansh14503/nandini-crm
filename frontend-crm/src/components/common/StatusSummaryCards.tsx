'use client';

import React, { useCallback, useState } from 'react';
import { Box, ButtonBase, IconButton, Skeleton, Tooltip, Typography } from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import { useTableScroll } from './DataTable/useTableScroll';

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
    /** Shows a pencil on the "All" card that opens the scorecard settings (admins). */
    onEdit?: () => void;
    /**
     * Many cards: one row at every screen size that scrolls sideways (swipe, trackpad, the arrow buttons on mouse
     * devices, or holding the scroll-wheel button and moving the mouse) instead of wrapping. Without it, more
     * than 6 cards fill rows left to right.
     */
    singleRow?: boolean;
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

/** Same grid as the cards, so swapping the skeleton for real cards doesn't shift the page. */
const gridSx = (count: number) =>
    ({
        display: 'grid',
        gap: 1.75,
        mb: 2,
        minWidth: 0,
        // Phones: one swipeable row. Wider screens: equal columns.
        gridAutoFlow: { xs: 'column', md: 'row' },
        gridAutoColumns: { xs: 'minmax(170px, 1fr)', md: 'unset' },
        // Up to 6 cards share one row; more wrap onto further rows.
        gridTemplateColumns: {
            xs: 'none',
            md: count > 6 ? 'repeat(auto-fill, minmax(190px, 1fr))' : `repeat(${count}, minmax(0, 1fr))`,
        },
        overflowX: { xs: 'auto', md: 'visible' },
        // Room for the hover lift and focus ring inside the scroll container.
        pt: 0.5,
        pb: { xs: 1, md: 0.5 },
        px: { xs: 0.25, md: 0 },
    }) as const;

/** Width of a card in the single scrolling row; cards stretch to fill the row when they all fit. */
const SINGLE_ROW_CARD_PX = 230;

const singleRowSx = {
    display: 'grid',
    gap: 1.75,
    minWidth: 0,
    gridAutoFlow: 'column',
    gridAutoColumns: `minmax(${SINGLE_ROW_CARD_PX}px, 1fr)`,
    overflowX: 'auto',
    overscrollBehaviorX: 'contain',
    scrollSnapType: 'x proximity',
    scrollPaddingInline: '2px',
    '& > *': { scrollSnapAlign: 'start' },
    // Room for the hover lift and focus ring inside the scroll container.
    pt: 0.5,
    pb: 1,
    px: 0.25,
} as const;

/** Round arrow at one end of the scrolling row (mouse devices; touch screens swipe). */
function RowScrollArrow({ direction, visible, onClick }: { direction: -1 | 1; visible: boolean; onClick: () => void }) {
    const Icon = direction < 0 ? ChevronLeftIcon : ChevronRightIcon;
    return (
        <IconButton
            aria-label={direction < 0 ? 'Show earlier cards' : 'Show more cards'}
            tabIndex={-1}
            onClick={onClick}
            sx={{
                position: 'absolute',
                top: '50%',
                [direction < 0 ? 'left' : 'right']: -6,
                transform: 'translateY(-50%)',
                zIndex: 2,
                width: 32,
                height: 32,
                backgroundColor: 'var(--mui-palette-background-paper)',
                border: '1px solid var(--mui-palette-border-strong)',
                boxShadow: '0 2px 8px rgba(15, 23, 42, 0.15)',
                color: 'var(--crm-slate-700)',
                opacity: visible ? 1 : 0,
                pointerEvents: visible ? 'auto' : 'none',
                transition: 'opacity 0.15s ease, background-color 0.15s ease, border-color 0.15s ease',
                '&:hover': {
                    borderColor: 'var(--crm-blue-300)',
                    backgroundColor: 'var(--mui-palette-primary-soft)',
                    color: 'var(--crm-text-blue-700)',
                },
                '@media (hover: none)': { display: 'none' },
            }}
        >
            <Icon sx={{ fontSize: 20 }} />
        </IconButton>
    );
}

/**
 * One row of cards that scrolls sideways: arrows at whichever end has more cards, and the same mouse panning as
 * the list table (hold the scroll-wheel button anywhere, or drag the gaps between cards with the left button).
 */
function SingleRow({ children, ...rest }: { children: React.ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
    const { setContainer, canScrollLeft, canScrollRight, isPanning, onPointerDown } = useTableScroll();
    const [el, setEl] = useState<HTMLDivElement | null>(null);
    const ref = useCallback(
        (node: HTMLDivElement | null) => {
            setEl(node);
            setContainer(node);
        },
        [setContainer]
    );

    // Most of a screen at a time, keeping the last card in view for context.
    const scrollByPage = (direction: -1 | 1) => el?.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: 'smooth' });

    return (
        <Box sx={{ position: 'relative', mb: 2, minWidth: 0 }}>
            <Box
                ref={ref}
                {...rest}
                onPointerDown={onPointerDown}
                sx={{
                    ...singleRowSx,
                    // Snapping would fight the pointer while panning.
                    ...(isPanning ? { scrollSnapType: 'none', cursor: 'grabbing', userSelect: 'none' } : null),
                }}
            >
                {children}
            </Box>
            <RowScrollArrow direction={-1} visible={canScrollLeft} onClick={() => scrollByPage(-1)} />
            <RowScrollArrow direction={1} visible={canScrollRight} onClick={() => scrollByPage(1)} />
        </Box>
    );
}

/** The cards' grid (one scrolling row with `singleRow`). */
function CardsGrid({
    count,
    singleRow,
    children,
    ...rest
}: { count: number; singleRow?: boolean; children: React.ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
    if (singleRow) return <SingleRow {...rest}>{children}</SingleRow>;
    return (
        <Box {...rest} sx={gridSx(count)}>
            {children}
        </Box>
    );
}

const skeletonSx = { bgcolor: 'var(--mui-palette-background-hover)' } as const;

/** Placeholder row of cards while the records / scorecard load. */
export function StatusSummaryCardsSkeleton({
    count = 5,
    singleRow,
    withAmount,
}: {
    count?: number;
    singleRow?: boolean;
    /** The cards will show amounts: same shape, so they don't jump when they load. */
    withAmount?: boolean;
}) {
    return (
        <CardsGrid count={count} singleRow={singleRow} aria-busy="true" aria-label="Loading summary">
            {Array.from({ length: count }, (_, i) => (
                <Box
                    key={i}
                    sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 1.25,
                        p: 2,
                        borderRadius: '14px',
                        border: '1px solid var(--mui-palette-border-main)',
                        backgroundColor: 'var(--mui-palette-background-paper)',
                    }}
                >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                        <Skeleton variant="rounded" width={38} height={38} sx={{ ...skeletonSx, borderRadius: '11px', flexShrink: 0 }} />
                        <Skeleton variant="rounded" height={12} width="45%" sx={skeletonSx} />
                    </Box>
                    {withAmount ? (
                        <Box sx={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 1.5 }}>
                            <Skeleton variant="rounded" height={32} width={48} sx={{ ...skeletonSx, flexShrink: 0 }} />
                            <Box sx={{ flex: '0 1 55%', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.5 }}>
                                <Skeleton variant="rounded" height={9} width="85%" sx={skeletonSx} />
                                <Skeleton variant="rounded" height={14} width="100%" sx={skeletonSx} />
                            </Box>
                        </Box>
                    ) : (
                        <>
                            <Skeleton variant="rounded" height={32} width={48} sx={skeletonSx} />
                            <Skeleton variant="rounded" height={10} width="60%" sx={skeletonSx} />
                        </>
                    )}
                    <Skeleton variant="rounded" height={6} sx={{ ...skeletonSx, mt: 'auto' }} />
                </Box>
            ))}
        </CardsGrid>
    );
}

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
    onEdit,
    singleRow,
}: StatusSummaryCardsProps<TId>) {
    const base = total ?? items[0]?.count ?? 0;
    const resetId = allId ?? items[0]?.id;

    return (
        <CardsGrid count={items.length} singleRow={singleRow} role="group" aria-label="Status summary">
            {items.map((item) => {
                const c = item.color ?? TONE_COLOR[item.tone ?? 'brand'];
                const isActive = item.id === activeId;
                const isAll = item.id === resetId;
                const share = base > 0 ? (item.count / base) * 100 : 0;
                const multiWord = /[\s/]/.test(item.label.trim());
                const sharePill = (
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
                );
                const shareBar = (
                    <Box
                        sx={{
                            position: 'relative',
                            flex: 1,
                            minWidth: 0,
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
                );

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
                                title={item.label}
                                sx={{
                                    flex: 1,
                                    minWidth: 0,
                                    fontSize: '0.74rem',
                                    fontWeight: 700,
                                    lineHeight: 1.3,
                                    letterSpacing: '0.05em',
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
                                {multiWord ? item.label.replace(/\//g, '/\u200B') : item.label}
                            </Typography>
                            {/* Room for the edit pencil, which sits over this corner. */}
                            {isAll && onEdit && <Box sx={{ width: 26, flexShrink: 0 }} />}
                            {!isAll && !singleRow && sharePill}
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
                                rowGap: 0.5,
                            }}
                        >
                            <Box sx={{ minWidth: 0, maxWidth: '100%' }}>
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

                            {item.amount !== undefined && (
                                <Box sx={{ ml: 'auto', minWidth: 0, maxWidth: '100%', textAlign: 'right', pb: 0.25 }}>
                                    {item.amountLabel && (
                                        <Typography
                                            sx={{
                                                fontSize: '0.68rem',
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
                                            fontSize: '0.95rem',
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

                        {/* Share bar (pinned to the bottom so bars line up across cards); in a single row the share
                            pill sits at its end, leaving the label the width of the card. */}
                        {singleRow ? (
                            <Box sx={{ position: 'relative', mt: 'auto', minHeight: 21, display: 'flex', alignItems: 'center', gap: 1 }}>
                                {shareBar}
                                {!isAll && sharePill}
                            </Box>
                        ) : (
                            <Box sx={{ position: 'relative', mt: 'auto', display: 'flex' }}>{shareBar}</Box>
                        )}
                    </ButtonBase>
                    {isAll && onEdit && (
                        <Tooltip title="Edit scorecard">
                            <IconButton
                                size="small"
                                aria-label="Edit scorecard"
                                onClick={onEdit}
                                sx={{
                                    position: 'absolute',
                                    top: 10,
                                    right: 10,
                                    width: 28,
                                    height: 28,
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
                                <EditOutlinedIcon sx={{ fontSize: 15 }} />
                            </IconButton>
                        </Tooltip>
                    )}
                    </Box>
                );
            })}
        </CardsGrid>
    );
}
