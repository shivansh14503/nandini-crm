'use client';

import { useState } from 'react';
import { Box, MenuItem, TextField } from '@mui/material';
import AlarmOutlinedIcon from '@mui/icons-material/AlarmOutlined';
import { errorMessage, inputSx } from '@/components/settings/form-customization/builderUi';
import { useFormConfigs } from '@/hooks/queries/useFormConfigs';
import { useUpdatePreferences } from '@/hooks/queries/useProfile';
import { ApiClientError } from '@/services/apiClient';
import { ACTIVITY_REMINDERS, type ActivityReminder } from '@/types/activity.types';
import type { PreferencesDto } from '@/types/preferences.types';
import { builtInDropdownDefaults } from '@/utils/formConfig';
import { DEFAULT_REMINDER_NONE } from '@/utils/notificationPreferences';
import type { Notify } from './ProfileView';
import { CardSaveFooter, ProfileCard } from './profileUi';

type DefaultReminder = PreferencesDto['defaultReminder'];

/** Select value of "Company default" (stored as null). */
const COMPANY_DEFAULT = '__company__';

const toSelectValue = (value: DefaultReminder) => value ?? COMPANY_DEFAULT;
const fromSelectValue = (value: string): DefaultReminder => (value === COMPANY_DEFAULT ? null : (value as ActivityReminder | typeof DEFAULT_REMINDER_NONE));

/**
 * My Profile › Notifications › Reminders: the Reminder pre-filled on new activities the user creates (company
 * default, no reminder, or a fixed reminder). Activities the server creates keep their own setting. Explicit save.
 */
export function ReminderDefaultCard({ preferences, notify }: { preferences: PreferencesDto; notify: Notify }) {
    const update = useUpdatePreferences();
    const configs = useFormConfigs();
    // The admin's default (Form Builder › Dropdowns › Reminder ☆), '' when there is none.
    const companyDefault = builtInDropdownDefaults(configs, 'activities', { reminder: '' }).reminder;
    const companyLabel = typeof companyDefault === 'string' && companyDefault ? companyDefault : 'No reminder';

    const [draft, setDraft] = useState<DefaultReminder | undefined>(undefined);
    const [error, setError] = useState('');
    const value = draft === undefined ? preferences.defaultReminder : draft;
    const dirty = value !== preferences.defaultReminder;
    const saving = update.isPending;

    const cancel = () => {
        setDraft(undefined);
        setError('');
    };

    const onSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!dirty) return;
        setError('');
        try {
            await update.mutateAsync({ defaultReminder: value });
            setDraft(undefined);
            notify('Default reminder saved.');
        } catch (err) {
            const fieldError = err instanceof ApiClientError ? err.details?.errors?.find((e) => e.path?.[0] === 'defaultReminder')?.message : undefined;
            if (fieldError) setError(fieldError);
            notify(fieldError || errorMessage(err, 'Could not save your default reminder.'), 'error');
        }
    };

    return (
        <ProfileCard id="reminder-default" icon={<AlarmOutlinedIcon fontSize="small" />} title="Reminders" description="The reminder new activities start with.">
            <Box component="form" noValidate onSubmit={onSubmit}>
                <TextField
                    select
                    fullWidth
                    size="small"
                    label="Default reminder"
                    value={toSelectValue(value)}
                    onChange={(e) => {
                        setDraft(fromSelectValue(e.target.value));
                        setError('');
                    }}
                    disabled={saving}
                    error={Boolean(error)}
                    helperText={error || 'Pre-filled on new activities you create. You can still change it on each activity. Reminders appear in the bell.'}
                    sx={{ ...inputSx, maxWidth: { sm: 420 } }}
                >
                    <MenuItem value={COMPANY_DEFAULT} sx={{ fontSize: '0.85rem' }}>
                        Company default ({companyLabel})
                    </MenuItem>
                    <MenuItem value={DEFAULT_REMINDER_NONE} sx={{ fontSize: '0.85rem' }}>
                        No reminder
                    </MenuItem>
                    {ACTIVITY_REMINDERS.map((reminder) => (
                        <MenuItem key={reminder} value={reminder} sx={{ fontSize: '0.85rem' }}>
                            {reminder}
                        </MenuItem>
                    ))}
                </TextField>
                <CardSaveFooter dirty={dirty} saving={saving} onCancel={cancel} />
            </Box>
        </ProfileCard>
    );
}
