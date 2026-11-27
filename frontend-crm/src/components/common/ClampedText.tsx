'use client';

import React from 'react';
import { Box, ButtonBase, type SxProps, type Theme } from '@mui/material';

/** Lines of long text shown before "Show more" in record views, drawers and table cells. */
export const CLAMPED_TEXT_LINES = 3;

export interface ClampedTextProps {
    children: React.ReactNode;
    /** Lines shown while collapsed (default {@link CLAMPED_TEXT_LINES}). */
    lines?: number;
    /** Styles for the text block (font size, colour, weight…). Line breaks are always kept. */
    sx?: SxProps<Theme>;
    /** Font size of the Show more / Show less toggle (default 0.76rem). */
    toggleFontSize?: string;
}

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? React.useLayoutEffect : React.useEffect;

/**
 * Long text (descriptions, remarks, terms…) shown as its first few lines with a "Show more" toggle. The toggle only
 * appears when the text really runs past `lines` (measured, so it follows the container's width as it resizes); short
 * values look exactly like plain text. Clicks on the toggle don't reach the row or card around it (tables open a
 * drawer on row click).
 */
export function ClampedText({ children, lines = CLAMPED_TEXT_LINES, sx, toggleFontSize = '0.76rem' }: ClampedTextProps) {
    const textRef = React.useRef<HTMLDivElement>(null);
    const [expanded, setExpanded] = React.useState(false);
    const [overflows, setOverflows] = React.useState(false);

    useIsomorphicLayoutEffect(() => {
        const el = textRef.current;
        if (!el || expanded) return;
        const measure = () => setOverflows(el.scrollHeight - el.clientHeight > 1);
        measure();
        if (typeof ResizeObserver === 'undefined') return;
        const observer = new ResizeObserver(measure);
        observer.observe(el);
        return () => observer.disconnect();
    }, [children, lines, expanded]);

    const toggle = (e: React.MouseEvent) => {
        e.stopPropagation();
        setExpanded((v) => !v);
    };

    return (
        <Box sx={{ minWidth: 0, maxWidth: '100%' }}>
            <Box
                ref={textRef}
                sx={[
                    { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'break-word' },
                    !expanded && {
                        display: '-webkit-box',
                        WebkitBoxOrient: 'vertical',
                        WebkitLineClamp: lines,
                        overflow: 'hidden',
                    },
                    ...(Array.isArray(sx) ? sx : [sx]),
                ]}
            >
                {children}
            </Box>
            {(overflows || expanded) && (
                <ButtonBase
                    onClick={toggle}
                    onDoubleClick={(e) => e.stopPropagation()}
                    aria-expanded={expanded}
                    sx={{
                        mt: 0.4,
                        // Tap target: the visible label is small, the hit area is not.
                        minHeight: 32,
                        px: 0.5,
                        mx: -0.5,
                        borderRadius: '6px',
                        fontSize: toggleFontSize,
                        fontWeight: 600,
                        fontFamily: 'inherit',
                        color: 'var(--crm-text-blue-600)',
                        transition: 'all 0.15s ease',
                        '&:hover': { color: 'var(--crm-text-blue-700)', backgroundColor: 'var(--mui-palette-primary-soft)' },
                        '&.Mui-focusVisible': { boxShadow: '0 0 0 3px rgb(var(--crm-accent-rgb) / 0.22)' },
                    }}
                >
                    {expanded ? 'Show less' : 'Show more'}
                </ButtonBase>
            )}
        </Box>
    );
}
