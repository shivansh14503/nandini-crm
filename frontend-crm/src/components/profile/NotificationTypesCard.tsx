'use client';

import { useState } from 'react';
import { Box, Switch, Typography } from '@mui/material';
import NotificationsActiveOutlinedIcon from '@mui/icons-material/NotificationsActiveOutlined';
import { errorMessage } from '@/components/settings/form-customization/builderUi';
import { useUpdatePreferences } from '@/hooks/queries/useProfile';
import type { PreferencesDto } from '@/types/preferences.types';
import { IN_APP_NOTIFICATION_KINDS, type InAppNotificationKind } from '@/utils/notificationPreferences';
import type { Notify } from './ProfileView';
import { CardSaveFooter, ProfileCard } from './profileUi';

/** Where a notification type can be delivered. Only the bell today; no bell kind sends email. */
type NotificationChannel = 'inApp' | 'email';

const CHANNEL_LABELS: Record<NotificationChannel, string> = { inApp: 'In app', email: 'Email' };

interface NotificationTypeRow {
    kind: InAppNotificationKind;
    label: string;
    description: string;
    channels: readonly NotificationChannel[];
}

/**
 * The configurable notification types, in the bell's own wording. Data-driven: a type that gains an email channel
 * adds `'email'` here (and its preference) and the Email column appears.
 */
export const NOTIFICATION_TYPE_ROWS: readonly NotificationTypeRow[] = [
    {
        kind: 'activity_reminder',
        label: 'Activity reminders',
        description: 'At the reminder time of activities you own or were invited to.',
        channels: ['inApp'],
    },
    { kind: 'activity_assigned', label: 'Assignments', description: 'When someone else makes you the owner of an activity.', channels: ['inApp'] },
    { kind: 'activity_invited', label: 'Invitations', description: 'When someone invites you to an activity.', channels: ['inApp'] },
    { kind: 'contract_renewal', label: 'Contract renewals', description: 'On the Renewal Reminder Date of contracts you manage.', channels: ['inApp'] },
];

/** Columns shown: In app always, Email only once some type has an email channel. */
const CHANNELS: readonly NotificationChannel[] = (['inApp', 'email'] as const).filter(
    (channel) => channel === 'inApp' || NOTIFICATION_TYPE_ROWS.some((row) => row.channels.includes(channel)),
);

/** Width of a channel column: the switch plus room for its caption. */
const CHANNEL_COLUMN = 72;

type InAppState = Record<InAppNotificationKind, boolean>;

const changedKinds = (draft: InAppState, saved: InAppState) => IN_APP_NOTIFICATION_KINDS.filter((kind) => draft[kind] !== saved[kind]);

/**
 * My Profile › Notifications › Notifications: which bell notifications the user gets, per type. Explicit save.
 * Turning a type off stops new ones only. Kinds not listed (e.g. calendar reconnect) always arrive.
 */
