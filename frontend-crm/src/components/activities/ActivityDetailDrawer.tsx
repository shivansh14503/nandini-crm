'use client';

import React, { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import {
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    MenuItem,
    TextField,
    Typography,
    useMediaQuery,
    useTheme,
} from '@mui/material';
import { FormProvider, useForm, useWatch } from 'react-hook-form';
import EventNoteOutlinedIcon from '@mui/icons-material/EventNoteOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import EventRepeatOutlinedIcon from '@mui/icons-material/EventRepeatOutlined';
import EventBusyOutlinedIcon from '@mui/icons-material/EventBusyOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import NotificationsNoneOutlinedIcon from '@mui/icons-material/NotificationsNoneOutlined';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import LinkOutlinedIcon from '@mui/icons-material/LinkOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import RateReviewOutlinedIcon from '@mui/icons-material/RateReviewOutlined';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';

import { ROUTES } from '@/config/constants';
import { withListOrigin } from '@/utils/listOrigin';
import { EntityDetailDrawer, DrawerSectionCard } from '@/components/common/Drawer';
import { DynamicDrawerCustomFields } from '@/components/common/Drawer/DynamicDrawerCustomFields';
import { RecordLink } from '@/components/common/RecordLink';
import { AppToast } from '@/components/common/AppToast';
import { NestedDrawerLayer, RaisedLayer } from '@/components/common/RaisedLayer';
import { fieldSx } from '@/components/forms/FormField';
import { CUSTOMER_RESPONSE_CATEGORY, CUSTOMER_RESPONSES } from '@/components/forms/FollowUpDecision';
import { useActivity, useDeleteActivity, useDeleteActivityScoped } from '@/hooks/queries/useActivities';
import { useDropdownOptionLabel, useModuleFormConfig } from '@/hooks/queries/useFormConfigs';
import { activityService } from '@/services/activity.service';
import { ActivityBusyTimes } from './ActivityBusyTimes';
import { ActivityCalendarNotes } from './ActivityCalendarNotes';
import { ActivitySyncStatus, calendarRemovalNote, showsSyncStatus } from './ActivitySyncStatus';
import { ActivitySeriesInfo } from './ActivitySeriesInfo';
import { useSeriesScopePrompt } from './SeriesScopeDialog';
import { useAuth } from '@/context/AuthContext';
import { findCrmUser } from '@/services/masterData.store';
import { UserAvatar } from '@/components/common/UserAvatar';
import { getModuleColor } from '@/theme/moduleColors';
import {
    CANCELLED_STATUS,
    COMPLETED_STATUS,
    NOTE_TYPE,
    PLANNED_STATUS,
    TASK_TYPE,
    isActivityRelatedModule,
    isFollowUpActivity,
    type Activity,
    type ActivityRelatedModule,
    type AttendeeResponse,
} from '@/types/activity.types';
import { activityPastIssues, activityScheduleIssues, fromApiSchedule, toApiSchedule, type ScheduleValues } from '@/utils/activitySchedule';
import { addDays, addMinutesToWallClock, daysBetween, instantToZonedWallClock, isDay, isWallClock, wallClockMinutesBetween } from '@/utils/zonedTime';
import { ACTIVITY_STATUS_COLORS, ActivityTypeIcon, AttendeeResponseChip, followUpModuleColor, useActivityTypeLabel } from './ActivityBadges';
import { attendeeKey, attendeeLabel } from './RhfAttendeesField';
import { RhfScheduleField } from './RhfScheduleField';
import { formatActivityWhen, formatBusinessInstant, isActivityOverdue, timeZoneAbbr, useBusinessClock, type BusinessClock } from './activityTime';
import { relatedModuleLabel, relatedRecordEditHref, relatedRecordHref } from './activityLinks';

// Loaded on demand: the related record's drawer imports every module's drawer (which import this one).
const RelatedRecordDrawer = dynamic(() => import('./relatedRecord').then((m) => m.RelatedRecordDrawer), { ssr: false });

const outlinedSx = {
    textTransform: 'none',
    fontWeight: 600,
    fontSize: '0.8rem',
    height: 36,
    px: 1.5,
    borderRadius: '8px',
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

const destructiveSx = {
    ...outlinedSx,
    '&:hover': {
        color: 'var(--mui-palette-error-main)',
        backgroundColor: 'var(--mui-palette-error-soft)',
        borderColor: 'var(--mui-palette-error-softBorder)',
    },
} as const;

const primarySx = {
    textTransform: 'none',
    fontWeight: 700,
    fontSize: '0.85rem',
    height: 40,
    px: 2.2,
    borderRadius: '8px',
    color: '#ffffff',
    boxShadow: 'none',
    background: 'linear-gradient(135deg, var(--crm-fill-blue-700) 0%, var(--crm-fill-blue-600) 100%)',
    '&:hover': {
        background: 'linear-gradient(135deg, var(--crm-fill-blue-800) 0%, var(--crm-fill-blue-700) 100%)',
        boxShadow: '0 4px 14px rgb(var(--crm-accent-rgb) / 0.28)',
    },
} as const;

const labelSx = { fontSize: '0.7rem', fontWeight: 700, color: 'var(--mui-palette-text-secondary)', letterSpacing: '0.04em', textTransform: 'uppercase' } as const;
const valueSx = { fontSize: '0.88rem', fontWeight: 600, color: 'var(--crm-slate-900)', mt: 0.3, overflowWrap: 'anywhere' } as const;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <Box sx={{ minWidth: 0 }}>
            <Typography sx={labelSx}>{label}</Typography>
            {typeof children === 'string' ? <Typography sx={valueSx}>{children}</Typography> : <Box sx={{ mt: 0.4 }}>{children}</Box>}
        </Box>
    );
}

