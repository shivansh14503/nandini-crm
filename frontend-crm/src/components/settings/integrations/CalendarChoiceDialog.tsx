'use client';

import React, { useState } from 'react';
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Switch, TextField, Typography } from '@mui/material';
import { errorMessage, inputSx, primaryButtonSx, secondaryButtonSx } from '@/components/settings/form-customization/builderUi';
import { pullRequestMessage } from '@/components/integrations/calendarConnections.types';
import { useCheckPersonCalendar, useSetPersonCalendar, useSyncPersonCalendar } from '@/hooks/queries/useIntegrationsAdmin';
import { PERSON_CALENDAR_NOTE_MAX, type CalendarCheckOutcome, type Person, type PersonCalendarPayload, type ProviderAdmin } from '@/types/integration.types';
import { PersonEmailLoggingSection } from './PersonEmailLoggingSection';
import { CALENDAR_PROVIDER_LABELS, NOT_SYNCED_LABELS, fieldErrorsOf, formatDateTime, hintSx } from './integrationUi';

const BY_DOMAIN = '__domain__';

const CHECK_MESSAGES: Record<CalendarCheckOutcome, { severity: 'success' | 'error' | 'info'; text: string }> = {
    ok: { severity: 'success', text: 'The calendar answered: sync works for this person.' },
    user_error: { severity: 'error', text: "This person's calendar can't be reached. See the reason on their row." },
    provider_unhealthy: { severity: 'error', text: 'The provider itself has a problem. See its card above.' },
    transient: { severity: 'info', text: "The provider didn't answer just now. The CRM retries on its own." },
    skipped: { severity: 'info', text: 'Not checked: the provider is switched off or not set up.' },
};

/**
 * One person's calendar choice (Admin › API Integrations › People): the provider (by email domain, or an override),
 * leaving them out of calendar sync with a note, "Import customer meetings" (P2-8: their meetings with CRM contacts
 * become activities and their replies go both ways; only while the company switch is on), "Check now", and "Sync now"
 * (their calendar changes come back now, P2-5). Saved at once and audited; the person is re-enrolled right after.
 * Mount with a `key` per person so it starts fresh.
 */
