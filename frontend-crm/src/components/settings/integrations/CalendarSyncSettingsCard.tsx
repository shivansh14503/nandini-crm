'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Chip, FormControlLabel, MenuItem, Switch, TextField, Typography } from '@mui/material';
import { errorMessage, inputSx, panelHeaderSx, primaryButtonSx, secondaryButtonSx, surfaceSx } from '@/components/settings/form-customization/builderUi';
import { useSaveCalendarSettings } from '@/hooks/queries/useIntegrationsAdmin';
import { ACTIVITY_REMINDERS, type ActivityReminder } from '@/types/activity.types';
import { BACKFILL_DAY_CHOICES, MAX_COMPANY_DOMAINS, type BackfillDays, type CalendarSyncSettings } from '@/types/integration.types';
import { fieldErrorsOf, fieldLabelSx, hintSx } from './integrationUi';

/** The fields this card edits today. Follow-up activities (P2-4) and meeting import (P2-8) join with their PRs. */
type EditedSettings = Pick<CalendarSyncSettings, 'companyDomains' | 'followUpReminder' | 'backfillDays' | 'eventVisibility'>;
const EDITED_KEYS: (keyof EditedSettings)[] = ['companyDomains', 'followUpReminder', 'backfillDays', 'eventVisibility'];

const pick = (s: CalendarSyncSettings): EditedSettings => ({
    companyDomains: s.companyDomains,
    followUpReminder: s.followUpReminder,
    backfillDays: s.backfillDays,
    eventVisibility: s.eventVisibility,
});
const sameValue = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const sameSettings = (a: EditedSettings, b: EditedSettings) => EDITED_KEYS.every((k) => sameValue(a[k], b[k]));

