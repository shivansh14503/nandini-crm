'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
    Alert,
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControlLabel,
    IconButton,
    Skeleton,
    Switch,
    Tooltip,
    Typography,
    useMediaQuery,
    useTheme,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import AutorenewRoundedIcon from '@mui/icons-material/AutorenewRounded';
import ListAltRoundedIcon from '@mui/icons-material/ListAltRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { AppToast } from '@/components/common/AppToast';
import { ConfirmDeleteDialog, EmptyState, errorMessage, primaryButtonSx, secondaryButtonSx, surfaceSx } from '@/components/settings/form-customization/builderUi';
import { StatusChip, formatDateTime, hintSx } from '@/components/settings/integrations/integrationUi';
import { useBookingLinkBookings, useBookingLinks, useNewBookingAddress, useUpdateBookingLink } from '@/hooks/queries/useBookingLinks';
import { useAuth } from '@/context/AuthContext';
import { useDropdownOptionLabel } from '@/hooks/queries/useFormConfigs';
import { FOLLOWUP_TYPE_CATEGORY_KEY } from '@/utils/formConfig';
import { ROUTES } from '@/config/constants';
import { durationLabel, BOOKING_WEEKDAYS, BOOKING_WEEKDAY_LABELS, type BookingLink } from '@/types/bookingLink.types';
import { BookingLinkDialog } from './BookingLinkDialog';

const iconButtonSx = {
    width: 36,
    height: 36,
    border: '1px solid var(--mui-palette-border-main)',
    borderRadius: '8px',
    color: 'var(--mui-palette-text-secondary)',
    backgroundColor: 'var(--mui-palette-background-paper)',
    transition: 'all 0.15s ease',
    '&:hover': { borderColor: 'var(--crm-blue-300)', backgroundColor: 'var(--mui-palette-primary-soft)', color: 'var(--crm-text-blue-700)' },
} as const;

/** The public address of a link on this app's origin. */
export const publicUrlOf = (link: Pick<BookingLink, 'path'>): string => (typeof window === 'undefined' ? link.path : `${window.location.origin}${link.path}`);

/** "Mon–Fri", "Mon, Wed, Fri" … from the weekly hours. */
function daysSummary(link: BookingLink): string {
    const on = BOOKING_WEEKDAYS.filter((d) => (link.availability[d] ?? []).length > 0);
    if (on.length === 0) return 'No hours';
    const short = (d: string) => BOOKING_WEEKDAY_LABELS[d as keyof typeof BOOKING_WEEKDAY_LABELS].slice(0, 3);
    const consecutive = on.every((d, i) => i === 0 || Number(d) === Number(on[i - 1]) + 1);
    return consecutive && on.length > 2 ? `${short(on[0])}–${short(on[on.length - 1])}` : on.map(short).join(', ');
}

function BookingsDialog({ link, onClose }: { link: BookingLink | null; onClose: () => void }) {
    const theme = useTheme();
    const phone = useMediaQuery(theme.breakpoints.down('sm'));
    const { data, isLoading, isError, error } = useBookingLinkBookings(link?.id ?? null);
    return (
        <Dialog open={Boolean(link)} onClose={onClose} fullScreen={phone} maxWidth="sm" fullWidth slotProps={{ paper: { sx: { borderRadius: phone ? 0 : '12px' } } }}>
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1, fontSize: '1rem', fontWeight: 700, color: 'var(--crm-slate-900)' }}>
                <Box sx={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>Bookings · {link?.title}</Box>
                <IconButton onClick={onClose} aria-label="Close" sx={{ width: 40, height: 40, color: 'var(--mui-palette-text-secondary)', '&:hover': { color: 'var(--mui-palette-error-main)', backgroundColor: 'var(--mui-palette-error-soft)' } }}>
                    <CloseRoundedIcon fontSize="small" />
                </IconButton>
            </DialogTitle>
            <DialogContent dividers sx={{ px: { xs: 1.5, sm: 2.5 } }}>
                {isLoading ? (
                    <Skeleton variant="rounded" height={120} />
                ) : isError ? (
                    <Alert severity="error">{errorMessage(error, 'Could not load the bookings.')}</Alert>
                ) : !data || data.length === 0 ? (
                    <EmptyState title="No bookings yet" description="Bookings made on this page show here, newest first." />
                ) : (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        {data.map((b) => (
                            <Box key={b.id} sx={{ border: '1px solid var(--mui-palette-border-main)', borderRadius: '10px', p: 1.25, display: 'flex', flexDirection: 'column', gap: 0.25, minWidth: 0 }}>
                                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                                    <Typography sx={{ fontWeight: 700, fontSize: '0.86rem', color: 'var(--crm-slate-900)', overflowWrap: 'anywhere' }}>{b.visitorName}</Typography>
                                    <StatusChip tone={b.activityStatus === 'Planned' ? 'brand' : b.activityStatus === 'Completed' ? 'success' : 'neutral'}>{b.activityStatus}</StatusChip>
                                </Box>
                                <Typography sx={{ fontSize: '0.8rem', color: 'var(--crm-slate-700)' }}>{formatDateTime(b.start)}</Typography>
                                <Typography sx={{ ...hintSx, overflowWrap: 'anywhere' }}>
                                    {[b.visitorEmail, b.visitorPhone, b.visitorCompany].filter(Boolean).join(' · ')}
                                </Typography>
                                {b.activityStatus !== 'Deleted' && (
                                    <Box>
                                        <Link href={ROUTES.ACTIVITY_DETAIL(b.activityId)} style={{ fontSize: '0.78rem', color: 'var(--crm-text-blue-700)' }}>
                                            Open the activity
                                        </Link>
                                    </Box>
                                )}
                            </Box>
                        ))}
                    </Box>
                )}
            </DialogContent>
            <DialogActions>
                <Button variant="outlined" onClick={onClose} sx={{ ...secondaryButtonSx, minHeight: 40 }}>
                    Close
                </Button>
            </DialogActions>
        </Dialog>
    );
}

