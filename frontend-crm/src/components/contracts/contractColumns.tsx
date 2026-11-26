'use client';

import React, { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import HistoryEduOutlinedIcon from '@mui/icons-material/HistoryEduOutlined';
import { RecordLink } from '../common/RecordLink';
import { documentNumberColumn, type DataTableColumn } from '../common/DataTable';
import { ROUTES } from '@/config/constants';
import { findCrmUser } from '@/services/masterData.store';
import type { Contract } from '@/types/contract.types';
import { useShowRecordNumber } from '@/hooks/queries/useDocumentSeries';
import { formatDateTime } from '@/utils/date';
import { fmtMoney } from '@/utils/formats';
import { ContractStatusPill } from './ContractBadges';
import { formatContractDate } from './contractDates';

const userName = (username: string | undefined) => (username ? findCrmUser(username)?.name || username : '');

/** ₹ without decimals in the company number grouping (as on Quotations); '-' when no amount is set. */
const formatAmount = (value: string) => {
    const amount = value ? Number(value) : NaN;
    if (!Number.isFinite(amount)) return '-';
    return fmtMoney(amount, { maxDecimals: 0 });
};

const plainCellSx = { fontSize: '0.78rem', color: 'var(--crm-slate-600)' } as const;
const linkCellSx = { display: 'block', fontSize: '0.8rem', fontWeight: 600, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as const;
const textCellSx = { fontSize: '0.8rem', fontWeight: 600, color: 'var(--crm-slate-700)', maxWidth: 240 } as const;

/**
 * The Contract table's columns (built-in ones; form-field columns are added by the table). Shared by the
 * module's list page and the related-records table in other records' drawers, so both offer the same columns.
 * `openRecord` runs on a plain click of the record link.
 */
export function useContractColumns(openRecord: (record: Contract) => void): DataTableColumn<Contract>[] {
    const showNumber = useShowRecordNumber();

    return useMemo(
        () => [
            ...(showNumber('contract')
                ? [
                      documentNumberColumn<Contract>({
                          id: 'contractNumber',
                          label: 'CONTRACT NUMBER',
                          getNumber: (c) => c.contractNumber,
                          getHref: (c) => ROUTES.CONTRACT_DETAIL(c.id),
                          onOpen: (c) => openRecord(c),
                      }),
                  ]
                : []),
            {
                id: 'contractTitle',
                locked: true,
                label: 'CONTRACT TITLE',
                sortable: true,
                minWidth: 200,
                render: (c) => (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                        <HistoryEduOutlinedIcon sx={{ fontSize: 16, color: 'var(--crm-text-blue-600)', flexShrink: 0 }} />
                        <RecordLink
                            href={ROUTES.CONTRACT_DETAIL(c.id)}
                            onOpen={() => openRecord(c)}
                            sx={{ fontSize: '0.8rem', fontWeight: 700, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        >
                            {c.contractTitle || '-'}
                        </RecordLink>
                    </Box>
                ),
            },
            {
                id: 'status',
                label: 'STATUS',
                sortable: true,
                minWidth: 130,
                render: (c) => <ContractStatusPill status={c.status} />,
            },
            {
                id: 'assignedTo',
                label: 'CONTRACT MANAGER',
                sortable: true,
                minWidth: 150,
                render: (c) => <Typography sx={plainCellSx}>{userName(c.assignedTo) || '-'}</Typography>,
            },
            {
                id: 'organizationName',
                label: 'ORGANIZATION',
                sortable: true,
                minWidth: 200,
                render: (c) =>
                    c.organizationId && c.organizationName ? (
                        <RecordLink href={ROUTES.ORGANIZATION_DETAIL(c.organizationId)} sx={linkCellSx}>
                            {c.organizationName}
                        </RecordLink>
                    ) : (
                        <Typography noWrap sx={textCellSx}>
                            {c.organizationName || '-'}
                        </Typography>
                    ),
            },
            {
                id: 'opportunity',
                label: 'OPPORTUNITY',
                sortable: true,
                minWidth: 180,
                render: (c) =>
                    // A plain click keeps opening this contract's drawer; Ctrl / middle / right click open the opportunity.
                    c.opportunityId && c.opportunity ? (
                        <RecordLink href={ROUTES.OPPORTUNITY_DETAIL(c.opportunityId)} sx={linkCellSx}>
                            {c.opportunity}
                        </RecordLink>
                    ) : (
                        <Typography noWrap sx={textCellSx}>
                            {c.opportunity || '-'}
                        </Typography>
                    ),
            },
            {
                id: 'contractValue',
                label: 'CONTRACT VALUE',
                sortable: true,
                align: 'right',
                minWidth: 140,
                render: (c) => (
                    <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--crm-slate-900)' }}>{formatAmount(c.contractValue)}</Typography>
                ),
            },
            {
                id: 'startDate',
                label: 'START DATE',
                sortable: true,
                minWidth: 110,
                render: (c) => <Typography sx={plainCellSx}>{formatContractDate(c.startDate) || '-'}</Typography>,
            },
            {
                id: 'endDate',
                label: 'END DATE',
                sortable: true,
                minWidth: 110,
                render: (c) => <Typography sx={plainCellSx}>{formatContractDate(c.endDate) || '-'}</Typography>,
            },
            {
                id: 'contractPeriod',
                label: 'CONTRACT PERIOD',
                sortable: true,
                minWidth: 130,
                render: (c) => <Typography sx={plainCellSx}>{c.contractPeriod || '-'}</Typography>,
            },
            {
                id: 'renewalReminderDate',
                label: 'RENEWAL REMINDER',
                sortable: true,
                minWidth: 170,
                render: (c) => <Typography sx={plainCellSx}>{formatDateTime(c.renewalReminderDate) || '-'}</Typography>,
            },
            {
                id: 'createdAt',
                label: 'DATE CREATED',
                sortable: true,
                minWidth: 170,
                render: (c) => <Typography sx={plainCellSx}>{formatDateTime(c.createdAt) || '-'}</Typography>,
            },
            {
                id: 'createdBy',
                label: 'CREATED BY',
                sortable: true,
                minWidth: 140,
                render: (c) => <Typography sx={plainCellSx}>{userName(c.createdBy) || '-'}</Typography>,
            },
        ],
        [showNumber, openRecord]
    );
}