/** A maps search for a typed place; a link (a video call…) opens as is. */
const locationHref = (location: string) =>
    /^https?:\/\//i.test(location) ? location : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;

function PersonBlock({ username }: { username: string }) {
    const user = findCrmUser(username);
    const name = user?.name || username || '-';
    return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2, minWidth: 0 }}>
            <UserAvatar name={name} photoUrl={user?.photoUrl} size={34} sx={{ fontSize: '0.75rem', fontWeight: 800 }} />
            <Box sx={{ minWidth: 0 }}>
                <Typography noWrap sx={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--crm-slate-900)' }}>
                    {name}
                </Typography>
                {user && (
                    <Typography noWrap sx={{ fontSize: '0.74rem', color: 'var(--mui-palette-text-secondary)' }}>
                        {[user.role, user.department].filter(Boolean).join(' • ')}
                    </Typography>
                )}
            </Box>
        </Box>
    );
}

// ── Mark complete ────────────────────────────────────────────────────────────

function CompleteDialog({ activity, onClose, onDone }: { activity: Activity; onClose: () => void; onDone: (message: string, error?: boolean) => void }) {
    const config = useModuleFormConfig('activities');
    const responses = config.getOptions(CUSTOMER_RESPONSE_CATEGORY, CUSTOMER_RESPONSES);
    const responseLabel = useDropdownOptionLabel(CUSTOMER_RESPONSE_CATEGORY);
    const responseField = config.getFieldProps('customerResponse', { label: 'Customer Response' });
    const remarksField = config.getFieldProps('remarks', { label: 'Remarks' });
    const [customerResponse, setCustomerResponse] = useState(activity.customerResponse ?? '');
    const [remarks, setRemarks] = useState(activity.remarks ?? '');
    const [busy, setBusy] = useState(false);
    const remarksTooShort = remarks.trim().length > 0 && remarks.trim().length < 3;

    const complete = async () => {
        setBusy(true);
        try {
            await activityService.update(activity.id, { status: COMPLETED_STATUS, customerResponse, remarks: remarks.trim() });
            onDone('Activity marked complete.');
            onClose();
        } catch (err: unknown) {
            onDone(err instanceof Error ? err.message : 'Failed to complete the activity.', true);
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open onClose={onClose} fullWidth maxWidth="xs" slotProps={{ paper: { sx: { borderRadius: '12px', backgroundImage: 'none' } } }}>
            <DialogTitle sx={{ fontSize: '1rem', fontWeight: 800, color: 'var(--crm-slate-900)' }}>Mark complete</DialogTitle>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '4px !important' }}>
                {!responseField.hidden && (
                    <TextField
                        select
                        size="small"
                        label={responseField.label}
                        value={customerResponse}
                        onChange={(e) => setCustomerResponse(e.target.value)}
                        sx={fieldSx}
                        slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
                    >
                        <MenuItem value="" sx={{ fontSize: '0.85rem', color: 'var(--mui-palette-text-muted)' }}>
                            Not recorded
                        </MenuItem>
                        {responses.map((r) => (
                            <MenuItem key={r} value={r} sx={{ fontSize: '0.85rem' }}>
                                {responseLabel(r)}
                            </MenuItem>
                        ))}
                    </TextField>
                )}
                {!remarksField.hidden && (
                    <TextField
                        multiline
                        minRows={3}
                        size="small"
                        label={remarksField.label}
                        value={remarks}
                        onChange={(e) => setRemarks(e.target.value.slice(0, 2000))}
                        placeholder="How did it go? Next steps..."
                        error={remarksTooShort}
                        helperText={remarksTooShort ? `${remarksField.label} must be at least 3 characters.` : undefined}
                        sx={fieldSx}
                        slotProps={{ inputLabel: { shrink: true } }}
                    />
                )}
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
                <Button onClick={onClose} sx={outlinedSx}>
                    Cancel
                </Button>
                <Button onClick={complete} disabled={busy || remarksTooShort} variant="contained" sx={primarySx}>
                    {busy ? 'Saving...' : 'Mark complete'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

// ── Reschedule (the non-drag way to move an activity) ─────────────────────────

interface RescheduleValues {
    allDay: boolean;
    startAt: string;
    endAt: string;
}

function RescheduleDialog({
    activity,
    clock,
    onClose,
    onDone,
}: {
    activity: Activity;
    clock: BusinessClock;
    onClose: () => void;
    onDone: (message: string, error?: boolean) => void;
}) {
    const timeZone = activity.timeZone || clock.timeZone;
    const loaded = useMemo(() => fromApiSchedule(activity, timeZone), [activity, timeZone]);
    const methods = useForm<RescheduleValues>({ defaultValues: loaded });
    const { control, handleSubmit, setError, setValue, getValues, formState } = methods;
    const allDay = Boolean(useWatch({ control, name: 'allDay' }));
    const startAt = useWatch({ control, name: 'startAt' }) ?? '';
    const endAt = useWatch({ control, name: 'endAt' }) ?? '';
    const isTask = activity.followupType === TASK_TYPE;
    const nowWall = instantToZonedWallClock(clock.now(), timeZone);
    // Busy times (P2-6) of the owner and invited colleagues, folded until asked for.
    const busyPeople = useMemo(
        () => [activity.assignedTo, ...(activity.attendees ?? []).filter((a) => a.kind === 'user' && a.username).map((a) => a.username as string)].filter(Boolean),
        [activity]
    );
    const showBusy = !allDay && !isTask && activity.followupType !== NOTE_TYPE && activity.status === PLANNED_STATUS && busyPeople.length > 0;

    const save = handleSubmit(async (values) => {
        const schedule: ScheduleValues = { followupType: activity.followupType, status: activity.status, ...values };
        const issues = [...activityScheduleIssues(schedule, timeZone), ...activityPastIssues(schedule, loaded, clock.now(), timeZone)];
        if (issues.length > 0) {
            for (const issue of issues) setError(issue.path as keyof RescheduleValues, { type: 'custom', message: issue.message });
            return;
        }
        try {
            await activityService.update(activity.id, toApiSchedule(schedule, timeZone));
            onDone('Activity rescheduled.');
            onClose();
        } catch (err: unknown) {
            onDone(err instanceof Error ? err.message : 'Failed to reschedule the activity.', true);
        }
    });

    // End keeps the current length when Start moves.
    const followStart = (next: string, previous: string) => {
        const end = getValues('endAt');
        if (isTask) return;
        if (allDay) {
            if (isDay(next) && isDay(previous) && isDay(end)) setValue('endAt', addDays(end, daysBetween(previous, next)));
        } else if (isWallClock(next) && isWallClock(previous) && isWallClock(end)) {
            setValue('endAt', addMinutesToWallClock(next, Math.max(0, wallClockMinutesBetween(previous, end, timeZone)), timeZone));
        }
    };

    return (
        <Dialog open onClose={onClose} fullWidth maxWidth="xs" slotProps={{ paper: { sx: { borderRadius: '12px', backgroundImage: 'none' } } }}>
            <DialogTitle sx={{ fontSize: '1rem', fontWeight: 800, color: 'var(--crm-slate-900)' }}>Reschedule</DialogTitle>
            <FormProvider {...methods}>
                <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, pt: '4px !important' }}>
                    <RhfScheduleField<RescheduleValues>
                        name="startAt"
                        label="Start"
                        required
                        allDay={allDay}
                        now={nowWall}
                        allowPast={activity.status !== PLANNED_STATUS}
                        onValueChange={followStart}
                    />
                    {!isTask && (
                        <RhfScheduleField<RescheduleValues>
                            name="endAt"
                            label="End"
                            allDay={allDay}
                            now={nowWall}
                            allowPast={activity.status !== PLANNED_STATUS}
                            sameDayAs="startAt"
                        />
                    )}
                    <Typography sx={{ fontSize: '0.74rem', color: 'var(--mui-palette-text-secondary)' }}>{`Times in ${timeZoneAbbr(timeZone)} (${timeZone})`}</Typography>
                    {showBusy && (
                        <Box sx={{ mt: 1, minWidth: 0 }}>
                            <ActivityBusyTimes
                                people={busyPeople}
                                startAt={startAt}
                                endAt={endAt}
                                timeZone={timeZone}
                                now={clock.now}
                                excludeId={activity.id}
                                onPickStart={(wall) => {
                                    const previous = getValues('startAt');
                                    if (wall === previous) return;
                                    setValue('startAt', wall, { shouldDirty: true, shouldValidate: true });
                                    followStart(wall, previous);
                                }}
                                collapsible
                            />
                        </Box>
                    )}
                </DialogContent>
            </FormProvider>
            <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
                <Button onClick={onClose} sx={outlinedSx}>
                    Cancel
                </Button>
                <Button onClick={save} disabled={formState.isSubmitting} variant="contained" sx={primarySx}>
                    {formState.isSubmitting ? 'Saving...' : 'Reschedule'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

// ── Drawer ───────────────────────────────────────────────────────────────────

export interface ActivityDetailDrawerProps {
    /** The activity (a list row); its fresh copy is loaded while the drawer is open. */
    activity?: Activity | null;
    /** Or just its id (calendar, deep links). */
    activityId?: string | null;
    open: boolean;
    onClose: () => void;
    onEdit?: (id: string) => void;
    hideBackdrop?: boolean;
}

type ActivityDialog = 'complete' | 'reschedule' | null;

/**
 * An activity at a glance: when (business timezone), what it is related to, who takes part, the outcome.
 * Owners (and their managers) can mark it complete, edit, reschedule, cancel or delete it; invited colleagues reply
 * (an invited colleague who may also edit it gets both).
 */
export function ActivityDetailDrawer({ activity, activityId, open, onClose, onEdit, hideBackdrop }: ActivityDetailDrawerProps) {
    const router = useRouter();
    const theme = useTheme();
    const isPhone = useMediaQuery(theme.breakpoints.down('sm'));
    const id = activity?.id ?? activityId ?? undefined;
    const { data: fresh, refetch } = useActivity(open && id ? id : undefined);
    const { user } = useAuth();
    const a = fresh ?? activity ?? null;
    const clock = useBusinessClock();
    const typeLabel = useActivityTypeLabel();
    const responseLabel = useDropdownOptionLabel(CUSTOMER_RESPONSE_CATEGORY);
    const deleteMutation = useDeleteActivity();
    const deleteScopedMutation = useDeleteActivityScoped();
    const [dialog, setDialog] = useState<ActivityDialog>(null);
    const [related, setRelated] = useState<{ module: ActivityRelatedModule; id: string } | null>(null);
    const [busy, setBusy] = useState(false);
    const [toast, setToast] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });
    // Recurring activities (Calendar Phase 4): cancel / delete of an occurrence ask this / following / all.
    const scopePrompt = useSeriesScopePrompt();

    if (!a) return null;

    const timeZone = a.timeZone || clock.timeZone;
    const now = clock.now();
    const canEdit = a.viewer?.canEdit ?? false;
    const myResponse = a.viewer?.myResponse ?? null;
    const isNote = a.followupType === NOTE_TYPE;
    const overdue = isActivityOverdue(a, now);
    const when = isNote ? `Written ${formatBusinessInstant(a.createdAt, timeZone)}` : formatActivityWhen(a, timeZone, now);
    const color = getModuleColor('activities');
    const statusColors = ACTIVITY_STATUS_COLORS[overdue ? 'Overdue' : a.status] ?? ACTIVITY_STATUS_COLORS.Cancelled;

    const notify = (message: string, error = false) => setToast({ open: true, message, severity: error ? 'error' : 'success' });
    const handleEdit = () => (onEdit ? onEdit(a.id) : router.push(ROUTES.ACTIVITY_EDIT(a.id)));

    const run = async (work: () => Promise<unknown>, success: string, failure: string) => {
        setBusy(true);
        try {
            await work();
            notify(success);
        } catch (err: unknown) {
            notify(err instanceof Error ? err.message : failure, true);
        } finally {
            setBusy(false);
        }
    };

    const markComplete = () => {
        // A task is done when it's done; other activities record how it went.
        if (a.followupType === TASK_TYPE) {
            void run(() => activityService.update(a.id, { status: COMPLETED_STATUS }), 'Task marked complete.', 'Failed to complete the task.');
        } else {
            setDialog('complete');
        }
    };
    const cancelActivity = () => {
        if (a.seriesId) {
            void (async () => {
                const scope = await scopePrompt.ask({ action: 'cancel', calendarNote: calendarRemovalNote(a, user?.username, 'cancel').trim() });
                if (scope) await run(() => activityService.updateScoped(a.id, { status: CANCELLED_STATUS }, scope), 'Cancelled.', 'Failed to cancel the activity.');
            })();
            return;
        }
        if (!window.confirm(`Cancel "${a.subject}"? It stays in the list as Cancelled.${calendarRemovalNote(a, user?.username, 'cancel')}`)) return;
        void run(() => activityService.update(a.id, { status: CANCELLED_STATUS }), 'Activity cancelled.', 'Failed to cancel the activity.');
    };
    const deleteActivity = () => {
        void (async () => {
            const scope = a.seriesId ? await scopePrompt.ask({ action: 'delete', calendarNote: calendarRemovalNote(a, user?.username, 'delete').trim() }) : 'this';
            if (!scope) return;
            if (!a.seriesId && !window.confirm(`Delete "${a.subject}"? This can't be undone.${calendarRemovalNote(a, user?.username, 'delete')}`)) return;
            try {
                if (a.seriesId) await deleteScopedMutation.mutateAsync({ id: a.id, scope });
                else await deleteMutation.mutateAsync(a.id);
                onClose();
            } catch (err: unknown) {
                notify(err instanceof Error ? err.message : 'Failed to delete the activity.', true);
            }
        })();
    };
    const respond = (response: Exclude<AttendeeResponse, 'needsAction'>) =>
        void run(() => activityService.respond(a.id, response), 'Reply sent.', 'Failed to send the reply.');

    const planned = a.status === PLANNED_STATUS && !isNote;
    const relatedHref = relatedRecordHref(a.relatedModule, a.relatedId);
    // A lead / opportunity follow-up activity (P2-4) moves with its record: its date, type, owner and status change
    // there ("Record a follow-up" on the record's edit page); it can't be rescheduled, cancelled or deleted here.
    const followUp = isFollowUpActivity(a);
    const followUpRecord = a.relatedModule === 'opportunities' ? 'opportunity' : 'lead';
    const recordFollowUpHref = followUp && isActivityRelatedModule(a.relatedModule) && a.relatedId ? relatedRecordEditHref(a.relatedModule, a.relatedId) : '';
    const recordFollowUp = () => {
        if (recordFollowUpHref) router.push(withListOrigin(recordFollowUpHref));
    };
    const followUpColor = followUpModuleColor(a.relatedModule);

    const overview = (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <DrawerSectionCard title="When" icon={<ScheduleOutlinedIcon sx={{ fontSize: 18, color: color.main }} />}>
                <Typography sx={{ fontSize: '0.95rem', fontWeight: 700, color: overdue ? 'var(--mui-palette-error-main)' : 'var(--crm-slate-900)' }}>
                    {when || '-'}
                </Typography>
                {overdue && (
                    <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--mui-palette-error-main)', mt: 0.3 }}>
                        Overdue: still Planned after its time
                    </Typography>
                )}
                <ActivitySeriesInfo activity={a} canEdit={canEdit} onEditSeries={handleEdit} />
                {followUp && (
                    <Typography sx={{ fontSize: '0.78rem', color: 'var(--mui-palette-text-secondary)', mt: 0.6 }}>
                        {planned
                            ? `The next follow-up of ${a.relatedCode || `this ${followUpRecord}`}. Its date, type, owner and status change on the ${followUpRecord}: Record follow-up.`
                            : `Follow-up history of ${a.relatedCode || `this ${followUpRecord}`}: kept with the ${followUpRecord}.`}
                    </Typography>
                )}
                <ActivityCalendarNotes calendar={a.calendar} timeZone={timeZone} besideStatus={showsSyncStatus(a, user?.username)} />
                {(a.reminder || a.completedAt) && (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mt: 1.2 }}>
                        {a.reminder && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>
                                <NotificationsNoneOutlinedIcon sx={{ fontSize: 16, color: 'var(--mui-palette-text-secondary)' }} />
                                <Typography sx={{ fontSize: '0.8rem', color: 'var(--mui-palette-text-secondary)' }}>{a.reminder}</Typography>
                            </Box>
                        )}
                        {a.completedAt && a.status === COMPLETED_STATUS && (
                            <Typography sx={{ fontSize: '0.8rem', color: 'var(--mui-palette-text-secondary)' }}>
                                {`Completed ${formatBusinessInstant(a.completedAt, timeZone)}${a.completedBy ? ` by ${findCrmUser(a.completedBy)?.name || a.completedBy}` : ''}`}
                            </Typography>
                        )}
                    </Box>
                )}
                <ActivitySyncStatus activity={a} onRefresh={refetch} onNotify={notify} />
            </DrawerSectionCard>

            {(a.relatedTo || a.organizationName || a.contact) && (
                <DrawerSectionCard title="Related" icon={<LinkOutlinedIcon sx={{ fontSize: 18, color: color.main }} />}>
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
                        {a.relatedTo && (
                            <Field label={relatedModuleLabel(a.relatedModule) || 'Related To'}>
                                {relatedHref && a.relatedModule ? (
                                    <RecordLink
                                        href={relatedHref}
                                        onOpen={() => setRelated({ module: a.relatedModule as ActivityRelatedModule, id: a.relatedId! })}
                                        sx={{ fontSize: '0.88rem', fontWeight: 700 }}
                                    >
                                        {a.relatedCode ? `${a.relatedCode} · ${a.relatedTo}` : a.relatedTo}
                                    </RecordLink>
                                ) : (
                                    a.relatedTo
                                )}
                            </Field>
                        )}
                        {a.organizationName && (
                            <Field label="Organization">
                                {a.organizationId ? (
                                    <RecordLink
                                        href={ROUTES.ORGANIZATION_DETAIL(a.organizationId)}
                                        onOpen={() => setRelated({ module: 'organizations', id: a.organizationId! })}
                                        sx={{ fontSize: '0.88rem', fontWeight: 700 }}
                                    >
                                        {a.organizationName}
                                    </RecordLink>
                                ) : (
                                    a.organizationName
                                )}
                            </Field>
                        )}
                        {a.contact && (
                            <Field label="Contact">
                                {a.contactId ? (
                                    <RecordLink
                                        href={ROUTES.CONTACT_DETAIL(a.contactId)}
                                        onOpen={() => setRelated({ module: 'contacts', id: a.contactId! })}
                                        sx={{ fontSize: '0.88rem', fontWeight: 700 }}
                                    >
                                        {a.contact}
                                    </RecordLink>
                                ) : (
                                    a.contact
                                )}
                            </Field>
                        )}
                    </Box>
                </DrawerSectionCard>
            )}

            <DrawerSectionCard title="People" icon={<GroupsOutlinedIcon sx={{ fontSize: 18, color: color.main }} />}>
                <Field label="Assigned to">
                    <PersonBlock username={a.assignedTo} />
                </Field>
                {a.attendees.length > 0 && (
                    <Box sx={{ mt: 2 }}>
                        <Typography sx={labelSx}>{`Attendees (${a.attendees.length})`}</Typography>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.8, mt: 0.8 }}>
                            {a.attendees.map((attendee) => (
                                <Box key={attendeeKey(attendee)} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, minWidth: 0, flexWrap: 'wrap' }}>
                                    <Box sx={{ minWidth: 0 }}>
                                        <Typography noWrap sx={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--crm-slate-900)' }}>
                                            {attendeeLabel(attendee)}
                                        </Typography>
                                        {attendee.kind !== 'user' && attendee.email && attendee.name && (
                                            <Typography noWrap sx={{ fontSize: '0.72rem', color: 'var(--mui-palette-text-secondary)' }}>
                                                {attendee.email}
                                            </Typography>
                                        )}
                                    </Box>
                                    <AttendeeResponseChip response={attendee.responseStatus} />
                                </Box>
                            ))}
                        </Box>
                    </Box>
                )}
            </DrawerSectionCard>

            {(a.location || a.customerResponse || a.remarks) && (
                <DrawerSectionCard title={isNote ? 'Note' : 'Details'} icon={<RateReviewOutlinedIcon sx={{ fontSize: 18, color: color.main }} />}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.8 }}>
                        {a.location && (
                            <Field label="Location">
                                <Box
                                    component="a"
                                    href={locationHref(a.location)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    sx={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 0.5,
                                        fontSize: '0.88rem',
                                        fontWeight: 600,
                                        color: 'var(--crm-text-blue-700)',
                                        textDecoration: 'none',
                                        overflowWrap: 'anywhere',
                                        '&:hover': { color: 'var(--crm-text-blue-600)', textDecoration: 'underline' },
                                    }}
                                >
                                    <PlaceOutlinedIcon sx={{ fontSize: 16, flexShrink: 0 }} />
                                    {a.location}
                                </Box>
                            </Field>
                        )}
                        {a.customerResponse && <Field label="Customer Response">{responseLabel(a.customerResponse)}</Field>}
                        {a.remarks && (
                            <Field label="Remarks">
                                <Typography sx={{ ...valueSx, fontWeight: 500, whiteSpace: 'pre-wrap' }}>{a.remarks}</Typography>
                            </Field>
                        )}
                    </Box>
                </DrawerSectionCard>
            )}
            <DynamicDrawerCustomFields module="activities" record={a} />
        </Box>
    );

    // Owners act on the activity; anyone invited as a colleague replies, owner or not (a manager invited to a rep's
    // meeting can also edit it, and still needs to accept or decline). A note has no replies.
    const canReply = myResponse !== null && !isNote;
    const rsvp = canReply ? (
        <Box
            sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: 1,
                flexWrap: 'wrap',
                // Beside the owner's actions it takes its own row, above them.
                ...(canEdit && { width: '100%' }),
            }}
        >
            <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--mui-palette-text-secondary)' }}>Going?</Typography>
            {(
                [
                    ['accepted', 'Accept'],
                    ['tentative', 'Maybe'],
                    ['declined', 'Decline'],
                ] as const
            ).map(([value, label]) => (
                <Button
                    key={value}
                    size="small"
                    onClick={() => respond(value)}
                    disabled={busy}
                    aria-pressed={myResponse === value}
                    sx={{
                        ...outlinedSx,
                        ...(myResponse === value && {
                            borderColor: 'var(--mui-palette-border-strong)',
                            backgroundColor: 'var(--mui-palette-primary-soft)',
                            color: 'var(--crm-text-blue-900)',
                        }),
                    }}
                >
                    {label}
                </Button>
            ))}
        </Box>
    ) : null;
    const ownerActions = canEdit ? (
        <>
            {planned && !followUp && (
                <Button size="small" startIcon={<EventRepeatOutlinedIcon sx={{ fontSize: 16 }} />} onClick={() => setDialog('reschedule')} disabled={busy} sx={outlinedSx}>
                    Reschedule
                </Button>
            )}
            {planned && !followUp && (
                <Button size="small" startIcon={<EventBusyOutlinedIcon sx={{ fontSize: 16 }} />} onClick={cancelActivity} disabled={busy} sx={outlinedSx}>
                    Cancel activity
                </Button>
            )}
            {!followUp && (
                <Button size="small" startIcon={<DeleteOutlineIcon sx={{ fontSize: 16 }} />} onClick={deleteActivity} disabled={busy} sx={destructiveSx}>
                    Delete
                </Button>
            )}
            {planned && (
                <Button size="small" startIcon={<EditOutlinedIcon sx={{ fontSize: 16 }} />} onClick={handleEdit} sx={outlinedSx}>
                    Edit
                </Button>
            )}
        </>
    ) : null;
    const footerActions =
        rsvp || ownerActions ? (
            <>
                {rsvp}
                {ownerActions}
            </>
        ) : null;

    const primaryAction = !canEdit
        ? undefined
        : followUp && planned && recordFollowUpHref
          ? { label: 'Record follow-up', icon: <EventAvailableOutlinedIcon sx={{ fontSize: 16 }} />, onClick: recordFollowUp }
          : planned
            ? { label: 'Mark complete', icon: <CheckCircleOutlineIcon sx={{ fontSize: 16 }} />, onClick: markComplete, disabled: busy }
            : { label: 'Edit Activity', onClick: handleEdit };

    return (
        <>
            <EntityDetailDrawer
                open={open}
                module="activities"
                onClose={onClose}
                hideBackdrop={hideBackdrop}
                title={a.subject || typeLabel(a.followupType) || 'Activity'}
                subtitle={when}
                verified={false}
                avatarIcon={<ActivityTypeIcon type={a.followupType} sx={{ fontSize: 24, color: '#ffffff' }} />}
                badges={[
                    {
                        label: typeLabel(a.followupType) || a.followupType,
                        color: color.text,
                        backgroundColor: color.soft,
                        borderColor: color.border,
                    },
                    ...(followUp
                        ? [
                              {
                                  label: 'Follow-up',
                                  color: followUpColor.text,
                                  backgroundColor: followUpColor.soft,
                                  borderColor: followUpColor.border,
                                  tooltip: `Moves with ${a.relatedCode || `the ${followUpRecord}`}`,
                              },
                          ]
                        : []),
                    ...(isNote
                        ? []
                        : [
                              {
                                  label: overdue ? 'Overdue' : a.status,
                                  color: statusColors.color,
                                  backgroundColor: statusColors.bg,
                                  borderColor: statusColors.border,
                              },
                          ]),
                    ...(myResponse ? [{ label: `You: ${myResponse === 'needsAction' ? 'not replied' : myResponse === 'tentative' ? 'maybe' : myResponse}` }] : []),
                ]}
                headerActions={{
                    onEdit: canEdit ? handleEdit : undefined,
                    onView: () => router.push(withListOrigin(ROUTES.ACTIVITY_DETAIL(a.id))),
                }}
                tabs={[{ id: 'overview', label: 'Overview', icon: <EventNoteOutlinedIcon sx={{ fontSize: 16 }} />, content: overview }]}
                auditEntity={{ type: 'activities', id: a.id }}
                recordAudit={a}
                includeChangesTab
                primaryAction={primaryAction}
                footerActions={footerActions}
                width={isPhone ? '100%' : { xs: '100%', sm: 540, md: 580 }}
            />
            <RaisedLayer>
                {dialog === 'complete' && <CompleteDialog activity={a} onClose={() => setDialog(null)} onDone={notify} />}
                {dialog === 'reschedule' && <RescheduleDialog activity={a} clock={clock} onClose={() => setDialog(null)} onDone={notify} />}
                <AppToast open={toast.open} message={toast.message} severity={toast.severity} onClose={() => setToast((t) => ({ ...t, open: false }))} />
            </RaisedLayer>
            {scopePrompt.dialog}
            {related && open && (
                <NestedDrawerLayer>
                    <RelatedRecordDrawer module={related.module} id={related.id} onClose={() => setRelated(null)} />
                </NestedDrawerLayer>
            )}
        </>
    );
}
