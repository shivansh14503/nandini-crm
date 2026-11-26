'use client';

import React from 'react';
import { Box, Chip, Link, Typography, type SxProps, type Theme } from '@mui/material';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import TableChartOutlinedIcon from '@mui/icons-material/TableChartOutlined';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import { recordFileService } from '@/services/recordFile.service';
import { findCrmUser } from '@/services/masterData.store';
import type { Document } from '@/types/document.types';
import type { RecordFile } from '@/types/recordFile.types';

/** Field labels, as on the opportunity form's Documentation section (same keys and labels everywhere). */
export const DOCUMENT_LABELS = {
    documentNo: 'Document No',
    documentDate: 'Document Date',
    documentFile: 'Upload Doc',
    opportunity: 'Opportunity',
    salesStage: 'Sales Stage',
    organizationName: 'Organization Name',
    contact: 'Contact',
    assignedTo: 'Assigned to',
    createdBy: 'Added By',
    createdAt: 'Date Created',
    updatedAt: 'Last Modified',
} as const;

/** A username as the user's full name (the username when it isn't a known user). */
export const userName = (username: string | undefined): string => (username ? findCrmUser(username)?.name || username : '');

/** How a document reads as a title: its Document No, else its file's name. */
export const documentTitle = (d: Pick<Document, 'documentNo' | 'documentFile'>): string => d.documentNo || d.documentFile?.fileName || 'Untitled document';

export type FileKind = 'pdf' | 'image' | 'word' | 'excel' | 'other';

export function fileKind(file: Pick<RecordFile, 'mimeType'> | null | undefined): FileKind {
    const mime = file?.mimeType ?? '';
    if (mime === 'application/pdf') return 'pdf';
    if (mime.startsWith('image/')) return 'image';
    if (mime.includes('word')) return 'word';
    if (mime.includes('excel') || mime.includes('spreadsheet')) return 'excel';
    return 'other';
}

export const FILE_KIND_LABELS: Record<FileKind, string> = { pdf: 'PDF', image: 'Image', word: 'Word', excel: 'Excel', other: 'File' };

/** Icon of the file's type, in the brand accent. */
export function FileKindIcon({ file, size = 16 }: { file: Pick<RecordFile, 'mimeType'> | null | undefined; size?: number }) {
    const sx = { fontSize: size, color: 'var(--crm-text-blue-600)', flexShrink: 0 };
    switch (fileKind(file)) {
        case 'pdf':
            return <PictureAsPdfOutlinedIcon sx={sx} />;
        case 'image':
            return <ImageOutlinedIcon sx={sx} />;
        case 'word':
            return <DescriptionOutlinedIcon sx={sx} />;
        case 'excel':
            return <TableChartOutlinedIcon sx={sx} />;
        default:
            return <InsertDriveFileOutlinedIcon sx={sx} />;
    }
}

/**
 * Link that opens the uploaded file in a new tab (PDFs and images in the browser, Word / Excel download). Clicks
 * don't reach the table row, so opening the file doesn't also open the drawer.
 */
export function DocumentFileLink({ file, sx }: { file: RecordFile | null | undefined; sx?: SxProps<Theme> }) {
    if (!file) return <Typography sx={{ fontSize: '0.8rem', color: 'var(--mui-palette-text-muted)' }}>-</Typography>;
    return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
            <FileKindIcon file={file} />
            <Link
                href={recordFileService.fileUrl(file)}
                target="_blank"
                rel="noopener noreferrer"
                underline="hover"
                title={`Open ${file.fileName}`}
                onClick={(e) => e.stopPropagation()}
                sx={[
                    {
                        color: 'var(--crm-text-blue-700)',
                        fontWeight: 600,
                        fontSize: '0.8rem',
                        minWidth: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        '&:hover': { color: 'var(--crm-text-blue-600)' },
                    },
                    ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
                ]}
            >
                {file.fileName}
            </Link>
        </Box>
    );
}

/** The opportunity's Sales Stage as a pill (green when won, red when lost, brand tint otherwise). */
export function SalesStagePill({ stage }: { stage: string }) {
    if (!stage) return <Typography sx={{ fontSize: '0.8rem', color: 'var(--mui-palette-text-muted)' }}>-</Typography>;
    const tone =
        stage === 'Closed Won'
            ? { bg: 'var(--mui-palette-success-soft)', color: 'var(--crm-emerald-700)', border: 'var(--mui-palette-success-softBorder)' }
            : stage === 'Closed Lost'
              ? { bg: 'var(--mui-palette-error-soft)', color: 'var(--crm-red-700)', border: 'var(--mui-palette-error-softBorder)' }
              : { bg: 'var(--mui-palette-primary-soft)', color: 'var(--crm-text-blue-700)', border: 'var(--mui-palette-primary-softBorder)' };
    return (
        <Chip
            label={stage}
            size="small"
            sx={{ height: 22, fontSize: '0.72rem', fontWeight: 700, backgroundColor: tone.bg, color: tone.color, border: `1px solid ${tone.border}`, maxWidth: '100%' }}
        />
    );
}
