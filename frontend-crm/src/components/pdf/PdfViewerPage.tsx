'use client';

import React from 'react';
import { Box, Button, IconButton, MenuItem, Select, Skeleton, Tooltip, Typography } from '@mui/material';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import { ErrorAlert } from '@/components/common/ErrorAlert';
import type { PdfTemplateListItem } from '@/types/pdfTemplate.types';

export interface PdfViewerPageProps {
    title: string;
    subtitle?: string;
    templates: PdfTemplateListItem[];
    templateId: string | undefined;
    onTemplateChange: (templateId: string) => void;
    pdfUrl: string | null;
    loading: boolean;
    error: string | null;
    onRetry: () => void;
    onBack: () => void;
    onClose: () => void;
}

const primaryButtonSx = {
    textTransform: 'none',
    fontWeight: 700,
    fontSize: '0.8rem',
    height: 34,
    borderRadius: '8px',
    boxShadow: 'none',
    background: 'linear-gradient(135deg, var(--crm-fill-blue-700) 0%, var(--crm-fill-blue-600) 100%)',
    '&:hover': { background: 'linear-gradient(135deg, var(--crm-fill-blue-800) 0%, var(--crm-fill-blue-700) 100%)', boxShadow: 'none' },
} as const;

/**
 * Minimal-chrome PDF viewer: sticky toolbar (back, template, close) over a full-height iframe.
 * Download and print are left to the browser's built-in PDF viewer toolbar.
 */
export function PdfViewerPage(props: PdfViewerPageProps) {
    const { title, subtitle, templates, templateId, onTemplateChange, pdfUrl, loading, error, onRetry, onBack, onClose } = props;

    return (
        <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--crm-slate-200)' }}>
            <Box
                component="header"
                sx={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 10,
                    display: 'flex',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 1.25,
                    px: { xs: 1.5, md: 2.5 },
                    py: 1.25,
                    backgroundColor: 'var(--mui-palette-background-paper)',
                    borderBottom: '1px solid var(--mui-palette-border-main)',
                    boxShadow: '0 1px 3px rgba(15,23,42,0.06)',
                }}
            >
                <Tooltip title="Back to quotation">
                    <IconButton size="small" aria-label="Back to quotation" onClick={onBack} sx={{ border: '1px solid var(--mui-palette-border-main)', borderRadius: '8px' }}>
                        <ArrowBackRoundedIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                </Tooltip>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, flex: '1 1 220px' }}>
                    <Box sx={{ width: 32, height: 32, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--mui-palette-primary-soft)', border: '1px solid var(--mui-palette-primary-softBorder)', color: 'var(--crm-text-blue-600)', flexShrink: 0 }}>
                        <PictureAsPdfOutlinedIcon sx={{ fontSize: 18 }} />
                    </Box>
                    <Box sx={{ minWidth: 0 }}>
                        <Typography component="h1" noWrap sx={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--crm-slate-900)' }}>
                            {title}
                        </Typography>
                        {subtitle && (
                            <Typography noWrap sx={{ fontSize: '0.75rem', color: 'var(--mui-palette-text-secondary)' }}>
                                {subtitle}
                            </Typography>
                        )}
                    </Box>
                </Box>

                <Select
                    size="small"
                    value={templateId ?? ''}
                    onChange={(e) => onTemplateChange(String(e.target.value))}
                    displayEmpty
                    disabled={templates.length === 0}
                    inputProps={{ 'aria-label': 'PDF template' }}
                    sx={{ minWidth: 190, height: 34, fontSize: '0.82rem', borderRadius: '8px', backgroundColor: 'var(--mui-palette-background-paper)' }}
                >
                    {templates.map((t) => (
                        <MenuItem key={t.id} value={t.id} sx={{ fontSize: '0.84rem' }}>
                            {t.name}
                            {t.isDefault ? ' (default)' : ''}
                        </MenuItem>
                    ))}
                </Select>
                <Tooltip title="Close tab">
                    <IconButton
                        size="small"
                        aria-label="Close tab"
                        onClick={onClose}
                        sx={{
                            color: 'var(--mui-palette-error-main)',
                            backgroundColor: 'var(--mui-palette-error-soft)',
                            border: '1px solid var(--mui-palette-error-softBorder)',
                            borderRadius: '8px',
                            '&:hover': { color: 'var(--crm-red-700)', backgroundColor: 'var(--crm-red-100)', borderColor: 'var(--crm-red-300)' },
                        }}
                    >
                        <CloseRoundedIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                </Tooltip>
            </Box>

            <Box component="main" sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', p: { xs: 1, md: 2 } }}>
                {error ? (
                    <Box sx={{ maxWidth: 640, width: '100%', mx: 'auto', mt: 4 }}>
                        <ErrorAlert id="pdf-viewer-error" error={error} />
                        <Button variant="contained" startIcon={<RefreshRoundedIcon />} onClick={onRetry} sx={primaryButtonSx}>
                            Try again
                        </Button>
                    </Box>
                ) : loading || !pdfUrl ? (
                    <Box aria-busy="true" aria-label="Generating PDF" sx={{ flex: 1, maxWidth: 900, width: '100%', mx: 'auto', backgroundColor: 'var(--mui-palette-background-paper)', borderRadius: '8px', p: 4, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                        <Skeleton variant="rectangular" height={56} sx={{ borderRadius: '6px' }} />
                        <Skeleton width="60%" />
                        <Skeleton width="40%" />
                        <Skeleton variant="rectangular" height={180} sx={{ borderRadius: '6px', mt: 2 }} />
                        <Skeleton width="80%" />
                        <Skeleton width="50%" />
                        <Typography sx={{ mt: 1, fontSize: '0.8rem', color: 'var(--mui-palette-text-secondary)' }}>Generating PDF…</Typography>
                    </Box>
                ) : (
                    <Box
                        component="iframe"
                        title={`${title} PDF`}
                        src={pdfUrl}
                        sx={{ flex: 1, width: '100%', border: 0, borderRadius: '8px', backgroundColor: 'var(--mui-palette-background-paper)', boxShadow: '0 4px 16px rgba(15,23,42,0.10)' }}
                    />
                )}
            </Box>
        </Box>
    );
}

export default PdfViewerPage;
