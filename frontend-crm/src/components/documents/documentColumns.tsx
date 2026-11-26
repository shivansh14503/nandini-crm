'use client';

import React, { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import { RecordLink } from '../common/RecordLink';
import { type DataTableColumn } from '../common/DataTable';
import { formatDay } from '../common/Drawer/layout/drawerFields';
import { ROUTES } from '@/config/constants';
import type { Document } from '@/types/document.types';
import { formatDateTime } from '@/utils/date';
import { DocumentFileLink, FileKindIcon, SalesStagePill, userName } from './documentDisplay';

const plainCellSx = { fontSize: '0.78rem', color: 'var(--crm-slate-600)' } as const;
const linkCellSx = { display: 'block', fontSize: '0.8rem', fontWeight: 600, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as const;
const textCellSx = { fontSize: '0.8rem', fontWeight: 600, color: 'var(--crm-slate-700)', maxWidth: 240 } as const;

/**
 * The Documents table's columns. Labels match the opportunity form's Documentation fields (Document No, Document
 * Date, Upload Doc). `openRecord` runs on a plain click of the Document No link (opens the drawer).
 */
export function useDocumentColumns(openRecord: (record: Document) => void): DataTableColumn<Document>[] {
    return useMemo(
        () => [
            {
                id: 'documentNo',
                locked: true,
                label: 'DOCUMENT NO',
                sortable: true,
                minWidth: 170,
                render: (d) => (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                        <FileKindIcon file={d.documentFile} />
                        <RecordLink
                            href={ROUTES.DOCUMENT_DETAIL(d.id)}
                            onOpen={() => openRecord(d)}
                            sx={{
                                fontSize: '0.8rem',
                                fontWeight: 700,
                                maxWidth: 220,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                ...(!d.documentNo && { fontWeight: 600, fontStyle: 'italic' }),
                            }}
                        >
                            {d.documentNo || 'No number'}
                        </RecordLink>
                    </Box>
                ),
            },
            {
                id: 'documentFile',
                label: 'UPLOAD DOC',
                sortable: true,
                minWidth: 220,
                render: (d) => <DocumentFileLink file={d.documentFile} sx={{ maxWidth: 260 }} />,
            },
            {
                id: 'documentDate',
                label: 'DOCUMENT DATE',
                sortable: true,
                minWidth: 120,
                render: (d) => <Typography sx={plainCellSx}>{d.documentDate ? formatDay(d.documentDate) : '-'}</Typography>,
            },
            {
                id: 'opportunity',
                label: 'OPPORTUNITY',
                sortable: true,
                minWidth: 200,
                // A plain click keeps opening this document's drawer; Ctrl / middle / right click open the opportunity.
                render: (d) => (
                    <RecordLink href={ROUTES.OPPORTUNITY_DETAIL(d.opportunityId)} sx={linkCellSx}>
                        {d.opportunity || d.opportunityCode || '-'}
                    </RecordLink>
                ),
            },
            {
                id: 'salesStage',
                label: 'SALES STAGE',
                sortable: true,
                minWidth: 140,
                render: (d) => <SalesStagePill stage={d.salesStage} />,
            },
            {
                id: 'organizationName',
                label: 'ORGANIZATION NAME',
                sortable: true,
                minWidth: 200,
                render: (d) =>
                    d.organizationId && d.organizationName ? (
                        <RecordLink href={ROUTES.ORGANIZATION_DETAIL(d.organizationId)} sx={linkCellSx}>
                            {d.organizationName}
                        </RecordLink>
                    ) : (
                        <Typography noWrap sx={textCellSx}>
                            {d.organizationName || '-'}
                        </Typography>
                    ),
            },
            {
                id: 'assignedTo',
                label: 'ASSIGNED TO',
                sortable: true,
                minWidth: 140,
                render: (d) => <Typography sx={plainCellSx}>{userName(d.assignedTo) || '-'}</Typography>,
            },
            {
                id: 'createdBy',
                label: 'ADDED BY',
                sortable: true,
                minWidth: 140,
                render: (d) => <Typography sx={plainCellSx}>{userName(d.createdBy) || '-'}</Typography>,
            },
            {
                id: 'createdAt',
                label: 'DATE CREATED',
                sortable: true,
                minWidth: 170,
                render: (d) => <Typography sx={plainCellSx}>{formatDateTime(d.createdAt) || '-'}</Typography>,
            },
        ],
        [openRecord]
    );
}
