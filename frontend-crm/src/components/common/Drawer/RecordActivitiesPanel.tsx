'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Button, ButtonBase, Skeleton, Typography } from '@mui/material';
import CallOutlinedIcon from '@mui/icons-material/CallOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import TaskAltOutlinedIcon from '@mui/icons-material/TaskAltOutlined';
import StickyNote2OutlinedIcon from '@mui/icons-material/StickyNote2Outlined';
import EventRepeatOutlinedIcon from '@mui/icons-material/EventRepeatOutlined';
import { ROUTES } from '@/config/constants';
import { useRecordActivities } from '@/hooks/queries/useActivities';
import { findCrmUser } from '@/services/masterData.store';
import { getModuleColor } from '@/theme/moduleColors';
import { COMPLETED_STATUS, isFollowUpActivity, NOTE_TYPE, PLANNED_STATUS, TASK_TYPE, type Activity } from '@/types/activity.types';
import type { ActivityFormValues } from '@/validations/activity.schema';
import { instantToZonedWallClock } from '@/utils/zonedTime';
import { ActivityDetailDrawer } from '@/components/activities/ActivityDetailDrawer';
import { ActivityQuickCreateDialog } from '@/components/activities/ActivityQuickCreateDialog';
import { ActivityStatusPill, ActivityTypeIcon, FollowUpChip, useActivityTypeLabel } from '@/components/activities/ActivityBadges';
import { activitySortTime, formatActivityWhen, isActivityOverdue, useBusinessClock } from '@/components/activities/activityTime';
import { formatFollowUpSlot } from '@/components/forms/FollowUpDecision';
import { NestedDrawerLayer } from '../RaisedLayer';
import { RecordLink } from '../RecordLink';
import type { RecordActivitiesContext } from './types';

const userName = (username: string | undefined) => (username ? findCrmUser(username)?.name || username : '');

/** The quick actions: type, status and label. "Log call" records one that just happened. */
const ACTIONS = [
    { key: 'call', label: 'Log call', type: 'Call', status: COMPLETED_STATUS, icon: CallOutlinedIcon },
    { key: 'meeting', label: 'Schedule meeting', type: 'Meeting', status: PLANNED_STATUS, icon: GroupsOutlinedIcon },
    { key: 'task', label: 'Add task', type: TASK_TYPE, status: PLANNED_STATUS, icon: TaskAltOutlinedIcon },
    { key: 'note', label: 'Add note', type: NOTE_TYPE, status: PLANNED_STATUS, icon: StickyNote2OutlinedIcon },
] as const;

const actionButtonSx = {
    height: 36,
    px: 1.5,
    borderRadius: '8px',
    textTransform: 'none',
    fontWeight: 600,
    fontSize: '0.8rem',
    border: '1px solid var(--mui-palette-border-main)',
    color: 'var(--crm-slate-700)',
    backgroundColor: 'var(--mui-palette-background-paper)',
    transition: 'all 0.15s ease',
    '&:hover': {
        borderColor: 'var(--crm-blue-300)',
        backgroundColor: 'var(--mui-palette-primary-soft)',
        color: 'var(--crm-text-blue-700)',
    },
} as const;

const sectionTitleSx = {
    fontSize: '0.7rem',
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: 'var(--mui-palette-text-secondary)',
} as const;

interface Section {
    key: string;
    title: string;
    rows: Activity[];
    tone?: 'error';
}

function ActivityRow({ activity, now, timeZone, onOpen }: { activity: Activity; now: Date; timeZone: string; onOpen: () => void }) {
    const typeLabel = useActivityTypeLabel()(activity.followupType);
    const isNote = activity.followupType === NOTE_TYPE;
    const overdue = isActivityOverdue(activity, now);
    const color = getModuleColor('activities');
    const when = isNote ? '' : formatActivityWhen(activity, activity.timeZone || timeZone, now);
    const secondary = [typeLabel || activity.followupType, when, userName(activity.assignedTo)].filter(Boolean).join(' · ');
    return (
        <ButtonBase
            onClick={onOpen}
            sx={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 1.25,
                p: 1.25,
                minHeight: 52,
                textAlign: 'left',
                borderRadius: '10px',
                border: '1px solid var(--mui-palette-border-light)',
                backgroundColor: 'var(--mui-palette-background-paper)',
                transition: 'all 0.15s ease',
                '&:hover': { borderColor: 'var(--crm-blue-300)', backgroundColor: 'var(--mui-palette-primary-soft)' },
                '&:focus-visible': { outline: 'none', boxShadow: '0 0 0 3px rgb(var(--crm-accent-rgb) / 0.22)' },
            }}
        >
            <Box
                sx={{
                    width: 32,
                    height: 32,
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: color.soft,
                    border: `1px solid ${color.border}`,
                    flexShrink: 0,
                }}
            >
                <ActivityTypeIcon type={activity.followupType} sx={{ fontSize: 17, color: color.main }} />
            </Box>
            <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography
                    noWrap
                    sx={{
                        fontSize: '0.84rem',
                        fontWeight: 700,
                        color: activity.status === 'Cancelled' ? 'var(--mui-palette-text-muted)' : 'var(--crm-slate-900)',
                        textDecoration: activity.status === 'Cancelled' ? 'line-through' : 'none',
                    }}
                >
                    {activity.subject || '-'}
                </Typography>
                <Typography noWrap sx={{ fontSize: '0.72rem', color: overdue ? 'var(--mui-palette-error-main)' : 'var(--mui-palette-text-secondary)' }}>
                    {secondary}
                </Typography>
                {isNote && activity.remarks && (
                    <Typography
                        sx={{
                            mt: 0.25,
                            fontSize: '0.75rem',
                            color: 'var(--crm-slate-600)',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                        }}
                    >
                        {activity.remarks}
                    </Typography>
                )}
            </Box>
            {!isNote && (
                <Box sx={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {isFollowUpActivity(activity) && <FollowUpChip relatedModule={activity.relatedModule} relatedCode={activity.relatedCode} compact />}
                    <ActivityStatusPill status={activity.status} overdue={overdue} />
                </Box>
            )}
        </ButtonBase>
    );
}

