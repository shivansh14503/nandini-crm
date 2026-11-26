'use client';

import React, { useMemo } from 'react';
import { Box, Chip, Typography } from '@mui/material';
import ApartmentIcon from '@mui/icons-material/Apartment';
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';

import { documentNumberColumn, type DataTableColumn } from '../common/DataTable';
import { ROUTES } from '@/config/constants';
import type { Quotation } from '@/types/quotation.types';
import { useShowRecordNumber } from '@/hooks/queries/useDocumentSeries';
import { wasModified } from '../common/Drawer/RecordAuditFooter';
import { formatDateTime } from '@/utils/date';
import { fmtMoney } from '@/utils/formats';
import { RecordLink } from '../common/RecordLink';

export type QuotationFilterTab = 'all' | 'high_value' | 'my_quotes';
/** Any column's field key: the table sorts on `row[sortField]`, including columns added from the form. */
export type QuotationSortField = string;

/** ₹ without decimals, in the company number grouping. */
const formatCurrency = (val: number = 0) => fmtMoney(val, { maxDecimals: 0 });

const plainCellSx = { fontSize: '0.78rem', color: 'var(--crm-slate-700)' } as const;

const STAGE_COLORS: Record<string, { bg: string; color: string; border: string }> = {
    Draft: { bg: 'var(--mui-palette-background-hover)', color: 'var(--crm-slate-600)', border: 'var(--mui-palette-border-strong)' },
    Negotiation: { bg: 'var(--mui-palette-warning-soft)', color: 'var(--crm-amber-700)', border: 'var(--mui-palette-warning-softBorder)' },
    Delivered: { bg: 'var(--mui-palette-primary-soft)', color: 'var(--crm-text-blue-700)', border: 'var(--mui-palette-primary-softBorder)' },
    'On Hold': { bg: 'var(--crm-rose-50)', color: 'var(--crm-rose-700)', border: 'var(--crm-rose-200)' },
    Confirmed: { bg: 'var(--mui-palette-success-soft)', color: 'var(--crm-emerald-700)', border: 'var(--mui-palette-success-softBorder)' },
    'Closed Accepted': { bg: 'var(--mui-palette-success-soft)', color: 'var(--crm-emerald-700)', border: 'var(--mui-palette-success-softBorder)' },
    'Closed Lost': { bg: 'var(--mui-palette-error-soft)', color: 'var(--crm-red-700)', border: 'var(--mui-palette-error-softBorder)' },
    'Closed Dead': { bg: 'var(--mui-palette-background-hover)', color: 'var(--mui-palette-text-secondary)', border: 'var(--mui-palette-border-strong)' },
    // Older records still carry the legacy status names.
    Sent: { bg: 'var(--mui-palette-primary-soft)', color: 'var(--crm-text-blue-700)', border: 'var(--mui-palette-primary-softBorder)' },
    Accepted: { bg: 'var(--mui-palette-success-soft)', color: 'var(--crm-emerald-700)', border: 'var(--mui-palette-success-softBorder)' },
    Rejected: { bg: 'var(--mui-palette-error-soft)', color: 'var(--crm-red-700)', border: 'var(--mui-palette-error-softBorder)' },
};

/**
 * The Quotation table's columns (built-in ones; form-field columns are added by the table). Shared by the
 * module's list page and the related-records table in other records' drawers, so both offer the same columns.
 * `openRecord` runs on a plain click of the record link.
 */
