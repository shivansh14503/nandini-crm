'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Button, CircularProgress, Typography, type SxProps, type Theme } from '@mui/material';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import TrendingUpOutlinedIcon from '@mui/icons-material/TrendingUpOutlined';
import { DrawerSectionCard } from '../common/Drawer';
import { formatDay } from '../common/Drawer/layout/drawerFields';
import { RecordLink } from '../common/RecordLink';
import { ROUTES } from '@/config/constants';
import { recordFileService } from '@/services/recordFile.service';
import type { Document } from '@/types/document.types';
import { formatFileSize, type RecordFile } from '@/types/recordFile.types';
import { DOCUMENT_LABELS as L, FILE_KIND_LABELS, FileKindIcon, SalesStagePill, fileKind, userName } from './documentDisplay';

const labelSx: SxProps<Theme> = {
    fontSize: '0.68rem',
    fontWeight: 600,
    color: 'var(--mui-palette-text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    mb: 0.4,
};
const valueSx: SxProps<Theme> = { fontSize: '0.85rem', fontWeight: 600, color: 'var(--crm-slate-900)', wordBreak: 'break-word' };
const emptySx: SxProps<Theme> = { fontSize: '0.82rem', color: 'var(--mui-palette-text-muted)', fontStyle: 'italic' };
const linkSx = { fontSize: '0.85rem', fontWeight: 700, wordBreak: 'break-word' } as const;

/** A linked record: a plain click goes to its page (modifier / middle clicks open it in a new tab). */
function GoLink({ href, children }: { href: string; children: React.ReactNode }) {
    const router = useRouter();
    return (
        <RecordLink href={href} onOpen={() => router.push(href)} sx={linkSx}>
            {children}
        </RecordLink>
    );
}

const gridSx = (columns: { xs: number; sm?: number }): SxProps<Theme> => ({
    display: 'grid',
    gridTemplateColumns: { xs: `repeat(${columns.xs}, minmax(0, 1fr))`, sm: `repeat(${columns.sm ?? columns.xs}, minmax(0, 1fr))` },
    gap: 1.75,
    mt: 0.75,
});

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
    const empty = children === '' || children === null || children === undefined;
    return (
        <Box sx={{ minWidth: 0, ...(full && { gridColumn: '1 / -1' }) }}>
            <Typography sx={labelSx}>{label}</Typography>
            {empty ? <Typography sx={emptySx}>Not provided</Typography> : typeof children === 'string' ? <Typography sx={valueSx}>{children}</Typography> : children}
        </Box>
    );
}

/** The uploaded file as a card: type icon, name, size and type, with a button that opens it. */
export function DocumentFileCard({ file }: { file: RecordFile | null }) {
    if (!file) return <Typography sx={emptySx}>No file uploaded</Typography>;
    return (
        <Box
            sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                p: 1.25,
                borderRadius: '8px',
                border: '1px solid var(--mui-palette-border-main)',
                backgroundColor: 'var(--mui-palette-background-subtle)',
                flexWrap: 'wrap',
            }}
        >
            <Box
                sx={{
                    width: 40,
                    height: 40,
                    borderRadius: '8px',
                    display: 'grid',
                    placeItems: 'center',
                    backgroundColor: 'var(--mui-palette-primary-soft)',
                    border: '1px solid var(--mui-palette-primary-softBorder)',
                    flexShrink: 0,
                }}
            >
                <FileKindIcon file={file} size={22} />
            </Box>
            <Box sx={{ minWidth: 0, flex: '1 1 160px' }}>
                <Typography sx={{ ...valueSx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={file.fileName}>
                    {file.fileName}
                </Typography>
                <Typography sx={{ fontSize: '0.72rem', color: 'var(--mui-palette-text-muted)' }}>
                    {FILE_KIND_LABELS[fileKind(file)]} · {formatFileSize(file.sizeBytes)}
                </Typography>
            </Box>
            <Button
                component="a"
                href={recordFileService.fileUrl(file)}
                target="_blank"
                rel="noopener noreferrer"
                size="small"
                startIcon={<OpenInNewRoundedIcon sx={{ fontSize: 16 }} />}
                sx={{
                    minHeight: 34,
                    px: 1.5,
                    textTransform: 'none',
                    fontWeight: 700,
                    fontSize: '0.78rem',
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
                }}
            >
                {fileKind(file) === 'pdf' || fileKind(file) === 'image' ? 'Open file' : 'Download'}
            </Button>
        </Box>
    );
}

/** Document No, Document Date and the file (Upload Doc). */
export function DocumentInfoSection({ document: d }: { document: Document }) {
    return (
        <DrawerSectionCard title="Document" icon={<DescriptionOutlinedIcon sx={{ fontSize: 18, color: 'var(--crm-text-blue-600)' }} />}>
            <Box sx={gridSx({ xs: 1, sm: 2 })}>
                <Field label={L.documentNo}>{d.documentNo}</Field>
                <Field label={L.documentDate}>{d.documentDate ? formatDay(d.documentDate) : ''}</Field>
                <Field label={L.documentFile} full>
                    <DocumentFileCard file={d.documentFile} />
                </Field>
            </Box>
        </DrawerSectionCard>
    );
}

