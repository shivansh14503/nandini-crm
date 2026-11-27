'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Autocomplete,
    Box,
    Button,
    Checkbox,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControlLabel,
    IconButton,
    MenuItem,
    Switch,
    TextField,
    Typography,
    useMediaQuery,
    useTheme,
} from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { useQuery } from '@tanstack/react-query';
import { errorMessage, inputSx, primaryButtonSx, secondaryButtonSx } from '@/components/settings/form-customization/builderUi';
import { fieldErrorsOf } from '@/components/settings/integrations/integrationUi';
import { useTypeOffersVideo } from '@/components/activities/VideoMeeting';
import { useVideoOptions } from '@/hooks/queries/useActivities';
import { useCreateBookingLink, useUpdateBookingLink } from '@/hooks/queries/useBookingLinks';
import { useDropdownOptionLabel, useDropdownOptions } from '@/hooks/queries/useFormConfigs';
import { useMasterData } from '@/hooks/queries/useMasterData';
import { queryKeys } from '@/hooks/queries/queryKeys';
import { activityService } from '@/services/activity.service';
import { getBusinessTimeZone } from '@/utils/formats';
import { FOLLOWUP_TYPE_CATEGORY_KEY } from '@/utils/formConfig';
import { FOLLOWUP_TYPES } from '@/types/lead.types';
import {
    ACTIVITY_RELATED_MODULES,
    ACTIVITY_RELATED_MODULE_LABELS,
    ACTIVITY_REMINDERS,
    NOTE_TYPE,
    TASK_TYPE,
    VIDEO_PROVIDER_LABELS,
    isActivityRelatedModule,
    type ActivityLinkTarget,
} from '@/types/activity.types';
import {
    BOOKING_LOCATION_MAX,
    BOOKING_MAX_DURATIONS,
    BOOKING_MAX_HORIZON_DAYS,
    BOOKING_MAX_PER_DAY,
    BOOKING_NOTE_MAX,
    BOOKING_SLOT_STEPS,
    BOOKING_TITLE_MAX,
    BOOKING_VIDEO_PROVIDERS,
    durationLabel,
    type BookingLink,
    type BookingLinkPayload,
    type BookingVideoProvider,
    type WeeklyAvailability,
} from '@/types/bookingLink.types';
import { AvailabilityEditor, availabilityIssues } from './AvailabilityEditor';
import { LongTextInput } from '@/components/forms/LongTextInput';

const DURATION_CHOICES = [15, 20, 30, 45, 60, 90, 120, 180, 240];
const BUFFER_CHOICES = [0, 5, 10, 15, 30, 45, 60, 90, 120];
const NOTICE_CHOICES: { value: number; label: string }[] = [
    { value: 0, label: 'No minimum' },
    { value: 30, label: '30 minutes' },
    { value: 60, label: '1 hour' },
    { value: 120, label: '2 hours' },
    { value: 240, label: '4 hours' },
    { value: 480, label: '8 hours' },
    { value: 1440, label: '1 day' },
    { value: 2880, label: '2 days' },
    { value: 10080, label: '1 week' },
];
const NO_REMINDER = '__none__';
const NO_VIDEO = '__none__';

const DEFAULT_AVAILABILITY: WeeklyAvailability = Object.fromEntries(
    ['1', '2', '3', '4', '5'].map((d) => [d, [{ start: '10:00', end: '13:00' }, { start: '14:00', end: '18:00' }]]),
) as WeeklyAvailability;

interface Draft {
    ownerUsername: string;
    title: string;
    followupType: string;
    durations: number[];
    slotStepMinutes: number;
    location: string;
    /** '' = none. */
    videoMeeting: BookingVideoProvider | '';
    note: string;
    availability: WeeklyAvailability;
    bufferBeforeMinutes: number;
    bufferAfterMinutes: number;
    minNoticeMinutes: number;
    horizonDays: string;
    maxPerDay: string;
    reminder: string;
    askPhone: boolean;
    askCompany: boolean;
    relatedModule: string;
    related: { id: string; label: string } | null;
    isActive: boolean;
}

