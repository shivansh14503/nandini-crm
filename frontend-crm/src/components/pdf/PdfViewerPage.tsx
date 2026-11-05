'use client';

import React from 'react';
import { Box, Button, CircularProgress, IconButton, MenuItem, Select, Skeleton, Tooltip, Typography } from '@mui/material';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import DownloadIcon from '@mui/icons-material/Download';
import PrintIcon from '@mui/icons-material/Print';
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
    onDownload: () => void;
    onPrint: () => void;
    onBack: () => void;
    onClose: () => void;
    downloading?: boolean;
    iframeRef: React.Ref<HTMLIFrameElement>;
}

const toolbarButtonSx = {
    textTransform: 'none',
    fontWeight: 600,
    fontSize: '0.8rem',
    height: 34,
    borderRadius: '8px',
    borderColor: '#cbd5e1',
    color: '#334155',
    '&:hover': { borderColor: '#93c5fd', backgroundColor: '#eff6ff', color: '#1d4ed8' },
} as const;

const primaryButtonSx = {
    textTransform: 'none',
    fontWeight: 700,
    fontSize: '0.8rem',
    height: 34,
    borderRadius: '8px',
    boxShadow: 'none',
    background: 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)',
    '&:hover': { background: 'linear-gradient(135deg, #1e40af 0%, #1d4ed8 100%)', boxShadow: 'none' },
} as const;

/** Minimal-chrome PDF viewer: sticky toolbar (template, download, print, back, close) over a full-height iframe. */
export function PdfViewerPage(props: PdfViewerPageProps) {
    const { title, subtitle, templates, templateId, onTemplateChange, pdfUrl, loading, error, onRetry, onDownload, onPrint, onBack, onClose, downloading, iframeRef } = props;
    const ready = Boolean(pdfUrl) && !loading && !error;

    return (
        <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#e2e8f0' }}>
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
                    backgroundColor: '#ffffff',
                    borderBottom: '1px solid #e2e8f0',
                    boxShadow: '0 1px 3px rgba(15,23,42,0.06)',
                }}
            >
                <Tooltip title="Back to quotation">
                    <IconButton size="small" aria-label="Back to quotation" onClick={onBack} sx={{ border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                        <ArrowBackRoundedIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                </Tooltip>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, flex: '1 1 220px' }}>
                    <Box sx={{ width: 32, height: 32, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', color: '#2563eb', flexShrink: 0 }}>
                        <PictureAsPdfOutlinedIcon sx={{ fontSize: 18 }} />
                    </Box>
                    <Box sx={{ minWidth: 0 }}>
                        <Typography component="h1" noWrap sx={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>
                            {title}
                        </Typography>
                        {subtitle && (
                            <Typography noWrap sx={{ fontSize: '0.75rem', color: '#64748b' }}>
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
                    sx={{ minWidth: 190, height: 34, fontSize: '0.82rem', borderRadius: '8px', backgroundColor: '#fff' }}
                >
                    {templates.map((t) => (
                        <MenuItem key={t.id} value={t.id} sx={{ fontSize: '0.84rem' }}>
                            {t.name}
                            {t.isDefault ? ' (default)' : ''}
                        </MenuItem>
                    ))}
                </Select>
                <Button
                    variant="outlined"
                    size="small"
                    startIcon={downloading ? <CircularProgress size={14} /> : <DownloadIcon sx={{ fontSize: 16 }} />}
                    onClick={onDownload}
                    disabled={!templateId || downloading}
                    sx={toolbarButtonSx}
                >
                    Download
                </Button>
                <Button variant="contained" size="small" startIcon={<PrintIcon sx={{ fontSize: 16 }} />} onClick={onPrint} disabled={!ready} sx={primaryButtonSx}>
                    Print
                </Button>
                <Tooltip title="Close tab">
                    <IconButton size="small" aria-label="Close tab" onClick={onClose} sx={{ border: '1px solid #e2e8f0', borderRadius: '8px', '&:hover': { color: '#dc2626', backgroundColor: '#fef2f2', borderColor: '#fecaca' } }}>
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
                    <Box aria-busy="true" aria-label="Generating PDF" sx={{ flex: 1, maxWidth: 900, width: '100%', mx: 'auto', backgroundColor: '#fff', borderRadius: '8px', p: 4, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                        <Skeleton variant="rectangular" height={56} sx={{ borderRadius: '6px' }} />
                        <Skeleton width="60%" />
                        <Skeleton width="40%" />
                        <Skeleton variant="rectangular" height={180} sx={{ borderRadius: '6px', mt: 2 }} />
                        <Skeleton width="80%" />
                        <Skeleton width="50%" />
                        <Typography sx={{ mt: 1, fontSize: '0.8rem', color: '#64748b' }}>Generating PDF…</Typography>
                    </Box>
                ) : (
                    <Box
                        component="iframe"
                        ref={iframeRef}
                        title={`${title} PDF`}
                        src={pdfUrl}
                        sx={{ flex: 1, width: '100%', border: 0, borderRadius: '8px', backgroundColor: '#fff', boxShadow: '0 4px 16px rgba(15,23,42,0.10)' }}
                    />
                )}
            </Box>
        </Box>
    );
}

export default PdfViewerPage;
