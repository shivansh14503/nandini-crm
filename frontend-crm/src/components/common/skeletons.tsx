'use client';

import React from 'react';
import { Box, Container, Skeleton, type SkeletonProps, type SxProps, type Theme } from '@mui/material';
import { glassSurfaceSx, GLASS_SHADOW, GLASS_RADIUS, FLOAT_INSET, NAVBAR_HEIGHT } from '@/theme/glass';

/**
 * Loading placeholders shaped like the real UI (navbar, list tables, record pages, forms), so a page doesn't
 * flash a spinner or empty fields before its data arrives. Colors come from theme tokens, so light and dark
 * mode both read as a soft neutral shimmer.
 */

const boneSx = { bgcolor: 'var(--mui-palette-background-hover)' } as const;

const cardSx = {
    borderRadius: '12px',
    border: '1px solid var(--mui-palette-border-main)',
    backgroundColor: 'var(--mui-palette-background-paper)',
    overflow: 'hidden',
} as const;

/** A single placeholder bar / block (rounded by default). */
export function Bone({ sx, variant = 'rounded', ...props }: SkeletonProps) {
    return <Skeleton variant={variant} {...props} sx={[boneSx, ...(Array.isArray(sx) ? sx : [sx])] as SxProps<Theme>} />;
}

/** Varied, stable widths so rows read as text rather than a grid of identical bars. */
const textWidth = (a: number, b: number, min = 45, spread = 45) => `${min + ((a * 7 + b * 13) % spread)}%`;

/** Same height and surface as the real navbar. */
export function NavbarSkeleton() {
    return (
        <Box
            sx={{
                // Mirrors the floating glass Navbar so nothing shifts when it loads.
                ...glassSurfaceSx,
                position: 'sticky',
                top: FLOAT_INSET,
                mt: `${FLOAT_INSET}px`,
                mx: `${FLOAT_INSET}px`,
                zIndex: 1200,
                height: NAVBAR_HEIGHT,
                boxSizing: 'border-box',
                pl: { xs: 1.5, md: 1.75 },
                pr: { xs: 1.5, md: 2 },
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderRadius: GLASS_RADIUS,
                boxShadow: GLASS_SHADOW,
            }}
        >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <Bone width={130} height={28} />
                <Box sx={{ display: { xs: 'none', md: 'flex' }, gap: 2.5 }}>
                    {[64, 56, 64, 72, 70, 36].map((w, i) => (
                        <Bone key={i} width={w} height={14} />
                    ))}
                </Box>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Bone width={220} height={34} sx={{ display: { xs: 'none', md: 'block' }, borderRadius: '8px' }} />
                <Bone width={96} height={34} sx={{ display: { xs: 'none', sm: 'block' }, borderRadius: '8px' }} />
                <Bone variant="circular" width={32} height={32} />
            </Box>
        </Box>
    );
}

/** Breadcrumb trail placeholder. */
export function BreadcrumbsSkeleton({ sx }: { sx?: SxProps<Theme> }) {
    return (
        <Box sx={[{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1.5 }, ...(Array.isArray(sx) ? sx : [sx])] as SxProps<Theme>}>
            <Bone width={44} height={12} />
            <Bone width={8} height={8} />
            <Bone width={72} height={12} />
        </Box>
    );
}

/** A table card on its own (header band + rows), for admin lists and page-level placeholders. */
export function TableSkeleton({ rows = 8, columns = 6, toolbar = true, sx }: { rows?: number; columns?: number; toolbar?: boolean; sx?: SxProps<Theme> }) {
    return (
        <Box aria-busy="true" sx={[cardSx, ...(Array.isArray(sx) ? sx : [sx])] as SxProps<Theme>}>
            {toolbar && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1.5, borderBottom: '1px solid var(--mui-palette-border-light)' }}>
                    <Bone width={110} height={32} sx={{ borderRadius: '8px' }} />
                    <Bone width={240} height={32} sx={{ borderRadius: '8px', display: { xs: 'none', sm: 'block' } }} />
                    <Box sx={{ flex: 1 }} />
                    <Bone width={140} height={14} />
                </Box>
            )}
            <Box
                sx={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                    gap: 3,
                    px: 2,
                    py: 1.5,
                    backgroundColor: 'var(--mui-palette-background-subtle)',
                    borderBottom: '1px solid var(--mui-palette-border-main)',
                }}
            >
                {Array.from({ length: columns }, (_, c) => (
                    <Bone key={c} height={10} width={textWidth(0, c, 40, 35)} />
                ))}
            </Box>
            {Array.from({ length: rows }, (_, r) => (
                <Box
                    key={r}
                    sx={{
                        display: 'grid',
                        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                        gap: 3,
                        px: 2,
                        py: 2,
                        borderBottom: r < rows - 1 ? '1px solid var(--mui-palette-border-light)' : 'none',
                    }}
                >
                    {Array.from({ length: columns }, (_, c) => (
                        <Bone key={c} height={12} width={textWidth(r, c)} />
                    ))}
                </Box>
            ))}
        </Box>
    );
}

/** Label + input pairs in the form grid (3 columns on desktop, like the real forms). */
export function FormFieldsSkeleton({ fields = 9, columns = 3, sx }: { fields?: number; columns?: number; sx?: SxProps<Theme> }) {
    return (
        <Box
            aria-busy="true"
            sx={[
                {
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', md: `repeat(${columns}, minmax(0, 1fr))` },
                    columnGap: 3,
                    rowGap: 2.5,
                },
                ...(Array.isArray(sx) ? sx : [sx]),
            ] as SxProps<Theme>}
        >
            {Array.from({ length: fields }, (_, i) => (
                <Box key={i} sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <Bone height={10} width={textWidth(i, 1, 25, 30)} />
                    <Bone height={38} sx={{ borderRadius: '8px' }} />
                </Box>
            ))}
        </Box>
    );
}

