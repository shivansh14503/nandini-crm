'use client';

import React, { useState, useSyncExternalStore } from 'react';
import Image from 'next/image';
import { useParams } from 'next/navigation';
import { Alert, Box, Button, CircularProgress, IconButton, MenuItem, Skeleton, TextField, Typography } from '@mui/material';
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import ScheduleRoundedIcon from '@mui/icons-material/ScheduleRounded';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import VideocamOutlinedIcon from '@mui/icons-material/VideocamOutlined';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiClientError } from '@/services/apiClient';
import { publicBookingService } from '@/services/bookingLink.service';
import { APP_CONFIG } from '@/config/constants';
import {
    BOOKING_ERROR_CODES,
    BOOKING_VISITOR_COMPANY_MAX,
    BOOKING_VISITOR_MESSAGE_MAX,
    BOOKING_VISITOR_NAME_MAX,
    durationLabel,
    type BookingConfirmation,
    type PublicBookingLink,
} from '@/types/bookingLink.types';

/**
 * The public booking page (`/book/<slug>`): no sign-in, outside the app shell, phone first. A visitor picks a duration,
 * a day and a free time (each time comes with a token the server signed), enters their details and books; the answer
 * is an on-page confirmation with an .ics file (no email is sent). The API never sends busy blocks, only free starts.
 * Times show in the visitor's time zone by default, or in the company's.
 */

const codeOf = (err: unknown): string | undefined => (err instanceof ApiClientError ? err.details?.code : undefined);
const statusOf = (err: unknown): number | undefined => (err instanceof ApiClientError ? err.status : undefined);
const NETWORK_TEXT = "We couldn't reach the booking service. Check your connection and try again.";
/** The server's message; a request that never got an answer (offline, unreachable API) has no status. */
const messageOf = (err: unknown, fallback: string) =>
    err instanceof ApiClientError && err.status === undefined ? NETWORK_TEXT : err instanceof Error && err.message ? err.message : fallback;

function browserTimeZone(): string {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
        return 'UTC';
    }
}

const subscribeNothing = () => () => undefined;
const serverTimeZone = () => 'UTC';

const timeText = (iso: string, timeZone: string) => new Intl.DateTimeFormat(undefined, { timeZone, hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
const dayOfInstant = (iso: string, timeZone: string) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
/** A `YYYY-MM-DD` as "Mon", "3 Dec". */
const dayParts = (day: string) => {
    const [y, m, d] = day.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d, 12));
    return {
        weekday: new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', weekday: 'short' }).format(date),
        date: new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(date),
        long: new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(date),
    };
};
const longWhen = (iso: string, timeZone: string) =>
    new Intl.DateTimeFormat(undefined, { timeZone, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));

const cardSx = {
    borderRadius: '14px',
    border: '1px solid var(--mui-palette-border-main)',
    backgroundColor: 'var(--mui-palette-background-paper)',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
} as const;

const primarySx = {
    textTransform: 'none',
    fontWeight: 600,
    borderRadius: '10px',
    minHeight: 44,
    boxShadow: 'none',
    color: '#ffffff',
    background: 'linear-gradient(135deg, var(--crm-fill-blue-700) 0%, var(--crm-fill-blue-600) 100%)',
    '&:hover': { background: 'linear-gradient(135deg, var(--crm-fill-blue-800) 0%, var(--crm-fill-blue-700) 100%)', boxShadow: '0 4px 14px rgb(var(--crm-accent-rgb) / 0.28)' },
    '&.Mui-disabled': { color: 'var(--mui-palette-text-muted)', background: 'var(--mui-palette-background-hover)' },
} as const;

const outlinedSx = {
    textTransform: 'none',
    fontWeight: 600,
    borderRadius: '10px',
    minHeight: 44,
    border: '1px solid var(--mui-palette-border-main)',
    color: 'var(--crm-slate-700)',
    backgroundColor: 'var(--mui-palette-background-paper)',
    transition: 'all 0.15s ease',
    '&:hover': { borderColor: 'var(--crm-blue-300)', backgroundColor: 'var(--mui-palette-primary-soft)', color: 'var(--crm-text-blue-700)' },
} as const;

