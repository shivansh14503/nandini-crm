'use client';

import React, { useMemo } from 'react';
import { Box, Chip, Typography } from '@mui/material';
import ConnectWithoutContactOutlinedIcon from '@mui/icons-material/ConnectWithoutContactOutlined';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import ApartmentIcon from '@mui/icons-material/Apartment';
import { RecordLink } from '../../common/RecordLink';
import { type DataTableColumn } from '../../common/DataTable';
import { ROUTES } from '@/config/constants';
import { wasModified } from '../../common/Drawer/RecordAuditFooter';
import { formatDateTime } from '@/utils/date';
import { formatPhoneDisplay } from '@/utils/phone';
import { findCrmUser } from '@/services/masterData.store';
import { ACTIVE_REFERRAL_STATUS, type Referral } from '@/types/referral.types';

const assigneeName = (username: string) => findCrmUser(username)?.name || username;
const plainCellSx = { fontSize: '0.78rem', color: 'var(--crm-slate-700)' } as const;

/** Active / Inactive pill: success tint for Active, warning tint for Inactive. */
export function ReferralStatusChip({ status }: { status?: string }) {
    if (!status) return <Typography sx={plainCellSx}>-</Typography>;
    const tone = status === ACTIVE_REFERRAL_STATUS ? 'success' : 'warning';
    return (
        <Chip
            label={status}
            size="small"
            sx={{
                height: 20,
                fontSize: '0.68rem',
                fontWeight: 700,
                backgroundColor: `var(--mui-palette-${tone}-soft)`,
                color: tone === 'success' ? 'var(--mui-palette-success-main)' : 'var(--crm-amber-700)',
                border: `1px solid var(--mui-palette-${tone}-softBorder)`,
            }}
        />
    );
}

/**
 * The Referral table's columns (built-in ones; form-field columns are added by the table).
 * `openRecord` runs on a plain click of the record link.
 */
export function useReferralColumns(openRecord: (record: Referral) => void): DataTableColumn<Referral>[] {
    return useMemo(
        () => [
            {
                id: 'name',
                locked: true,
                label: 'NAME',
                sortable: true,
                minWidth: 200,
                render: (r) => (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <ConnectWithoutContactOutlinedIcon sx={{ fontSize: 16, color: 'var(--crm-text-blue-600)' }} />
                        <RecordLink
                            href={ROUTES.REFERRAL_DETAIL(r.id)}
                            onOpen={() => openRecord(r)}
                            sx={{ fontWeight: 700, color: 'var(--crm-text-blue-700)', fontSize: '0.82rem', cursor: 'pointer' }}
                        >
                            {r.name}
                        </RecordLink>
                    </Box>
                ),
            },
            {
                id: 'status',
                label: 'STATUS',
                sortable: true,
                minWidth: 110,
                render: (r) => <ReferralStatusChip status={r.status} />,
            },
            {
                id: 'companyName',
                label: 'COMPANY NAME',
                sortable: true,
                minWidth: 180,
                render: (r) => (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                        <ApartmentIcon sx={{ fontSize: 14, color: 'var(--mui-palette-text-secondary)' }} />
                        <Typography sx={{ ...plainCellSx, fontSize: '0.8rem', fontWeight: 500 }}>{r.companyName || '-'}</Typography>
                    </Box>
                ),
            },
            {
                id: 'mobile',
                label: 'MOBILE',
                sortable: true,
                minWidth: 140,
                render: (r) => (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>
                        <PhoneOutlinedIcon sx={{ fontSize: 14, color: 'var(--mui-palette-text-muted)' }} />
                        <Typography sx={plainCellSx}>{r.mobile ? formatPhoneDisplay(r.mobile) || r.mobile : '-'}</Typography>
                    </Box>
                ),
            },
            {
                id: 'officePhone',
                label: 'OFFICE PHONE',
                sortable: true,
                minWidth: 140,
                defaultHidden: true,
                render: (r) => <Typography sx={plainCellSx}>{r.officePhone ? formatPhoneDisplay(r.officePhone) || r.officePhone : '-'}</Typography>,
            },
            {
                id: 'email',
                fieldKey: 'emailAddress',
                label: 'EMAIL',
                sortable: false,
                minWidth: 180,
                render: (r) => {
                    const email = (r.emailAddress?.find((e) => e.isPrimary) ?? r.emailAddress?.[0])?.email;
                    return (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>
                            <EmailOutlinedIcon sx={{ fontSize: 14, color: 'var(--mui-palette-text-muted)' }} />
                            <Typography sx={plainCellSx}>{email || '-'}</Typography>
                        </Box>
                    );
                },
            },
            {
                id: 'designation',
                label: 'DESIGNATION',
                sortable: true,
                minWidth: 150,
                render: (r) => <Typography sx={plainCellSx}>{r.designation || '-'}</Typography>,
            },
            {
                id: 'assignedTo',
                label: 'ASSIGNED TO',
                sortable: true,
                minWidth: 150,
                render: (r) => <Typography sx={plainCellSx}>{assigneeName(r.assignedTo) || '-'}</Typography>,
            },
            {
                id: 'updatedAt',
                label: 'DATE MODIFIED',
                sortable: true,
                minWidth: 170,
                render: (r) =>
                    wasModified(r) ? (
                        <Typography sx={plainCellSx}>{formatDateTime(r.updatedAt) || '-'}</Typography>
                    ) : (
                        <Typography sx={{ ...plainCellSx, color: 'var(--mui-palette-text-muted)' }}>- - -</Typography>
                    ),
            },
            {
                id: 'createdAt',
                label: 'DATE CREATED',
                sortable: true,
                minWidth: 170,
                render: (r) => <Typography sx={plainCellSx}>{formatDateTime(r.createdAt) || '-'}</Typography>,
            },
        ],
        [openRecord]
    );
}
