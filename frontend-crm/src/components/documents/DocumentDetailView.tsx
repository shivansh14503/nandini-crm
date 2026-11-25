'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Box, Button, Paper, Skeleton, Typography } from '@mui/material';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import FolderOffOutlinedIcon from '@mui/icons-material/FolderOffOutlined';
import { AppBreadcrumbsBar } from '../common/AppBreadcrumbsBar';
import { RecordAuditFooter } from '../common/Drawer';
import { ROUTES } from '@/config/constants';
import { useDocument } from '@/hooks/queries';
import { getModuleColor } from '@/theme/moduleColors';
import { DocumentInfoSection, DocumentOpportunitySection, DocumentPreview } from './DocumentDetails';
import { FileKindIcon, documentTitle } from './documentDisplay';

const outlinedButtonSx = {
    minHeight: 36,
    px: 1.8,
    textTransform: 'none',
    fontWeight: 600,
    fontSize: '0.8rem',
    borderRadius: '8px',
    border: '1px solid var(--mui-palette-border-main)',
    color: 'var(--crm-slate-700)',
    backgroundColor: 'var(--mui-palette-background-paper)',
    transition: 'all 0.15s ease',
    '&:hover': {
        borderColor: 'var(--crm-blue-300)',
        backgroundColor: 'var(--mui-palette-primary-soft)',
        color: 'var(--crm-text-blue-700)',
    },
} as const;

const primaryButtonSx = {
    minHeight: 36,
    px: 1.8,
    textTransform: 'none',
    fontWeight: 700,
    fontSize: '0.8rem',
    borderRadius: '8px',
    color: '#ffffff',
    background: 'linear-gradient(135deg, var(--crm-fill-blue-700) 0%, var(--crm-fill-blue-600) 100%)',
    boxShadow: '0 4px 14px rgb(var(--crm-accent-rgb) / 0.28)',
    '&:hover': {
        background: 'linear-gradient(135deg, var(--crm-fill-blue-800) 0%, var(--crm-fill-blue-700) 100%)',
    },
} as const;

/**
 * A document's full page: its details and opportunity beside a preview of the file (stacked on phones and tablets).
 * Read-only; "Edit in Opportunity" opens the opportunity form, whose Documentation section changes it.
 */
export function DocumentDetailView({ documentId, backHref = ROUTES.DOCUMENTS }: { documentId: string; backHref?: string }) {
    const router = useRouter();
    const { data: d, isPending } = useDocument(documentId);
    const moduleColor = getModuleColor('documents');

    const back = (
        <Button startIcon={<ArrowBackRoundedIcon sx={{ fontSize: 18 }} />} onClick={() => router.push(backHref)} sx={outlinedButtonSx}>
            Back to Documents
        </Button>
    );

    if (isPending) {
        return (
            <Box>
                <AppBreadcrumbsBar items={[{ label: 'Activities' }, { label: 'Documents', href: ROUTES.DOCUMENTS }, { label: 'Loading…' }]} />
                <Skeleton variant="rounded" height={88} sx={{ mb: 2 }} />
                <Skeleton variant="rounded" height={360} />
            </Box>
        );
    }

    if (!d) {
        return (
            <Box>
                <AppBreadcrumbsBar items={[{ label: 'Activities' }, { label: 'Documents', href: ROUTES.DOCUMENTS }]} />
                <Paper
                    elevation={0}
                    sx={{
                        p: { xs: 3, md: 5 },
                        textAlign: 'center',
                        borderRadius: '12px',
                        border: '1px solid var(--mui-palette-border-main)',
                        backgroundColor: 'var(--mui-palette-background-paper)',
                    }}
                >
                    <FolderOffOutlinedIcon sx={{ fontSize: 44, color: 'var(--mui-palette-text-muted)' }} />
                    <Typography sx={{ mt: 1, fontWeight: 700, color: 'var(--crm-slate-900)' }}>Document not found</Typography>
                    <Typography sx={{ mt: 0.5, mb: 2, fontSize: '0.85rem', color: 'var(--mui-palette-text-secondary)' }}>
                        It may have been removed from its opportunity, or you don&apos;t have access to it.
                    </Typography>
                    {back}
                </Paper>
            </Box>
        );
    }

    const title = documentTitle(d);

    return (
        <Box>
            <AppBreadcrumbsBar
                items={[{ label: 'Activities' }, { label: 'Documents', href: ROUTES.DOCUMENTS }, { label: title }]}
                actions={
                    <>
                        {back}
                        <Button
                            startIcon={<EditOutlinedIcon sx={{ fontSize: 16 }} />}
                            onClick={() => router.push(ROUTES.OPPORTUNITY_EDIT(d.opportunityId))}
                            title="Documents are changed from the Documentation section of their opportunity"
                            sx={primaryButtonSx}
                        >
                            Edit in Opportunity
                        </Button>
                    </>
                }
            />

            {/* Header: module-tinted strip, file icon, title and the opportunity it belongs to. */}
            <Paper
                elevation={0}
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.75,
                    p: { xs: 1.75, md: 2.25 },
                    mb: 2,
                    borderRadius: '12px',
                    border: '1px solid var(--mui-palette-border-main)',
                    borderTop: `3px solid ${moduleColor.main}`,
                    backgroundColor: 'var(--mui-palette-background-paper)',
                    minWidth: 0,
                }}
            >
                <Box
                    sx={{
                        width: 48,
                        height: 48,
                        borderRadius: '10px',
                        display: 'grid',
                        placeItems: 'center',
                        flexShrink: 0,
                        backgroundColor: moduleColor.soft,
                        border: `1px solid ${moduleColor.border}`,
                    }}
                >
                    <FileKindIcon file={d.documentFile} size={24} />
                </Box>
                <Box sx={{ minWidth: 0 }}>
                    <Typography
                        component="h1"
                        sx={{ fontSize: { xs: '1.05rem', md: '1.25rem' }, fontWeight: 800, color: 'var(--crm-slate-900)', lineHeight: 1.25, wordBreak: 'break-word' }}
                    >
                        {title}
                    </Typography>
                    <Typography sx={{ fontSize: '0.82rem', color: 'var(--mui-palette-text-secondary)', mt: 0.3, wordBreak: 'break-word' }}>
                        {[d.opportunityCode, d.opportunity, d.organizationName].filter(Boolean).join(' · ')}
                    </Typography>
                </Box>
            </Paper>

            <Box
                sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 5fr) minmax(0, 7fr)' },
                    gap: 2,
                    alignItems: 'start',
                }}
            >
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                    <DocumentInfoSection document={d} />
                    <DocumentOpportunitySection document={d} />
                    <Box sx={{ px: 0.5, mt: -1 }}>
                        <RecordAuditFooter audit={d} />
                    </Box>
                </Box>
                <Box sx={{ minWidth: 0, position: { lg: 'sticky' }, top: { lg: 16 } }}>
                    <DocumentPreview file={d.documentFile} sx={{ height: { xs: 360, sm: 520, lg: 'calc(100dvh - 200px)' } }} />
                </Box>
            </Box>
        </Box>
    );
}
