'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Alert, Box, Button, MenuItem, Skeleton, Switch, TextField, Typography } from '@mui/material';
import { errorMessage, inputSx, panelHeaderSx, primaryButtonSx, secondaryButtonSx, surfaceSx } from '@/components/settings/form-customization/builderUi';
import { useBookingSettings, useSaveBookingSettings } from '@/hooks/queries/useBookingLinks';
import { ROUTES } from '@/config/constants';
import { BOOKING_CREATOR_SCOPES, BOOKING_CREATOR_SCOPE_LABELS, type BookingSettings } from '@/types/bookingLink.types';
import { hintSx } from './integrationUi';

/**
 * Admin › API Integrations › Booking links (Calendar Phase 4): the company switch (default off) and who may create
 * public booking pages. Saved as the form-config module setting activities/bookingLinks (PUT /api/booking-links/settings).
 */
export function BookingLinksSettingsCard({ onDirtyChange, onToast }: { onDirtyChange: (dirty: boolean) => void; onToast: (message: string, severity?: 'success' | 'error') => void }) {
    const query = useBookingSettings();
    const save = useSaveBookingSettings();
    const [draft, setDraft] = useState<Partial<BookingSettings>>({});
    const saved = query.data;
    const value: BookingSettings | null = saved ? { ...saved, ...draft } : null;
    const dirty = Boolean(saved && value && (value.enabled !== saved.enabled || value.whoCanCreate !== saved.whoCanCreate));

    useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
    useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

    const submit = async () => {
        if (!value) return;
        try {
            await save.mutateAsync({ enabled: value.enabled, whoCanCreate: value.whoCanCreate });
            setDraft({});
            onToast(value.enabled ? 'Saved. Booking links are on.' : 'Saved. Booking links are off: every booking page now answers "not available".');
        } catch (err) {
            onToast(errorMessage(err, 'Could not save the booking link settings.'), 'error');
        }
    };

    return (
        <Box component="section" aria-labelledby="booking-links-title" sx={{ ...surfaceSx, overflow: 'hidden', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <Box sx={panelHeaderSx}>
                <Typography id="booking-links-title" component="h2" sx={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--crm-slate-900)' }}>
                    Booking links
                </Typography>
                <Typography sx={hintSx}>
                    Public pages where customers pick a free time on an employee&apos;s calendar (CRM activities plus the company calendar). Each booking becomes a
                    meeting activity of that employee.
                </Typography>
            </Box>
            <Box sx={{ p: { xs: 1.75, sm: 2 }, display: 'flex', flexDirection: 'column', gap: 1.5, flex: 1, minWidth: 0 }}>
                {query.isLoading ? (
                    <Skeleton variant="rounded" height={90} />
                ) : !value ? (
                    <Alert severity="error">{errorMessage(query.error, 'Could not load the booking link settings.')}</Alert>
                ) : (
                    <>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 40 }}>
                            <Switch
                                size="small"
                                checked={value.enabled}
                                disabled={save.isPending}
                                onChange={(e) => setDraft((d) => ({ ...d, enabled: e.target.checked }))}
                                slotProps={{ input: { 'aria-label': 'Booking links on' } }}
                            />
                            <Typography sx={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--crm-slate-900)' }}>{value.enabled ? 'On for the company' : 'Off for the company'}</Typography>
                        </Box>
                        <TextField
                            select
                            size="small"
                            label="Who may create links"
                            value={value.whoCanCreate}
                            disabled={save.isPending}
                            onChange={(e) => setDraft((d) => ({ ...d, whoCanCreate: e.target.value as BookingSettings['whoCanCreate'] }))}
                            sx={{ ...inputSx, maxWidth: 320 }}
                        >
                            {BOOKING_CREATOR_SCOPES.map((s) => (
                                <MenuItem key={s} value={s}>
                                    {BOOKING_CREATOR_SCOPE_LABELS[s]}
                                </MenuItem>
                            ))}
                        </TextField>
                        <Typography sx={hintSx}>
                            Admins can always make a link for a colleague. Turning this off stops every page at once (visitors see &quot;not available&quot;); links
                            and their bookings are kept. Visitors are never emailed; they get an on-page confirmation with a calendar file. Invitations from the
                            employee&apos;s mailbox are held for the employee to send.
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', mt: 'auto' }}>
                            <Link href={ROUTES.BOOKING_LINKS} style={{ fontSize: '0.8rem', color: 'var(--crm-text-blue-700)' }}>
                                Manage booking links
                            </Link>
                            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                                {dirty && (
                                    <Button variant="outlined" sx={{ ...secondaryButtonSx, minHeight: 36 }} onClick={() => setDraft({})} disabled={save.isPending}>
                                        Cancel
                                    </Button>
                                )}
                                <Button variant="contained" sx={{ ...primaryButtonSx, minHeight: 36 }} disabled={!dirty || save.isPending} onClick={() => void submit()}>
                                    {save.isPending ? 'Saving…' : 'Save'}
                                </Button>
                            </Box>
                        </Box>
                    </>
                )}
            </Box>
        </Box>
    );
}
