'use client';

import React, { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import { RecordLink } from '../common/RecordLink';
import { type DataTableColumn } from '../common/DataTable';
import { ROUTES } from '@/config/constants';
import { findCrmUser } from '@/services/masterData.store';
import { useDropdownOptionLabel } from '@/hooks/queries/useFormConfigs';
import { CUSTOMER_RESPONSE_CATEGORY } from '@/components/forms/FollowUpDecision';
import type { Activity } from '@/types/activity.types';
import { isFollowUpActivity, NOTE_TYPE } from '@/types/activity.types';
import { ActivityStatusPill, ActivityTypeChip, ActivityTypeIcon, FollowUpChip } from './ActivityBadges';
import { attendeeLabel } from './RhfAttendeesField';
import { formatActivityWhen, formatBusinessInstant, formatDayLabel, isActivityOverdue, useBusinessClock } from './activityTime';
import { relatedModuleLabel, relatedRecordHref } from './activityLinks';

const userName = (username: string | undefined) => (username ? findCrmUser(username)?.name || username : '');

const plainCellSx = { fontSize: '0.78rem', color: 'var(--crm-slate-600)' } as const;
const linkCellSx = { display: 'block', fontSize: '0.8rem', fontWeight: 600, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as const;
const textCellSx = { fontSize: '0.8rem', fontWeight: 600, color: 'var(--crm-slate-700)', maxWidth: 240 } as const;

/**
 * The Activity table's columns (built-in ones; form-field columns are added by the table). Shared by the list page and
 * the related-records table in other records' drawers. Times show in the business timezone. End, All Day, Reminder,
 * Location and Attendees are hidden at first; they carry their `fieldKey` so the table doesn't add a raw copy of
 * them (an ISO `…Z` End) from the form fields.
 */
export function useActivityColumns(openRecord: (record: Activity) => void): DataTableColumn<Activity>[] {
    const clock = useBusinessClock();
    const responseLabel = useDropdownOptionLabel(CUSTOMER_RESPONSE_CATEGORY);
    const { timeZone } = clock;

    return useMemo(() => {
        const now = clock.now();
        const tzOf = (a: Activity) => a.timeZone || timeZone;
        return [
            {
                id: 'followupType',
                fieldKey: 'followupType',
                label: 'TYPE',
                sortable: true,
                minWidth: 130,
                render: (a) => <ActivityTypeChip type={a.followupType} />,
            },
            {
                id: 'subject',
                fieldKey: 'subject',
                locked: true,
                label: 'SUBJECT',
                sortable: true,
                minWidth: 220,
                render: (a) => (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                        <ActivityTypeIcon type={a.followupType} sx={{ flexShrink: 0 }} />
                        <RecordLink
                            href={ROUTES.ACTIVITY_DETAIL(a.id)}
                            onOpen={() => openRecord(a)}
                            sx={{
                                fontSize: '0.8rem',
                                fontWeight: 700,
                                maxWidth: 280,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                ...(a.status === 'Cancelled' && { textDecoration: 'line-through', color: 'var(--mui-palette-text-muted)' }),
                            }}
                        >
                            {a.subject || '-'}
                        </RecordLink>
                        {isFollowUpActivity(a) && <FollowUpChip relatedModule={a.relatedModule} relatedCode={a.relatedCode} compact />}
                    </Box>
                ),
            },
            {
                id: 'startAt',
                fieldKey: 'startAt',
                label: 'START',
                sortable: true,
                minWidth: 200,
                render: (a) =>
                    a.followupType === NOTE_TYPE ? (
                        <Typography sx={{ ...plainCellSx, color: 'var(--mui-palette-text-muted)' }}>-</Typography>
                    ) : (
                        <Typography
                            sx={{
                                ...plainCellSx,
                                whiteSpace: 'nowrap',
                                ...(isActivityOverdue(a, now) && { color: 'var(--mui-palette-error-main)', fontWeight: 600 }),
                            }}
                        >
                            {formatActivityWhen(a, tzOf(a), now) || '-'}
                        </Typography>
                    ),
            },
            {
                id: 'status',
                fieldKey: 'status',
                label: 'STATUS',
                sortable: true,
                minWidth: 120,
                render: (a) => (a.followupType === NOTE_TYPE ? <Typography sx={plainCellSx}>Note</Typography> : <ActivityStatusPill status={a.status} overdue={isActivityOverdue(a, now)} />),
            },
            {
                id: 'relatedTo',
                fieldKey: 'relatedTo',
                label: 'RELATED TO',
                sortable: true,
                minWidth: 200,
                render: (a) => {
                    const href = relatedRecordHref(a.relatedModule, a.relatedId);
                    if (!a.relatedTo) return <Typography sx={plainCellSx}>-</Typography>;
                    const label = `${relatedModuleLabel(a.relatedModule)}${a.relatedModule ? ': ' : ''}${a.relatedTo}`;
                    // A plain click keeps opening this activity's drawer; Ctrl / middle / right click open the record.
                    return href ? (
                        <RecordLink href={href} sx={linkCellSx}>
                            {label}
                        </RecordLink>
                    ) : (
                        <Typography noWrap sx={textCellSx}>
                            {label}
                        </Typography>
                    );
                },
            },
            {
                id: 'organizationName',
                fieldKey: 'organizationName',
                label: 'ORGANIZATION',
                sortable: true,
                minWidth: 180,
                render: (a) =>
                    a.organizationId && a.organizationName ? (
                        <RecordLink href={ROUTES.ORGANIZATION_DETAIL(a.organizationId)} sx={linkCellSx}>
                            {a.organizationName}
                        </RecordLink>
                    ) : (
                        <Typography noWrap sx={textCellSx}>
                            {a.organizationName || '-'}
                        </Typography>
                    ),
            },
            {
                id: 'contact',
                fieldKey: 'contact',
                label: 'CONTACT',
                sortable: true,
                minWidth: 160,
                defaultHidden: true,
                render: (a) =>
                    a.contactId && a.contact ? (
                        <RecordLink href={ROUTES.CONTACT_DETAIL(a.contactId)} sx={linkCellSx}>
                            {a.contact}
                        </RecordLink>
                    ) : (
                        <Typography noWrap sx={textCellSx}>
                            {a.contact || '-'}
                        </Typography>
                    ),
            },
            {
                id: 'assignedTo',
                fieldKey: 'assignedTo',
                label: 'ASSIGNED TO',
                sortable: true,
                minWidth: 150,
                render: (a) => <Typography sx={plainCellSx}>{userName(a.assignedTo) || '-'}</Typography>,
            },
            {
                id: 'customerResponse',
                fieldKey: 'customerResponse',
                label: 'CUSTOMER RESPONSE',
                sortable: true,
                minWidth: 170,
                render: (a) => <Typography sx={plainCellSx}>{responseLabel(a.customerResponse) || '-'}</Typography>,
            },
            // Hidden at first; formatted in the business timezone rather than the form field's raw value.
            {
                id: 'endAt',
                fieldKey: 'endAt',
                label: 'END',
                sortable: true,
                minWidth: 170,
                defaultHidden: true,
                render: (a) => (
                    <Typography sx={{ ...plainCellSx, whiteSpace: 'nowrap' }}>
                        {a.allDay ? formatDayLabel(a.endDay || a.startDay, { withYear: true }) || '-' : formatBusinessInstant(a.endAt, tzOf(a)) || '-'}
                    </Typography>
                ),
            },
            {
                id: 'allDay',
                fieldKey: 'allDay',
                label: 'ALL DAY',
                sortable: true,
                minWidth: 90,
                defaultHidden: true,
                render: (a) => <Typography sx={plainCellSx}>{a.allDay ? 'Yes' : 'No'}</Typography>,
            },
            {
                id: 'reminder',
                fieldKey: 'reminder',
                label: 'REMINDER',
                sortable: true,
                minWidth: 150,
                defaultHidden: true,
                render: (a) => <Typography sx={plainCellSx}>{a.reminder || '-'}</Typography>,
            },
            {
                id: 'location',
                fieldKey: 'location',
                label: 'LOCATION',
                sortable: true,
                minWidth: 180,
                defaultHidden: true,
                render: (a) => (
                    <Typography noWrap sx={{ ...plainCellSx, maxWidth: 240 }}>
                        {a.location || '-'}
                    </Typography>
                ),
            },
            {
                id: 'attendees',
                fieldKey: 'attendees',
                label: 'ATTENDEES',
                sortable: true,
                minWidth: 200,
                defaultHidden: true,
                render: (a) => (
                    <Typography noWrap sx={{ ...plainCellSx, maxWidth: 260 }} title={a.attendees.map(attendeeLabel).join(', ')}>
                        {a.attendees.length > 0 ? a.attendees.map(attendeeLabel).join(', ') : '-'}
                    </Typography>
                ),
            },
            {
                id: 'createdAt',
                label: 'DATE CREATED',
                sortable: true,
                minWidth: 170,
                render: (a) => <Typography sx={{ ...plainCellSx, whiteSpace: 'nowrap' }}>{formatBusinessInstant(a.createdAt, tzOf(a)) || '-'}</Typography>,
            },
            {
                id: 'createdBy',
                label: 'CREATED BY',
                sortable: true,
                minWidth: 140,
                defaultHidden: true,
                render: (a) => <Typography sx={plainCellSx}>{userName(a.createdBy) || '-'}</Typography>,
            },
        ] satisfies DataTableColumn<Activity>[];
    }, [clock, timeZone, openRecord, responseLabel]);
}