function LinkCard({
    link,
    showOwner,
    onEdit,
    onBookings,
    onToggle,
    onNewAddress,
    onCopy,
    busy,
}: {
    link: BookingLink;
    showOwner: boolean;
    onEdit: () => void;
    onBookings: () => void;
    onToggle: (on: boolean) => void;
    onNewAddress: () => void;
    onCopy: () => void;
    busy: boolean;
}) {
    const url = publicUrlOf(link);
    const typeLabel = useDropdownOptionLabel(FOLLOWUP_TYPE_CATEGORY_KEY);
    return (
        <Box component="article" sx={{ ...surfaceSx, p: { xs: 1.75, sm: 2 }, display: 'flex', flexDirection: 'column', gap: 1.25, minWidth: 0, opacity: link.isActive ? 1 : 0.8 }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, minWidth: 0 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography component="h2" sx={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--crm-slate-900)', overflowWrap: 'anywhere' }}>
                        {link.title}
                    </Typography>
                    <Typography sx={{ ...hintSx, mt: 0.25 }}>
                        {[typeLabel(link.followupType) || link.followupType, link.durations.map(durationLabel).join(' / '), daysSummary(link), showOwner ? link.ownerName : ''].filter(Boolean).join(' · ')}
                    </Typography>
                </Box>
                <FormControlLabel
                    control={<Switch size="small" checked={link.isActive} disabled={busy} onChange={(e) => onToggle(e.target.checked)} slotProps={{ input: { 'aria-label': link.isActive ? 'Turn off' : 'Turn on' } }} />}
                    label={<Typography sx={{ fontSize: '0.76rem', color: 'var(--mui-palette-text-secondary)' }}>{link.isActive ? 'On' : 'Off'}</Typography>}
                    labelPlacement="start"
                    sx={{ m: 0, gap: 0.5, minHeight: 36 }}
                />
            </Box>
            <Box
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    px: 1.25,
                    py: 0.75,
                    borderRadius: '8px',
                    backgroundColor: 'var(--mui-palette-background-subtle)',
                    border: '1px solid var(--mui-palette-border-main)',
                    minWidth: 0,
                }}
            >
                <Typography sx={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-geist-mono), monospace', fontSize: '0.76rem', color: link.isActive ? 'var(--crm-slate-900)' : 'var(--mui-palette-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {url}
                </Typography>
                <Tooltip title="Copy link">
                    <IconButton size="small" onClick={onCopy} aria-label="Copy link" sx={iconButtonSx}>
                        <ContentCopyRoundedIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                </Tooltip>
                <Tooltip title="Open the page">
                    <IconButton size="small" component="a" href={link.path} target="_blank" rel="noopener noreferrer" aria-label="Open the page" sx={iconButtonSx}>
                        <OpenInNewRoundedIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                </Tooltip>
            </Box>
            <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', alignItems: 'center' }}>
                <StatusChip tone={link.bookings.upcoming > 0 ? 'brand' : 'neutral'}>{link.bookings.upcoming} upcoming</StatusChip>
                <Typography sx={hintSx}>
                    {link.bookings.total} booked{link.bookings.lastBookedAt ? `, last ${formatDateTime(link.bookings.lastBookedAt)}` : ''}
                </Typography>
                {link.ownerCalendar === 'error' && (
                    <StatusChip tone="error" title="The company calendar of the owner can't be read, so the page shows no times until it works again.">
                        Calendar problem: no times shown
                    </StatusChip>
                )}
                {link.ownerCalendar === 'not_connected' && (
                    <StatusChip tone="warning" title="Times are checked against CRM activities only: Google / Outlook meetings outside the CRM are not seen.">
                        CRM activities only
                    </StatusChip>
                )}
            </Box>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 'auto' }}>
                <Button size="small" variant="outlined" startIcon={<EditOutlinedIcon fontSize="small" />} onClick={onEdit} disabled={busy} sx={{ ...secondaryButtonSx, minHeight: 36 }}>
                    Edit
                </Button>
                <Button size="small" variant="outlined" startIcon={<ListAltRoundedIcon fontSize="small" />} onClick={onBookings} sx={{ ...secondaryButtonSx, minHeight: 36 }}>
                    Bookings
                </Button>
                <Button size="small" variant="outlined" startIcon={<AutorenewRoundedIcon fontSize="small" />} onClick={onNewAddress} disabled={busy} sx={{ ...secondaryButtonSx, minHeight: 36 }}>
                    New address
                </Button>
            </Box>
        </Box>
    );
}