const inputSx = {
    '& .MuiOutlinedInput-root': {
        borderRadius: '10px',
        backgroundColor: 'var(--mui-palette-background-paper)',
        '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--mui-palette-border-strong)' },
        '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--mui-palette-primary-main)', boxShadow: '0 0 0 3px rgb(var(--crm-accent-rgb) / 0.22)' },
    },
} as const;

function PageFrame({ children }: { children: React.ReactNode }) {
    return (
        <Box component="main" sx={{ minHeight: '100dvh', backgroundColor: 'var(--mui-palette-background-default)', px: { xs: 1.5, sm: 3 }, py: { xs: 2, sm: 4 } }}>
            <Box sx={{ maxWidth: 960, mx: 'auto', display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Image src="/images/NIPL-Updated-Logo-Large.png" alt={APP_CONFIG.logoAlt} width={28} height={28} style={{ objectFit: "contain" }} />
                    <Typography sx={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--crm-slate-900)' }}>{APP_CONFIG.companyName}</Typography>
                </Box>
                {children}
            </Box>
        </Box>
    );
}

function NotAvailable() {
    return (
        <Box sx={{ ...cardSx, p: { xs: 3, sm: 5 }, textAlign: 'center' }}>
            <EventAvailableOutlinedIcon sx={{ fontSize: 40, color: 'var(--mui-palette-text-muted)' }} />
            <Typography component="h1" sx={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--crm-slate-900)', mt: 1 }}>
                This booking page isn&apos;t available
            </Typography>
            <Typography sx={{ fontSize: '0.88rem', color: 'var(--mui-palette-text-secondary)', mt: 0.5 }}>
                The link may be mistyped, or it is no longer in use. Please ask the person who sent it for a new one.
            </Typography>
        </Box>
    );
}

function downloadIcs(confirmation: BookingConfirmation) {
    const blob = new Blob([confirmation.ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${confirmation.booking.title.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'meeting'}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * The meeting's video link on the confirmation: the join link when the organiser's calendar had already made it, else
 * who sends it. Never polled: the link is made after this answer, when the meeting reaches the organiser's calendar.
 */
function ConfirmedVideo({ video, ownerName }: { video: NonNullable<BookingConfirmation['video']>; ownerName: string }) {
    return (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5, flexWrap: 'wrap', fontSize: '0.84rem', color: 'var(--crm-slate-700)', minWidth: 0 }}>
            <VideocamOutlinedIcon sx={{ fontSize: 18, color: 'var(--mui-palette-text-muted)' }} />
            {video.joinUrl ? (
                <>
                    {video.label}:{' '}
                    <Box
                        component="a"
                        href={video.joinUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        sx={{ color: 'var(--crm-text-blue-700)', fontWeight: 600, overflowWrap: 'anywhere', '&:hover': { color: 'var(--crm-text-blue-600)' } }}
                    >
                        {video.joinUrl}
                    </Box>
                </>
            ) : (
                <span>
                    {video.label} link: sent by {ownerName}
                </span>
            )}
        </Box>
    );
}

function Confirmed({ confirmation, timeZone, onAnother }: { confirmation: BookingConfirmation; timeZone: string; onAnother: () => void }) {
    const b = confirmation.booking;
    // Older servers don't send `video`.
    const video = confirmation.video ?? null;
    return (
        <Box sx={{ ...cardSx, p: { xs: 2.5, sm: 4 }, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 1.25 }} role="status" aria-live="polite">
            <CheckCircleRoundedIcon sx={{ fontSize: 48, color: 'var(--mui-palette-success-main)' }} />
            <Typography component="h1" sx={{ fontWeight: 700, fontSize: { xs: '1.15rem', sm: '1.3rem' }, color: 'var(--crm-slate-900)' }}>
                You&apos;re booked
            </Typography>
            <Typography sx={{ fontSize: '0.92rem', color: 'var(--crm-slate-700)', maxWidth: 520 }}>
                {b.title} with {b.ownerName}
            </Typography>
            <Box sx={{ backgroundColor: 'var(--mui-palette-background-subtle)', border: '1px solid var(--mui-palette-border-main)', borderRadius: '10px', px: 2, py: 1.5, width: '100%', maxWidth: 520, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--crm-slate-900)' }}>{longWhen(b.start, timeZone)}</Typography>
                <Typography sx={{ fontSize: '0.82rem', color: 'var(--mui-palette-text-secondary)' }}>
                    {durationLabel(b.durationMinutes)} · {timeZone}
                </Typography>
                {b.location && <Typography sx={{ fontSize: '0.84rem', color: 'var(--crm-slate-700)', overflowWrap: 'anywhere' }}>{b.location}</Typography>}
                {video && <ConfirmedVideo video={video} ownerName={b.ownerName} />}
            </Box>
            <Typography sx={{ fontSize: '0.82rem', color: 'var(--mui-palette-text-secondary)', maxWidth: 520 }}>
                No confirmation email is sent from this page, so add the meeting to your calendar now. {b.ownerName} may send a calendar invitation as well
                {video && !video.joinUrl ? `, and will share the ${video.label} link before the meeting` : ''}.
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'center', mt: 0.5 }}>
                <Button variant="contained" startIcon={<DownloadRoundedIcon />} onClick={() => downloadIcs(confirmation)} sx={primarySx}>
                    Add to my calendar (.ics)
                </Button>
                <Button variant="outlined" onClick={onAnother} sx={outlinedSx}>
                    Book another time
                </Button>
            </Box>
        </Box>
    );
}

interface Picked {
    start: string;
    token: string;
    /** The length the token was signed for (the slots page's duration). */
    duration: number;
}

/** What the visitor typed (kept by the page, so picking another time doesn't clear it). */
interface VisitorDetails {
    name: string;
    email: string;
    phone: string;
    company: string;
    message: string;
    /** Honeypot. */
    website: string;
}

const EMPTY_DETAILS: VisitorDetails = { name: '', email: '', phone: '', company: '', message: '', website: '' };

function BookingForm({
    link,
    slug,
    picked,
    timeZone,
    values,
    setValues,
    onBack,
    onBooked,
    onSlotGone,
}: {
    link: PublicBookingLink;
    slug: string;
    picked: Picked;
    timeZone: string;
    values: VisitorDetails;
    setValues: React.Dispatch<React.SetStateAction<VisitorDetails>>;
    onBack: () => void;
    onBooked: (c: BookingConfirmation) => void;
    onSlotGone: (message: string) => void;
}) {
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [formError, setFormError] = useState('');
    const [sending, setSending] = useState(false);
    const set = (key: keyof VisitorDetails) => (e: React.ChangeEvent<HTMLInputElement>) => setValues((v) => ({ ...v, [key]: e.target.value }));

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        const local: Record<string, string> = {};
        if (!values.name.trim()) local.name = 'Please enter your name.';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) local.email = 'Please enter a valid email address.';
        setErrors(local);
        setFormError('');
        if (Object.keys(local).length) return;
        setSending(true);
        try {
            const confirmation = await publicBookingService.book(slug, {
                token: picked.token,
                name: values.name.trim(),
                email: values.email.trim(),
                ...(link.askPhone && values.phone.trim() ? { phone: values.phone.trim() } : {}),
                ...(link.askCompany && values.company.trim() ? { company: values.company.trim() } : {}),
                ...(values.message.trim() ? { message: values.message.trim() } : {}),
                website: values.website,
            });
            onBooked(confirmation);
        } catch (err) {
            const code = codeOf(err);
            if (code === BOOKING_ERROR_CODES.slotUnavailable || code === BOOKING_ERROR_CODES.dayFull) {
                onSlotGone(messageOf(err, 'That time is no longer available. Please pick another time.'));
                return;
            }
            const fieldErrors: Record<string, string> = {};
            if (err instanceof ApiClientError) for (const fe of err.details?.errors ?? []) if (fe.path?.[0] && !fieldErrors[fe.path[0]]) fieldErrors[fe.path[0]] = fe.message;
            setErrors(fieldErrors);
            setFormError(statusOf(err) === 429 ? 'Too many attempts. Please wait a little and try again.' : messageOf(err, 'Your booking could not be completed. Please try again.'));
        } finally {
            setSending(false);
        }
    };

    return (
        <Box component="form" noValidate onSubmit={(e) => void submit(e)} sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <IconButton onClick={onBack} aria-label="Pick another time" disabled={sending} sx={{ width: 40, height: 40, border: '1px solid var(--mui-palette-border-main)', borderRadius: '10px', color: 'var(--mui-palette-text-secondary)', '&:hover': { borderColor: 'var(--crm-blue-300)', backgroundColor: 'var(--mui-palette-primary-soft)', color: 'var(--crm-text-blue-700)' } }}>
                    <ArrowBackRoundedIcon fontSize="small" />
                </IconButton>
                <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--crm-slate-900)' }}>{longWhen(picked.start, timeZone)}</Typography>
                    <Typography sx={{ fontSize: '0.78rem', color: 'var(--mui-palette-text-secondary)' }}>
                        {durationLabel(picked.duration)} · {timeZone}
                    </Typography>
                </Box>
            </Box>
            {formError && <Alert severity="error">{formError}</Alert>}
            <TextField label="Your name" required value={values.name} onChange={set('name')} autoComplete="name" error={Boolean(errors.name)} helperText={errors.name} slotProps={{ htmlInput: { maxLength: BOOKING_VISITOR_NAME_MAX } }} sx={inputSx} />
            <TextField label="Email" type="email" required value={values.email} onChange={set('email')} autoComplete="email" error={Boolean(errors.email)} helperText={errors.email} slotProps={{ htmlInput: { maxLength: 120, inputMode: 'email' } }} sx={inputSx} />
            {link.askPhone && <TextField label="Phone (optional)" type="tel" value={values.phone} onChange={set('phone')} autoComplete="tel" error={Boolean(errors.phone)} helperText={errors.phone} slotProps={{ htmlInput: { maxLength: 30, inputMode: 'tel' } }} sx={inputSx} />}
            {link.askCompany && <TextField label="Company (optional)" value={values.company} onChange={set('company')} autoComplete="organization" error={Boolean(errors.company)} helperText={errors.company} slotProps={{ htmlInput: { maxLength: BOOKING_VISITOR_COMPANY_MAX } }} sx={inputSx} />}
            <TextField label="Anything we should know? (optional)" multiline minRows={3} value={values.message} onChange={set('message')} error={Boolean(errors.message)} helperText={errors.message} slotProps={{ htmlInput: { maxLength: BOOKING_VISITOR_MESSAGE_MAX } }} sx={inputSx} />
            {/* Honeypot: hidden from people and screen readers; automated form fillers tend to fill it. */}
            <Box aria-hidden="true" sx={{ position: 'absolute', left: '-10000px', top: 'auto', width: 1, height: 1, overflow: 'hidden' }}>
                <label>
                    Website
                    <input type="text" name="website" tabIndex={-1} autoComplete="off" value={values.website} onChange={set('website')} />
                </label>
            </Box>
            <Button type="submit" variant="contained" disabled={sending} sx={primarySx}>
                {sending ? <CircularProgress size={20} sx={{ color: 'inherit' }} /> : 'Confirm booking'}
            </Button>
            <Typography sx={{ fontSize: '0.74rem', color: 'var(--mui-palette-text-muted)' }}>
                Your details go only to {link.ownerName} at {APP_CONFIG.companyName}, to prepare and hold this meeting.
            </Typography>
        </Box>
    );
}

