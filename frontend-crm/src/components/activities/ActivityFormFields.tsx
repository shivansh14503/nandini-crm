'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Box, Divider } from '@mui/material';
import { useFormContext, useWatch } from 'react-hook-form';
import EventNoteOutlinedIcon from '@mui/icons-material/EventNoteOutlined';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import RateReviewOutlinedIcon from '@mui/icons-material/RateReviewOutlined';

import {
    FIELD_MAX_LENGTH,
    FormGrid,
    FormGridItem,
    RhfAssignedUserCard,
    RhfCheckbox,
    RhfLookup,
    RhfSelect,
    RhfTextField,
    SectionLabel,
    useRhfForm,
    withDropdownDefaults,
} from '@/components/forms';
import { findCrmUser, getFormConfigs } from '@/services/masterData.store';
import { useAuth } from '@/context/AuthContext';
import { useOwnCalendarSync } from '@/components/integrations/useCalendarConnections';
import { useFormMode } from '@/context/FormModeContext';
import { DynamicModuleCustomFields } from '@/components/forms/DynamicModuleCustomFields';
import { activityResponseCategory, CUSTOMER_RESPONSES } from '@/components/forms/FollowUpDecision';
import { useDropdownOptionMeta, useFormConfigs, useModuleFormConfig } from '@/hooks/queries/useFormConfigs';
import { isActivityOnlyFollowupType } from '@/utils/followupTypes';
import { useMyPreferences } from '@/hooks/queries/useProfile';
import { activityService } from '@/services/activity.service';
import {
    ACTIVITY_NOT_APPLICABLE,
    ACTIVITY_REMINDERS,
    ACTIVITY_STATUSES,
    ACTIVITY_TYPES,
    isExternallyOrganized,
    NOTE_TYPE,
    PLANNED_STATUS,
    TASK_TYPE,
    type Activity,
    type ActivityCalendarState,
    type ActivityLinkTarget,
    type ActivityRelatedModule,
    type RepeatRule,
    type SeriesScope,
} from '@/types/activity.types';
import type { ExtendedOrganization } from '@/types/organization.types';
import type { Contact } from '@/types/contact.types';
import { activityFormRules, activityFormSchema, type ActivityFormValues } from '@/validations/activity.schema';
import { durationMinutesFor, nextQuarterHour, switchScheduleMode } from '@/utils/activitySchedule';
import { FOLLOWUP_TYPE_CATEGORY_KEY, NEVER_REQUIRED_FIELDS } from '@/utils/formConfig';
import { DEFAULT_REMINDER_NONE } from '@/utils/notificationPreferences';
import {
    addDays,
    addMinutesToWallClock,
    daysBetween,
    instantToZonedWallClock,
    isDay,
    isWallClock,
    wallClockMinutesBetween,
} from '@/utils/zonedTime';
import { activityToFormValues, formValuesToPayload, useBusinessClock, type BusinessClock } from './activityTime';
import { RhfScheduleField } from './RhfScheduleField';
import { RhfRelatedRecordField } from './RhfRelatedRecordField';
import { RhfAttendeesField } from './RhfAttendeesField';
import { ActivityBusyTimes } from './ActivityBusyTimes';
import { RhfVideoMeetingField, useTypeOffersVideo } from './VideoMeeting';
import { calendarProviderName } from './ActivitySyncStatus';

/** A blank activity (Start / End are filled in from the business clock when the form opens). */
export const DEFAULT_ACTIVITY_FORM: ActivityFormValues = {
    followupType: '',
    subject: '',
    status: PLANNED_STATUS,
    assignedTo: '',
    relatedModule: '',
    relatedId: '',
    relatedTo: '',
    organizationName: '',
    organizationId: '',
    contact: '',
    contactId: '',
    allDay: false,
    startAt: '',
    endAt: '',
    reminder: '',
    location: '',
    videoMeeting: '',
    attendees: [],
    customerResponse: '',
    remarks: '',
    customFields: {},
};

/**
 * A note in the quick-create dialog shows these (the type stays switchable), plus any field an admin made required.
 * Assigned to is left out: it starts as the signed-in user.
 */
const NOTE_COMPACT_FIELDS: ReadonlySet<string> = new Set(['followupType', 'subject', 'remarks', 'relatedTo']);

/** The record id each lookup's name is linked to: typing another name unlinks it. */
const LINKED_ID_FIELDS: Readonly<Record<string, 'organizationId' | 'contactId'>> = {
    organizationName: 'organizationId',
    contact: 'contactId',
};

