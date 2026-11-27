'use client';

import { useState } from 'react';
import { Box, Button, TextField, Typography } from '@mui/material';
import EventBusyOutlinedIcon from '@mui/icons-material/EventBusyOutlined';
import { formatDayLabel } from '@/components/activities/activityTime';
import { errorMessage, inputSx, secondaryButtonSx } from '@/components/settings/form-customization/builderUi';
import { useUpdatePreferences } from '@/hooks/queries/useProfile';
import { ApiClientError } from '@/services/apiClient';
import type { PreferencesDto } from '@/types/preferences.types';
import { OUT_OF_OFFICE_MAX_DAYS, OUT_OF_OFFICE_MESSAGE_MAX, outOfOfficeIssues } from '@/utils/notificationPreferences';
import { formatDayRange, useBusinessToday } from '@/utils/userAvailability';
import { addDays, isDay } from '@/utils/zonedTime';
import type { Notify } from './ProfileView';
import { CardSaveFooter, ProfileCard, ProfileNote, cardButtonLayoutSx } from './profileUi';
import { LongTextInput } from '@/components/forms/LongTextInput';

interface OutOfOfficeForm {
    from: string;
    to: string;
    message: string;
}

type FieldKey = keyof OutOfOfficeForm;
type FieldErrors = Partial<Record<FieldKey, string>>;

const FIELDS: readonly FieldKey[] = ['from', 'to', 'message'];

const toForm = (stored: PreferencesDto['outOfOffice']): OutOfOfficeForm => ({
    from: stored?.from ?? '',
    to: stored?.to ?? '',
    message: stored?.message ?? '',
});

const sameForm = (a: OutOfOfficeForm, b: OutOfOfficeForm) => a.from === b.from && a.to === b.to && a.message.trim() === b.message.trim();

/** The same checks as the API (utils/notificationPreferences mirrors it), plus the required dates. */
function validate(values: OutOfOfficeForm, today: string, stored: PreferencesDto['outOfOffice']): FieldErrors {
    const errors: FieldErrors = {};
    if (!values.from) errors.from = 'Start Date is required.';
    else if (!isDay(values.from)) errors.from = 'Start Date must be a valid date.';
    if (!values.to) errors.to = 'End Date is required.';
    else if (!isDay(values.to)) errors.to = 'End Date must be a valid date.';
    if (values.message.trim().length > OUT_OF_OFFICE_MESSAGE_MAX) errors.message = `Message cannot exceed ${OUT_OF_OFFICE_MESSAGE_MAX} characters.`;
    if (errors.from || errors.to) return errors;
    for (const issue of outOfOfficeIssues({ from: values.from, to: values.to }, today, stored)) errors[issue.path] ??= issue.message;
    return errors;
}

/** Field errors of a failed save: `outOfOffice.<field>` paths from the API. */
function serverFieldErrors(err: unknown): FieldErrors {
    if (!(err instanceof ApiClientError)) return {};
    const errors: FieldErrors = {};
    for (const e of err.details?.errors ?? []) {
        const field = e.path?.[1] as FieldKey | undefined;
        if (e.path?.[0] === 'outOfOffice' && field && FIELDS.includes(field)) errors[field] ??= e.message;
    }
    return errors;
}

const clearButtonSx = {
    ...secondaryButtonSx,
    ...cardButtonLayoutSx,
    '&:hover': {
        color: 'var(--mui-palette-error-main)',
        backgroundColor: 'var(--mui-palette-error-soft)',
        borderColor: 'var(--mui-palette-error-softBorder)',
    },
} as const;

/**
 * My Profile › Notifications › Out of office: the user's own away dates (inclusive business days) and an optional
 * message. While today is in range colleagues see "Out of office until …" when picking them and the morning summary
 * email pauses; bell notifications keep arriving. Explicit save; Clear removes the range.
 */
