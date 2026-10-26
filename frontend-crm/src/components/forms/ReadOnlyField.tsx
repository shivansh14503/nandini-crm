'use client';

import React from 'react';
import { Box, Chip, Typography, type SxProps, type Theme } from '@mui/material';
import { DrawerCopyButton } from '../common/Drawer/DrawerPrimitives';

export interface ReadOnlyFieldProps {
    label: string;
    value?: React.ReactNode;
    /** Shows a copy button next to the value (uses `copyText`, or `value` when it is a string/number). */
    copyable?: boolean;
    copyText?: string;
    /** Renders the value as a non-interactive pill. */
    badge?: boolean;
    /** Main colour of the badge (text); the background is a light tint of it. */
    badgeColor?: string;
    hint?: React.ReactNode;
    /** Render nothing at all when there is no value (record views only show filled-in data). */
    hideWhenEmpty?: boolean;
    sx?: SxProps<Theme>;
}

const isEmpty = (value: React.ReactNode) =>
    value === undefined || value === null || value === false || value === '';

/** Borderless label/value pair for record detail views — no input box, no disabled look. */
export function ReadOnlyField({
    label,
    value,
    copyable,
    copyText,
    badge,
    badgeColor = '#475569',
    hint,
    hideWhenEmpty,
    sx,
}: ReadOnlyFieldProps) {
    const empty = isEmpty(value);
    if (empty && hideWhenEmpty) return null;
    const textToCopy = copyText ?? (typeof value === 'string' || typeof value === 'number' ? String(value) : undefined);

    return (
        <Box sx={sx}>
            <Typography
                sx={{
                    fontSize: '0.68rem',
                    fontWeight: 600,
                    color: '#64748b',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    mb: 0.4,
                }}
            >
                {label}
            </Typography>

            {empty ? (
                <Typography sx={{ color: '#94a3b8', fontSize: '0.86rem' }} aria-label="Not provided">
                    —
                </Typography>
            ) : (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
                    {badge ? (
                        <Chip
                            label={value}
                            size="small"
                            sx={{
                                height: 24,
                                fontSize: '0.76rem',
                                fontWeight: 700,
                                color: badgeColor,
                                backgroundColor: `${badgeColor}1a`,
                                cursor: 'default',
                            }}
                        />
                    ) : (
                        <Typography
                            component="div"
                            sx={{
                                fontSize: '0.86rem',
                                fontWeight: 600,
                                color: '#0f172a',
                                lineHeight: 1.35,
                                wordBreak: 'break-word',
                                whiteSpace: 'pre-wrap',
                            }}
                        >
                            {value}
                        </Typography>
                    )}
                    {copyable && textToCopy && <DrawerCopyButton text={textToCopy} title={`Copy ${label}`} />}
                </Box>
            )}

            {hint && (
                <Typography sx={{ fontSize: '0.72rem', color: '#94a3b8', mt: 0.3 }}>{hint}</Typography>
            )}
        </Box>
    );
}
