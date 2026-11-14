'use client';

import { useId } from 'react';
import SvgIcon, { type SvgIconProps } from '@mui/material/SvgIcon';

/**
 * Bookmark icons for the "set as default" toggle on dropdown options in the form builder.
 * Drawn on a 24px grid for ~18–20px display and colored by `color` / `sx.color` (currentColor).
 * The "on" variant cuts its star out of the filled bookmark with a mask, so it reads on any background.
 */

const BOOKMARK = 'M6.5 3.5h11v17L12 16.5l-5.5 4z';
const STAR = 'M12 6.6l1.1 2.3 2.5.3-1.8 1.7.4 2.5-2.2-1.2-2.2 1.2.4-2.5-1.8-1.7 2.5-.3z';

export function DefaultBookmarkOffIcon(props: SvgIconProps) {
    return (
        <SvgIcon {...props}>
            <path d={BOOKMARK} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
        </SvgIcon>
    );
}

export function DefaultBookmarkOnIcon(props: SvgIconProps) {
    const maskId = `default-bookmark-${useId().replace(/:/g, '')}`;
    return (
        <SvgIcon {...props}>
            <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
                <rect width="24" height="24" fill="#fff" />
                <path d={STAR} fill="#000" />
            </mask>
            <path
                d={BOOKMARK}
                mask={`url(#${maskId})`}
                fill="currentColor"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </SvgIcon>
    );
}
