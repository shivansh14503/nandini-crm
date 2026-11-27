'use client';

import React from 'react';
import { Typography, type SxProps, type Theme } from '@mui/material';

export interface CharacterCounterProps {
    length: number;
    maxLength: number;
    id?: string;
    sx?: SxProps<Theme>;
}

/** Share of the limit at which the counter turns amber, so people see the end coming. */
const NEAR_LIMIT = 0.9;

/** "420 / 2,000" under a long text field: muted, amber near the limit, red at it. */
export function CharacterCounter({ length, maxLength, id, sx }: CharacterCounterProps) {
    const atLimit = length >= maxLength;
    const near = !atLimit && length >= maxLength * NEAR_LIMIT;
    const color = atLimit ? 'var(--mui-palette-error-main)' : near ? 'var(--mui-palette-warning-main)' : 'var(--mui-palette-text-muted)';
    return (
        <Typography
            id={id}
            component="span"
            aria-label={`${length} of ${maxLength} characters used`}
            sx={[
                { fontSize: '0.72rem', lineHeight: 1.66, fontWeight: atLimit || near ? 600 : 500, color, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' },
                ...(Array.isArray(sx) ? sx : [sx]),
            ]}
        >
            {length.toLocaleString('en-IN')} / {maxLength.toLocaleString('en-IN')}
        </Typography>
    );
}
