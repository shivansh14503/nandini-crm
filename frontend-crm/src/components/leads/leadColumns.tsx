'use client';

import React, { useMemo, useCallback } from 'react';
import { Box, Chip, Typography } from '@mui/material';
import { localToday } from '@/utils/pastDates';
import { isFollowUpExpired } from '../forms/FollowUpDecision';
import { useLeadRatingConfig } from '@/utils/leadRating';
import { RatingBadge } from '@/components/common/RatingBadge';
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import ApartmentIcon from '@mui/icons-material/Apartment';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import { RecordLink } from '../common/RecordLink';
import { documentNumberColumn, type DataTableColumn } from '../common/DataTable';
import { ROUTES } from '@/config/constants';
import { LEAD_RATINGS, type Lead } from '@/types/lead.types';
import { useDropdownOptionLabel } from '@/hooks/queries';
import { useShowRecordNumber } from '@/hooks/queries/useDocumentSeries';
import { formatDateTime } from '@/utils/date';
import { fmtDayOrRaw, fmtTimeOrRaw } from '@/utils/formats';
import { formatPhoneDisplay } from '@/utils/phone';

const plainCellSx = { fontSize: '0.78rem', color: 'var(--crm-slate-700)' } as const;

/**
 * The Lead table's columns (built-in ones; form-field columns are added by the table). Shared by the
 * module's list page and the related-records table in other records' drawers, so both offer the same columns.
 * `openRecord` runs on a plain click of the record link.
 */