function draftOf(link: BookingLink | null, me: string): Draft {
    if (!link) {
        return {
            ownerUsername: me,
            title: '',
            followupType: 'Meeting',
            durations: [30],
            slotStepMinutes: 30,
            location: '',
            videoMeeting: '',
            note: '',
            availability: DEFAULT_AVAILABILITY,
            bufferBeforeMinutes: 0,
            bufferAfterMinutes: 10,
            minNoticeMinutes: 240,
            horizonDays: '30',
            maxPerDay: '',
            reminder: '15 minutes before',
            askPhone: false,
            askCompany: true,
            relatedModule: '',
            related: null,
            isActive: true,
        };
    }
    return {
        ownerUsername: link.ownerUsername,
        title: link.title,
        followupType: link.followupType,
        durations: link.durations,
        slotStepMinutes: link.slotStepMinutes,
        location: link.location,
        videoMeeting: link.videoMeeting ?? '',
        note: link.note,
        availability: link.availability,
        bufferBeforeMinutes: link.bufferBeforeMinutes,
        bufferAfterMinutes: link.bufferAfterMinutes,
        minNoticeMinutes: link.minNoticeMinutes,
        horizonDays: String(link.horizonDays),
        maxPerDay: link.maxPerDay === null ? '' : String(link.maxPerDay),
        reminder: link.reminder ?? NO_REMINDER,
        askPhone: link.askPhone,
        askCompany: link.askCompany,
        relatedModule: link.relatedModule ?? '',
        related: link.relatedId ? { id: link.relatedId, label: [link.relatedCode, link.relatedLabel].filter(Boolean).join(' · ') || link.relatedId } : null,
        isActive: link.isActive,
    };
}

const sectionTitleSx = { fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--mui-palette-text-secondary)', mt: 1 } as const;
const twoColSx = { display: 'grid', gridTemplateColumns: { xs: 'minmax(0,1fr)', sm: 'repeat(2, minmax(0,1fr))' }, gap: 1.5 } as const;

/**
 * Default video meeting of booked meetings: None / Google Meet / Microsoft Teams (Zoom is never offered on links). The
 * choices follow the link OWNER's company calendar (GET /api/activities/video-options?owner=); ones it can't make are
 * disabled with the reason under the field; when the check itself fails, all stay selectable and the API decides. The
 * saved choice stays selectable (re-saving it is allowed even when the calendar or the type changed since; the booking
 * then goes without a link and notes why). The API checks again (409 VIDEO_PROVIDER_NOT_CONNECTED).
 */
function VideoMeetingSelect({
    owner,
    ownerName,
    typeLabel,
    typeOffersVideo,
    value,
    saved,
    error,
    disabled,
    onChange,
}: {
    owner: string;
    ownerName: string;
    typeLabel: string;
    typeOffersVideo: boolean;
    value: BookingVideoProvider | '';
    saved: BookingVideoProvider | '';
    error: string;
    disabled?: boolean;
    onChange: (value: BookingVideoProvider | '') => void;
}) {
    const { data, isLoading, isError } = useVideoOptions(owner, { enabled: Boolean(owner) && typeOffersVideo });
    const available = useMemo(() => new Set((data?.options ?? []).filter((o) => o.available).map((o) => o.value)), [data]);
    const reasonOf = (provider: BookingVideoProvider) => data?.options.find((o) => o.value === provider)?.reason;
    // The owner's calendar couldn't be read (and nothing is cached): leave the choices open, the API's 409 decides.
    const unchecked = isError && !data;
    const selectable = (provider: BookingVideoProvider) => typeOffersVideo && (unchecked || available.has(provider) || provider === saved);
    const firstReason = BOOKING_VIDEO_PROVIDERS.map(reasonOf).find(Boolean);

    let hint: string;
    if (!typeOffersVideo) {
        hint = value
            ? `Video meetings aren't offered for ${typeLabel} any more, so booked meetings get no link. Choose None.`
            : `Video meetings aren't offered for ${typeLabel}. An admin can switch them on in Admin › API Integrations › What goes to calendars.`;
    } else if (isLoading) {
        hint = 'Checking the owner’s calendar…';
    } else if (unchecked) {
        hint = 'Couldn’t check the owner’s calendar. You can still save; the server checks again.';
    } else if (value && !available.has(value)) {
        hint = `${reasonOf(value) ?? ''} Booked meetings get no link until this is fixed; choose another option or None.`.trim();
    } else if (value) {
        hint = `Each booked meeting gets a ${VIDEO_PROVIDER_LABELS[value]} link from ${ownerName}'s calendar; the page says ${ownerName} sends it.`;
    } else {
        hint = available.size === 0 && firstReason ? firstReason : 'Booked meetings get no video link.';
    }

    return (
        <TextField
            select
            size="small"
            label="Video meeting"
            value={value || NO_VIDEO}
            onChange={(e) => onChange(e.target.value === NO_VIDEO ? '' : (e.target.value as BookingVideoProvider))}
            disabled={disabled || (!typeOffersVideo && !value)}
            error={Boolean(error)}
            helperText={error || hint}
            sx={inputSx}
        >
            <MenuItem value={NO_VIDEO}>None</MenuItem>
            {BOOKING_VIDEO_PROVIDERS.map((p) => (
                <MenuItem key={p} value={p} disabled={!selectable(p)} sx={{ whiteSpace: 'normal' }}>
                    {VIDEO_PROVIDER_LABELS[p]}
                    {!selectable(p) && typeOffersVideo && !isLoading && !unchecked ? ' (not available for this owner)' : ''}
                </MenuItem>
            ))}
        </TextField>
    );
}