/**
 * A record's Activities tab (lead, opportunity, contact, organization, quotation, ticket, contract): overdue, upcoming
 * and past activities and the notes, with buttons that log a call, schedule a meeting, add a task or a note already
 * related to the record. Organizations and contacts roll up the activities that carry them. Leads and opportunities
 * also show their current next follow-up (rescheduled on their own form): its follow-up activity when there is one
 * (Calendar Phase 2 P2-4; it opens like any activity and is left out of the Upcoming / Overdue lists), else the
 * record's own date (the "Follow-ups create activities" switch is off, or the nightly backfill hasn't run yet).
 */
export function RecordActivitiesPanel({ module, id, label, organizationId, organizationName, contactId, contact, nextFollowUp }: RecordActivitiesContext) {
    const router = useRouter();
    const clock = useBusinessClock();
    const { data: activities = [], isLoading } = useRecordActivities(module, id);
    const [openActivity, setOpenActivity] = useState<Activity | null>(null);
    const [prefill, setPrefill] = useState<Partial<ActivityFormValues> | null>(null);
    const followUpTypeLabel = useActivityTypeLabel();

    // The record's open follow-up activity (leads / opportunities): shown in the Next follow-up box instead of a list.
    const openFollowUp = useMemo(
        () => activities.find((a) => isFollowUpActivity(a) && a.status === PLANNED_STATUS && a.relatedModule === module && a.relatedId === id) ?? null,
        [activities, module, id]
    );

    const sections = useMemo<Section[]>(() => {
        const now = clock.now();
        const notes: Activity[] = [];
        const overdue: Activity[] = [];
        const upcoming: Activity[] = [];
        const past: Activity[] = [];
        for (const a of activities) {
            if (a === openFollowUp) continue;
            if (a.followupType === NOTE_TYPE) notes.push(a);
            else if (a.status !== PLANNED_STATUS) past.push(a);
            else if (isActivityOverdue(a, now)) overdue.push(a);
            else upcoming.push(a);
        }
        const asc = (x: Activity, y: Activity) => activitySortTime(x) - activitySortTime(y);
        const desc = (x: Activity, y: Activity) => activitySortTime(y) - activitySortTime(x);
        return [
            { key: 'overdue', title: 'Overdue', rows: overdue.sort(asc), tone: 'error' as const },
            { key: 'upcoming', title: 'Upcoming', rows: upcoming.sort(asc) },
            { key: 'past', title: 'Past', rows: past.sort(desc) },
            { key: 'notes', title: 'Notes', rows: notes.sort((x, y) => Date.parse(y.createdAt) - Date.parse(x.createdAt)) },
        ].filter((s) => s.rows.length > 0);
    }, [activities, clock, openFollowUp]);

    // New activities start related to this record (an organization or a contact is also filled in as itself).
    const startNew = (type: string, status: string) => {
        const base: Partial<ActivityFormValues> = {
            followupType: type,
            status,
            relatedModule: module,
            relatedId: id,
            relatedTo: label,
            organizationName: module === 'organizations' ? label : (organizationName ?? ''),
            organizationId: module === 'organizations' ? id : (organizationId ?? ''),
            contact: module === 'contacts' ? label : (contact ?? ''),
            contactId: module === 'contacts' ? id : (contactId ?? ''),
        };
        if (status === COMPLETED_STATUS) {
            // A call that just happened: now, to the minute below.
            const wall = instantToZonedWallClock(clock.now(), clock.timeZone);
            const minutes = Number(wall.slice(14, 16));
            base.startAt = `${wall.slice(0, 14)}${String(minutes - (minutes % 5)).padStart(2, '0')}`;
        }
        setPrefill(base);
    };

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            {(openFollowUp || nextFollowUp?.date) && (
                <Box
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1.25,
                        flexWrap: 'wrap',
                        p: 1.5,
                        borderRadius: '10px',
                        border: '1px solid var(--mui-palette-primary-softBorder)',
                        backgroundColor: 'var(--mui-palette-primary-soft)',
                    }}
                >
                    <EventRepeatOutlinedIcon sx={{ fontSize: 20, color: 'var(--crm-text-blue-600)' }} />
                    {openFollowUp ? (
                        <ButtonBase
                            onClick={() => setOpenActivity(openFollowUp)}
                            aria-label={`Open the next follow-up: ${openFollowUp.subject}`}
                            sx={{
                                minWidth: 0,
                                flex: 1,
                                display: 'block',
                                textAlign: 'left',
                                borderRadius: '6px',
                                minHeight: 40,
                                '&:focus-visible': { outline: 'none', boxShadow: '0 0 0 3px rgb(var(--crm-accent-rgb) / 0.22)' },
                            }}
                        >
                            <Typography sx={{ ...sectionTitleSx, color: 'var(--crm-text-blue-900)' }}>Next follow-up</Typography>
                            <Typography
                                sx={{
                                    fontSize: '0.85rem',
                                    fontWeight: 700,
                                    color: isActivityOverdue(openFollowUp, clock.now()) ? 'var(--mui-palette-error-main)' : 'var(--crm-slate-900)',
                                    overflowWrap: 'anywhere',
                                }}
                            >
                                {formatActivityWhen(openFollowUp, openFollowUp.timeZone || clock.timeZone, clock.now())}
                                {` · ${followUpTypeLabel(openFollowUp.followupType) || openFollowUp.followupType}`}
                                {openFollowUp.assignedTo ? ` · ${userName(openFollowUp.assignedTo)}` : ''}
                            </Typography>
                            {isActivityOverdue(openFollowUp, clock.now()) && (
                                <Typography sx={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--mui-palette-error-main)' }}>Overdue</Typography>
                            )}
                        </ButtonBase>
                    ) : (
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                            <Typography sx={{ ...sectionTitleSx, color: 'var(--crm-text-blue-900)' }}>Next follow-up</Typography>
                            <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--crm-slate-900)' }}>
                                {formatFollowUpSlot({ date: nextFollowUp?.date ?? '', time: nextFollowUp?.time ?? '' })}
                                {nextFollowUp?.type ? ` · ${followUpTypeLabel(nextFollowUp.type) || nextFollowUp.type}` : ''}
                            </Typography>
                        </Box>
                    )}
                    {nextFollowUp?.editHref && (
                        <RecordLink href={nextFollowUp.editHref} onOpen={() => router.push(nextFollowUp.editHref)} sx={{ fontSize: '0.8rem', fontWeight: 600 }}>
                            Reschedule
                        </RecordLink>
                    )}
                </Box>
            )}

            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {ACTIONS.map((action) => {
                    const Icon = action.icon;
                    return (
                        <Button key={action.key} onClick={() => startNew(action.type, action.status)} startIcon={<Icon sx={{ fontSize: 18 }} />} sx={actionButtonSx}>
                            {action.label}
                        </Button>
                    );
                })}
            </Box>

            {isLoading ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {[0, 1, 2].map((i) => (
                        <Skeleton key={i} variant="rounded" height={52} sx={{ borderRadius: '10px' }} />
                    ))}
                </Box>
            ) : sections.length === 0 ? (
                <Box
                    sx={{
                        p: 3,
                        textAlign: 'center',
                        borderRadius: '10px',
                        border: '1px dashed var(--mui-palette-border-main)',
                        backgroundColor: 'var(--mui-palette-background-subtle)',
                    }}
                >
                    <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--crm-slate-900)' }}>No activities yet</Typography>
                    <Typography sx={{ fontSize: '0.78rem', color: 'var(--mui-palette-text-secondary)', mt: 0.5 }}>
                        Log a call, schedule a meeting, add a task or write a note.
                    </Typography>
                </Box>
            ) : (
                sections.map((section) => (
                    <Box key={section.key} sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                        <Typography sx={{ ...sectionTitleSx, ...(section.tone === 'error' && { color: 'var(--mui-palette-error-main)' }) }}>
                            {`${section.title} (${section.rows.length})`}
                        </Typography>
                        {section.rows.map((a) => (
                            <ActivityRow key={a.id} activity={a} now={clock.now()} timeZone={clock.timeZone} onOpen={() => setOpenActivity(a)} />
                        ))}
                    </Box>
                ))
            )}

            {activities.length > 0 && (
                <RecordLink href={ROUTES.CALENDAR} onOpen={() => router.push(ROUTES.CALENDAR)} sx={{ alignSelf: 'flex-start', fontSize: '0.8rem', fontWeight: 600 }}>
                    Open the calendar
                </RecordLink>
            )}

            {openActivity && (
                <NestedDrawerLayer>
                    <ActivityDetailDrawer
                        activity={openActivity}
                        open
                        onClose={() => setOpenActivity(null)}
                        onEdit={(activityId) => router.push(ROUTES.ACTIVITY_EDIT(activityId))}
                    />
                </NestedDrawerLayer>
            )}
            <ActivityQuickCreateDialog open={Boolean(prefill)} prefill={prefill ?? undefined} onClose={() => setPrefill(null)} />
        </Box>
    );
}