/** The organization and contact a related record filled in. */
interface FilledLinks {
    /** The related record they came from ('' for none). */
    relatedId: string;
    organizationName: string;
    contact: string;
}

/**
 * What the related record filled in, as far as the form can tell: with a related record set (a prefill built from it,
 * or a saved activity), the organization and contact are taken as coming from it, so picking another related record
 * replaces them, as the API does when an update re-points Related To (`mergeActivityPatch`). Without one they are the
 * user's own.
 */
function linksFilledByRelated(values: Partial<ActivityFormValues>): FilledLinks {
    const relatedId = values.relatedId ?? '';
    if (!relatedId) return { relatedId, organizationName: '', contact: '' };
    return { relatedId, organizationName: values.organizationName ?? '', contact: values.contact ?? '' };
}

/** Default length (minutes) of each Followup Type: the API's meta, else the option's meta, else the fallback. */
export function useActivityDurations(clock: BusinessClock) {
    const getOptions = useModuleFormConfig('activities').getOptions;
    const optionMeta = useDropdownOptionMeta(FOLLOWUP_TYPE_CATEGORY_KEY);
    const durations = useMemo(() => {
        const fromOptions: Record<string, number> = {};
        for (const value of getOptions(FOLLOWUP_TYPE_CATEGORY_KEY, ACTIVITY_TYPES)) {
            const minutes = optionMeta(value)?.durationMinutes;
            if (typeof minutes === 'number') fromOptions[value] = minutes;
        }
        return { ...fromOptions, ...clock.meta?.durationMinutes };
    }, [getOptions, optionMeta, clock.meta]);
    const fallback = clock.meta?.fallbackDurationMinutes ?? 30;
    return useCallback((type: string) => durationMinutesFor(type, durations, fallback), [durations, fallback]);
}

/** A new activity's schedule: the prefill's, else the next quarter hour (plus the type's length). */
function initialSchedule(prefill: Partial<ActivityFormValues> | undefined, clock: BusinessClock, durationOf: (type: string) => number) {
    const allDay = Boolean(prefill?.allDay);
    const type = prefill?.followupType ?? '';
    if (allDay) {
        const today = instantToZonedWallClock(clock.now(), clock.timeZone).slice(0, 10);
        const startAt = prefill?.startAt && isDay(prefill.startAt.slice(0, 10)) ? prefill.startAt.slice(0, 10) : today;
        const endAt = prefill?.endAt && isDay(prefill.endAt.slice(0, 10)) && prefill.endAt.slice(0, 10) >= startAt ? prefill.endAt.slice(0, 10) : startAt;
        return { allDay, startAt, endAt };
    }
    const startAt = prefill?.startAt && isWallClock(prefill.startAt) ? prefill.startAt : nextQuarterHour(clock.now(), clock.timeZone);
    const endAt =
        prefill?.endAt && isWallClock(prefill.endAt) && prefill.endAt >= startAt
            ? prefill.endAt
            : addMinutesToWallClock(startAt, durationOf(type), clock.timeZone);
    return { allDay, startAt, endAt };
}

export interface UseActivityFormOptions {
    mode: 'create' | 'edit' | 'view';
    activityId?: string;
    /** Values a new activity starts with (query string, calendar slot, a record's Activities tab). */
    prefill?: Partial<ActivityFormValues>;
}

/**
 * The activity form's state (shared by the page form and the quick-create dialog): React Hook Form with the
 * activity schema, the admin's field rules (Followup Types that hide fields relax them) and the schedule rules
 * on the business clock; loads the record for edit / view and saves through the API.
 */