export function CalendarChoiceDialog({
    person,
    providers,
    fakeProvider,
    meetingImport,
    onClose,
    onToast,
}: {
    person: Person | null;
    providers: ProviderAdmin[];
    fakeProvider: boolean;
    /** The company switch "Bring in meetings with customers" (`allowMeetingImport`). */
    meetingImport: boolean;
    onClose: () => void;
    onToast: (message: string, severity?: 'success' | 'error') => void;
}) {
    const choice = person?.calendar.choice ?? null;
    const [provider, setProvider] = useState<string>(choice?.provider ?? BY_DOMAIN);
    const [excluded, setExcluded] = useState(choice?.excluded ?? false);
    const [note, setNote] = useState(choice?.note ?? '');
    const [importMeetings, setImportMeetings] = useState(choice?.importMeetings ?? false);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [checked, setChecked] = useState<CalendarCheckOutcome | null>(null);
    const save = useSetPersonCalendar();
    const check = useCheckPersonCalendar();
    const pull = useSyncPersonCalendar();
    const [pulled, setPulled] = useState<ReturnType<typeof pullRequestMessage> | null>(null);

    if (!person) return null;
    const name = person.fullName || person.username;
    const connection = person.calendar.connection;
    const calendarProviders = providers.filter((p) => p.kind === 'calendar');
    const options = [
        ...calendarProviders.map((p) => ({ value: p.provider as string, label: p.label, off: !p.enabled })),
        ...(fakeProvider || choice?.provider === 'fake' ? [{ value: 'fake', label: `${CALENDAR_PROVIDER_LABELS.fake} (development)`, off: !fakeProvider }] : []),
    ];

    const payload: PersonCalendarPayload = {};
    const nextProvider = provider === BY_DOMAIN ? null : provider;
    if (nextProvider !== (choice?.provider ?? null)) payload.provider = nextProvider;
    if (excluded !== (choice?.excluded ?? false)) payload.excluded = excluded;
    if ((note.trim() || null) !== (choice?.note ?? null)) payload.note = note.trim() || null;
    if (importMeetings !== (choice?.importMeetings ?? false)) payload.importMeetings = importMeetings;
    const dirty = Object.keys(payload).length > 0;
    const busy = save.isPending || check.isPending || pull.isPending;

    const submit = async () => {
        if (!dirty) return onClose();
        try {
            const saved = await save.mutateAsync({ username: person.username, payload });
            onToast(
                saved.calendar.reason === 'excluded'
                    ? `${name} is left out of calendar sync. Events already in their calendar stay.`
                    : `Saved the calendar choice for ${name}.`,
            );
            onClose();
        } catch (err) {
            setErrors(fieldErrorsOf(err));
            onToast(errorMessage(err, 'Could not save the calendar choice.'), 'error');
        }
    };

    const runCheck = async () => {
        setChecked(null);
        try {
            setChecked((await check.mutateAsync(person.username)).check);
        } catch (err) {
            onToast(errorMessage(err, 'Could not check the calendar.'), 'error');
        }
    };

    const runPull = async () => {
        setPulled(null);
        try {
            setPulled(pullRequestMessage((await pull.mutateAsync(person.username)).sync));
        } catch (err) {
            onToast(errorMessage(err, 'Could not sync the calendar.'), 'error');
        }
    };

    return (
        <Dialog
            open
            onClose={() => !busy && onClose()}
            maxWidth="sm"
            fullWidth
            slotProps={{ paper: { sx: { borderRadius: '12px', m: { xs: 1.5, sm: 4 }, width: { xs: 'calc(100% - 24px)', sm: undefined } } } }}
        >
            <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', color: 'var(--crm-slate-900)', pb: 0.5, overflowWrap: 'anywhere' }}>Calendar for {name}</DialogTitle>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.75, pt: '8px !important' }}>
                {/* Now */}
                <Box sx={{ p: 1.25, borderRadius: '10px', border: '1px solid var(--mui-palette-border-main)', backgroundColor: 'var(--mui-palette-background-subtle)', minWidth: 0 }}>
                    {connection ? (
                        <>
                            <Typography sx={{ fontSize: '0.82rem', color: 'var(--crm-slate-900)', fontWeight: 600, overflowWrap: 'anywhere' }}>
                                {CALENDAR_PROVIDER_LABELS[connection.provider] ?? connection.provider} · {connection.accountEmail}
                            </Typography>
                            <Typography sx={hintSx}>
                                Enrolled {formatDateTime(connection.enrolledAt)}
                                {connection.lastCheckedAt ? ` · checked ${formatDateTime(connection.lastCheckedAt)}` : ''}
                                {connection.status === 'error' && connection.nextCheckAt ? ` · next check ${formatDateTime(connection.nextCheckAt)}` : ''}
                            </Typography>
                            {connection.status === 'error' && connection.lastErrorMessage && (
                                <Typography sx={{ fontSize: '0.76rem', color: 'var(--mui-palette-error-main)', mt: 0.5, overflowWrap: 'anywhere' }}>{connection.lastErrorMessage}</Typography>
                            )}
                        </>
                    ) : (
                        <Typography sx={{ fontSize: '0.82rem', color: 'var(--crm-slate-700)' }}>
                            Not synced{person.calendar.reason ? `: ${NOT_SYNCED_LABELS[person.calendar.reason].toLowerCase()}` : ' yet'}.
                        </Typography>
                    )}
                </Box>

                <TextField
                    select
                    label="Provider"
                    size="small"
                    value={provider}
                    onChange={(e) => setProvider(e.target.value)}
                    disabled={busy || excluded}
                    error={Boolean(errors.provider)}
                    helperText={errors.provider || (excluded ? 'Left out: no provider is used.' : 'By email domain uses the provider that serves this person’s email domain.')}
                    sx={inputSx}
                >
                    <MenuItem value={BY_DOMAIN} sx={{ fontSize: '0.85rem' }}>
                        By email domain (default)
                    </MenuItem>
                    {options.map((o) => (
                        <MenuItem key={o.value} value={o.value} sx={{ fontSize: '0.85rem' }}>
                            {o.label}
                            {o.off ? ' (off)' : ''}
                        </MenuItem>
                    ))}
                </TextField>

                <FormControlLabel
                    control={<Switch checked={excluded} onChange={(e) => setExcluded(e.target.checked)} disabled={busy} />}
                    label={<Typography sx={{ fontSize: '0.84rem', color: 'var(--crm-slate-900)' }}>Leave out of calendar sync</Typography>}
                    sx={{ ml: 0, gap: 1, alignItems: 'center' }}
                />
                {excluded && !(choice?.excluded ?? false) && (
                    <Alert severity="info" sx={{ fontSize: '0.78rem', py: 0.25 }}>
                        The CRM stops writing to {name}&apos;s calendar. Events already there stay (removing them would send cancellations to customers).
                    </Alert>
                )}

                <Box sx={{ minWidth: 0 }}>
                    <FormControlLabel
                        control={
                            <Switch
                                checked={importMeetings}
                                onChange={(e) => setImportMeetings(e.target.checked)}
                                // Turning it off always works; turning it on needs the company switch.
                                disabled={busy || excluded || (!meetingImport && !importMeetings)}
                                slotProps={{ input: { 'aria-describedby': 'import-meetings-hint' } }}
                            />
                        }
                        label={<Typography sx={{ fontSize: '0.84rem', color: 'var(--crm-slate-900)' }}>Import customer meetings</Typography>}
                        sx={{ ml: 0, gap: 1, alignItems: 'center' }}
                    />
                    <Typography id="import-meetings-hint" sx={{ ...hintSx, mt: 0.25 }}>
                        {meetingImport
                            ? `Meetings in ${name}'s calendar with a CRM contact become activities, and replies to invitations go both ways. Private, repeating and all-day events are never brought in.`
                            : 'Turn on "Bring in meetings with customers" in the calendar sync settings first.'}
                    </Typography>
                    {errors.importMeetings && (
                        <Typography role="alert" sx={{ ...hintSx, mt: 0.5, color: 'var(--mui-palette-error-main)' }}>
                            {errors.importMeetings}
                        </Typography>
                    )}
                </Box>

                <TextField
                    label="Note (optional)"
                    size="small"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    disabled={busy}
                    error={Boolean(errors.note)}
                    helperText={errors.note || 'Shown on the People table and kept in the audit log.'}
                    sx={inputSx}
                    slotProps={{ htmlInput: { maxLength: PERSON_CALENDAR_NOTE_MAX } }}
                />

                <PersonEmailLoggingSection username={person.username} onToast={onToast} />

                {pulled && (
                    <Alert severity={pulled.tone} sx={{ fontSize: '0.78rem', py: 0.25 }}>
                        {pulled.text}
                    </Alert>
                )}

                {checked && (
                    <Alert severity={CHECK_MESSAGES[checked].severity} sx={{ fontSize: '0.78rem', py: 0.25 }}>
                        {CHECK_MESSAGES[checked].text}
                    </Alert>
                )}
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2, gap: 1, flexWrap: 'wrap' }}>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mr: 'auto' }}>
                    {connection && (
                        <Button
                            variant="outlined"
                            sx={{ ...secondaryButtonSx, minHeight: 36 }}
                            onClick={() => void runCheck()}
                            disabled={busy || dirty}
                            startIcon={check.isPending ? <CircularProgress size={14} color="inherit" /> : undefined}
                        >
                            {check.isPending ? 'Checking…' : 'Check now'}
                        </Button>
                    )}
                    {connection?.status === 'ok' && (
                        <Button
                            variant="outlined"
                            sx={{ ...secondaryButtonSx, minHeight: 36 }}
                            onClick={() => void runPull()}
                            disabled={busy || dirty}
                            startIcon={pull.isPending ? <CircularProgress size={14} color="inherit" /> : undefined}
                        >
                            {pull.isPending ? 'Syncing…' : 'Sync now'}
                        </Button>
                    )}
                </Box>
                <Button variant="outlined" sx={{ ...secondaryButtonSx, minHeight: 36 }} onClick={onClose} disabled={busy}>
                    {dirty ? 'Cancel' : 'Close'}
                </Button>
                <Button variant="contained" sx={{ ...primaryButtonSx, minHeight: 36 }} onClick={() => void submit()} disabled={busy || !dirty}>
                    {save.isPending ? 'Saving…' : 'Save'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