/** The opportunity the document belongs to, with its organization, contact, stage and owner. */
export function DocumentOpportunitySection({ document: d }: { document: Document }) {
    return (
        <DrawerSectionCard title="Opportunity" icon={<TrendingUpOutlinedIcon sx={{ fontSize: 18, color: 'var(--crm-text-blue-600)' }} />}>
            <Box sx={gridSx({ xs: 1, sm: 2 })}>
                <Field label={L.opportunity} full>
                    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flexWrap: 'wrap', minWidth: 0 }}>
                        <GoLink href={ROUTES.OPPORTUNITY_DETAIL(d.opportunityId)}>{d.opportunity || d.opportunityCode}</GoLink>
                        {d.opportunityCode && d.opportunity && (
                            <Typography sx={{ fontSize: '0.72rem', fontFamily: 'monospace', color: 'var(--mui-palette-text-secondary)' }}>{d.opportunityCode}</Typography>
                        )}
                    </Box>
                </Field>
                <Field label={L.salesStage}>{d.salesStage ? <SalesStagePill stage={d.salesStage} /> : ''}</Field>
                <Field label={L.assignedTo}>{userName(d.assignedTo)}</Field>
                <Field label={L.organizationName}>
                    {d.organizationId && d.organizationName ? (
                        <GoLink href={ROUTES.ORGANIZATION_DETAIL(d.organizationId)}>{d.organizationName}</GoLink>
                    ) : (
                        d.organizationName
                    )}
                </Field>
                <Field label={L.contact}>
                    {d.contactId && d.contact ? (
                        <GoLink href={ROUTES.CONTACT_DETAIL(d.contactId)}>{d.contact}</GoLink>
                    ) : (
                        d.contact
                    )}
                </Field>
            </Box>
        </DrawerSectionCard>
    );
}

/**
 * The file shown in the page (PDFs and images). It is fetched with the session cookie and shown from a local blob
 * URL, since the API doesn't allow other sites to frame its responses. Word / Excel files only offer the download.
 */
export function DocumentPreview({ file, sx }: { file: RecordFile | null; sx?: SxProps<Theme> }) {
    const kind = fileKind(file);
    const previewable = Boolean(file) && (kind === 'pdf' || kind === 'image');
    const fileUrl = file ? recordFileService.fileUrl(file) : '';
    const [state, setState] = useState<{ url: string | null; error: boolean; forUrl: string }>({ url: null, error: false, forUrl: '' });

    useEffect(() => {
        if (!previewable || !fileUrl) return;
        let objectUrl: string | null = null;
        let cancelled = false;
        fetch(fileUrl, { credentials: 'include' })
            .then((res) => (res.ok ? res.blob() : Promise.reject(new Error(String(res.status)))))
            .then((blob) => {
                if (cancelled) return;
                objectUrl = URL.createObjectURL(blob);
                setState({ url: objectUrl, error: false, forUrl: fileUrl });
            })
            .catch(() => {
                if (!cancelled) setState({ url: null, error: true, forUrl: fileUrl });
            });
        return () => {
            cancelled = true;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [previewable, fileUrl]);

    const current = state.forUrl === fileUrl ? state : { url: null, error: false };
    const frameSx: SxProps<Theme> = {
        borderRadius: '10px',
        border: '1px solid var(--mui-palette-border-main)',
        backgroundColor: 'var(--mui-palette-background-subtle)',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: { xs: 260, md: 420 },
        ...(sx as object),
    };
    const message = (text: string) => (
        <Box sx={{ ...frameSx, p: 3, textAlign: 'center', flexDirection: 'column', gap: 1 }}>
            <FileKindIcon file={file} size={36} />
            <Typography sx={{ fontSize: '0.85rem', color: 'var(--mui-palette-text-secondary)', maxWidth: 320 }}>{text}</Typography>
        </Box>
    );

    if (!file) return message('No file was uploaded with this document.');
    if (!previewable) return message(`${FILE_KIND_LABELS[kind]} files can't be shown here. Use Download to open it.`);
    if (current.error) return message("The file couldn't be loaded for preview. Use Open file to view it.");
    if (!current.url) {
        return (
            <Box sx={frameSx}>
                <CircularProgress size={28} sx={{ color: 'var(--mui-palette-primary-main)' }} />
            </Box>
        );
    }
    return (
        <Box sx={frameSx}>
            {kind === 'pdf' ? (
                <Box component="iframe" title={file.fileName} src={current.url} sx={{ width: '100%', height: '100%', minHeight: 'inherit', border: 0, alignSelf: 'stretch' }} />
            ) : (
                <Box component="img" src={current.url} alt={file.fileName} sx={{ maxWidth: '100%', maxHeight: { xs: 480, md: 720 }, objectFit: 'contain', display: 'block' }} />
            )}
        </Box>
    );
}