/** Form body: a couple of titled sections of fields (what a form card shows once loaded). */
export function FormSectionsSkeleton({ sections = 2, sx }: { sections?: number; sx?: SxProps<Theme> }) {
    return (
        <Box sx={[{ display: 'flex', flexDirection: 'column', gap: 4, p: { xs: 2, md: 3 } }, ...(Array.isArray(sx) ? sx : [sx])] as SxProps<Theme>}>
            {Array.from({ length: sections }, (_, s) => (
                <Box key={s}>
                    <Bone height={14} width={160} sx={{ mb: 2.5 }} />
                    <FormFieldsSkeleton fields={s === 0 ? 9 : 6} />
                </Box>
            ))}
        </Box>
    );
}

/** Tab strip placeholder (form card / record page tabs). */
function TabsBarSkeleton({ tabs = 3 }: { tabs?: number }) {
    return (
        <Box
            sx={{
                display: 'flex',
                gap: 1,
                px: { xs: 2, md: 2.5 },
                py: 1,
                backgroundColor: 'var(--mui-palette-background-subtle)',
                borderBottom: '1px solid var(--mui-palette-border-main)',
            }}
        >
            {Array.from({ length: tabs }, (_, i) => (
                <Bone key={i} width={90} height={30} sx={{ borderRadius: '8px' }} />
            ))}
        </Box>
    );
}

/** Record identity header: avatar, title, code and badges. */
export function RecordHeaderSkeleton({ sx }: { sx?: SxProps<Theme> }) {
    return (
        <Box sx={[{ display: 'flex', alignItems: 'center', gap: 2 }, ...(Array.isArray(sx) ? sx : [sx])] as SxProps<Theme>}>
            <Bone variant="rounded" width={52} height={52} sx={{ borderRadius: '14px', flexShrink: 0 }} />
            <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Bone height={20} width="40%" sx={{ maxWidth: 320 }} />
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <Bone height={20} width={90} sx={{ borderRadius: '999px' }} />
                    <Bone height={20} width={70} sx={{ borderRadius: '999px' }} />
                </Box>
            </Box>
            <Bone width={96} height={34} sx={{ borderRadius: '8px', display: { xs: 'none', sm: 'block' } }} />
        </Box>
    );
}

/** Record page / drawer body: header, tabs and field rows. */
export function RecordDetailSkeleton({ sx }: { sx?: SxProps<Theme> }) {
    return (
        <Box aria-busy="true" sx={[cardSx, ...(Array.isArray(sx) ? sx : [sx])] as SxProps<Theme>}>
            <RecordHeaderSkeleton sx={{ p: { xs: 2, md: 2.5 }, borderBottom: '1px solid var(--mui-palette-border-light)' }} />
            <TabsBarSkeleton />
            <FormSectionsSkeleton />
        </Box>
    );
}

/** Form page card: tabs + sections of fields. */
export function FormCardSkeleton({ sx }: { sx?: SxProps<Theme> }) {
    return (
        <Box aria-busy="true" sx={[cardSx, ...(Array.isArray(sx) ? sx : [sx])] as SxProps<Theme>}>
            <TabsBarSkeleton tabs={2} />
            <FormSectionsSkeleton />
        </Box>
    );
}

export type PageSkeletonVariant = 'list' | 'detail' | 'form' | 'page';

/** The whole screen (navbar + body) while auth / route data loads. */
export function PageSkeleton({ variant = 'page', label }: { variant?: PageSkeletonVariant; label?: string }) {
    let body: React.ReactNode;
    if (variant === 'list') {
        body = (
            <Box sx={{ px: { xs: 2, md: 3 }, py: 2 }}>
                <BreadcrumbsSkeleton />
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 2 }}>
                    {[96, 120, 96].map((w, i) => (
                        <Bone key={i} width={w} height={32} sx={{ borderRadius: '999px' }} />
                    ))}
                    <Box sx={{ flex: 1 }} />
                    <Bone width={92} height={36} sx={{ borderRadius: '8px', display: { xs: 'none', sm: 'block' } }} />
                    <Bone width={120} height={36} sx={{ borderRadius: '8px' }} />
                </Box>
                <TableSkeleton columns={7} />
            </Box>
        );
    } else {
        body = (
            <Container maxWidth="xl" sx={{ pt: 2.5, pb: 4 }}>
                <BreadcrumbsSkeleton />
                {variant === 'detail' && <RecordDetailSkeleton />}
                {variant === 'form' && <FormCardSkeleton />}
                {variant === 'page' && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <Box sx={{ ...cardSx, p: { xs: 2, md: 3 } }}>
                            <RecordHeaderSkeleton />
                        </Box>
                        <TableSkeleton rows={5} columns={5} toolbar={false} />
                    </Box>
                )}
            </Container>
        );
    }
    return (
        <Box
            role="status"
            aria-busy="true"
            aria-label={label ?? 'Loading'}
            sx={{ minHeight: '100vh', backgroundColor: 'var(--mui-palette-background-subtle)', display: 'flex', flexDirection: 'column' }}
        >
            <NavbarSkeleton />
            {body}
        </Box>
    );
}