export function useQuotationColumns(openRecord: (record: Quotation) => void): DataTableColumn<Quotation>[] {
    const showNumber = useShowRecordNumber();

    return useMemo(
        () => [
            ...(showNumber('quotation')
                ? [
                      documentNumberColumn<Quotation>({
                          id: 'quotationCode',
                          label: 'QUOTATION NUMBER',
                          getNumber: (row) => row.quotationCode,
                          getHref: (row) => ROUTES.QUOTATION_DETAIL(row.id),
                          onOpen: (row) => openRecord(row),
                      }),
                  ]
                : []),
            {
                id: 'quotationTitle',
                locked: true,
                label: 'TITLE',
                sortable: true,
                minWidth: 200,
                render: (row) => (
                    <RecordLink
                        href={ROUTES.QUOTATION_DETAIL(row.id)}
                        onOpen={() => openRecord(row)}
                        sx={{ fontSize: '0.8rem', fontWeight: 700 }}
                    >
                        {row.quotationTitle || row.quotationSubject || '-'}
                    </RecordLink>
                ),
            },
            {
                id: 'opportunity',
                label: 'OPPORTUNITY',
                sortable: true,
                minWidth: 160,
                render: (row) => {
                    const label = row.opportunity || (showNumber('opportunity') ? row.opportunityCode : '') || '-';
                    // A plain click keeps opening this quotation's drawer; Ctrl / middle / right click open the opportunity.
                    return row.opportunityId && label !== '-' ? (
                        <RecordLink href={ROUTES.OPPORTUNITY_DETAIL(row.opportunityId)} sx={{ fontSize: '0.8rem', fontWeight: 600 }}>
                            {label}
                        </RecordLink>
                    ) : (
                        <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--crm-text-blue-600)' }}>{label}</Typography>
                    );
                },
            },
            {
                // Derived: the quotation was edited after it was first saved.
                id: 'revised',
                label: 'REVISED',
                sortable: false,
                minWidth: 100,
                render: (row) => {
                    const revised = wasModified(row);
                    return (
                        <Typography sx={{ fontSize: '0.76rem', fontWeight: 600, color: revised ? 'var(--crm-amber-700)' : 'var(--mui-palette-text-muted)' }}>
                            {revised ? 'Yes' : 'No'}
                        </Typography>
                    );
                },
            },
            {
                id: 'quoteStage',
                label: 'QUOTE STAGE',
                sortable: true,
                minWidth: 130,
                render: (row) => {
                    const stage = String(row.quoteStage || row.status || 'Draft');
                    const st = STAGE_COLORS[stage] ?? STAGE_COLORS.Draft;
                    return (
                        <Chip
                            label={stage}
                            size="small"
                            sx={{
                                backgroundColor: st.bg,
                                color: st.color,
                                border: `1px solid ${st.border}`,
                                fontWeight: 700,
                                fontSize: '0.72rem',
                                height: 22,
                            }}
                        />
                    );
                },
            },
            {
                id: 'contact',
                label: 'CONTACT',
                sortable: true,
                minWidth: 150,
                render: (row) => (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                        <PersonOutlinedIcon sx={{ fontSize: 15, color: 'var(--mui-palette-text-muted)' }} />
                        {row.contactId && row.contact ? (
                            <RecordLink href={ROUTES.CONTACT_DETAIL(row.contactId)} sx={{ fontSize: '0.8rem' }}>
                                {row.contact}
                            </RecordLink>
                        ) : (
                            <Typography sx={{ fontSize: '0.8rem', color: 'var(--crm-slate-600)' }}>{row.contact || '-'}</Typography>
                        )}
                    </Box>
                ),
            },
            {
                id: 'organizationName',
                label: 'ORGANIZATION',
                sortable: true,
                minWidth: 180,
                render: (row) => (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                        <ApartmentIcon sx={{ fontSize: 15, color: 'var(--mui-palette-text-secondary)' }} />
                        {row.organizationId && row.organizationName ? (
                            <RecordLink href={ROUTES.ORGANIZATION_DETAIL(row.organizationId)} sx={{ fontSize: '0.8rem', fontWeight: 500 }}>
                                {row.organizationName}
                            </RecordLink>
                        ) : (
                            <Typography sx={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--crm-slate-700)' }}>
                                {row.organizationName || '-'}
                            </Typography>
                        )}
                    </Box>
                ),
            },
            {
                id: 'grandTotal',
                label: 'GRAND TOTAL',
                sortable: true,
                align: 'right',
                minWidth: 130,
                render: (row) => (
                    <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--crm-slate-900)' }}>
                        {formatCurrency(row.grandTotal)}
                    </Typography>
                ),
            },
            {
                id: 'validUntil',
                label: 'VALID UNTIL',
                sortable: true,
                minWidth: 120,
                render: (row) => <Typography sx={plainCellSx}>{row.validUntil || '-'}</Typography>,
            },
            {
                id: 'assignedTo',
                label: 'USER',
                sortable: true,
                minWidth: 120,
                render: (row) => <Typography sx={plainCellSx}>{row.assignedTo || '-'}</Typography>,
            },
            {
                id: 'createdAt',
                label: 'DATE CREATED',
                sortable: true,
                minWidth: 170,
                render: (row) => <Typography sx={plainCellSx}>{formatDateTime(row.createdAt) || '-'}</Typography>,
            },
        ],
        [showNumber, openRecord]
    );
}
