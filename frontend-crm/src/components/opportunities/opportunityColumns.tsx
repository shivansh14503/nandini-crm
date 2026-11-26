'use client';

import React, { useMemo } from 'react';
import { Box, Chip, Typography } from '@mui/material';
import TrendingUpOutlinedIcon from '@mui/icons-material/TrendingUpOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import ApartmentIcon from '@mui/icons-material/Apartment';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import { RecordLink } from '../common/RecordLink';
import { documentNumberColumn, type DataTableColumn } from '../common/DataTable';
import { ROUTES } from '@/config/constants';
import type { Opportunity } from '@/types/opportunity.types';
import { useQuotations } from '@/hooks/queries';
import { useShowRecordNumber } from '@/hooks/queries/useDocumentSeries';
import type { Quotation } from '@/types/quotation.types';
import { formatDateTime } from '@/utils/date';
import { fmtDayOrRaw, fmtMoney, fmtTimeOrRaw } from '@/utils/formats';

/** ₹ without decimals, in the company number grouping. */
const formatCurrency = (val: number) => fmtMoney(val, { maxDecimals: 0 });

const plainCellSx = { fontSize: '0.78rem', color: 'var(--crm-slate-700)' } as const;

/** Yes / No cell for derived flags (Quote Created, Quote Sent). */
function YesNo({ value }: { value: boolean }) {
    return (
        <Typography sx={{ fontSize: '0.76rem', fontWeight: 600, color: value ? 'var(--crm-emerald-700)' : 'var(--mui-palette-text-muted)' }}>
            {value ? 'Yes' : 'No'}
        </Typography>
    );
}

const NO_QUOTES: Quotation[] = [];

/**
 * The Opportunity table's columns (built-in ones; form-field columns are added by the table). Shared by the
 * module's list page and the related-records table in other records' drawers, so both offer the same columns.
 * `openRecord` runs on a plain click of the record link.
 */
