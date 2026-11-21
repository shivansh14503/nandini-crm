'use client';

import React, { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import ApartmentIcon from '@mui/icons-material/Apartment';

import { ROUTES } from '@/config/constants';
import { RecordLink } from '../common/RecordLink';
import { documentNumberColumn, type DataTableColumn } from '../common/DataTable';
import type { ExtendedOrganization } from '@/types/organization.types';
import { formatDateTime } from '@/utils/date';
import { useShowRecordNumber } from '@/hooks/queries/useDocumentSeries';

const plainCellSx = { fontSize: '0.78rem', color: 'var(--crm-slate-700)' } as const;

const getNatureBadgeStyle = (nature: string = '') => {
    const n = nature.toLowerCase();
    if (n.includes('education')) return { backgroundColor: 'var(--crm-purple-100)', color: 'var(--crm-purple-700)', border: '1px solid var(--crm-purple-300)' };
    if (n.includes('construction')) return { backgroundColor: 'var(--crm-orange-50)', color: 'var(--crm-orange-700)', border: '1px solid var(--crm-orange-200)' };
    if (n.includes('distributor') || n.includes('trading') || n.includes('wholesale')) return { backgroundColor: 'var(--mui-palette-primary-soft)', color: 'var(--crm-text-blue-700)', border: '1px solid var(--mui-palette-primary-softBorder)' };
    if (n.includes('transportation') || n.includes('logistics')) return { backgroundColor: 'var(--crm-cyan-50)', color: 'var(--crm-cyan-700)', border: '1px solid var(--crm-cyan-200)' };
    if (n.includes('consulting')) return { backgroundColor: 'var(--crm-indigo-50)', color: 'var(--crm-indigo-700)', border: '1px solid var(--crm-indigo-200)' };
    if (n.includes('it') || n.includes('software')) return { backgroundColor: 'var(--mui-palette-info-soft)', color: 'var(--mui-palette-info-main)', border: '1px solid var(--mui-palette-info-softBorder)' };
    if (n.includes('manufacturing')) return { backgroundColor: 'var(--mui-palette-success-soft)', color: 'var(--crm-emerald-700)', border: '1px solid var(--mui-palette-success-softBorder)' };
    if (n.includes('healthcare')) return { backgroundColor: 'var(--crm-rose-50)', color: 'var(--crm-rose-700)', border: '1px solid var(--crm-rose-200)' };
    if (n.includes('retail')) return { backgroundColor: 'var(--crm-yellow-50)', color: 'var(--crm-yellow-700)', border: '1px solid var(--crm-yellow-200)' };
    return { backgroundColor: 'var(--mui-palette-background-subtle)', color: 'var(--crm-slate-600)', border: '1px solid var(--mui-palette-border-strong)' };
};

const formatNatureLabel = (nature: string = '') => {
    if (nature.includes('Distributor / Trading / Wholesale')) return 'Distributor/Trading';
    return nature;
};

/**
 * The ExtendedOrganization table's columns (built-in ones; form-field columns are added by the table). Shared by the
 * module's list page and the related-records table in other records' drawers, so both offer the same columns.
 * `openRecord` runs on a plain click of the record link.
 */
export function useOrganizationColumns(openRecord: (record: ExtendedOrganization) => void): DataTableColumn<ExtendedOrganization>[] {
    const showNumber = useShowRecordNumber();

    return useMemo(
        () => [
            ...(showNumber('organization')
                ? [
                      {
                          // Not one of the basic columns; switch it on from Modify Columns.
                          ...documentNumberColumn<ExtendedOrganization>({
                              id: 'accountCode',
                              label: 'ORGANIZATION NO.',
                              getNumber: (o) => o.accountCode,
                              getHref: (o) => ROUTES.ORGANIZATION_DETAIL(o.id),
                              onOpen: (o) => openRecord(o),
                          }),
                          defaultHidden: true,
                      },
                  ]
                : []),
            {
                id: 'organizationName',
                locked: true,
                label: 'NAME',
                sortable: true,
                minWidth: 240,
                render: (org) => (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
                        <Box
                            sx={{
                                width: 28,
                                height: 28,
                                borderRadius: '6px',
                                backgroundColor: 'var(--mui-palette-primary-soft)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: 'var(--crm-text-blue-600)',
                                flexShrink: 0,
                            }}
                        >
                            <ApartmentIcon sx={{ fontSize: 16 }} />
                        </Box>
                        <Box>
                            <RecordLink
                                href={ROUTES.ORGANIZATION_DETAIL(org.id)}
                                onOpen={() => openRecord(org)}
                                sx={{
                                    fontSize: '0.82rem',
                                    fontWeight: 700,
                                    color: 'var(--crm-text-blue-700)',
                                    cursor: 'pointer',
                                    lineHeight: 1.3,
                                    '&:hover': { textDecoration: 'underline' },
                                }}
                            >
                                {org.organizationName}
                            </RecordLink>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.2 }}>
                                {org.tradeName && org.tradeName !== org.organizationName && (
                                    <Typography sx={{ fontSize: '0.7rem', color: 'var(--mui-palette-text-muted)' }}>{org.tradeName}</Typography>
                                )}
                                {org.accountVerified && (
                                    <Box
                                        component="span"
                                        sx={{
                                            fontSize: '0.62rem',
                                            fontWeight: 700,
                                            color: 'var(--crm-emerald-600)',
                                            backgroundColor: 'var(--mui-palette-success-soft)',
                                            px: 0.6,
                                            py: 0.1,
                                            borderRadius: '4px',
                                            border: '1px solid var(--mui-palette-success-softBorder)',
                                        }}
                                    >
                                        Verified
                                    </Box>
                                )}
                            </Box>
                        </Box>
                    </Box>
                ),
            },
            {
                id: 'natureOfBusiness',
                label: 'NATURE OF BUSINESS',
                sortable: true,
                minWidth: 160,
                render: (org) => {
                    const badge = getNatureBadgeStyle(org.natureOfBusiness);
                    return (
                        <Box
                            component="span"
                            sx={{
                                display: 'inline-block',
                                px: 1,
                                py: 0.3,
                                borderRadius: '6px',
                                fontSize: '0.72rem',
                                fontWeight: 600,
                                ...badge,
                            }}
                        >
                            {formatNatureLabel(org.natureOfBusiness)}
                        </Box>
                    );
                },
            },
            {
                id: 'customerType',
                label: 'CUSTOMER TYPE',
                sortable: true,
                minWidth: 130,
                render: (org) => (
                    <Box
                        component="span"
                        sx={{
                            display: 'inline-block',
                            px: 1,
                            py: 0.25,
                            borderRadius: '6px',
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            backgroundColor: 'var(--mui-palette-background-hover)',
                            color: 'var(--crm-slate-700)',
                            border: '1px solid var(--mui-palette-border-main)',
                        }}
                    >
                        {org.customerType}
                    </Box>
                ),
            },
            {
                id: 'accountStatus',
                label: 'STATUS',
                sortable: true,
                minWidth: 110,
                render: (org) => {
                    const isActive = org.accountStatus === 'Active';
                    return (
                        <Box
                            component="span"
                            sx={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 0.6,
                                px: 0.9,
                                py: 0.25,
                                borderRadius: '12px',
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                backgroundColor: isActive ? 'var(--mui-palette-success-soft)' : 'var(--crm-amber-100)',
                                color: isActive ? 'var(--crm-emerald-600)' : 'var(--mui-palette-warning-main)',
                                border: isActive ? '1px solid var(--mui-palette-success-softBorder)' : '1px solid var(--mui-palette-warning-softBorder)',
                            }}
                        >
                            <Box
                                component="span"
                                sx={{
                                    width: 6,
                                    height: 6,
                                    borderRadius: '50%',
                                    backgroundColor: isActive ? '#10b981' : '#f59e0b',
                                }}
                            />
                            {org.accountStatus}
                        </Box>
                    );
                },
            },
            {
                id: 'billingAddress',
                label: 'BILLING STREET',
                sortable: true,
                minWidth: 160,
                render: (org) => (
                    <Typography sx={{ fontSize: '0.78rem', color: 'var(--crm-slate-600)' }}>
                        {org.billingStreet || org.billingAddress || '-'}
                    </Typography>
                ),
            },
            {
                id: 'billingCity',
                label: 'BILLING CITY',
                sortable: true,
                minWidth: 120,
                render: (org) => (
                    <Typography sx={{ fontSize: '0.78rem', color: 'var(--crm-slate-600)' }}>
                        {org.billingCity || '-'}
                    </Typography>
                ),
            },
            {
                id: 'billingState',
                label: 'BILLING STATE',
                sortable: true,
                minWidth: 120,
                render: (org) => (
                    <Typography sx={{ fontSize: '0.78rem', color: 'var(--crm-slate-600)' }}>
                        {org.billingState || '-'}
                    </Typography>
                ),
            },
            {
                id: 'gstNumber',
                label: 'GST NUMBER',
                sortable: true,
                minWidth: 150,
                render: (org) => (
                    <Typography sx={{ fontSize: '0.78rem', color: 'var(--crm-slate-700)', fontFamily: 'monospace' }}>
                        {org.gstNumber || org.gstNumber || '-'}
                    </Typography>
                ),
            },
            {
                id: 'numberOfEmployees',
                label: 'NO. OF EMPLOYEES',
                sortable: true,
                minWidth: 130,
                render: (org) => <Typography sx={plainCellSx}>{org.numberOfEmployees || '-'}</Typography>,
            },
            {
                id: 'annualTurnover',
                label: 'TURNOVER',
                sortable: true,
                minWidth: 130,
                render: (org) => (
                    <Typography sx={{ fontSize: '0.78rem', color: 'var(--crm-slate-700)' }}>
                        {org.annualTurnover || '-'}
                    </Typography>
                ),
            },
            {
                id: 'assignedTo',
                label: 'USER',
                sortable: true,
                minWidth: 130,
                render: (org) => <Typography sx={plainCellSx}>{org.assignedTo || '-'}</Typography>,
            },
            {
                id: 'createdAt',
                label: 'DATE CREATED',
                sortable: true,
                minWidth: 170,
                render: (org) => <Typography sx={plainCellSx}>{formatDateTime(org.createdAt) || '-'}</Typography>,
            },
        ],
        [showNumber, openRecord]
    );
}
