'use client';

import { useState } from 'react';
import { Box, Button } from '@mui/material';
import MailOutlineOutlinedIcon from '@mui/icons-material/MailOutlineOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import { MorningSummaryPreviewDialog } from '@/components/layout/MorningSummaryPreviewDialog';
import { errorMessage, secondaryButtonSx } from '@/components/settings/form-customization/builderUi';
import { useUpdatePreferences } from '@/hooks/queries/useProfile';
import type { PreferencesDto } from '@/types/preferences.types';
import type { Notify } from './ProfileView';
import { SwitchRow } from '@/components/common/SwitchRow';
import { CardSaveFooter, ProfileCard, ProfileNote, cardButtonLayoutSx } from './profileUi';

/**
 * My Profile › Notifications › Morning summary email: the user's switch for the 9 AM email, a preview, and why it
 * may not be sent (email off on the server, no address on the account, out of office / on leave). Explicit save.
 */
export function MorningSummaryCard({ preferences, notify }: { preferences: PreferencesDto; notify: Notify }) {
    const update = useUpdatePreferences();
    const [draft, setDraft] = useState<boolean | null>(null);
    const [previewOpen, setPreviewOpen] = useState(false);
    const value = draft ?? preferences.morningSummaryEmail;
    const dirty = value !== preferences.morningSummaryEmail;
    const saving = update.isPending;
    const { mail, email, onLeave, outOfOffice } = preferences;

    const onSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!dirty) return;
        try {
            await update.mutateAsync({ morningSummaryEmail: value });
            setDraft(null);
            notify(value ? 'Morning summary email turned on.' : 'Morning summary email turned off.');
        } catch (err) {
            notify(errorMessage(err, 'Could not save your morning summary setting.'), 'error');
        }
    };

    return (
        <ProfileCard
            id="morning-summary"
            icon={<MailOutlineOutlinedIcon fontSize="small" />}
            title="Morning summary email"
            description="A daily email with what needs your attention today."
            actions={
                <Button
                    variant="outlined"
                    onClick={() => setPreviewOpen(true)}
                    startIcon={<VisibilityOutlinedIcon sx={{ fontSize: '17px !important' }} />}
                    sx={{ ...secondaryButtonSx, ...cardButtonLayoutSx }}
                >
                    Preview morning email
                </Button>
            }
        >
            <Box component="form" noValidate onSubmit={onSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                <SwitchRow
                    checked={value}
                    onChange={(on) => setDraft(on)}
                    disabled={saving}
                    label="Send me the morning summary email"
                    hint="Today's activities, overdue items, follow-ups and contract renewals, every working day at 9 AM."
                />
                {(!mail.mailEnabled || !mail.summaryEnabled) && <ProfileNote>Email is turned off on the server, so nothing is sent yet.</ProfileNote>}
                {!email && (
                    <ProfileNote tone="warning">Your user account has no email address, so you won&apos;t get this email. Ask an admin to add one.</ProfileNote>
                )}
                {(outOfOffice?.active || onLeave) && (
                    <ProfileNote>Paused while you are {outOfOffice?.active ? 'out of office' : 'on leave'}.</ProfileNote>
                )}
                <CardSaveFooter dirty={dirty} saving={saving} onCancel={() => setDraft(null)} mt={1.25} />
            </Box>
            <MorningSummaryPreviewDialog open={previewOpen} onClose={() => setPreviewOpen(false)} />
        </ProfileCard>
    );
}