export function PublicBookingPage({ slug }: { slug: string }) {
    const queryClient = useQueryClient();
    // The visitor's zone (the server renders with UTC; the browser's zone takes over on hydration).
    const localZone = useSyncExternalStore(subscribeNothing, browserTimeZone, serverTimeZone);
    const [zoneChoice, setZoneChoice] = useState<'local' | 'company'>('local');
    const [duration, setDuration] = useState<number | null>(null);
    const [from, setFrom] = useState<string | undefined>(undefined);
    const [day, setDay] = useState<string | null>(null);
    const [picked, setPicked] = useState<Picked | null>(null);
    const [details, setDetails] = useState<VisitorDetails>(EMPTY_DETAILS);
    const [confirmation, setConfirmation] = useState<BookingConfirmation | null>(null);
    const [notice, setNotice] = useState('');

    const view = useQuery({ queryKey: ['public-booking', slug], queryFn: () => publicBookingService.view(slug), retry: false, staleTime: 5 * 60 * 1000 });
    const link = view.data;
    const activeDuration = duration ?? link?.defaultDuration ?? null;
    const slots = useQuery({
        queryKey: ['public-booking', slug, 'slots', activeDuration, from ?? ''],
        queryFn: () => publicBookingService.slots(slug, { from, days: 7, duration: activeDuration ?? undefined }),
        enabled: Boolean(link && activeDuration),
        retry: false,
        // Tokens are good for 30 minutes: refresh well before.
        staleTime: 60 * 1000,
        refetchInterval: 10 * 60 * 1000,
        placeholderData: keepPreviousData,
    });

    const timeZone = zoneChoice === 'company' && link ? link.timeZone : localZone;
    // While another duration's times load, the previous page (kept as placeholder) must not be clickable: its tokens
    // are signed for the old length.
    const slotsData = slots.data && slots.data.duration === activeDuration ? slots.data : undefined;
    const days = slotsData?.days ?? [];
    // The chosen day while it still has times, else the first day of the page with times.
    const selectedDay = days.find((d) => d.date === day && d.slots.length > 0) ?? days.find((d) => d.slots.length > 0) ?? null;

    const refreshSlots = () => void queryClient.invalidateQueries({ queryKey: ['public-booking', slug, 'slots'] });

    if (view.isLoading) {
        return (
            <PageFrame>
                <Skeleton variant="rounded" height={140} sx={{ borderRadius: '14px' }} />
                <Skeleton variant="rounded" height={320} sx={{ borderRadius: '14px' }} />
            </PageFrame>
        );
    }
    if (view.isError || !link) {
        const status = statusOf(view.error);
        return (
            <PageFrame>
                {status === 404 ? (
                    <NotAvailable />
                ) : (
                    <Alert severity="error" action={<Button onClick={() => void view.refetch()} sx={outlinedSx}>Try again</Button>}>
                        {status === 429 ? 'Too many requests. Please wait a minute and try again.' : messageOf(view.error, 'This page could not be loaded. Please try again.')}
                    </Alert>
                )}
            </PageFrame>
        );
    }

    if (confirmation) {
        return (
            <PageFrame>
                <Confirmed
                    confirmation={confirmation}
                    timeZone={timeZone}
                    onAnother={() => {
                        setConfirmation(null);
                        setPicked(null);
                        refreshSlots();
                    }}
                />
            </PageFrame>
        );
    }

    const slotsError = slots.isError ? slots.error : null;
    const slotsErrorText = !slotsError
        ? ''
        : codeOf(slotsError) === BOOKING_ERROR_CODES.calendarUnavailable
          ? "Times can't be shown right now. Please try again in a few minutes."
          : statusOf(slotsError) === 429
            ? 'Too many requests. Please wait a minute and try again.'
            : messageOf(slotsError, 'Times could not be loaded.');

    return (
        <PageFrame>
            {/* About the meeting */}
            <Box component="header" sx={{ ...cardSx, p: { xs: 2, sm: 3 }, display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Typography sx={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--mui-palette-text-secondary)' }}>{link.ownerName}</Typography>
                <Typography component="h1" sx={{ fontWeight: 800, fontSize: { xs: '1.25rem', sm: '1.5rem' }, color: 'var(--crm-slate-900)', overflowWrap: 'anywhere', lineHeight: 1.25 }}>
                    {link.title}
                </Typography>
                <Box sx={{ display: 'flex', gap: { xs: 1, sm: 2 }, flexWrap: 'wrap', color: 'var(--crm-slate-700)', fontSize: '0.86rem' }}>
                    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                        <ScheduleRoundedIcon sx={{ fontSize: 18, color: 'var(--mui-palette-text-muted)' }} />
                        {link.typeLabel} · {link.durations.map(durationLabel).join(' / ')}
                    </Box>
                    {link.location && (
                        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, minWidth: 0, overflowWrap: 'anywhere' }}>
                            <PlaceOutlinedIcon sx={{ fontSize: 18, color: 'var(--mui-palette-text-muted)' }} />
                            {link.location}
                        </Box>
                    )}
                    {link.videoMeeting && (
                        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, minWidth: 0, overflowWrap: 'anywhere' }}>
                            <VideocamOutlinedIcon sx={{ fontSize: 18, color: 'var(--mui-palette-text-muted)' }} />
                            {link.videoMeeting.label} link: sent by {link.ownerName}
                        </Box>
                    )}
                </Box>
                {link.note && <Typography sx={{ fontSize: '0.88rem', color: 'var(--crm-slate-700)', whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>{link.note}</Typography>}
            </Box>

            <Box sx={{ ...cardSx, p: { xs: 2, sm: 3 }, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                {picked ? (
                    <BookingForm
                        link={link}
                        slug={slug}
                        picked={picked}
                        timeZone={timeZone}
                        values={details}
                        setValues={setDetails}
                        onBack={() => setPicked(null)}
                        onBooked={setConfirmation}
                        onSlotGone={(message) => {
                            setPicked(null);
                            setNotice(message);
                            refreshSlots();
                        }}
                    />
                ) : (
                    <>
                        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Typography component="h2" sx={{ fontWeight: 700, fontSize: '1rem', color: 'var(--crm-slate-900)' }}>
                                Pick a time
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', minWidth: 0 }}>
                                {link.durations.length > 1 && (
                                    <TextField
                                        select
                                        size="small"
                                        label="Duration"
                                        value={activeDuration ?? ''}
                                        onChange={(e) => {
                                            setDuration(Number(e.target.value));
                                            setNotice('');
                                        }}
                                        sx={{ ...inputSx, minWidth: 120 }}
                                    >
                                        {link.durations.map((m) => (
                                            <MenuItem key={m} value={m}>
                                                {durationLabel(m)}
                                            </MenuItem>
                                        ))}
                                    </TextField>
                                )}
                                {localZone !== link.timeZone && (
                                    <TextField select size="small" label="Time zone" value={zoneChoice} onChange={(e) => setZoneChoice(e.target.value as 'local' | 'company')} sx={{ ...inputSx, minWidth: 0, maxWidth: '100%' }}>
                                        <MenuItem value="local">Your time ({localZone})</MenuItem>
                                        <MenuItem value="company">{link.timeZone}</MenuItem>
                                    </TextField>
                                )}
                            </Box>
                        </Box>

                        {notice && (
                            <Alert severity="warning" onClose={() => setNotice('')}>
                                {notice}
                            </Alert>
                        )}

                        {slotsError ? (
                            <Alert severity="warning" action={<Button onClick={refreshSlots} sx={outlinedSx}>Try again</Button>}>
                                {slotsErrorText}
                            </Alert>
                        ) : !slotsData ? (
                            <Skeleton variant="rounded" height={220} sx={{ borderRadius: '10px' }} />
                        ) : (
                            <>
                                {/* Day strip: scrolls sideways inside itself on phones. */}
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                                    <IconButton
                                        aria-label="Earlier days"
                                        disabled={!slotsData.prevFrom || slots.isFetching}
                                        onClick={() => setFrom(slotsData.prevFrom ?? undefined)}
                                        sx={{ width: 40, height: 40, flexShrink: 0, border: '1px solid var(--mui-palette-border-main)', borderRadius: '10px', '&:hover': { borderColor: 'var(--crm-blue-300)', backgroundColor: 'var(--mui-palette-primary-soft)', color: 'var(--crm-text-blue-700)' } }}
                                    >
                                        <ChevronLeftRoundedIcon />
                                    </IconButton>
                                    <Box role="tablist" aria-label="Days" sx={{ display: 'flex', gap: 0.75, overflowX: 'auto', flex: 1, minWidth: 0, py: 0.5, scrollbarWidth: 'thin' }}>
                                        {days.map((d) => {
                                            const parts = dayParts(d.date);
                                            const active = selectedDay?.date === d.date;
                                            const none = d.slots.length === 0;
                                            return (
                                                <Box
                                                    key={d.date}
                                                    component="button"
                                                    type="button"
                                                    role="tab"
                                                    aria-selected={active}
                                                    aria-label={`${parts.long}${none ? ', no times' : `, ${d.slots.length} times`}`}
                                                    disabled={none}
                                                    onClick={() => setDay(d.date)}
                                                    sx={{
                                                        flex: '1 0 64px',
                                                        minWidth: 64,
                                                        minHeight: 60,
                                                        px: 1,
                                                        py: 0.75,
                                                        borderRadius: '10px',
                                                        cursor: none ? 'default' : 'pointer',
                                                        font: 'inherit',
                                                        border: '1px solid',
                                                        borderColor: active ? 'transparent' : 'var(--mui-palette-border-main)',
                                                        background: active ? 'linear-gradient(135deg, var(--crm-fill-blue-700) 0%, var(--crm-fill-blue-600) 100%)' : 'var(--mui-palette-background-paper)',
                                                        color: active ? '#ffffff' : none ? 'var(--mui-palette-text-muted)' : 'var(--crm-slate-900)',
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        alignItems: 'center',
                                                        gap: 0.25,
                                                        transition: 'all 0.15s ease',
                                                        '&:hover:not(:disabled)': active ? {} : { borderColor: 'var(--crm-blue-300)', backgroundColor: 'var(--mui-palette-primary-soft)', color: 'var(--crm-text-blue-700)' },
                                                        '&:focus-visible': { outline: 'none', boxShadow: '0 0 0 3px rgb(var(--crm-accent-rgb) / 0.22)' },
                                                    }}
                                                >
                                                    <Box component="span" sx={{ fontSize: '0.72rem', fontWeight: 600, opacity: 0.85 }}>{parts.weekday}</Box>
                                                    <Box component="span" sx={{ fontSize: '0.86rem', fontWeight: 700, whiteSpace: 'nowrap' }}>{parts.date}</Box>
                                                </Box>
                                            );
                                        })}
                                    </Box>
                                    <IconButton
                                        aria-label="Later days"
                                        disabled={!slotsData.nextFrom || slots.isFetching}
                                        onClick={() => setFrom(slotsData.nextFrom ?? undefined)}
                                        sx={{ width: 40, height: 40, flexShrink: 0, border: '1px solid var(--mui-palette-border-main)', borderRadius: '10px', '&:hover': { borderColor: 'var(--crm-blue-300)', backgroundColor: 'var(--mui-palette-primary-soft)', color: 'var(--crm-text-blue-700)' } }}
                                    >
                                        <ChevronRightRoundedIcon />
                                    </IconButton>
                                </Box>

                                {selectedDay ? (
                                    <Box>
                                        <Typography sx={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--crm-slate-700)', mb: 1 }}>
                                            {dayParts(selectedDay.date).long}
                                            {slots.isFetching && <CircularProgress size={14} sx={{ ml: 1, verticalAlign: 'middle' }} />}
                                        </Typography>
                                        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 1 }}>
                                            {selectedDay.slots.map((s) => {
                                                const otherDay = dayOfInstant(s.start, timeZone) !== selectedDay.date;
                                                return (
                                                    <Button
                                                        key={s.start}
                                                        variant="outlined"
                                                        onClick={() => {
                                                            setNotice('');
                                                            setPicked({ ...s, duration: slotsData.duration });
                                                        }}
                                                        sx={{ ...outlinedSx, flexDirection: 'column', lineHeight: 1.2, px: 1 }}
                                                    >
                                                        {timeText(s.start, timeZone)}
                                                        {otherDay && (
                                                            <Box component="span" sx={{ fontSize: '0.66rem', fontWeight: 500, color: 'var(--mui-palette-text-secondary)' }}>
                                                                {dayParts(dayOfInstant(s.start, timeZone)).date}
                                                            </Box>
                                                        )}
                                                    </Button>
                                                );
                                            })}
                                        </Box>
                                    </Box>
                                ) : (
                                    <Typography sx={{ fontSize: '0.88rem', color: 'var(--mui-palette-text-secondary)', py: 2, textAlign: 'center' }}>
                                        {slotsData.nextFrom ? 'No free times these days. Try later days.' : 'No free times right now. Please check again later.'}
                                    </Typography>
                                )}
                                <Typography sx={{ fontSize: '0.76rem', color: 'var(--mui-palette-text-muted)' }}>Times shown in {timeZone}.</Typography>
                            </>
                        )}
                    </>
                )}
            </Box>
        </PageFrame>
    );
}

/** The route's client entry: reads `<slug>` from the URL here, so the page shell can be prerendered. */
export function PublicBookingRoute() {
    const params = useParams<{ slug: string }>();
    // Slugs are lower-case letters, digits and dashes; anything else is the API's one 404.
    const slug = typeof params?.slug === 'string' ? params.slug : '';
    return <PublicBookingPage key={slug} slug={slug} />;
}