const DOMAIN_PATTERN = /^(?=.{3,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
const normalizeDomain = (value: string) => value.trim().toLowerCase().replace(/^@/, '');
const NO_REMINDER = '__none__';

/** Company-wide calendar sync settings (ModuleSetting activities / calendarSync). */
export function CalendarSyncSettingsCard({
    settings,
    onDirtyChange,
    onToast,
}: {
    settings: CalendarSyncSettings;
    onDirtyChange: (dirty: boolean) => void;
    onToast: (message: string, severity?: 'success' | 'error') => void;
}) {
    const server = useMemo(() => pick(settings), [settings]);
    const [seen, setSeen] = useState<EditedSettings>(server);
    const [base, setBase] = useState<EditedSettings>(server);
    const [form, setForm] = useState<EditedSettings>(server);
    const [domainInput, setDomainInput] = useState('');
    const [domainError, setDomainError] = useState('');
    const [errors, setErrors] = useState<Record<string, string>>({});
    const save = useSaveCalendarSettings();

    const dirty = !sameSettings(form, base) || domainInput.trim() !== '';
    if (!sameSettings(server, seen)) {
        setSeen(server);
        if (!dirty) {
            setBase(server);
            setForm(server);
        }
    }

    useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
    useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

    const set = <K extends keyof EditedSettings>(key: K, value: EditedSettings[K]) => {
        setForm((f) => ({ ...f, [key]: value }));
        setErrors({});
    };

    /** Adds what's typed (comma, space or Enter separate domains). Returns the new list, or null when something was refused. */
    const addDomains = (raw: string): string[] | null => {
        const parts = raw.split(/[\s,;]+/).map(normalizeDomain).filter(Boolean);
        if (!parts.length) return form.companyDomains;
        const bad = parts.find((d) => !DOMAIN_PATTERN.test(d));
        if (bad) {
            setDomainError(`"${bad}" isn't a domain. Enter one such as nandiniinfosys.com.`);
            return null;
        }
        const next = [...new Set([...form.companyDomains, ...parts])];
        if (next.length > MAX_COMPANY_DOMAINS) {
            setDomainError(`At most ${MAX_COMPANY_DOMAINS} company domains.`);
            return null;
        }
        set('companyDomains', next);
        setDomainInput('');
        setDomainError('');
        return next;
    };

    const cancel = () => {
        setForm(base);
        setDomainInput('');
        setDomainError('');
        setErrors({});
    };

    const submit = async () => {
        const domains = domainInput.trim() ? addDomains(domainInput) : form.companyDomains;
        if (!domains) return;
        if (!domains.length) {
            setDomainError('Add at least one company domain.');
            return;
        }
        const next = { ...form, companyDomains: domains };
        const patch: Partial<CalendarSyncSettings> = {};
        for (const key of EDITED_KEYS) if (!sameValue(next[key], base[key])) Object.assign(patch, { [key]: next[key] });
        if (!Object.keys(patch).length) return;
        try {
            const saved = pick(await save.mutateAsync(patch));
            setBase(saved);
            setForm(saved);
            setErrors({});
            onToast('Calendar sync settings saved.');
        } catch (err) {
            setErrors(fieldErrorsOf(err));
            onToast(errorMessage(err, 'Could not save the settings.'), 'error');
        }
    };

    const domainsError = domainError || errors.companyDomains || Object.entries(errors).find(([k]) => k.startsWith('companyDomains.'))?.[1] || '';

    return (
        <Box component="section" aria-labelledby="calendar-sync-settings-title" sx={{ ...surfaceSx, overflow: 'hidden', minWidth: 0 }}>
            <Box sx={panelHeaderSx}>
                <Typography id="calendar-sync-settings-title" component="h2" sx={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--crm-slate-900)' }}>
                    Calendar sync settings
                </Typography>
                <Typography sx={hintSx}>Company-wide. They apply to every employee who connects a calendar.</Typography>
            </Box>

            <Box sx={{ p: { xs: 1.75, sm: 2 }, display: 'flex', flexDirection: 'column', gap: 2.25, minWidth: 0 }}>
                {/* Company domains */}
                <Box sx={{ minWidth: 0 }}>
                    <Typography component="label" htmlFor="company-domain-input" sx={{ ...fieldLabelSx, display: 'block' }}>
                        Company email domains
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: form.companyDomains.length ? 1 : 0 }}>
                        {form.companyDomains.map((d) => (
                            <Chip
                                key={d}
                                label={d}
                                size="small"
                                onDelete={save.isPending ? undefined : () => set('companyDomains', form.companyDomains.filter((x) => x !== d))}
                                sx={{
                                    fontWeight: 600,
                                    fontSize: '0.76rem',
                                    color: 'var(--crm-text-blue-700)',
                                    backgroundColor: 'var(--mui-palette-primary-soft)',
                                    border: '1px solid var(--mui-palette-primary-softBorder)',
                                    '& .MuiChip-deleteIcon': { color: 'var(--mui-palette-text-secondary)', '&:hover': { color: 'var(--mui-palette-error-main)' } },
                                }}
                            />
                        ))}
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', flexWrap: { xs: 'wrap', sm: 'nowrap' } }}>
                        <TextField
                            id="company-domain-input"
                            size="small"
                            placeholder="Add a domain, e.g. nandiniinfosys.com"
                            value={domainInput}
                            onChange={(e) => {
                                setDomainInput(e.target.value);
                                setDomainError('');
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ',') {
                                    e.preventDefault();
                                    addDomains(domainInput);
                                }
                            }}
                            disabled={save.isPending || form.companyDomains.length >= MAX_COMPANY_DOMAINS}
                            error={Boolean(domainsError)}
                            helperText={domainsError || 'Calendars must belong to one of these domains, and company emails are checked against them.'}
                            sx={{ ...inputSx, flex: 1, minWidth: 0, width: { xs: '100%', sm: 'auto' } }}
                            slotProps={{ htmlInput: { spellCheck: false, autoCapitalize: 'none' } }}
                        />
                        <Button variant="outlined" sx={{ ...secondaryButtonSx, minHeight: 40 }} disabled={!domainInput.trim() || save.isPending} onClick={() => addDomains(domainInput)}>
                            Add
                        </Button>
                    </Box>
                </Box>

                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0,1fr)', sm: 'repeat(2, minmax(0,1fr))' }, gap: 2 }}>
                    <TextField
                        select
                        size="small"
                        label="Reminder on follow-up activities"
                        value={form.followUpReminder ?? NO_REMINDER}
                        onChange={(e) => set('followUpReminder', e.target.value === NO_REMINDER ? null : (e.target.value as ActivityReminder))}
                        disabled={save.isPending}
                        error={Boolean(errors.followUpReminder)}
                        helperText={errors.followUpReminder || 'Used when a lead or opportunity follow-up becomes a calendar activity.'}
                        sx={inputSx}
                    >
                        <MenuItem value={NO_REMINDER} sx={{ fontSize: '0.85rem' }}>
                            No reminder
                        </MenuItem>
                        {ACTIVITY_REMINDERS.map((r) => (
                            <MenuItem key={r} value={r} sx={{ fontSize: '0.85rem' }}>
                                {r}
                            </MenuItem>
                        ))}
                    </TextField>
                    <TextField
                        select
                        size="small"
                        label="Copy upcoming activities on connect"
                        value={form.backfillDays}
                        onChange={(e) => set('backfillDays', Number(e.target.value) as BackfillDays)}
                        disabled={save.isPending}
                        error={Boolean(errors.backfillDays)}
                        helperText={errors.backfillDays || 'How far ahead a newly connected calendar gets its CRM activities.'}
                        sx={inputSx}
                    >
                        {BACKFILL_DAY_CHOICES.map((d) => (
                            <MenuItem key={d} value={d} sx={{ fontSize: '0.85rem' }}>
                                Next {d} days
                            </MenuItem>
                        ))}
                    </TextField>
                </Box>

                <Box>
                    <FormControlLabel
                        control={
                            <Switch
                                checked={form.eventVisibility === 'default'}
                                onChange={(e) => set('eventVisibility', e.target.checked ? 'default' : 'private')}
                                disabled={save.isPending}
                            />
                        }
                        label={<Typography sx={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--crm-slate-900)' }}>Show event details to colleagues who can see the calendar</Typography>}
                        sx={{ ml: 0, gap: 0.5, alignItems: 'center' }}
                    />
                    <Typography sx={{ ...hintSx, mt: 0.25 }}>
                        Off (recommended): events the CRM puts on calendars are private, so colleagues see only &quot;busy&quot;; invitees always see the whole event. Turn this on
                        only if the company wants colleagues to read meeting titles (customer names) in their calendar app. Check the Google Workspace setting
                        &quot;Internal sharing options for primary calendars&quot; first.
                    </Typography>
                </Box>

                {errors[''] && <Alert severity="error">{errors['']}</Alert>}

                <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    {dirty && (
                        <Button variant="outlined" sx={{ ...secondaryButtonSx, minHeight: 36 }} onClick={cancel} disabled={save.isPending}>
                            Cancel
                        </Button>
                    )}
                    <Button variant="contained" sx={{ ...primaryButtonSx, minHeight: 36 }} disabled={!dirty || save.isPending} onClick={() => void submit()}>
                        {save.isPending ? 'Saving…' : 'Save settings'}
                    </Button>
                </Box>
            </Box>
        </Box>
    );
}
