'use client';

import React from 'react';
import { Box, Tooltip, type SxProps, type Theme } from '@mui/material';
import type { SvgIconComponent } from '@mui/icons-material';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import AcUnitIcon from '@mui/icons-material/AcUnit';
import WbSunnyIcon from '@mui/icons-material/WbSunny';
import { ratingChipColors } from '@/utils/leadRating';

/**
 * A lead's Rating, everywhere it is shown: the word (Hot / Warm / Cold) with its icon (fire, sun, snowflake) in the
 * rating's colours (Hot red, Warm amber, Cold slate). Not a button.
 *
 *   block  the big box under the lead drawer's header buttons
 *   chip   table cells
 *   small  inline in text (follow-up history, rating rules)
 */

export const RATING_ICONS: Record<string, SvgIconComponent> = {
    Hot: LocalFireDepartmentIcon,
    Warm: WbSunnyIcon,
    Cold: AcUnitIcon,
};

const SIZES = {
    block: { px: 1.5, height: 36, minWidth: 88, fontSize: '0.86rem', icon: 18, gap: 0.75, radius: '8px' },
    chip: { px: 0.9, height: 22, minWidth: 0, fontSize: '0.72rem', icon: 14, gap: 0.45, radius: '6px' },
    small: { px: 0.7, height: 18, minWidth: 0, fontSize: '0.68rem', icon: 12, gap: 0.35, radius: '5px' },
} as const;

export interface RatingBadgeProps {
    rating: string | null | undefined;
    variant?: keyof typeof SIZES;
    /** Shown on hover, e.g. why the lead has this rating. */
    reason?: string;
    sx?: SxProps<Theme>;
}

export function RatingBadge({ rating, variant = 'chip', reason, sx }: RatingBadgeProps) {
    if (!rating) return null;
    const size = SIZES[variant];
    const colors = ratingChipColors(rating);
    const Icon = RATING_ICONS[rating];
    const box = (
        <Box
            component="span"
            role="status"
            aria-label={`Rating: ${rating}`}
            sx={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: size.gap,
                px: size.px,
                height: size.height,
                minWidth: size.minWidth,
                boxSizing: 'border-box',
                borderRadius: size.radius,
                border: '1px solid',
                fontSize: size.fontSize,
                fontWeight: 800,
                letterSpacing: variant === 'block' ? '0.02em' : 0,
                whiteSpace: 'nowrap',
                lineHeight: 1,
                cursor: 'default',
                userSelect: 'none',
                ...colors,
                ...(sx as object),
            }}
        >
            {Icon && <Icon sx={{ fontSize: size.icon, color: 'inherit' }} />}
            {rating}
        </Box>
    );
    return reason ? (
        <Tooltip title={reason} arrow disableInteractive>
            {box}
        </Tooltip>
    ) : (
        box
    );
}