export function OutOfOfficeCard({ preferences, notify }: { preferences: PreferencesDto; notify: Notify }) {
    const update = useUpdatePreferences();
    const today = useBusinessToday();
    const stored = preferences.outOfOffice;
    const storedForm = toForm(stored);
    const [draft, setDraft] = useState<OutOfOfficeForm | null>(null);
    const [attempted, setAttempted] = useState(false);
    const [serverErrors, setServerErrors] = useState<FieldErrors>({});
    const values = draft ?? storedForm;
    const dirty = !sameForm(values, storedForm);
    const saving = update.isPending;
    const errors: FieldErrors = { ...(attempted ? validate(values, today, stored) : {}), ...serverErrors };

    const set = (field: FieldKey, value: string) => {
        setDraft({ ...values, [field]: value });
        if (serverErrors[field]) {
            setServerErrors((prev) => {
                const next = { ...prev };
                delete next[field];
                return next;
            });
        }
    };

    const reset = () => {
        setDraft(null);
        setAttempted(false);
        setServerErrors({});
    };

    const save = async (outOfOffice: { from: string; to: string; message: string | null } | null, done: string) => {
        try {
            await update.mutateAsync({ outOfOffice });
            reset();
            notify(done);
        } catch (err) {
            const fieldErrors = serverFieldErrors(err);
            setServerErrors(fieldErrors);
            notify(Object.values(fieldErrors)[0] || errorMessage(err, 'Could not save your out of office.'), 'error');
        }
    };

    const onSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!dirty) return;
        // Both dates emptied on a stored range: same as Clear.
        if (stored && !values.from && !values.to) {
            await save(null, 'Out of office cleared.');
            return;
        }
        setAttempted(true);
        const found = validate(values, today, stored);
        const first = Object.values(found)[0];
        if (first) {
            notify(first, 'error');
            return;
        }
        await save({ from: values.from, to: values.to, message: values.message.trim() || null }, 'Out of office saved.');
    };

    // Native date pickers: an end from today (and not before the start), a start within the next year.
    const endMin = values.from && isDay(values.from) && values.from > today ? values.from : today;
    const endMax = values.from && isDay(values.from) ? addDays(values.from, OUT_OF_OFFICE_MAX_DAYS - 1) : undefined;
    const dayHint = (day: string) => (isDay(day) ? formatDayLabel(day, { withYear: true }) : ' ');

    return (
        <ProfileCard
            id="out-of-office"
            icon={<EventBusyOutlinedIcon fontSize="small" />}
            title="Out of office"
            description="Let colleagues know when you are away."
        >
            <Box component="form" noValidate onSubmit={onSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {stored && (
                    <Typography role="status" sx={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--crm-slate-900)' }}>
                        {stored.active
                            ? `You are out of office until ${formatDayLabel(stored.to, { weekday: false, withYear: true })}.`
                            : `Scheduled: ${formatDayRange(stored.from, stored.to)}.`}
                    </Typography>
                )}
                {preferences.onLeave && <ProfileNote>An admin has marked you as on leave.</ProfileNote>}

                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
                    <TextField
                        label="Start Date"
                        type="date"
                        size="small"
                        value={values.from}
                        onChange={(e) => set('from', e.target.value)}
                        disabled={saving}
                        error={Boolean(errors.from)}
                        helperText={errors.from || dayHint(values.from)}
                        sx={inputSx}
                        slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: '2000-01-01', max: addDays(today, OUT_OF_OFFICE_MAX_DAYS) } }}
                    />
                    <TextField
                        label="End Date"
                        type="date"
                        size="small"
                        value={values.to}
                        onChange={(e) => set('to', e.target.value)}
                        disabled={saving}
                        error={Boolean(errors.to)}
                        helperText={errors.to || dayHint(values.to)}
                        sx={inputSx}
                        slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: endMin, max: endMax } }}
                    />
                </Box>
                <LongTextInput
                    label="Message (optional)"
                    inputLabel="Message (optional)"
                    value={values.message}
                    onChange={(value) => set('message', value)}
                    disabled={saving}
                    placeholder="e.g. Back on Monday. For anything urgent, call the sales desk."
                    error={errors.message}
                    maxLength={OUT_OF_OFFICE_MESSAGE_MAX}
                    expandable={false}
                />
                <Typography sx={{ fontSize: '0.75rem', color: 'var(--mui-palette-text-secondary)', lineHeight: 1.5 }}>
                    While you are out of office, colleagues see &quot;Out of office until …&quot; when they pick you, and your morning summary email is paused. Bell
                    notifications keep arriving so you can catch up when you return.
                </Typography>

                <CardSaveFooter
                    dirty={dirty}
                    saving={saving}
                    onCancel={reset}
                    extra={
                        stored ? (
                            <Button
                                variant="outlined"
                                onClick={() => void save(null, 'Out of office cleared.')}
                                disabled={saving}
                                sx={{ ...clearButtonSx, mr: { sm: 'auto' } }}
                            >
                                Clear
                            </Button>
                        ) : undefined
                    }
                    mt={0.5}
                />
            </Box>
        </ProfileCard>
    );
}