/**
 * /booking-links: the signed-in user's booking links (admins: also everyone's, and a link for a colleague). Cards in a
 * grid that collapses to one column on phones.
 */
export function BookingLinksView() {
    const { user } = useAuth();
    const [scope, setScope] = useState<'mine' | 'all'>('mine');
    const query = useBookingLinks(scope);
    const update = useUpdateBookingLink();
    const newAddress = useNewBookingAddress();
    const [editing, setEditing] = useState<{ open: boolean; link: BookingLink | null; version: number }>({ open: false, link: null, version: 0 });
    const [bookingsOf, setBookingsOf] = useState<BookingLink | null>(null);
    const [renewing, setRenewing] = useState<BookingLink | null>(null);
    const [toast, setToast] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });
    const showToast = (message: string, severity: 'success' | 'error' = 'success') => setToast({ open: true, message, severity });

    const access = query.data?.access;
    const links = query.data?.links ?? [];
    const canMake = Boolean(access && (access.canCreate || (access.enabled && access.isAdmin)));
    const busy = update.isPending || newAddress.isPending;

    const copy = async (link: BookingLink) => {
        try {
            await navigator.clipboard.writeText(publicUrlOf(link));
            showToast('Link copied.');
        } catch {
            showToast('Could not copy. Select the address and copy it instead.', 'error');
        }
    };
    const toggle = async (link: BookingLink, on: boolean) => {
        try {
            await update.mutateAsync({ id: link.id, payload: { isActive: on } });
            showToast(on ? 'The page takes bookings again.' : 'Turned off. The page now answers "not available".');
        } catch (err) {
            showToast(errorMessage(err, 'Could not change the link.'), 'error');
        }
    };
    const renew = async () => {
        if (!renewing) return;
        try {
            const saved = await newAddress.mutateAsync(renewing.id);
            setRenewing(null);
            showToast(`New address made: ${publicUrlOf(saved)}`);
        } catch (err) {
            showToast(errorMessage(err, 'Could not make a new address.'), 'error');
        }
    };

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <Box sx={{ ...surfaceSx, p: { xs: 2, md: 2.5 }, display: 'flex', gap: 1.5, alignItems: 'flex-start', flexWrap: { xs: 'wrap', sm: 'nowrap' } }}>
                <Box
                    sx={{
                        width: 40,
                        height: 40,
                        borderRadius: '10px',
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: 'var(--crm-module-activities-soft)',
                        border: '1px solid var(--crm-module-activities-border)',
                        color: 'var(--crm-module-activities-main)',
                    }}
                >
                    <EventAvailableOutlinedIcon />
                </Box>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography component="h1" sx={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--crm-slate-900)' }}>
                        Booking links
                    </Typography>
                    <Typography sx={{ fontSize: '0.8rem', color: 'var(--mui-palette-text-secondary)', mt: 0.25, lineHeight: 1.55 }}>
                        Share a link and customers pick a free time on your calendar themselves. Times come from your CRM activities and your company calendar;
                        each booking becomes an activity of yours and you get a notification. No email is sent to the visitor: they get an on-page confirmation with a
                        calendar file.
                    </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', width: { xs: '100%', sm: 'auto' }, justifyContent: { xs: 'space-between', sm: 'flex-end' } }}>
                    {access?.isAdmin && (
                        <FormControlLabel
                            control={<Switch size="small" checked={scope === 'all'} onChange={(e) => setScope(e.target.checked ? 'all' : 'mine')} />}
                            label={<Typography sx={{ fontSize: '0.8rem' }}>Everyone&apos;s links</Typography>}
                            sx={{ m: 0, gap: 0.5, minHeight: 40 }}
                        />
                    )}
                    {canMake && (
                        <Button
                            variant="contained"
                            startIcon={<AddIcon />}
                            onClick={() => setEditing((e) => ({ open: true, link: null, version: e.version + 1 }))}
                            sx={{ ...primaryButtonSx, color: '#ffffff', minHeight: 40, whiteSpace: 'nowrap' }}
                        >
                            New link
                        </Button>
                    )}
                </Box>
            </Box>

            {query.isLoading ? (
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0,1fr)', md: 'repeat(2, minmax(0,1fr))', xl: 'repeat(3, minmax(0,1fr))' }, gap: 2 }}>
                    {[0, 1].map((i) => (
                        <Skeleton key={i} variant="rounded" height={210} sx={{ borderRadius: '12px' }} />
                    ))}
                </Box>
            ) : query.isError ? (
                <Alert
                    severity="error"
                    action={
                        <Button size="small" variant="outlined" sx={secondaryButtonSx} onClick={() => void query.refetch()}>
                            Try again
                        </Button>
                    }
                >
                    {errorMessage(query.error, 'Could not load booking links.')}
                </Alert>
            ) : (
                <>
                    {access && !access.enabled && (
                        <Alert severity="info">
                            Booking links are turned off for the company. Existing pages don&apos;t take bookings. An admin can turn them on in Admin › API Integrations.
                        </Alert>
                    )}
                    {access && access.enabled && !access.canCreate && !access.isAdmin && (
                        <Alert severity="info">Your role can&apos;t create booking links. Ask an admin if you need one.</Alert>
                    )}
                    {links.length === 0 ? (
                        <Box sx={surfaceSx}>
                            <EmptyState
                                icon={<EventAvailableOutlinedIcon />}
                                title={scope === 'all' ? 'Nobody has a booking link yet' : 'You have no booking links yet'}
                                description="Make one for each kind of meeting you offer, e.g. a 30-minute intro call or a 1-hour product demo."
                            />
                        </Box>
                    ) : (
                        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0,1fr)', md: 'repeat(2, minmax(0,1fr))', xl: 'repeat(3, minmax(0,1fr))' }, gap: 2, alignItems: 'stretch' }}>
                            {links.map((link) => (
                                <LinkCard
                                    key={link.id}
                                    link={link}
                                    showOwner={scope === 'all'}
                                    busy={busy}
                                    onEdit={() => setEditing((e) => ({ open: true, link, version: e.version + 1 }))}
                                    onBookings={() => setBookingsOf(link)}
                                    onToggle={(on) => void toggle(link, on)}
                                    onNewAddress={() => setRenewing(link)}
                                    onCopy={() => void copy(link)}
                                />
                            ))}
                        </Box>
                    )}
                </>
            )}

            {user && editing.open && (
                <BookingLinkDialog
                    key={editing.version}
                    open
                    link={editing.link}
                    me={user.username}
                    isAdmin={Boolean(access?.isAdmin)}
                    onClose={() => setEditing((e) => ({ ...e, open: false }))}
                    onSaved={(saved, created) => {
                        setEditing((e) => ({ ...e, open: false }));
                        showToast(created ? 'Booking link created. Copy it and share it with customers.' : 'Saved. Times shown before the change must be picked again.');
                        if (created) void navigator.clipboard?.writeText(publicUrlOf(saved)).catch(() => undefined);
                    }}
                />
            )}
            <BookingsDialog link={bookingsOf} onClose={() => setBookingsOf(null)} />
            <ConfirmDeleteDialog
                open={Boolean(renewing)}
                title="Make a new address?"
                confirmLabel={newAddress.isPending ? 'Making…' : 'Make a new address'}
                confirmDisabled={newAddress.isPending}
                onClose={() => setRenewing(null)}
                onConfirm={() => void renew()}
            >
                The current address of &quot;{renewing?.title ?? ''}&quot; stops working at once; anyone you sent it to will see &quot;not available&quot;. The settings
                and bookings stay.
            </ConfirmDeleteDialog>
            <AppToast open={toast.open} message={toast.message} severity={toast.severity} onClose={() => setToast((t) => ({ ...t, open: false }))} />
        </Box>
    );
}
