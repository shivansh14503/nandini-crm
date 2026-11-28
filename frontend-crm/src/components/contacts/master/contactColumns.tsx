'use client';

import React, { useMemo } from 'react';
import { Box, Chip, Typography } from '@mui/material';
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import ApartmentIcon from '@mui/icons-material/Apartment';
import { RecordLink } from '../../common/RecordLink';
import { documentNumberColumn, type DataTableColumn } from '../../common/DataTable';
import { ROUTES } from '@/config/constants';
import { useOrganizations } from '@/hooks/queries';
import { useShowRecordNumber } from '@/hooks/queries/useDocumentSeries';
import { wasModified } from '../../common/Drawer/RecordAuditFooter';
import { formatDateTime } from '@/utils/date';
import { formatPhoneDisplay } from '@/utils/phone';
import type { ExtendedOrganization } from '@/types/organization.types';
import type { Contact } from '@/types/contact.types';

const NO_ORGANIZATIONS: ExtendedOrganization[] = [];
const plainCellSx = { fontSize: '0.78rem', color: 'var(--crm-slate-700)' } as const;
/**
 * The Location column's text for a contact: its organization's billing "City, State" (matched by id, else by name),
 * '' when unknown. Shared by the table column and the list's CSV export so both read the same.
 */
export function useContactLocation({ enabled = true }: { enabled?: boolean } = {}): (contact: Contact) => string {
    const { data: organizations = NO_ORGANIZATIONS } = useOrganizations(undefined, { enabled });
    return useMemo(() => {
        const byId = new Map(organizations.map((o) => [o.id, o]));
        const byName = new Map(organizations.map((o) => [o.organizationName.trim().toLowerCase(), o]));
        return (c: Contact) => {
            const org = (c.organizationId && byId.get(c.organizationId)) || byName.get((c.organizationName || '').trim().toLowerCase());
            return org ? [org.billingCity, org.billingState].filter(Boolean).join(', ') : '';
        };
    }, [organizations]);
}

/** A phone number as the table shows it (formatted, else as stored); '' when empty. */
export function contactPhoneText(value: string | null | undefined): string {
    return value ? formatPhoneDisplay(value) || value : '';
}

/** The email the table's Email column shows: the primary address, else the first one; '' when none. */
export function contactPrimaryEmail(c: Contact): string {
    return (c.emailAddress?.find((e) => e.isPrimary) ?? c.emailAddress?.[0])?.email ?? '';
}

/**
 * The Contact table's columns (built-in ones; form-field columns are added by the table). Shared by the
 * module's list page and the related-records table in other records' drawers, so both offer the same columns.
 * `openRecord` runs on a plain click of the record link.
 */
