'use client';

import React from 'react';
import { Box, Typography } from '@mui/material';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import { panelHeaderSx, surfaceSx } from '@/components/settings/form-customization/builderUi';
import {
    formatDay,
    formatMoney,
    formatNumber,
    formatShortDay,
    formatTime,
    formatWallClock,
    type DisplayFormats,
} from '@/lib/display-formats/displayFormats';
import type { SaveCompanyFormatsPayload } from '@/types/companyFormats.types';

/** Sample values of the preview: a Wednesday afternoon and a lakh-sized amount. */
const SAMPLE_DAY = '2026-03-25';
const SAMPLE_WALL_CLOCK = `${SAMPLE_DAY}T14:07`;
const SAMPLE_NUMBER = 1234567.891;
const SAMPLE_AMOUNT = 1234567.5;

/** The preview's rows for a draft, computed as the saved formats would show them (`customized: true`). */
export function previewRows(draft: SaveCompanyFormatsPayload): { label: string; value: string }[] {
    const f: DisplayFormats = { ...draft, customized: true };
    return [
        { label: 'Date', value: formatDay(SAMPLE_DAY, f) },
        { label: 'Date and time', value: formatWallClock(SAMPLE_WALL_CLOCK, f) },
        { label: 'Time', value: formatTime(SAMPLE_WALL_CLOCK, f) },
        { label: 'Short label', value: formatShortDay(SAMPLE_DAY, f, { weekday: true }) },
        { label: 'Number', value: formatNumber(SAMPLE_NUMBER, f) },
        { label: 'Amount', value: formatMoney(SAMPLE_AMOUNT, f) },
        { label: 'Amount in a list', value: formatMoney(SAMPLE_AMOUNT, f, { maxDecimals: 0 }) },
    ];
}

/** Admin › Company formats: how the draft formats read on screens, PDFs and emails. */
export function FormatsPreview({ draft }: { draft: SaveCompanyFormatsPayload }) {
    const rows = previewRows(draft);
    return (
        <Box component="section" aria-labelledby="company-formats-preview-title" sx={{ ...surfaceSx, overflow: 'hidden', minWidth: 0, alignSelf: 'start' }}>
            <Box sx={{ ...panelHeaderSx, display: 'flex', alignItems: 'center', gap: 1 }}>
                <VisibilityOutlinedIcon sx={{ fontSize: 18, color: 'var(--crm-text-blue-600)' }} />
                <Box sx={{ minWidth: 0 }}>
                    <Typography id="company-formats-preview-title" component="h2" sx={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--crm-slate-900)' }}>
                        Preview
                    </Typography>
                    <Typography sx={{ fontSize: '0.75rem', color: 'var(--mui-palette-text-secondary)' }}>As the formats above would show them.</Typography>
                </Box>
            </Box>
            <Box component="dl" sx={{ m: 0, px: 2, py: 0.5 }}>
                {rows.map((row, i) => (
                    <Box
                        key={row.label}
                        sx={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            alignItems: 'baseline',
                            justifyContent: 'space-between',
                            columnGap: 2,
                            rowGap: 0.25,
                            py: 1.1,
                            borderTop: i === 0 ? 'none' : '1px solid var(--mui-palette-border-light)',
                        }}
                    >
                        <Typography component="dt" sx={{ fontSize: '0.8rem', color: 'var(--mui-palette-text-secondary)' }}>
                            {row.label}
                        </Typography>
                        <Typography
                            component="dd"
                            sx={{ m: 0, fontSize: '0.86rem', fontWeight: 600, color: 'var(--crm-slate-900)', fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere', textAlign: 'right' }}
                        >
                            {row.value}
                        </Typography>
                    </Box>
                ))}
            </Box>
        </Box>
    );
}
