'use client';

import React from 'react';
import Link from 'next/link';
import { Typography, type SxProps, type Theme } from '@mui/material';

export interface RecordLinkProps {
    /** Full-page URL of the record; used for right-click / middle-click / Ctrl or Cmd + click. */
    href: string;
    /** Called on a plain left click instead of navigating (e.g. opens the side drawer). */
    onOpen: () => void;
    children: React.ReactNode;
    sx?: SxProps<Theme>;
}

/**
 * A real anchor for a record's title/code. Plain left-click opens the side drawer; modifier
 * clicks, middle-click and the context menu fall through to the browser so the full page can
 * open in a new tab. Always stops propagation so the row's own click handler doesn't also fire.
 */
export function RecordLink({ href, onOpen, children, sx }: RecordLinkProps) {
    const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
        e.stopPropagation();
        const isModified = e.ctrlKey || e.metaKey || e.shiftKey || e.altKey;
        if (e.button === 0 && !isModified) {
            e.preventDefault();
            onOpen();
        }
    };

    return (
        <Typography
            component={Link}
            href={href}
            onClick={handleClick}
            sx={[{ textDecoration: 'none' }, ...(Array.isArray(sx) ? sx : [sx])]}
        >
            {children}
        </Typography>
    );
}
