'use client';

import React from 'react';
import Link from 'next/link';
import { Typography, type SxProps, type Theme } from '@mui/material';

export interface RecordLinkProps {
    /** Full-page URL of the record; used for right-click / middle-click / Ctrl or Cmd + click. */
    href: string;
    /**
     * Called on a plain left click instead of navigating (e.g. opens the side drawer). When omitted, a plain left
     * click doesn't navigate either: it bubbles up to the table row so the row's own click behaviour is kept
     * (used for linked-record fields such as a contact's organization).
     */
    onOpen?: () => void;
    children: React.ReactNode;
    sx?: SxProps<Theme>;
}

/**
 * A real anchor for a record field. Plain left-click opens the side drawer (or falls through to the row);
 * modifier clicks, middle-click and the context menu go to the browser so the full page can open in a new tab.
 */
export function RecordLink({ href, onOpen, children, sx }: RecordLinkProps) {
    const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
        const isModified = e.ctrlKey || e.metaKey || e.shiftKey || e.altKey;
        if (e.button !== 0 || isModified) {
            // Let the browser open the href (new tab / window); the row must not also react.
            e.stopPropagation();
            return;
        }
        e.preventDefault();
        if (onOpen) {
            e.stopPropagation();
            onOpen();
        }
    };

    return (
        <Typography
            component={Link}
            href={href}
            onClick={handleClick}
            sx={[
                {
                    color: 'var(--crm-text-blue-700)',
                    textDecoration: 'none',
                    cursor: 'pointer',
                    // Above a table row's hidden link (DataTable), whose cell content otherwise lets the pointer through.
                    pointerEvents: 'auto',
                    transition: 'color 0.15s ease',
                    '&:hover': {
                        color: 'var(--crm-text-blue-600)',
                        textDecoration: 'underline',
                    },
                },
                ...(Array.isArray(sx) ? sx : [sx]),
            ]}
        >
            {children}
        </Typography>
    );
}