export function NotificationTypesCard({ preferences, notify }: { preferences: PreferencesDto; notify: Notify }) {
    const update = useUpdatePreferences();
    const saved = preferences.inApp;
    // `null` = follow the server; a draft exists only while the user has unsaved changes.
    const [draft, setDraft] = useState<InAppState | null>(null);
    const values = draft ?? saved;
    const changed = changedKinds(values, saved);
    const dirty = changed.length > 0;
    const saving = update.isPending;

    const toggle = (kind: InAppNotificationKind, on: boolean) => setDraft({ ...values, [kind]: on });

    const onSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!dirty) return;
        try {
            await update.mutateAsync({ inApp: Object.fromEntries(changed.map((kind) => [kind, values[kind]])) });
            setDraft(null);
            notify('Notification settings saved.');
        } catch (err) {
            notify(errorMessage(err, 'Could not save your notification settings.'), 'error');
        }
    };

    return (
        <ProfileCard
            id="notification-types"
            icon={<NotificationsActiveOutlinedIcon fontSize="small" />}
            title="Notifications"
            description="Choose which notifications appear under the bell."
        >
            <Box component="form" noValidate onSubmit={onSubmit}>
                {/* Column headers (tablet and up); on phones each switch carries its own caption. */}
                <Box
                    aria-hidden
                    sx={{
                        display: { xs: 'none', sm: 'grid' },
                        gridTemplateColumns: `minmax(0, 1fr) repeat(${CHANNELS.length}, ${CHANNEL_COLUMN}px)`,
                        gap: 1.5,
                        px: 1.5,
                        pb: 0.75,
                    }}
                >
                    <Typography sx={headerSx}>Type</Typography>
                    {CHANNELS.map((channel) => (
                        <Typography key={channel} sx={{ ...headerSx, textAlign: 'center' }}>
                            {CHANNEL_LABELS[channel]}
                        </Typography>
                    ))}
                </Box>
                <Box
                    component="ul"
                    aria-label="Notification types"
                    sx={{
                        listStyle: 'none',
                        m: 0,
                        p: 0,
                        border: '1px solid var(--mui-palette-border-main)',
                        borderRadius: '10px',
                        overflow: 'hidden',
                    }}
                >
                    {NOTIFICATION_TYPE_ROWS.map((row) => (
                        <Box
                            component="li"
                            key={row.kind}
                            sx={{
                                display: 'grid',
                                gridTemplateColumns: `minmax(0, 1fr) repeat(${CHANNELS.length}, ${CHANNEL_COLUMN}px)`,
                                alignItems: 'center',
                                gap: 1.5,
                                px: 1.5,
                                py: 1,
                                minHeight: 56,
                                backgroundColor: 'var(--mui-palette-background-paper)',
                                borderBottom: '1px solid var(--mui-palette-border-light)',
                                '&:last-of-type': { borderBottom: 'none' },
                            }}
                        >
                            <Box sx={{ minWidth: 0 }}>
                                <Typography sx={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--crm-slate-900)', overflowWrap: 'anywhere' }}>{row.label}</Typography>
                                <Typography sx={{ fontSize: '0.75rem', color: 'var(--mui-palette-text-secondary)', lineHeight: 1.45, overflowWrap: 'anywhere' }}>
                                    {row.description}
                                </Typography>
                            </Box>
                            {CHANNELS.map((channel) =>
                                row.channels.includes(channel) && channel === 'inApp' ? (
                                    <Box
                                        key={channel}
                                        component="label"
                                        sx={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            minHeight: 44,
                                            minWidth: 44,
                                            cursor: saving ? 'default' : 'pointer',
                                        }}
                                    >
                                        <Switch
                                            checked={values[row.kind]}
                                            onChange={(e) => toggle(row.kind, e.target.checked)}
                                            disabled={saving}
                                            slotProps={{ input: { 'aria-label': `${CHANNEL_LABELS[channel]}: ${row.label}` } }}
                                        />
                                        <Typography
                                            aria-hidden
                                            component="span"
                                            sx={{ display: { xs: 'block', sm: 'none' }, fontSize: '0.68rem', color: 'var(--mui-palette-text-muted)', lineHeight: 1 }}
                                        >
                                            {CHANNEL_LABELS[channel]}
                                        </Typography>
                                    </Box>
                                ) : (
                                    // A channel this type doesn't have. An email channel also needs its own preference in
                                    // PreferencesDto before it can get a switch here.
                                    <Typography key={channel} aria-label={`${CHANNEL_LABELS[channel]}: not available`} sx={{ textAlign: 'center', color: 'var(--mui-palette-text-muted)', fontSize: '0.8rem' }}>
                                        –
                                    </Typography>
                                ),
                            )}
                        </Box>
                    ))}
                </Box>
                <Typography sx={{ mt: 1.25, fontSize: '0.75rem', color: 'var(--mui-palette-text-secondary)', lineHeight: 1.5 }}>
                    Turning a type off stops new ones; ones already in the bell stay.
                </Typography>
                <CardSaveFooter dirty={dirty} saving={saving} onCancel={() => setDraft(null)} />
            </Box>
        </ProfileCard>
    );
}

const headerSx = {
    fontSize: '0.7rem',
    fontWeight: 700,
    color: 'var(--mui-palette-text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
} as const;
