'use client';

import React, { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import ConfirmationNumberOutlinedIcon from '@mui/icons-material/ConfirmationNumberOutlined';
import { RecordLink } from '../../common/RecordLink';
import { documentNumberColumn, type DataTableColumn } from '../../common/DataTable';
import { ROUTES } from '@/config/constants';
import { findCrmUser } from '@/services/masterData.store';
import { isTicketOverdue, type Ticket } from '@/types/ticket.types';
import { useShowRecordNumber } from '@/hooks/queries/useDocumentSeries';
import { TicketPriorityPill, TicketStatusPill, formatTicketDue } from '../TicketBadges';

const assigneeName = (username: string) => findCrmUser(username)?.name || username;

/**
 * The Ticket table's columns (built-in ones; form-field columns are added by the table). Shared by the
 * module's list page and the related-records table in other records' drawers, so both offer the same columns.
 * `openRecord` runs on a plain click of the record link.
 */
export function useTicketColumns(openRecord: (record: Ticket) => void, now: number): DataTableColumn<Ticket>[] {
    const showNumber = useShowRecordNumber();

    return useMemo(
        () => [
            ...(showNumber('ticket')
                ? [
                      documentNumberColumn<Ticket>({
                          id: 'ticketNumber',
                          label: 'TICKET NO.',
                          locked: true,
                          getNumber: (t) => t.ticketNumber,
                          getHref: (t) => ROUTES.TICKET_DETAIL(t.id),
                          onOpen: (t) => openRecord(t),
                      }),
                  ]
                : []),
            {
                id: 'ticketSubject',
                locked: true,
                label: 'SUBJECT',
                sortable: true,
                minWidth: 220,
                render: (t) => (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                        <ConfirmationNumberOutlinedIcon sx={{ fontSize: 16, color: 'var(--crm-text-blue-600)', flexShrink: 0 }} />
                        <RecordLink
                            href={ROUTES.TICKET_DETAIL(t.id)}
                            onOpen={() => openRecord(t)}
                            sx={{ fontSize: '0.8rem', fontWeight: 700, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        >
                            {t.ticketSubject || t.problemReported || '-'}
                        </RecordLink>
                    </Box>
                ),
            },
            {
                id: 'organizationName',
                label: 'ORGANIZATION',
                sortable: true,
                minWidth: 200,
                render: (t) =>
                    t.organizationId && t.organizationName ? (
                        <RecordLink
                            href={ROUTES.ORGANIZATION_DETAIL(t.organizationId)}
                            sx={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        >
                            {t.organizationName}
                        </RecordLink>
                    ) : (
                        <Typography noWrap sx={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--crm-slate-700)', maxWidth: 240 }}>
                            {t.organizationName || '-'}
                        </Typography>
                    ),
            },
            {
                id: 'contact',
                label: 'CONTACT',
                sortable: true,
                minWidth: 150,
                render: (t) => (
                    <Box>
                        {t.contactId && t.contact ? (
                            <RecordLink href={ROUTES.CONTACT_DETAIL(t.contactId)} sx={{ display: 'block', fontSize: '0.8rem', lineHeight: 1.3 }}>
                                {t.contact}
                            </RecordLink>
                        ) : (
                            <Typography sx={{ fontSize: '0.8rem', color: 'var(--crm-slate-700)', lineHeight: 1.3 }}>{t.contact || '-'}</Typography>
                        )}
                        {t.contactNumber && <Typography sx={{ fontSize: '0.72rem', color: 'var(--mui-palette-text-muted)' }}>{t.contactNumber}</Typography>}
                    </Box>
                ),
            },
            {
                id: 'ticketPriority',
                label: 'PRIORITY',
                sortable: true,
                minWidth: 100,
                render: (t) => <TicketPriorityPill priority={t.ticketPriority} />,
            },
            {
                id: 'ticketStatus',
                label: 'STATUS',
                sortable: true,
                minWidth: 140,
                render: (t) => <TicketStatusPill status={t.ticketStatus} />,
            },
            {
                id: 'natureOfCall',
                label: 'NATURE OF CALL',
                sortable: true,
                minWidth: 150,
                render: (t) => <Typography sx={{ fontSize: '0.78rem', color: 'var(--crm-slate-600)' }}>{t.natureOfCall || '-'}</Typography>,
            },
            {
                id: 'dueDate',
                label: 'DUE DATE',
                sortable: true,
                minWidth: 170,
                render: (t) => {
                    const overdue = isTicketOverdue(t, now);
                    return (
                        <Box>
                            <Typography sx={{ fontSize: '0.78rem', fontWeight: overdue ? 700 : 500, color: overdue ? 'var(--mui-palette-error-main)' : 'var(--crm-slate-600)' }}>
                                {formatTicketDue(t.dueDate)}
                            </Typography>
                            {overdue && <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--mui-palette-error-main)' }}>Overdue</Typography>}
                        </Box>
                    );
                },
            },
            {
                id: 'assignedTo',
                label: 'ASSIGNED TO',
                sortable: true,
                minWidth: 140,
                render: (t) => <Typography sx={{ fontSize: '0.78rem', color: 'var(--crm-slate-600)' }}>{assigneeName(t.assignedTo) || '-'}</Typography>,
            },
        ],
        [now, showNumber, openRecord]
    );
}
