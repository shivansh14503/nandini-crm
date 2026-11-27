'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { FormProvider, useWatch } from 'react-hook-form';
import EventNoteOutlinedIcon from '@mui/icons-material/EventNoteOutlined';

import { type BreadcrumbItem } from '../common/AppBreadcrumbs';
import { type FormTabDefinition } from '../common/Drawer';
import { ROUTES } from '@/config/constants';
import { setSaveFlash } from '@/utils/saveFlash';
import { CommonFormLayout, AppToast } from '@/components/forms';
import { FormConfigProvider } from '@/context/FormConfigContext';
import { isFollowUpActivity, NOTE_TYPE, PLANNED_STATUS, type Activity } from '@/types/activity.types';
import type { ActivityFormValues } from '@/validations/activity.schema';
import { ActivityFormFields, useActivityForm } from './ActivityFormFields';
import { ActivityTypeIcon } from './ActivityBadges';
import { activityToFormValues, formatActivityWhen } from './activityTime';
import { ActivityRepeatField, useActivityRepeat } from './ActivityRepeatField';
import { useSeriesScopePrompt } from './SeriesScopeDialog';
import { calendarRemovalNote } from './ActivitySyncStatus';
import { findCrmUser } from '@/services/masterData.store';
import { useAuth } from '@/context/AuthContext';

// ─── Single Source of Truth for Activity Form Tabs ────────────────────────────
export const ACTIVITY_FORM_TABS: (FormTabDefinition & { id: 'overview' })[] = [
    {
        id: 'overview',
        label: 'Overview',
        icon: <EventNoteOutlinedIcon sx={{ fontSize: 18 }} />,
    },
];

export { DEFAULT_ACTIVITY_FORM } from './ActivityFormFields';

export interface ActivityFormProps {
    mode?: 'create' | 'edit' | 'view';
    activityId?: string;
    /** Values a new activity starts with (e.g. from `/activities/new?type=…&start=…`). */
    initialData?: Partial<ActivityFormValues>;
    /** Where Cancel and a save lead back to (default: the activity list). */
    returnTo?: string;
    /** Called after a save instead of going back to the list (e.g. when opened from a drawer). */
    onSaved?: (activity: Activity) => void;
}

const lcName = (value: string | null | undefined) => (value ?? '').trim().toLowerCase();

/**
 * The save confirmation when a synced activity with invited guests changes owner (P2-3c, spec §14.5): the event moves
 * to the new owner's calendar, so its guests get a cancellation and a new invitation. '' = no confirmation needed.
 */
export function ownerChangeNote(activity: Activity | null | undefined, values: Pick<ActivityFormValues, 'assignedTo'>, viewer: string | null | undefined): string {
    const calendar = activity?.calendar;
    if (!activity || !calendar || calendar.invites !== 'send' || calendar.state === 'unsupported' || calendar.state === 'removed_remote') return '';
    if (!values.assignedTo || lcName(values.assignedTo) === lcName(activity.assignedTo)) return '';
    const guests = (activity.attendees ?? []).filter((a) => !(a.kind === 'user' && lcName(a.username) === lcName(activity.assignedTo)));
    if (guests.length === 0) return '';
    const newOwner = findCrmUser(values.assignedTo)?.name || values.assignedTo;
    // D41: invitations leave a mailbox only on its owner's action, so someone else's save holds them for the new owner.
    return lcName(values.assignedTo) === lcName(viewer)
        ? `Change the owner to you? The meeting moves to your calendar: attendees get a cancellation and a new invitation from you.`
        : `Change the owner to ${newOwner}? The meeting moves to ${newOwner}'s calendar: attendees get a cancellation now, and a new invitation from ${newOwner} once ${newOwner} sends it.`;
}

/** The line under Repeat for an occurrence of a series (how a save applies; what "after N times" counts). */
function seriesHint(activity: Activity): string {
    const counted = activity.series?.rule.ends === 'after' ? '. The number of times counts from the first event; "This and following" keeps the ones left' : '';
    return `Saving asks whether the change is for this event, the following ones or all${counted}`;
}