export function useOpportunityColumns(openRecord: (record: Opportunity) => void, { enabled = true }: { enabled?: boolean } = {}): DataTableColumn<Opportunity>[] {
    const showNumber = useShowRecordNumber();
    // Quotations per deal, for the Quote Created / Quote Sent columns.
    const { data: quotations = NO_QUOTES } = useQuotations(undefined, { enabled });
    const quotesByOpp = useMemo(() => {
        const map = new Map<string, Quotation[]>();
        for (const q of quotations) {
            if (!q.opportunityId) continue;
            map.set(q.opportunityId, [...(map.get(q.opportunityId) ?? []), q]);
        }
        return map;
    }, [quotations]);
    const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

    return useMemo(
        () => [
            {
                id: 'assignedTo',
                label: 'USER',
                sortable: true,
                minWidth: 120,
                render: (o) => <Typography sx={plainCellSx}>{o.assignedTo || '-'}</Typography>,
            },
            {
                // Derived: the deal has at least one quotation linked to it.
                id: 'quoteCreated',
                label: 'QUOTE CREATED',
                sortable: false,
                minWidth: 120,
                render: (o) => <YesNo value={(quotesByOpp.get(o.id)?.length ?? 0) > 0} />,
            },
            ...(showNumber('opportunity')
                ? [
                      documentNumberColumn<Opportunity>({
                          id: 'opportunityCode',
                          label: 'OPP NUMBER',
                          getNumber: (o) => o.opportunityCode,
                          getHref: (o) => ROUTES.OPPORTUNITY_DETAIL(o.id),
                          onOpen: (o) => openRecord(o),
                      }),
                  ]
                : []),
            {
                id: 'opportunityName',
                locked: true,
                label: 'NAME',
                sortable: true,
                minWidth: 180,
                render: (o) => (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <TrendingUpOutlinedIcon sx={{ fontSize: 16, color: 'var(--crm-text-blue-600)', flexShrink: 0 }} />
                        <RecordLink
                            href={ROUTES.OPPORTUNITY_DETAIL(o.id)}
                            onOpen={() => openRecord(o)}
                            sx={{
                                fontWeight: 700,
                                color: 'var(--crm-text-blue-700)',
                                fontSize: '0.82rem',
                                cursor: 'pointer',
                                '&:hover': { textDecoration: 'underline' },
                            }}
                        >
                            {o.opportunityName || o.organizationName || (showNumber('opportunity') ? o.opportunityCode : '')}
                        </RecordLink>
                    </Box>
                ),
            },
            {
                id: 'organizationName',
                label: 'ORGANIZATION NAME',
                sortable: true,
                minWidth: 180,
                render: (o) => (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                        <ApartmentIcon sx={{ fontSize: 15, color: 'var(--mui-palette-text-secondary)', flexShrink: 0 }} />
                        {o.organizationId && o.organizationName ? (
                            <RecordLink href={ROUTES.ORGANIZATION_DETAIL(o.organizationId)} sx={{ fontSize: '0.8rem', fontWeight: 600 }}>
                                {o.organizationName}
                            </RecordLink>
                        ) : (
                            <Typography sx={{ fontSize: '0.8rem', color: 'var(--mui-palette-text-primary)', fontWeight: 600 }}>
                                {o.organizationName || '-'}
                            </Typography>
                        )}
                    </Box>
                ),
            },
            {
                id: 'productCategory',
                label: 'PRODUCT CATEGORY',
                sortable: false,
                minWidth: 170,
                render: (o) => (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {o.productCategory && o.productCategory.length > 0 ? (
                            o.productCategory.map((cat, idx) => (
                                <Chip
                                    key={idx}
                                    label={cat}
                                    size="small"
                                    sx={{
                                        height: 20,
                                        fontSize: '0.66rem',
                                        fontWeight: 600,
                                        backgroundColor: 'var(--mui-palette-primary-soft)',
                                        color: 'var(--crm-text-blue-700)',
                                        border: '1px solid var(--mui-palette-primary-softBorder)',
                                    }}
                                />
                            ))
                        ) : (
                            <Typography sx={{ fontSize: '0.78rem', color: 'var(--mui-palette-text-muted)' }}>-</Typography>
                        )}
                    </Box>
                ),
            },
            {
                id: 'type',
                label: 'TYPE',
                sortable: true,
                minWidth: 130,
                render: (o) => <Typography sx={plainCellSx}>{o.type || '-'}</Typography>,
            },
            {
                id: 'nextFollowupDate',
                label: 'NEXT FOLLOWUP DATE',
                sortable: true,
                minWidth: 140,
                render: (o) => {
                    const isToday = o.nextFollowupDate === todayStr;

                    return (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                            <CalendarMonthOutlinedIcon
                                sx={{
                                    fontSize: 16,
                                    color: isToday ? 'var(--mui-palette-warning-main)' : 'var(--mui-palette-text-secondary)',
                                }}
                            />
                            <Box>
                                <Typography
                                    sx={{
                                        fontSize: '0.78rem',
                                        fontWeight: isToday ? 700 : 500,
                                        color: isToday ? 'var(--crm-amber-700)' : 'var(--crm-slate-700)',
                                    }}
                                >
                                    {fmtDayOrRaw(o.nextFollowupDate) || '-'}
                                    {isToday && (
                                        <Box
                                            component="span"
                                            sx={{
                                                ml: 0.6,
                                                px: 0.6,
                                                py: 0.1,
                                                borderRadius: '4px',
                                                fontSize: '0.62rem',
                                                fontWeight: 800,
                                                backgroundColor: 'var(--crm-amber-100)',
                                                color: 'var(--crm-amber-700)',
                                                border: '1px solid var(--mui-palette-warning-softBorder)',
                                            }}
                                        >
                                            TODAY
                                        </Box>
                                    )}
                                </Typography>
                                {o.followupType && (
                                    <Typography sx={{ fontSize: '0.7rem', color: 'var(--mui-palette-text-secondary)' }}>
                                        {o.followupType} {o.nextFollowupTime ? `• ${fmtTimeOrRaw(o.nextFollowupTime)}` : ''}
                                    </Typography>
                                )}
                            </Box>
                        </Box>
                    );
                },
            },
            {
                id: 'salesStage',
                label: 'SALES STAGE',
                sortable: true,
                minWidth: 150,
                render: (o) => {
                    let bg = 'var(--mui-palette-primary-soft)';
                    let color = 'var(--crm-text-blue-700)';
                    let border = 'var(--mui-palette-primary-softBorder)';

                    if (o.salesStage === 'Closed Won') {
                        bg = 'var(--mui-palette-success-soft)';
                        color = 'var(--crm-emerald-700)';
                        border = 'var(--mui-palette-success-softBorder)';
                    } else if (o.salesStage === 'Closed Lost') {
                        bg = 'var(--mui-palette-error-soft)';
                        color = 'var(--crm-red-700)';
                        border = 'var(--mui-palette-error-softBorder)';
                    } else if (o.salesStage.includes('Proposal') || o.salesStage.includes('Negotiation')) {
                        bg = 'var(--mui-palette-warning-soft)';
                        color = 'var(--crm-amber-700)';
                        border = 'var(--mui-palette-warning-softBorder)';
                    } else if (o.salesStage.includes('Value') || o.salesStage.includes('Needs')) {
                        bg = 'var(--crm-violet-50)';
                        color = 'var(--crm-violet-700)';
                        border = 'var(--crm-violet-200)';
                    }

                    return (
                        <Chip
                            label={o.salesStage}
                            size="small"
                            icon={
                                o.salesStage === 'Closed Won' ? (
                                    <CheckCircleOutlinedIcon
                                        sx={{ fontSize: '13px !important', color: 'var(--crm-emerald-700) !important' }}
                                    />
                                ) : undefined
                            }
                            sx={{
                                height: 22,
                                fontSize: '0.72rem',
                                fontWeight: 600,
                                backgroundColor: bg,
                                color: color,
                                border: `1px solid ${border}`,
                            }}
                        />
                    );
                },
            },
            {
                // Line items after discount, before tax.
                id: 'subtotal',
                label: 'ACTUAL (BEFORE TAX)',
                sortable: true,
                minWidth: 150,
                render: (o) => (
                    <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--crm-slate-900)' }}>
                        {formatCurrency(o.subtotal ?? (o.grandTotal || 0) - (o.totalTax || 0))}
                    </Typography>
                ),
            },
            {
                // No remarks log on deals: "Add Description" is the note updated on each follow-up (as on leads).
                id: 'remarks',
                label: 'LATEST REMARKS',
                sortable: false,
                minWidth: 220,
                width: 280,
                render: (o) => <Typography sx={plainCellSx}>{o.remarks || '-'}</Typography>,
            },
            {
                // Derived: a linked quotation has moved past Draft.
                id: 'quoteSent',
                label: 'QUOTE SENT',
                sortable: false,
                minWidth: 110,
                render: (o) => <YesNo value={(quotesByOpp.get(o.id) ?? []).some((q) => q.quoteStage && q.quoteStage !== 'Draft')} />,
            },
            {
                id: 'createdAt',
                label: 'DATE CREATED',
                sortable: true,
                minWidth: 170,
                render: (o) => <Typography sx={plainCellSx}>{formatDateTime(o.createdAt) || '-'}</Typography>,
            },
        ],
        [todayStr, quotesByOpp, showNumber, openRecord]
    );
}