export function useContactColumns(openRecord: (record: Contact) => void, { enabled = true }: { enabled?: boolean } = {}): DataTableColumn<Contact>[] {
    const showNumber = useShowRecordNumber();
    // Location column: the contact's organization's billing city and state.
    const locationOf = useContactLocation({ enabled });

    return useMemo(
        () => [
            ...(showNumber('contact')
                ? [
                      {
                          // Not one of the basic columns; switch it on from Modify Columns.
                          ...documentNumberColumn<Contact>({
                              id: 'contactCode',
                              label: 'CONTACT NO.',
                              getNumber: (c) => c.contactCode,
                              getHref: (c) => ROUTES.CONTACT_DETAIL(c.id),
                              onOpen: (c) => openRecord(c),
                          }),
                          defaultHidden: true,
                      },
                  ]
                : []),
            {
                id: 'name',
                locked: true,
                label: 'NAME',
                sortable: true,
                minWidth: 200,
                render: (c) => (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <PersonOutlinedIcon sx={{ fontSize: 16, color: 'var(--crm-text-blue-600)' }} />
                        <RecordLink
                            href={ROUTES.CONTACT_DETAIL(c.id)}
                            onOpen={() => openRecord(c)}
                            sx={{
                                fontWeight: 700,
                                color: 'var(--crm-text-blue-700)',
                                fontSize: '0.82rem',
                                cursor: 'pointer',
                                '&:hover': { textDecoration: 'underline' },
                            }}
                        >
                            {c.name}
                        </RecordLink>
                        {c.isPrimaryContact && (
                            <Chip
                                label="Primary"
                                size="small"
                                sx={{
                                    height: 18,
                                    fontSize: '0.64rem',
                                    fontWeight: 700,
                                    backgroundColor: 'var(--mui-palette-primary-soft)',
                                    color: 'var(--crm-text-blue-700)',
                                    border: '1px solid var(--mui-palette-primary-softBorder)',
                                }}
                            />
                        )}
                    </Box>
                ),
            },
            {
                id: 'designation',
                label: 'JOB TITLE',
                sortable: true,
                minWidth: 150,
                render: (c) => <Typography sx={plainCellSx}>{c.designation || '-'}</Typography>,
            },
            {
                id: 'organizationName',
                label: 'ORGANIZATION NAME',
                sortable: true,
                minWidth: 180,
                render: (c) => (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                        <ApartmentIcon sx={{ fontSize: 14, color: 'var(--mui-palette-text-secondary)' }} />
                        {c.organizationId && c.organizationName ? (
                            <RecordLink href={ROUTES.ORGANIZATION_DETAIL(c.organizationId)} sx={{ fontSize: '0.8rem', fontWeight: 500 }}>
                                {c.organizationName}
                            </RecordLink>
                        ) : (
                            <Typography sx={{ fontSize: '0.8rem', color: 'var(--crm-slate-700)', fontWeight: 500 }}>
                                {c.organizationName || '-'}
                            </Typography>
                        )}
                    </Box>
                ),
            },
            {
                id: 'mobile',
                label: 'MOBILE',
                sortable: true,
                minWidth: 140,
                render: (c) => (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>
                        <PhoneOutlinedIcon sx={{ fontSize: 14, color: 'var(--mui-palette-text-muted)' }} />
                        <Typography sx={plainCellSx}>{contactPhoneText(c.mobile) || '-'}</Typography>
                    </Box>
                ),
            },
            {
                id: 'officePhone',
                label: 'OFFICE PHONE',
                sortable: true,
                minWidth: 140,
                render: (c) => (
                    <Typography sx={plainCellSx}>{contactPhoneText(c.officePhone) || '-'}</Typography>
                ),
            },
            {
                id: 'email',
                fieldKey: 'emailAddress',
                label: 'EMAIL',
                sortable: false,
                minWidth: 180,
                render: (c) => {
                    const email = contactPrimaryEmail(c);
                    return (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>
                            <EmailOutlinedIcon sx={{ fontSize: 14, color: 'var(--mui-palette-text-muted)' }} />
                            <Typography sx={plainCellSx}>{email || '-'}</Typography>
                        </Box>
                    );
                },
            },
            {
                // Derived: the linked organization's billing city and state (contacts have no address of their own).
                id: 'location',
                label: 'LOCATION',
                sortable: false,
                // The organization's billing City, State.
                filter: { kind: 'text', getValue: locationOf },
                minWidth: 150,
                render: (c) => <Typography sx={plainCellSx}>{locationOf(c) || '-'}</Typography>,
            },
            {
                id: 'updatedAt',
                label: 'DATE MODIFIED',
                sortable: true,
                minWidth: 170,
                render: (c) =>
                    wasModified(c) ? (
                        <Typography sx={plainCellSx}>{formatDateTime(c.updatedAt) || '-'}</Typography>
                    ) : (
                        <Typography sx={{ ...plainCellSx, color: 'var(--mui-palette-text-muted)' }}>- - -</Typography>
                    ),
            },
            {
                id: 'createdAt',
                label: 'DATE CREATED',
                sortable: true,
                minWidth: 170,
                render: (c) => <Typography sx={plainCellSx}>{formatDateTime(c.createdAt) || '-'}</Typography>,
            },
        ],
        [locationOf, showNumber, openRecord]
    );
}