export default function ActivityForm({ mode = 'create', activityId, initialData, returnTo = ROUTES.ACTIVITIES, onSaved }: ActivityFormProps) {
    const router = useRouter();
    const { user } = useAuth();
    const { methods, toast, showToast, closeToast, createSubmitHandler, stepwise, clock, durationOf, activity, recordLoading, save } = useActivityForm({
        mode,
        activityId,
        prefill: initialData,
    });
    const { formState, control } = methods;
    const { isDirty, isSubmitting } = formState;
    const subject = useWatch({ control, name: 'subject' });
    const followupType = useWatch({ control, name: 'followupType' });
    // Recurring activities (Calendar Phase 4): the Repeat control and, for an occurrence, the scope of a save.
    const startAt = useWatch({ control, name: 'startAt' }) ?? '';
    const repeatState = useActivityRepeat(mode === 'create' ? undefined : activity, startAt.slice(0, 10));
    const scopePrompt = useSeriesScopePrompt();
    const canRepeat =
        followupType !== NOTE_TYPE && !isFollowUpActivity(activity) && (!activity || !activity.origin || activity.origin === 'crm') && !activity?.lockedFields?.includes('startAt');

    const canEdit = activity?.viewer?.canEdit ?? true;
    const breadcrumbs: BreadcrumbItem[] = [
        { label: 'Activities', href: ROUTES.ACTIVITIES },
        { label: mode === 'create' ? 'New Activity' : `${mode === 'view' ? 'View' : 'Edit'}: ${subject || 'Activity'}` },
    ];

    const submit = createSubmitHandler(async (values) => {
        const ownerChange = ownerChangeNote(activity, values, user?.username);
        if (ownerChange && !window.confirm(ownerChange)) return;
        const repeat = canRepeat ? repeatState.repeat : null;
        let recurrence: Parameters<typeof save>[1];
        if (mode === 'create') recurrence = repeat ? { repeat } : undefined;
        else if (activity?.seriesId) {
            const loadedDay = activityToFormValues(activity, activity.timeZone || clock.timeZone).startAt.slice(0, 10);
            const cancelling = values.status === 'Cancelled' && activity.status !== 'Cancelled';
            const scope = await scopePrompt.ask({
                action: cancelling ? 'cancel' : 'save',
                ruleChanged: repeatState.changed,
                dayMoved: (values.startAt ?? '').slice(0, 10) !== loadedDay,
                calendarNote: cancelling ? calendarRemovalNote(activity, user?.username, 'cancel').trim() : undefined,
            });
            if (!scope) return;
            recurrence = { scope, ...(repeatState.changed ? { repeat } : {}) };
        } else if (repeat) recurrence = { repeat };
        try {
            const saved = await save(values, recurrence);
            if (onSaved) {
                onSaved(saved);
                return;
            }
            setSaveFlash({
                listPath: ROUTES.ACTIVITIES,
                message: mode === 'create' ? 'Activity created successfully!' : 'Activity updated successfully!',
                severity: 'success',
                recordId: saved.id,
            });
            router.push(returnTo);
        } catch (err: unknown) {
            showToast(err instanceof Error ? err.message : 'Failed to save activity.', 'error');
        }
    });

    const when = activity ? formatActivityWhen(activity, activity.timeZone || clock.timeZone, clock.now()) : '';
    // A lead / opportunity follow-up activity (P2-4): its type, times, status, owner and related record move with the record.
    const lockedFields = mode === 'create' ? undefined : activity?.lockedFields;
    const record = activity?.relatedModule === 'opportunities' ? 'opportunity' : 'lead';
    const lockReason =
        activity && isFollowUpActivity(activity)
            ? activity.status === PLANNED_STATUS
                ? `The next follow-up of ${activity.relatedCode || `this ${record}`}. Its type, date, time, status and owner change on the ${record} (Record follow-up); the subject, location, attendees and remarks can be edited here.`
                : `Follow-up history of ${activity.relatedCode || `this ${record}`}: its type, times, status and owner are kept with the ${record}.`
            : lockedFields?.length
              ? 'Some fields of this activity can only change where it came from.'
              : undefined;

    return (
        <FormProvider {...methods}>
            <FormConfigProvider module="activities">
                <CommonFormLayout
                    loading={recordLoading}
                    isDirty={isDirty || (canRepeat && repeatState.changed)}
                    breadcrumbItems={breadcrumbs}
                    tabs={ACTIVITY_FORM_TABS}
                    activeTab="overview"
                    onCancel={() => router.push(returnTo)}
                    onSave={mode === 'view' ? () => router.push(ROUTES.ACTIVITY_EDIT(activityId!)) : submit}
                    submitting={isSubmitting}
                    saveLabel={mode === 'view' ? 'Edit Activity' : mode === 'edit' ? 'Update Activity' : 'Save Activity'}
                    saveDisabled={mode !== 'create' && !canEdit}
                    saveDisabledTooltip="Only the owner and their managers can change this activity."
                    stepwise={stepwise}
                    cancelLabel={mode === 'view' ? 'Back' : 'Cancel'}
                    recordView={{
                        title: subject || '',
                        subtitle: when || undefined,
                        avatarIcon: <ActivityTypeIcon type={followupType} sx={{ fontSize: 28, color: 'inherit' }} />,
                        editHref: activityId ? ROUTES.ACTIVITY_EDIT(activityId) : undefined,
                        editLabel: 'Edit Activity',
                        editDisabled: !canEdit,
                        editDisabledTooltip: 'Only the owner and their managers can change this activity.',
                        backHref: ROUTES.ACTIVITIES,
                        audit: activity
                            ? { createdAt: activity.createdAt, createdBy: activity.createdBy, updatedAt: activity.updatedAt, updatedBy: activity.updatedBy }
                            : undefined,
                    }}
                    mode={mode}
                    toast={<AppToast open={toast.open} message={toast.message} severity={toast.severity} onClose={closeToast} />}
                >
                    <ActivityFormFields
                        clock={clock}
                        durationOf={durationOf}
                        lockedFields={lockedFields}
                        lockReason={lockReason}
                        activityId={mode === 'create' ? undefined : activityId}
                        activity={mode === 'create' ? undefined : activity}
                        calendar={mode === 'create' ? null : activity?.calendar}
                        savedOwner={mode === 'create' ? undefined : activity?.assignedTo}
                        repeatSlot={
                            canRepeat ? (
                                <ActivityRepeatField
                                    value={repeatState.repeat}
                                    onChange={repeatState.setRepeat}
                                    startDay={startAt.slice(0, 10)}
                                    disabled={mode === 'view' || (mode !== 'create' && !canEdit)}
                                    hint={activity?.seriesId ? seriesHint(activity) : undefined}
                                />
                            ) : undefined
                        }
                    />
                    {scopePrompt.dialog}
                </CommonFormLayout>
            </FormConfigProvider>
        </FormProvider>
    );
}
