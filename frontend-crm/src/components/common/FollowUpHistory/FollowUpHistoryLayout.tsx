'use client';

import React from 'react';
import { Box } from '@mui/material';
import { FLOAT_INSET } from '@/theme/glass';
import { FollowUpHistoryPanel, FOLLOW_UP_PANEL_WIDTH, type FollowUpHistoryPanelProps } from './FollowUpHistoryPanel';

/**
 * Space above the form's first card: the one-line breadcrumb bar plus its gap. The panel column starts this far
 * down so its top lines up with the form's header card.
 */
const FORM_BREADCRUMB_OFFSET = 39;

/**
 * Page body of a record's view / edit page: the form with its follow-up history beside it on wide screens (a card
 * under the form on narrower ones). Full width with the app's 12px edge gap; inside `RecordWorkspace` the left
 * padding is taken over by the related modules dock, and a module table opened there hides this whole body.
 */
export function FollowUpHistoryLayout({ children, ...panel }: FollowUpHistoryPanelProps & { children: React.ReactNode }) {
    return (
        <Box
            sx={{
                pt: 2.5,
                pb: 1,
                px: `${FLOAT_INSET}px`,
                display: { lg: 'flex' },
                alignItems: 'stretch',
                gap: `${FLOAT_INSET}px`,
            }}
        >
            <Box sx={{ flex: 1, minWidth: 0 }}>{children}</Box>
            {/* Stretches to the form's height, so the sticky panel can travel alongside it. */}
            <Box sx={{ width: { lg: FOLLOW_UP_PANEL_WIDTH }, flexShrink: 0, pt: { lg: `${FORM_BREADCRUMB_OFFSET}px` } }}>
                <FollowUpHistoryPanel {...panel} />
            </Box>
        </Box>
    );
}