/** Related record picker (records the user may see), the same source as an activity's Related To. */
function RelatedPicker({ module, value, onChange, disabled }: { module: string; value: Draft['related']; onChange: (v: Draft['related']) => void; disabled?: boolean }) {
    const [input, setInput] = useState('');
    const [search, setSearch] = useState('');
    useEffect(() => {
        const t = window.setTimeout(() => setSearch(input.trim()), 250);
        return () => window.clearTimeout(t);
    }, [input]);
    const enabled = isActivityRelatedModule(module);
    const { data = [], isFetching } = useQuery<ActivityLinkTarget[]>({
        queryKey: [...queryKeys.activities.all, 'link-targets', module, search],
        queryFn: () => activityService.linkTargets({ module: module as never, search: search || undefined, limit: 20 }),
        enabled,
        staleTime: 30_000,
    });
    const options = data.map((t) => ({ id: t.id, label: [t.code, t.label].filter(Boolean).join(' · ') }));
    return (
        <Autocomplete
            size="small"
            disabled={disabled || !enabled}
            options={options}
            value={value}
            onChange={(_, v) => onChange(v)}
            inputValue={input}
            onInputChange={(_, v) => setInput(v)}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            getOptionLabel={(o) => o.label}
            filterOptions={(x) => x}
            loading={isFetching}
            noOptionsText={enabled ? 'No records found' : 'Pick a record type first'}
            renderInput={(params) => (
                <TextField
                    {...params}
                    label="Record"
                    sx={inputSx}
                    slotProps={{
                        ...params.slotProps,
                        input: {
                            ...params.slotProps.input,
                            endAdornment: (
                                <>
                                    {isFetching ? <CircularProgress size={16} /> : null}
                                    {params.slotProps.input.endAdornment}
                                </>
                            ),
                        },
                    }}
                />
            )}
        />
    );
}

/**
 * Create or edit a booking link. Admins creating one may pick a colleague as the owner. Mount with a `key` per link so
 * it starts fresh. Full screen on phones; the content scrolls inside.
 */