export function useLeadColumns(openRecord: (record: Lead) => void): DataTableColumn<Lead>[] {
    const showNumber = useShowRecordNumber();
    const leadSourceLabel = useDropdownOptionLabel('shared_lead_source');
    // Today on this device's clock (IST for the team), not UTC: UTC's date lags until 05:30 IST.
    const todayStr = useMemo(() => localToday(), []);
    // Overdue: an open lead whose next follow-up has passed (closed leads have none to miss).
    const { closingStatuses } = useLeadRatingConfig();
    const isOverdue = useCallback(
        (l: Lead) => !closingStatuses.has(l.status) && Boolean(l.nextFollowupDate) && isFollowUpExpired({ date: l.nextFollowupDate, time: l.nextFollowupTime ?? '' }),
        [closingStatuses],
    );

    return useMemo(
        () => [
            ...(showNumber('lead')
                ? [
                      documentNumberColumn<Lead>({
                          id: 'leadCode',
                          label: 'LEAD NUMBER',
                          getNumber: (l) => l.leadCode,
                          getHref: (l) => ROUTES.LEAD_DETAIL(l.id),
                          onOpen: (l) => openRecord(l),
                      }),
                  ]
                : []),
            {
                id: 'name',
                locked: true,
                label: 'NAME',
                sortable: true,
                minWidth: 200,
                render: (l) => (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.3 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <PersonOutlinedIcon sx={{ fontSize: 16, color: 'var(--crm-text-blue-600)', flexShrink: 0 }} />
                            <RecordLink
                                href={ROUTES.LEAD_DETAIL(l.id)}
                                onOpen={() => openRecord(l)}
                                sx={{
                                    fontWeight: 700,
                                    color: 'var(--crm-text-blue-700)',
                                    fontSize: '0.82rem',
                                    cursor: 'pointer',
                                    '&:hover': { textDecoration: 'underline' },
                                }}
                            >
                                {l.name}
                            </RecordLink>
                        </Box>
                        {l.designation && (
                            <Typography sx={{ fontSize: '0.7rem', color: 'var(--mui-palette-text-secondary)', pl: 3 }} noWrap>
                                {l.designation}
                            </Typography>
                        )}
                    </Box>
                ),
            },
            {
                // Hot / Warm / Cold, set by the system from each follow-up; the tooltip says why.
                id: 'rating',
                label: 'RATING',
                sortable: true,
                filter: { kind: 'options', options: LEAD_RATINGS.map((r) => ({ value: r, label: r })) },
                minWidth: 100,
                render: (l) =>
                    l.rating ? (
                        <RatingBadge rating={l.rating} reason={l.ratingReason || undefined} />
                    ) : (
                        <Typography sx={{ fontSize: '0.78rem', color: 'var(--mui-palette-text-muted)' }}>-</Typography>
                    ),
            },
            {
                id: 'leadSource',
                label: 'LEAD SOURCE',
                sortable: true,
                minWidth: 140,
                render: (l) => <Typography sx={plainCellSx}>{leadSourceLabel(l.leadSource) || '-'}</Typography>,
            },
            {
                id: 'productCategory',
                label: 'PRODUCT CATEGORY',
                sortable: false,
                minWidth: 170,
                render: (l) => (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {l.productCategory && l.productCategory.length > 0 ? (
                            l.productCategory.map((prod, idx) => (
                                <Chip
                                    key={idx}
                                    label={prod}
                                    size="small"
                                    sx={{
                                        height: 20,
                                        fontSize: '0.68rem',
                                        fontWeight: 600,
                                        backgroundColor: 'var(--crm-green-50)',
                                        color: 'var(--crm-green-800)',
                                        border: '1px solid var(--crm-green-200)',
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
                id: 'organizationName',
                label: 'ORGANIZATION NAME',
                sortable: true,
                minWidth: 180,
                render: (l) => (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                        <ApartmentIcon sx={{ fontSize: 15, color: 'var(--mui-palette-text-secondary)', flexShrink: 0 }} />
                        <Box>
                            <Typography sx={{ fontSize: '0.8rem', color: 'var(--mui-palette-text-primary)', fontWeight: 600 }}>
                                {l.organizationName || 'Individual Prospect'}
                            </Typography>
                            {l.primaryCity && (
                                <Typography sx={{ fontSize: '0.7rem', color: 'var(--mui-palette-text-secondary)' }}>
                                    {l.primaryCity}{l.primaryState ? `, ${l.primaryState}` : ''}
                                </Typography>
                            )}
                        </Box>
                    </Box>
                ),
            },
            {
                id: 'status',
                label: 'STATUS',
                sortable: true,
                minWidth: 120,
                render: (l) => {
                    let bg = 'var(--mui-palette-primary-soft)';
                    let color = 'var(--crm-text-blue-700)';
                    let border = 'var(--mui-palette-primary-softBorder)';

                    if (l.status === 'New') {
                        bg = 'var(--mui-palette-primary-soft)';
                        color = 'var(--crm-text-blue-800)';
                        border = 'var(--mui-palette-primary-softBorder)';
                    } else if (l.status === 'Contacted' || l.status === 'In Discussion') {
                        bg = 'var(--crm-violet-50)';
                        color = 'var(--crm-violet-700)';
                        border = 'var(--crm-violet-200)';
                    } else if (l.status === 'Demo Scheduled') {
                        bg = 'var(--crm-fuchsia-50)';
                        color = 'var(--crm-fuchsia-700)';
                        border = 'var(--crm-fuchsia-200)';
                    } else if (l.status === 'Proposal Sent' || l.status === 'Negotiation') {
                        bg = 'var(--mui-palette-warning-soft)';
                        color = 'var(--crm-amber-700)';
                        border = 'var(--mui-palette-warning-softBorder)';
                    } else if (l.status === 'Converted') {
                        bg = 'var(--mui-palette-success-soft)';
                        color = 'var(--crm-emerald-700)';
                        border = 'var(--mui-palette-success-softBorder)';
                    } else if (l.status.includes('Lost') || l.status.includes('Unqualified')) {
                        bg = 'var(--mui-palette-error-soft)';
                        color = 'var(--crm-red-700)';
                        border = 'var(--mui-palette-error-softBorder)';
                    }

                    return (
                        <Chip
                            label={l.status || 'New'}
                            size="small"
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
                // The lead's email list; the primary address (else the first) is shown.
                id: 'emailAddress',
                label: 'EMAIL',
                sortable: false,
                minWidth: 190,
                render: (l) => {
                    const email = (l.emailAddress?.find((e) => e.isPrimary) ?? l.emailAddress?.[0])?.email;
                    return (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>
                            {email && <EmailOutlinedIcon sx={{ fontSize: 14, color: 'var(--mui-palette-text-muted)' }} />}
                            <Typography sx={plainCellSx}>{email || '-'}</Typography>
                        </Box>
                    );
                },
            },
            {
                id: 'mobile',
                label: 'MOBILE',
                sortable: true,
                minWidth: 140,
                render: (l) => {
                    const phone = l.mobile || l.otherPhone;
                    return (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>
                            {phone && <PhoneOutlinedIcon sx={{ fontSize: 14, color: 'var(--mui-palette-text-secondary)' }} />}
                            <Typography sx={{ ...plainCellSx, fontWeight: 600 }}>
                                {phone ? formatPhoneDisplay(phone) || phone : '-'}
                            </Typography>
                        </Box>
                    );
                },
            },
            {
                // Leads keep no remarks log: "Add Description" is the action-items note updated on each follow-up.
                id: 'remarks',
                label: 'LATEST REMARKS',
                sortable: true,
                minWidth: 220,
                width: 280,
                render: (l) => <Typography sx={plainCellSx}>{l.remarks || '-'}</Typography>,
            },
            {
                id: 'nextFollowupDate',
                label: 'NEXT FOLLOWUP DATE',
                sortable: true,
                minWidth: 150,
                render: (l) => {
                    const isToday = l.nextFollowupDate === todayStr;
                    const overdue = isOverdue(l);

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
                                    {fmtDayOrRaw(l.nextFollowupDate) || '-'}
                                    {overdue ? (
                                        <Box
                                            component="span"
                                            sx={{
                                                ml: 0.6,
                                                px: 0.6,
                                                py: 0.1,
                                                borderRadius: '4px',
                                                fontSize: '0.62rem',
                                                fontWeight: 800,
                                                backgroundColor: 'var(--mui-palette-error-soft)',
                                                color: 'var(--crm-red-700)',
                                                border: '1px solid var(--mui-palette-error-softBorder)',
                                            }}
                                        >
                                            OVERDUE
                                        </Box>
                                    ) : isToday && (
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
                                {(l.nextFollowupTime || l.followupType) && (
                                    <Typography sx={{ fontSize: '0.7rem', color: 'var(--mui-palette-text-secondary)' }}>
                                        {l.followupType ? `${l.followupType} • ` : ''}
                                        {fmtTimeOrRaw(l.nextFollowupTime) || ''}
                                    </Typography>
                                )}
                            </Box>
                        </Box>
                    );
                },
            },
            {
                id: 'assignedTo',
                label: 'USER',
                sortable: true,
                minWidth: 130,
                render: (l) => (
                    <Typography sx={{ fontSize: '0.78rem', color: 'var(--crm-slate-600)', fontWeight: 500 }}>
                        {l.assignedTo || '-'}
                    </Typography>
                ),
            },
            {
                id: 'createdAt',
                label: 'DATE CREATED',
                sortable: true,
                minWidth: 170,
                render: (l) => <Typography sx={plainCellSx}>{formatDateTime(l.createdAt) || '-'}</Typography>,
            },
        ],
        [todayStr, leadSourceLabel, showNumber, isOverdue, openRecord]
    );
}