export function useActivityForm({ mode, activityId, prefill }: UseActivityFormOptions) {
    const clock = useBusinessClock();
    const durationOf = useActivityDurations(clock);
    // The user's own default reminder (My Profile › Notifications) for activities they create: over the admin's
    // default, under a prefilled one (`keep`). null / not loaded = the company default.
    const preferredReminder = useMyPreferences({ enabled: mode === 'create' }).data?.defaultReminder;
    const personal = useMemo(
        () => (preferredReminder == null ? undefined : { reminder: preferredReminder === DEFAULT_REMINDER_NONE ? '' : preferredReminder }),
        [preferredReminder]
    );
    const [initial] = useState<ActivityFormValues>(() => {
        const values = { ...DEFAULT_ACTIVITY_FORM, ...prefill };
        if (mode !== 'create') return values;
        // The End's default length follows the type the form opens with (the admin's default when none is given).
        const type = values.followupType || withDropdownDefaults(getFormConfigs(), 'activities', values, prefill).followupType;
        return { ...values, ...initialSchedule({ ...prefill, followupType: type }, clock, durationOf) };
    });
    // The schedule as loaded: an unchanged Planned start passes the past check (overdue activities stay editable).
    const [loadedSchedule, setLoadedSchedule] = useState<Pick<ActivityFormValues, 'allDay' | 'startAt'>>();

    const extraRules = useMemo(
        () => activityFormRules({ timeZone: clock.timeZone, now: clock.now, initial: () => loadedSchedule }),
        [clock, loadedSchedule]
    );
    const form = useRhfForm<ActivityFormValues>({
        schema: activityFormSchema,
        module: 'activities',
        defaultValues: initial,
        dropdownDefaults: { enabled: mode === 'create', keep: prefill, personal },
        assigneeField: 'assignedTo',
        // Video meeting is never required (it depends on the type and the owner's calendar: NEVER_REQUIRED_FIELDS).
        relaxedFields: (values) => [...(ACTIVITY_NOT_APPLICABLE[values.followupType] ?? []), ...(NEVER_REQUIRED_FIELDS.activities ?? [])],
        extraRules,
    });
    const { reset } = form.methods;

    const [activity, setActivity] = useState<Activity>();
    const [recordLoading, setRecordLoading] = useState(Boolean(activityId));
    useEffect(() => {
        if (!activityId) return;
        let active = true;
        activityService
            .getById(activityId)
            .then((found) => {
                if (!active || !found) return;
                const values = activityToFormValues(found, found.timeZone || clock.timeZone);
                setLoadedSchedule({ allDay: values.allDay, startAt: values.startAt });
                setActivity(found);
                reset(values);
            })
            .catch(() => {})
            .finally(() => {
                if (active) setRecordLoading(false);
            });
        return () => {
            active = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per record; the zone comes with it
    }, [activityId, reset]);

    /**
     * Creates or updates the activity from the form's values. Recurring activities (Calendar Phase 4): `repeat` is sent
     * when given (a rule, or null = stops repeating) and `scope` applies the edit to this / following / all occurrences.
     */
    const save = useCallback(
        async (values: ActivityFormValues, recurrence?: { repeat?: RepeatRule | null; scope?: SeriesScope }): Promise<Activity> => {
            const payload = formValuesToPayload(values, activity?.timeZone || clock.timeZone);
            const withRepeat = recurrence && recurrence.repeat !== undefined ? { ...payload, repeat: recurrence.repeat } : payload;
            const scoped = Boolean(recurrence && (recurrence.scope || recurrence.repeat !== undefined));
            const saved =
                mode === 'create' || !activityId
                    ? await activityService.create(withRepeat as Partial<typeof payload>)
                    : scoped
                      ? await activityService.updateScoped(activityId, withRepeat, recurrence?.scope ?? 'this')
                      : await activityService.update(activityId, payload);
            reset(values);
            return saved;
        },
        [activity?.timeZone, clock.timeZone, mode, activityId, reset]
    );

    return { ...form, clock, durationOf, activity, recordLoading, save };
}

/**
 * A field the API won't let anyone change on this activity (`Activity.lockedFields`: a lead / opportunity follow-up
 * activity's type, times, status, owner and related record move with the record; a meeting organized outside the CRM
 * takes its title, times, place, attendees and owner from the organizer's calendar, P2-8). Shown greyed out and `inert`
 * (no focus, no clicks, no typing); the title says why. Keeps `children`, so the Form Builder's field lookup still
 * finds the control inside.
 */
function LockedField({ locked, reason, children }: { locked: boolean; reason?: string; children: React.ReactNode }) {
    if (!locked) return <>{children}</>;
    return (
        <Box title={reason} sx={{ minWidth: 0, cursor: 'not-allowed' }}>
            <Box inert aria-disabled sx={{ opacity: 0.6, minWidth: 0 }}>
                {children}
            </Box>
        </Box>
    );
}

export interface ActivityFormFieldsProps {
    clock: BusinessClock;
    durationOf: (type: string) => number;
    /** The quick-create dialog: two columns; a note shows only Subject, Remarks and Related To (plus fields an admin requires). */
    compact?: boolean;
    /** Opens the related record (view mode) instead of following the link. */
    onOpenRelated?: (module: ActivityRelatedModule, id: string) => void;
    /** Fields the loaded activity locks (`Activity.lockedFields`): shown read only. */
    lockedFields?: readonly string[];
    /** Why they are locked (shown above the fields and on each one). */
    lockReason?: string;
    /** The activity being edited: its own block is left out of the busy times (it is the one moving). */
    activityId?: string;
    /** The loaded activity (edit / view): its saved video meeting, the Teams lock and the join link. */
    activity?: Activity;
    /** The loaded activity's copy in its owner's calendar (P2-3c): the Attendees field says where invitations come from. */
    calendar?: ActivityCalendarState | null;
    /** The loaded activity's saved owner (the calendar copy belongs to them). */
    savedOwner?: string;
    /** The Repeat control (Calendar Phase 4, ActivityRepeatField), shown in the Schedule section; omitted = none. */
    repeatSlot?: React.ReactNode;
}

const lcName = (value: string | null | undefined) => (value ?? '').trim().toLowerCase();

/**
 * The Attendees field's line on invitations (P2-3c, D41): who sends them and from which calendar. Undefined when the
 * owner isn't synced (or the form doesn't know yet).
 */
export function attendeesInvitationHint(args: {
    assignedTo: string;
    viewer: string | null | undefined;
    calendar?: ActivityCalendarState | null;
    savedOwner?: string;
    /** Creating: the viewer's own calendar provider when it is set up (ok / pending), else null. */
    ownProvider?: string | null;
}): string | undefined {
    const { assignedTo, viewer, calendar, savedOwner, ownProvider } = args;
    const mine = Boolean(assignedTo) && lcName(assignedTo) === lcName(viewer);
    if (calendar) {
        if (calendar.state === 'unsupported' || calendar.state === 'removed_remote' || lcName(assignedTo) !== lcName(savedOwner)) return undefined;
        const where = calendarProviderName(calendar.provider);
        const owner = findCrmUser(assignedTo)?.name || assignedTo;
        if (calendar.invites === 'withhold') {
            return mine
                ? `This is a private copy in your ${where}: guests are invited when you press Send invitations in the activity.`
                : `This is a private copy in ${owner}'s ${where}: guests are invited when ${owner} sends the invitations.`;
        }
        return mine ? `Invitations go out from your ${where}.` : `Guests you add wait for ${owner} to send the invitations from their ${where}.`;
    }
    if (ownProvider && mine) return `Invitations go out from your ${calendarProviderName(ownProvider)}.`;
    return undefined;
}

/**
 * The activity form's fields, Form Builder driven (`FormConfigProvider module="activities"`): one section per
 * seeded section, each control named after its field key. Fields a Followup Type doesn't use
 * (`ACTIVITY_NOT_APPLICABLE`) aren't rendered. Render inside the form's FormProvider.
 */
export function ActivityFormFields({
    clock,
    durationOf,
    compact = false,
    onOpenRelated,
    lockedFields,
    lockReason,
    activityId,
    activity,
    calendar,
    savedOwner,
    repeatSlot,
}: ActivityFormFieldsProps) {
    const { control, getValues, setValue, watch, getFieldState, trigger } = useFormContext<ActivityFormValues>();
    const formConfig = useModuleFormConfig('activities');
    const { getOptions } = formConfig;
    const followupType = useWatch({ control, name: 'followupType' }) ?? '';
    const relatedModule = useWatch({ control, name: 'relatedModule' }) ?? '';
    const allDay = Boolean(useWatch({ control, name: 'allDay' }));
    const status = useWatch({ control, name: 'status' }) ?? PLANNED_STATUS;
    const organizationId = useWatch({ control, name: 'organizationId' }) ?? '';
    // Busy times (P2-6): who and when, as the form has them now.
    const { mode: formMode } = useFormMode();
    const assignedTo = useWatch({ control, name: 'assignedTo' }) ?? '';
    const attendees = useWatch({ control, name: 'attendees' });
    const startAt = useWatch({ control, name: 'startAt' }) ?? '';
    const endAt = useWatch({ control, name: 'endAt' }) ?? '';
    const busyPeople = useMemo(
        () => [assignedTo, ...(attendees ?? []).filter((a) => a.kind === 'user' && a.username).map((a) => a.username as string)].filter(Boolean),
        [assignedTo, attendees]
    );
    const isTask = followupType === TASK_TYPE;
    const isNote = followupType === NOTE_TYPE;
    // Video meeting (P3-1): offered on types with option meta `videoMeeting`; a saved one stays shown either way.
    const typeOffersVideo = useTypeOffersVideo();
    const savedVideo = activity?.videoMeeting ?? '';
    const videoMeetingLocked = Boolean(activity?.conference?.locked);
    const videoMeeting = useWatch({ control, name: 'videoMeeting' }) ?? '';
    const offersVideo = typeOffersVideo(followupType);
    // Type meta comes with the form configuration: until it has loaded, no type "offers" video yet.
    const configsLoaded = useFormConfigs() !== null;
    // A new choice the type (or a logged status) can't have is dropped, so the save isn't refused for a hidden field.
    useEffect(() => {
        if (!configsLoaded) return;
        if (videoMeeting && videoMeeting !== savedVideo && (!offersVideo || status !== PLANNED_STATUS)) setValue('videoMeeting', '', { shouldDirty: true });
    }, [configsLoaded, videoMeeting, savedVideo, offersVideo, status, setValue]);
    // Where invitations come from (P2-3c): the saved activity's calendar copy, or (creating) the viewer's own calendar.
    const { user } = useAuth();
    const { data: ownSync } = useOwnCalendarSync(!activityId);
    const ownCalendar = ownSync?.calendar ?? null;
    const attendeesHint = attendeesInvitationHint({
        assignedTo,
        viewer: user?.username,
        calendar: activityId ? calendar : null,
        savedOwner,
        ownProvider: !activityId && ownCalendar && (ownCalendar.status === 'ok' || ownCalendar.status === 'pending') ? ownCalendar.provider : null,
    });

    const notApplicable = useMemo(() => new Set(ACTIVITY_NOT_APPLICABLE[followupType] ?? []), [followupType]);
    const locked = useMemo(() => new Set(lockedFields ?? []), [lockedFields]);
    const isLocked = (key: string) => locked.has(key);
    /** A note in the quick-create dialog is Subject + Remarks + Related To, plus whatever an admin made required. */
    const noteCompact = compact && isNote;
    const shows = (key: string) => {
        if (notApplicable.has(key)) return false;
        if (!noteCompact || NOTE_COMPACT_FIELDS.has(key)) return true;
        return key !== 'assignedTo' && Boolean(formConfig.getField(key)?.isRequired);
    };

    const tz = clock.timeZone;
    const nowWall = instantToZonedWallClock(clock.now(), tz);
    const allowPast = status !== PLANNED_STATUS;
    const touch = { shouldDirty: true, shouldValidate: true } as const;
    const dirty = { shouldDirty: true } as const;

    // ── Schedule ───────────────────────────────────────────────────────────────
    const revalidateEnd = () => {
        if (getFieldState('endAt').error) void trigger('endAt');
    };

    /** Start moved: End keeps the current length (or takes the type's default when there is none). */
    const handleStartChange = (next: string, previous: string) => {
        if (isTask) return;
        const end = getValues('endAt');
        if (allDay) {
            if (!isDay(next)) return;
            if (isDay(previous) && isDay(end)) setValue('endAt', addDays(end, daysBetween(previous, next)), touch);
            else if (!isDay(end) || end < next) setValue('endAt', next, touch);
        } else {
            if (!isWallClock(next)) return;
            const length = isWallClock(previous) && isWallClock(end) ? Math.max(0, wallClockMinutesBetween(previous, end, tz)) : durationOf(followupType);
            setValue('endAt', addMinutesToWallClock(next, length, tz), touch);
        }
        revalidateEnd();
    };

    /** A start picked on the busy-times strip: set as if typed into Start (End keeps the length). */
    const pickStart = (wall: string) => {
        const previous = getValues('startAt') ?? '';
        if (wall === previous) return;
        setValue('startAt', wall, touch);
        handleStartChange(wall, previous);
    };

    // The Followup Type the End's default length was worked out for (a loaded record's type is taken as is).
    const previousType = useRef(getValues('followupType') ?? '');
    // What the related record filled in (organization, contact): a later pick may replace those, never what the user
    // entered. Seeded from the prefill here and from a loaded record on reset below.
    const filledLinks = useRef<FilledLinks | null>(null);
    if (filledLinks.current === null) filledLinks.current = linksFilledByRelated(getValues());
    useEffect(() => {
        const { unsubscribe } = watch((values, { name, type }) => {
            const currentType = values.followupType ?? '';
            if (name === 'followupType') {
                // Picked by the user or set to the admin's default: an End that still holds the old type's default
                // length takes the new type's.
                const before = previousType.current;
                previousType.current = currentType;
                const start = values.startAt ?? '';
                const end = values.endAt ?? '';
                if (before === currentType || values.allDay || !isWallClock(start) || currentType === TASK_TYPE || currentType === NOTE_TYPE) return;
                if (!end || end === addMinutesToWallClock(start, durationOf(before), tz)) {
                    setValue('endAt', addMinutesToWallClock(start, durationOf(currentType), tz), dirty);
                }
                return;
            }
            // A record loaded (reset): its type is the reference from now on, and so are its links when it relates
            // to another record than the one they were worked out for.
            if (!name) {
                previousType.current = currentType;
                if ((values.relatedId ?? '') !== (filledLinks.current?.relatedId ?? '')) {
                    filledLinks.current = linksFilledByRelated(values as Partial<ActivityFormValues>);
                }
            }
            // All Day switched by the user: keep the days (timed → all-day) or start at 09:00 (all-day → timed).
            if (name === 'allDay' && type === 'change') {
                const next = switchScheduleMode(
                    { startAt: values.startAt ?? '', endAt: values.endAt ?? '' },
                    Boolean(values.allDay),
                    tz,
                    durationOf(values.followupType ?? ''),
                    nextQuarterHour(clock.now(), tz)
                );
                setValue('startAt', next.startAt, touch);
                setValue('endAt', next.endAt, touch);
                return;
            }
            // Typing another name into a lookup unlinks its record, so the API resolves the new name instead.
            const idField = name ? LINKED_ID_FIELDS[name] : undefined;
            if (type === 'change' && idField && getValues(idField)) setValue(idField, '', dirty);
        });
        return unsubscribe;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [watch, getValues, setValue, tz, durationOf, clock]);

    // ── Related record → organization / contact ───────────────────────────────
    // A pick fills the organization and contact that are empty or came from the previous related record (it clears
    // those when the new record has none); what the user entered stays.
    const handleRelatedPicked = (target: ActivityLinkTarget) => {
        const filled = (filledLinks.current ??= { relatedId: '', organizationName: '', contact: '' });
        filled.relatedId = target.id;
        const orgName = getValues('organizationName') ?? '';
        if (!orgName.trim() || orgName === filled.organizationName) {
            const next = target.organizationName ?? '';
            if (next || orgName) {
                setValue('organizationName', next, touch);
                setValue('organizationId', next ? (target.organizationId ?? '') : '', dirty);
            }
            filled.organizationName = next;
        }
        const contact = getValues('contact') ?? '';
        if (!contact.trim() || contact === filled.contact) {
            const next = target.contact ?? '';
            if (next || contact) {
                setValue('contact', next, touch);
                setValue('contactId', next ? (target.contactId ?? '') : '', dirty);
            }
            filled.contact = next;
        }
    };

    const handleOrganizationPicked = (org: ExtendedOrganization) => setValue('organizationId', org.id, dirty);
    const handleContactPicked = (contact: Contact) => {
        setValue('contactId', contact.id, dirty);
        if (contact.organizationName && !getValues('organizationName')?.trim()) {
            setValue('organizationName', contact.organizationName, touch);
            setValue('organizationId', contact.organizationId ?? '', dirty);
        }
    };

    const defaultTime = (day: string) => (day === nowWall.slice(0, 10) ? nextQuarterHour(clock.now(), tz).slice(11, 16) : '09:00');
    const columns = compact ? 2 : 3;
    // P2-8: a meeting organized outside the CRM can't become a Task / Note (the API answers 409 EXTERNAL_EVENT_LOCKED):
    // they would drop the times, place and attendees the organizer's calendar owns.
    const externallyOrganized = isExternallyOrganized(activity);
    const typeOptions = getOptions(FOLLOWUP_TYPE_CATEGORY_KEY, ACTIVITY_TYPES).filter(
        (value) => !externallyOrganized || !isActivityOnlyFollowupType(value) || value === activity?.followupType,
    );
    // Customer Response: the related lead's / opportunity's own list, else the Activities list. A saved value that list
    // no longer offers stays pickable, so opening the form never blanks it.
    const responseOptions = getOptions(activityResponseCategory(relatedModule), CUSTOMER_RESPONSES);
    const savedResponse = activity?.customerResponse ?? '';
    const customerResponseOptions = savedResponse && !responseOptions.includes(savedResponse) ? [...responseOptions, savedResponse] : responseOptions;
    const showSchedule = !isNote || ['startAt', 'endAt', 'allDay', 'reminder', 'location', 'videoMeeting', 'attendees'].some(shows);
    const showOutcome = shows('customerResponse') || shows('remarks');
    const divider = <Divider sx={{ my: compact ? 2.5 : 3.5, borderColor: 'var(--mui-palette-border-light)' }} />;

    return (
        <>
            {/* ── Activity Details ── */}
            {locked.size > 0 && lockReason && (
                <Alert severity="info" sx={{ mb: 2, fontSize: '0.82rem', alignItems: 'center' }}>
                    {lockReason}
                </Alert>
            )}
            <SectionLabel icon={<EventNoteOutlinedIcon sx={{ fontSize: 18 }} />} label="Activity Details" />
            <FormGrid columns={columns} sx={{ mt: 1 }}>
                <LockedField locked={isLocked('followupType')} reason={lockReason}>
                    <RhfSelect<ActivityFormValues> name="followupType" label="Followup Type" required options={typeOptions} placeholder="Select Followup Type" />
                </LockedField>
                {shows('subject') && (
                    <LockedField locked={isLocked('subject')} reason={lockReason}>
                        <RhfTextField<ActivityFormValues>
                            name="subject"
                            label="Subject"
                            required
                            maxLength={FIELD_MAX_LENGTH.title}
                            placeholder={isNote ? 'e.g. Pricing discussed with the owner' : 'e.g. Demo of TallyPrime Server'}
                        />
                    </LockedField>
                )}
                {shows('status') && (
                    <LockedField locked={isLocked('status')} reason={lockReason}>
                        <RhfSelect<ActivityFormValues>
                            name="status"
                            label="Status"
                            required
                            options={[...ACTIVITY_STATUSES]}
                            placeholder="Select Status"
                            hint={status === PLANNED_STATUS ? undefined : 'Past times allowed'}
                        />
                    </LockedField>
                )}
                {shows('assignedTo') && (
                    <LockedField locked={isLocked('assignedTo')} reason={lockReason}>
                        <RhfAssignedUserCard<ActivityFormValues> name="assignedTo" label="Assigned to" required roleBadge="" />
                    </LockedField>
                )}
                {shows('relatedTo') && (
                    <FormGridItem span={compact ? 'full' : 2}>
                        <LockedField locked={isLocked('relatedTo') || isLocked('relatedId')} reason={lockReason}>
                            <RhfRelatedRecordField name="relatedTo" label="Related To" onPicked={handleRelatedPicked} onOpenRecord={onOpenRelated} />
                        </LockedField>
                    </FormGridItem>
                )}
                {shows('organizationName') && (
                    <RhfLookup<ActivityFormValues, 'organization'>
                        name="organizationName"
                        label="Organization Name"
                        lookupType="organization"
                        onSelectRecord={handleOrganizationPicked}
                        onClearRecord={() => setValue('organizationId', '', dirty)}
                        placeholder="Search or select organization..."
                    />
                )}
                {shows('contact') && (
                    <RhfLookup<ActivityFormValues, 'contact'>
                        name="contact"
                        label="Contact"
                        lookupType="contact"
                        onSelectRecord={handleContactPicked}
                        onClearRecord={() => setValue('contactId', '', dirty)}
                        placeholder="Search or select contact..."
                    />
                )}
            </FormGrid>

            {/* ── Schedule ── (a note has none) */}
            {showSchedule && (
                <>
                    {divider}
                    <SectionLabel icon={<ScheduleOutlinedIcon sx={{ fontSize: 18 }} />} label="Schedule" />
                    <FormGrid columns={columns} sx={{ mt: 1 }}>
                        {shows('startAt') && (
                            <LockedField locked={isLocked('startAt')} reason={lockReason}>
                                <RhfScheduleField<ActivityFormValues>
                                    name="startAt"
                                    label="Start"
                                    required
                                    allDay={allDay}
                                    now={nowWall}
                                    allowPast={allowPast || isLocked('startAt')}
                                    defaultTime={defaultTime}
                                    onValueChange={handleStartChange}
                                />
                            </LockedField>
                        )}
                        {shows('endAt') && (
                            <LockedField locked={isLocked('endAt')} reason={lockReason}>
                                <RhfScheduleField<ActivityFormValues>
                                    name="endAt"
                                    label="End"
                                    allDay={allDay}
                                    now={nowWall}
                                    allowPast={allowPast || isLocked('endAt')}
                                    defaultTime={defaultTime}
                                    hint={allDay ? 'Last day' : undefined}
                                    onValueChange={revalidateEnd}
                                    sameDayAs="startAt"
                                />
                            </LockedField>
                        )}
                        {shows('allDay') && (
                            <LockedField locked={isLocked('allDay')} reason={lockReason}>
                                <RhfCheckbox<ActivityFormValues> name="allDay" label="All Day" alignWithInputs />
                            </LockedField>
                        )}
                        {shows('reminder') && (
                            <RhfSelect<ActivityFormValues>
                                name="reminder"
                                label="Reminder"
                                options={[...ACTIVITY_REMINDERS]}
                                placeholder="No reminder"
                                hint={allDay ? 'Counts back from 9:00 AM' : undefined}
                            />
                        )}
                        {shows('location') && (
                            <LockedField locked={isLocked('location')} reason={lockReason}>
                                <RhfTextField<ActivityFormValues>
                                    name="location"
                                    label="Location"
                                    maxLength={FIELD_MAX_LENGTH.address}
                                    placeholder="Address, meeting room or video link"
                                />
                            </LockedField>
                        )}
                        {shows('videoMeeting') && (offersVideo || Boolean(savedVideo)) && (
                            <RhfVideoMeetingField<ActivityFormValues>
                                name="videoMeeting"
                                owner={assignedTo}
                                saved={savedVideo}
                                savedOwner={activity?.assignedTo}
                                locked={videoMeetingLocked}
                                lockedReason={isLocked('videoMeeting') ? lockReason || 'This video meeting can only be changed where the meeting was organized.' : undefined}
                                planned={status === PLANNED_STATUS}
                                joinUrl={activity?.conferenceJoinUrl || null}
                            />
                        )}
                        {repeatSlot && !isNote && <FormGridItem span="full">{repeatSlot}</FormGridItem>}
                        {shows('attendees') && (
                            <FormGridItem span="full">
                                <LockedField locked={isLocked('attendees')} reason={lockReason}>
                                    <RhfAttendeesField name="attendees" label="Attendees" organizationId={organizationId} hint={attendeesHint} />
                                </LockedField>
                            </FormGridItem>
                        )}
                        {/* Busy times of the owner and invited colleagues (timed, planned meetings; not Tasks or Notes). */}
                        {shows('startAt') && !allDay && !isTask && !isNote && status === PLANNED_STATUS && busyPeople.length > 0 && (
                            <FormGridItem span="full">
                                <ActivityBusyTimes
                                    people={busyPeople}
                                    startAt={startAt}
                                    endAt={endAt}
                                    timeZone={tz}
                                    now={clock.now}
                                    excludeId={activityId}
                                    onPickStart={pickStart}
                                    collapsible={compact}
                                    readOnly={isLocked('startAt') || formMode === 'view'}
                                />
                            </FormGridItem>
                        )}
                    </FormGrid>
                </>
            )}

            {/* ── Outcome & Notes ── */}
            {showOutcome && (
                <>
                    {divider}
                    <SectionLabel icon={<RateReviewOutlinedIcon sx={{ fontSize: 18 }} />} label="Outcome & Notes" />
                    <FormGrid columns={columns} sx={{ mt: 1 }}>
                        {shows('customerResponse') && (
                            <RhfSelect<ActivityFormValues>
                                name="customerResponse"
                                label="Customer Response"
                                options={customerResponseOptions}
                                placeholder="Select Customer Response"
                            />
                        )}
                        {shows('remarks') && (
                            <FormGridItem span="full">
                                <RhfTextField<ActivityFormValues>
                                    name="remarks"
                                    label="Remarks"
                                    required={isNote}
                                    multiline
                                    minRows={compact ? 3 : 4}
                                    maxLength={FIELD_MAX_LENGTH.longText}
                                    placeholder={isNote ? 'What was discussed or decided...' : 'Agenda, outcome, next steps...'}
                                />
                            </FormGridItem>
                        )}
                    </FormGrid>
                </>
            )}
            {!noteCompact && <DynamicModuleCustomFields module="activities" tabKey="overview" sx={{ px: 0, pb: 0, mt: compact ? 2.5 : 3.5 }} />}
        </>
    );
}