export function BookingLinkDialog({
    open,
    link,
    me,
    isAdmin,
    onClose,
    onSaved,
}: {
    open: boolean;
    link: BookingLink | null;
    me: string;
    isAdmin: boolean;
    onClose: () => void;
    onSaved: (link: BookingLink, created: boolean) => void;
}) {
    const theme = useTheme();
    const phone = useMediaQuery(theme.breakpoints.down('sm'));
    const [draft, setDraft] = useState<Draft>(() => draftOf(link, me));
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [formError, setFormError] = useState('');
    const create = useCreateBookingLink();
    const update = useUpdateBookingLink();
    const saving = create.isPending || update.isPending;
    const timeZone = getBusinessTimeZone();

    const allTypes = useDropdownOptions(FOLLOWUP_TYPE_CATEGORY_KEY, FOLLOWUP_TYPES, 'activities');
    const typeLabel = useDropdownOptionLabel(FOLLOWUP_TYPE_CATEGORY_KEY);
    const types = useMemo(() => {
        const list = allTypes.filter((t) => t !== TASK_TYPE && t !== NOTE_TYPE);
        return draft.followupType && !list.includes(draft.followupType) ? [draft.followupType, ...list] : list;
    }, [allTypes, draft.followupType]);
    const { users } = useMasterData();
    const owners = useMemo(() => users.filter((u) => u.status === 'Active' && !u.isGroupUser).sort((a, b) => (a.name || a.username).localeCompare(b.name || b.username)), [users]);
    const offersVideo = useTypeOffersVideo();
    const typeOffersVideo = offersVideo(draft.followupType);
    const ownerName = (link && draft.ownerUsername === link.ownerUsername ? link.ownerName : owners.find((u) => u.username === draft.ownerUsername)?.name) || draft.ownerUsername;

    const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
    const toggleDuration = (m: number) =>
        setDraft((d) => {
            if (d.durations.includes(m)) return d.durations.length === 1 ? d : { ...d, durations: d.durations.filter((x) => x !== m) };
            if (d.durations.length >= BOOKING_MAX_DURATIONS) return d;
            return { ...d, durations: [...d.durations, m].sort((a, b) => a - b) };
        });

    const horizon = Number(draft.horizonDays);
    const maxPerDay = draft.maxPerDay.trim() === '' ? null : Number(draft.maxPerDay);
    const localErrors: Record<string, string> = {};
    if (!draft.title.trim()) localErrors.title = 'Title is required.';
    if (!Number.isInteger(horizon) || horizon < 1 || horizon > BOOKING_MAX_HORIZON_DAYS) localErrors.horizonDays = `1 to ${BOOKING_MAX_HORIZON_DAYS} days.`;
    if (maxPerDay !== null && (!Number.isInteger(maxPerDay) || maxPerDay < 1 || maxPerDay > BOOKING_MAX_PER_DAY)) localErrors.maxPerDay = `Blank, or 1 to ${BOOKING_MAX_PER_DAY}.`;
    if (draft.relatedModule && !draft.related) localErrors.relatedId = 'Pick a record, or clear the record type.';
    const weekIssues = availabilityIssues(draft.availability);
    const hasLocalErrors = Object.keys(localErrors).length > 0 || Boolean(weekIssues.week) || Object.keys(weekIssues.days).length > 0;
    const errorOf = (key: string) => fieldErrors[key] || localErrors[key] || '';

    const submit = async () => {
        setFieldErrors({});
        setFormError('');
        if (hasLocalErrors) return;
        const payload: Omit<BookingLinkPayload, 'ownerUsername'> = {
            title: draft.title.trim(),
            followupType: draft.followupType,
            durations: draft.durations,
            slotStepMinutes: draft.slotStepMinutes,
            location: draft.location.trim() || null,
            videoMeeting: draft.videoMeeting || null,
            note: draft.note.trim() || null,
            availability: draft.availability,
            bufferBeforeMinutes: draft.bufferBeforeMinutes,
            bufferAfterMinutes: draft.bufferAfterMinutes,
            minNoticeMinutes: draft.minNoticeMinutes,
            horizonDays: horizon,
            maxPerDay,
            reminder: draft.reminder === NO_REMINDER ? null : draft.reminder,
            askPhone: draft.askPhone,
            askCompany: draft.askCompany,
            relatedModule: draft.relatedModule || null,
            relatedId: draft.relatedModule ? (draft.related?.id ?? null) : null,
            isActive: draft.isActive,
        };
        try {
            if (link) onSaved(await update.mutateAsync({ id: link.id, payload }), false);
            else onSaved(await create.mutateAsync({ ...payload, ...(isAdmin && draft.ownerUsername && draft.ownerUsername !== me ? { ownerUsername: draft.ownerUsername } : {}) }), true);
        } catch (err) {
            const fields = fieldErrorsOf(err);
            setFieldErrors(fields);
            setFormError(Object.keys(fields).length ? 'Please fix the highlighted fields.' : errorMessage(err, 'Could not save the booking link.'));
        }
    };

    return (
        <Dialog
            open={open}
            onClose={saving ? undefined : onClose}
            fullScreen={phone}
            maxWidth="md"
            fullWidth
            slotProps={{ paper: { sx: { borderRadius: phone ? 0 : '12px', backgroundColor: 'var(--mui-palette-background-paper)' } } }}
        >
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1, fontSize: '1rem', fontWeight: 700, color: 'var(--crm-slate-900)', borderBottom: '1px solid var(--mui-palette-border-main)' }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>{link ? 'Edit booking link' : 'New booking link'}</Box>
                <IconButton
                    onClick={onClose}
                    disabled={saving}
                    aria-label="Close"
                    sx={{ width: 40, height: 40, color: 'var(--mui-palette-text-secondary)', '&:hover': { color: 'var(--mui-palette-error-main)', backgroundColor: 'var(--mui-palette-error-soft)' } }}
                >
                    <CloseRoundedIcon fontSize="small" />
                </IconButton>
            </DialogTitle>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pt: '16px !important', px: { xs: 2, sm: 3 } }}>
                {formError && <Alert severity="error">{formError}</Alert>}

                <Typography sx={sectionTitleSx}>What visitors book</Typography>
                {isAdmin && !link && (
                    <TextField select size="small" label="Owner" value={draft.ownerUsername} onChange={(e) => set('ownerUsername', e.target.value)} sx={inputSx} error={Boolean(errorOf('ownerUsername'))} helperText={errorOf('ownerUsername') || 'Whose calendar is offered and who gets the meetings.'}>
                        {!owners.some((u) => u.username === draft.ownerUsername) && <MenuItem value={draft.ownerUsername}>{draft.ownerUsername}</MenuItem>}
                        {owners.map((u) => (
                            <MenuItem key={u.username} value={u.username}>
                                {u.name || u.username}
                            </MenuItem>
                        ))}
                    </TextField>
                )}
                <Box sx={twoColSx}>
                    <TextField
                        size="small"
                        label="Title"
                        required
                        value={draft.title}
                        onChange={(e) => set('title', e.target.value)}
                        slotProps={{ htmlInput: { maxLength: BOOKING_TITLE_MAX } }}
                        error={Boolean(errorOf('title'))}
                        helperText={errorOf('title') || 'Shown on the page, e.g. "Product demo".'}
                        sx={inputSx}
                    />
                    <TextField
                        select
                        size="small"
                        label="Activity type"
                        value={draft.followupType}
                        // A type without video meetings drops the choice (the API would refuse it for the new type).
                        onChange={(e) => setDraft((d) => ({ ...d, followupType: e.target.value, videoMeeting: offersVideo(e.target.value) ? d.videoMeeting : '' }))}
                        sx={inputSx}
                        error={Boolean(errorOf('followupType'))}
                        helperText={errorOf('followupType') || ' '}
                    >
                        {types.map((t) => (
                            <MenuItem key={t} value={t}>
                                {typeLabel(t) || t}
                            </MenuItem>
                        ))}
                    </TextField>
                </Box>
                <Box>
                    <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--crm-slate-700)', mb: 0.75 }}>Durations (up to {BOOKING_MAX_DURATIONS}; the first is the default)</Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                        {DURATION_CHOICES.map((m) => {
                            const on = draft.durations.includes(m);
                            return (
                                <Chip
                                    key={m}
                                    label={durationLabel(m)}
                                    onClick={() => toggleDuration(m)}
                                    variant="outlined"
                                    aria-pressed={on}
                                    sx={{
                                        height: 34,
                                        fontSize: '0.8rem',
                                        fontWeight: on ? 700 : 500,
                                        borderColor: on ? 'var(--mui-palette-primary-softBorder)' : 'var(--mui-palette-border-main)',
                                        backgroundColor: on ? 'var(--mui-palette-primary-soft)' : 'var(--mui-palette-background-paper)',
                                        color: on ? 'var(--crm-text-blue-900)' : 'var(--crm-slate-700)',
                                        '&:hover': { borderColor: 'var(--crm-blue-300)', color: 'var(--crm-text-blue-700)' },
                                    }}
                                />
                            );
                        })}
                    </Box>
                    {errorOf('durations') && <Typography sx={{ fontSize: '0.74rem', color: 'var(--mui-palette-error-main)', mt: 0.5 }}>{errorOf('durations')}</Typography>}
                </Box>
                <Box sx={twoColSx}>
                    <TextField
                        size="small"
                        label="Location or how to join"
                        value={draft.location}
                        onChange={(e) => set('location', e.target.value)}
                        slotProps={{ htmlInput: { maxLength: BOOKING_LOCATION_MAX } }}
                        helperText={errorOf('location') || 'An address or a phone number. For a Meet / Teams link, use Video meeting.'}
                        error={Boolean(errorOf('location'))}
                        sx={inputSx}
                    />
                    <VideoMeetingSelect
                        owner={draft.ownerUsername}
                        ownerName={ownerName}
                        typeLabel={typeLabel(draft.followupType) || draft.followupType}
                        typeOffersVideo={typeOffersVideo}
                        value={draft.videoMeeting}
                        saved={link && draft.followupType === link.followupType ? (link.videoMeeting ?? '') : ''}
                        error={errorOf('videoMeeting')}
                        disabled={saving}
                        onChange={(v) => set('videoMeeting', v)}
                    />
                    <TextField select size="small" label="Reminder for you" value={draft.reminder} onChange={(e) => set('reminder', e.target.value)} sx={inputSx} helperText=" ">
                        <MenuItem value={NO_REMINDER}>No reminder</MenuItem>
                        {ACTIVITY_REMINDERS.map((r) => (
                            <MenuItem key={r} value={r}>
                                {r}
                            </MenuItem>
                        ))}
                    </TextField>
                </Box>
                <LongTextInput
                    label="Note for visitors"
                    inputLabel="Note for visitors"
                    value={draft.note}
                    onChange={(value) => set('note', value)}
                    maxLength={BOOKING_NOTE_MAX}
                    helperText="Shown above the times (what to prepare, what the meeting covers)."
                    error={errorOf('note')}
                />

                <Typography sx={sectionTitleSx}>When</Typography>
                <AvailabilityEditor value={draft.availability} onChange={(v) => set('availability', v)} timeZone={timeZone} disabled={saving} />
                {errorOf('availability') && <Typography sx={{ fontSize: '0.74rem', color: 'var(--mui-palette-error-main)' }}>{errorOf('availability')}</Typography>}
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0,1fr)', sm: 'repeat(2, minmax(0,1fr))', md: 'repeat(3, minmax(0,1fr))' }, gap: 1.5, mt: 0.5 }}>
                    <TextField select size="small" label="Start times every" value={draft.slotStepMinutes} onChange={(e) => set('slotStepMinutes', Number(e.target.value))} sx={inputSx}>
                        {BOOKING_SLOT_STEPS.map((s) => (
                            <MenuItem key={s} value={s}>
                                {durationLabel(s)}
                            </MenuItem>
                        ))}
                    </TextField>
                    <TextField select size="small" label="Free time before" value={draft.bufferBeforeMinutes} onChange={(e) => set('bufferBeforeMinutes', Number(e.target.value))} sx={inputSx}>
                        {BUFFER_CHOICES.map((b) => (
                            <MenuItem key={b} value={b}>
                                {b === 0 ? 'None' : durationLabel(b)}
                            </MenuItem>
                        ))}
                    </TextField>
                    <TextField select size="small" label="Free time after" value={draft.bufferAfterMinutes} onChange={(e) => set('bufferAfterMinutes', Number(e.target.value))} sx={inputSx}>
                        {BUFFER_CHOICES.map((b) => (
                            <MenuItem key={b} value={b}>
                                {b === 0 ? 'None' : durationLabel(b)}
                            </MenuItem>
                        ))}
                    </TextField>
                    <TextField select size="small" label="Minimum notice" value={draft.minNoticeMinutes} onChange={(e) => set('minNoticeMinutes', Number(e.target.value))} sx={inputSx}>
                        {(NOTICE_CHOICES.some((n) => n.value === draft.minNoticeMinutes) ? NOTICE_CHOICES : [...NOTICE_CHOICES, { value: draft.minNoticeMinutes, label: `${draft.minNoticeMinutes} minutes` }]).map((n) => (
                            <MenuItem key={n.value} value={n.value}>
                                {n.label}
                            </MenuItem>
                        ))}
                    </TextField>
                    <TextField
                        size="small"
                        label="Days ahead"
                        type="number"
                        value={draft.horizonDays}
                        onChange={(e) => set('horizonDays', e.target.value)}
                        slotProps={{ htmlInput: { min: 1, max: BOOKING_MAX_HORIZON_DAYS, inputMode: 'numeric' } }}
                        error={Boolean(errorOf('horizonDays'))}
                        helperText={errorOf('horizonDays') || ' '}
                        sx={inputSx}
                    />
                    <TextField
                        size="small"
                        label="Bookings a day (blank = no limit)"
                        type="number"
                        value={draft.maxPerDay}
                        onChange={(e) => set('maxPerDay', e.target.value)}
                        slotProps={{ htmlInput: { min: 1, max: BOOKING_MAX_PER_DAY, inputMode: 'numeric' } }}
                        error={Boolean(errorOf('maxPerDay'))}
                        helperText={errorOf('maxPerDay') || ' '}
                        sx={inputSx}
                    />
                </Box>

                <Typography sx={sectionTitleSx}>Questions</Typography>
                <Typography sx={{ fontSize: '0.78rem', color: 'var(--mui-palette-text-secondary)' }}>Name and email are always asked; visitors can add a message.</Typography>
                <Box sx={{ display: 'flex', gap: { xs: 0, sm: 3 }, flexWrap: 'wrap' }}>
                    <FormControlLabel control={<Checkbox size="small" checked={draft.askPhone} onChange={(e) => set('askPhone', e.target.checked)} />} label={<Typography sx={{ fontSize: '0.84rem' }}>Ask for a phone number</Typography>} sx={{ minHeight: 40 }} />
                    <FormControlLabel control={<Checkbox size="small" checked={draft.askCompany} onChange={(e) => set('askCompany', e.target.checked)} />} label={<Typography sx={{ fontSize: '0.84rem' }}>Ask for a company</Typography>} sx={{ minHeight: 40 }} />
                </Box>

                <Typography sx={sectionTitleSx}>Related record (optional)</Typography>
                <Typography sx={{ fontSize: '0.78rem', color: 'var(--mui-palette-text-secondary)' }}>
                    Every booked meeting is linked to this record. Leave it empty to link a matching contact (by email) instead.
                </Typography>
                <Box sx={twoColSx}>
                    <TextField
                        select
                        size="small"
                        label="Record type"
                        value={draft.relatedModule}
                        onChange={(e) => setDraft((d) => ({ ...d, relatedModule: e.target.value, related: null }))}
                        sx={inputSx}
                    >
                        <MenuItem value="">None</MenuItem>
                        {ACTIVITY_RELATED_MODULES.map((m) => (
                            <MenuItem key={m} value={m}>
                                {ACTIVITY_RELATED_MODULE_LABELS[m]}
                            </MenuItem>
                        ))}
                    </TextField>
                    <Box>
                        <RelatedPicker module={draft.relatedModule} value={draft.related} onChange={(v) => set('related', v)} disabled={saving} />
                        {errorOf('relatedId') && <Typography sx={{ fontSize: '0.74rem', color: 'var(--mui-palette-error-main)', mt: 0.5 }}>{errorOf('relatedId')}</Typography>}
                    </Box>
                </Box>

                <FormControlLabel
                    control={<Switch size="small" checked={draft.isActive} onChange={(e) => set('isActive', e.target.checked)} />}
                    label={<Typography sx={{ fontSize: '0.84rem' }}>{draft.isActive ? 'On: the page takes bookings' : 'Off: the page answers "not available"'}</Typography>}
                    sx={{ minHeight: 40, mt: 0.5 }}
                />
            </DialogContent>
            <DialogActions sx={{ px: { xs: 2, sm: 3 }, py: 1.5, borderTop: '1px solid var(--mui-palette-border-main)', gap: 1, flexWrap: 'wrap' }}>
                <Button variant="outlined" onClick={onClose} disabled={saving} sx={{ ...secondaryButtonSx, minHeight: 40 }}>
                    Cancel
                </Button>
                <Button variant="contained" onClick={() => void submit()} disabled={saving || hasLocalErrors} sx={{ ...primaryButtonSx, minHeight: 40, color: '#ffffff' }}>
                    {saving ? 'Saving…' : link ? 'Save' : 'Create link'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
