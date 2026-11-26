'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Box, Button, CircularProgress, Typography } from '@mui/material';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ReplayIcon from '@mui/icons-material/Replay';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
import { useAuth } from '@/context/AuthContext';
import { activityService } from '@/services/activity.service';
import { findCrmUser } from '@/services/masterData.store';
import { PLANNED_STATUS, type Activity, type ActivityCalendarState } from '@/types/activity.types';
import { formatBusinessInstant } from './activityTime';

/**
 * The activity's copy in its owner's company calendar (Calendar Phase 2 P2-3c, spec §14.5), under the When card, for
 * the owner and the people who may edit the activity. Reads `activity.calendar` (null = the owner isn't synced or the
 * type never goes to calendars: nothing is shown, the Phase 1 look). One state line, plus:
 * - a private copy (`invites='withhold'`) or guests held for the owner (D41): an info box, with **Send invitations**
 *   for the owner and "Waiting for <owner> to send the invitations" for everyone else;
 * - a refused push: an error box with **Retry**; an event deleted in the calendar: **Add again** (planned activities
 *   not over for more than a day, as the API allows);
 * - "Open in Google Calendar / Outlook" (the event's own link, owner and editors only, from the API).
 * While a change is being sent it asks for the activity again every 5 s, for up to a minute.
 */

const outlinedSx = {
    textTransform: 'none',
    fontWeight: 600,
    fontSize: '0.8rem',
    minHeight: 36,
    px: 1.5,
    borderRadius: '8px',
    border: '1px solid var(--mui-palette-border-main)',
    color: 'var(--crm-slate-700)',
    backgroundColor: 'var(--mui-palette-background-paper)',
    transition: 'all 0.15s ease',
    '&:hover': {
        borderColor: 'var(--crm-blue-300)',
        backgroundColor: 'var(--mui-palette-primary-soft)',
        color: 'var(--crm-text-blue-700)',
    },
} as const;

const primarySx = {
    textTransform: 'none',
    fontWeight: 700,
    fontSize: '0.8rem',
    minHeight: 36,
    px: 1.75,
    borderRadius: '8px',
    color: '#ffffff',
    boxShadow: 'none',
    background: 'linear-gradient(135deg, var(--crm-fill-blue-700) 0%, var(--crm-fill-blue-600) 100%)',
    '&:hover': {
        background: 'linear-gradient(135deg, var(--crm-fill-blue-800) 0%, var(--crm-fill-blue-700) 100%)',
        boxShadow: '0 4px 14px rgb(var(--crm-accent-rgb) / 0.28)',
    },
} as const;

const lineSx = { fontSize: '0.8rem', color: 'var(--mui-palette-text-secondary)', overflowWrap: 'anywhere' } as const;
const mutedSx = { fontSize: '0.74rem', color: 'var(--mui-palette-text-muted)', overflowWrap: 'anywhere' } as const;

/** "Google Calendar" / "Outlook" / "test calendar" (the dev-only fake provider). */
export function calendarProviderName(provider: string | null | undefined): string {
    if (provider === 'google') return 'Google Calendar';
    if (provider === 'microsoft') return 'Outlook';
    return 'test calendar';
}

/** "just now", "5 min ago", "3 h ago", else the business-timezone date and time. */
function ago(iso: string | null | undefined, timeZone: string): string {
    if (!iso) return '';
    const ms = Date.now() - Date.parse(iso);
    if (Number.isNaN(ms)) return '';
    const minutes = Math.floor(ms / 60_000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} min ago`;
    if (minutes < 6 * 60) return `${Math.floor(minutes / 60)} h ago`;
    return formatBusinessInstant(iso, timeZone);
}

const lc = (value: string | null | undefined) => (value ?? '').trim().toLowerCase();
const personName = (username: string | null | undefined) => (username ? findCrmUser(username)?.name || username : '');
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * How long after its end a planned activity can still be added to the calendar again (the API's create window,
 * backend-crm sync.constants.ts CREATE_ELIGIBLE_PAST_MS); an older one would only get "no longer upcoming" back.
 */
const ADD_AGAIN_PAST_MS = 24 * 60 * 60 * 1000;

/** Add again would be accepted: planned, and not over for longer than the create window. */
function canAddAgain(activity: Pick<Activity, 'status' | 'startAt' | 'endAt'>): boolean {
    if (activity.status !== PLANNED_STATUS) return false;
    const end = Date.parse(activity.endAt || activity.startAt);
    return !Number.isFinite(end) || end > Date.now() - ADD_AGAIN_PAST_MS;
}

/** A sentence for our own error codes; the provider's own text (owner / editors) otherwise. */
function errorSentence(calendar: ActivityCalendarState): string {
    if (calendar.errorCode === 'retries_exhausted') return "The calendar couldn't be reached. The CRM keeps trying; Retry tries now.";
    if (calendar.errorCode === 'conflict_loop') return 'The event keeps changing in the calendar while the CRM updates it. Retry when the edits there have stopped.';
    if (calendar.errorMessage) return `The calendar refused the last change: ${calendar.errorMessage}`;
    return 'The calendar refused the last change.';
}

export interface ActivitySyncStatusProps {
    activity: Activity;
    /** Ask the API for the activity again (the drawer's query refetch), while a change is being sent. */
    onRefresh?: () => void;
    /** Toasts. */
    onNotify: (message: string, error?: boolean) => void;
}

function InfoBox({ tone, icon, children, action }: { tone: 'info' | 'error'; icon: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }) {
    const colors =
        tone === 'error'
            ? { bg: 'var(--mui-palette-error-soft)', border: 'var(--mui-palette-error-softBorder)' }
            : { bg: 'var(--mui-palette-primary-soft)', border: 'var(--mui-palette-primary-softBorder)' };
    return (
        <Box
            sx={{
                display: 'flex',
                alignItems: { xs: 'stretch', sm: 'center' },
                flexDirection: { xs: 'column', sm: 'row' },
                gap: 1.25,
                p: 1.25,
                borderRadius: '10px',
                backgroundColor: colors.bg,
                border: `1px solid ${colors.border}`,
                minWidth: 0,
            }}
        >
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', flex: 1, minWidth: 0 }}>
                {icon}
                <Box sx={{ minWidth: 0 }}>{children}</Box>
            </Box>
            {action && <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', flexShrink: 0 }}>{action}</Box>}
        </Box>
    );
}

const POLL_MS = 5_000;
const POLL_ROUNDS = 12;

export function ActivitySyncStatus({ activity, onRefresh, onNotify }: ActivitySyncStatusProps) {
    const { user } = useAuth();
    const calendar = activity.calendar ?? null;
    const [busy, setBusy] = useState(false);
    const sending = Boolean(calendar && (calendar.pending || calendar.state === 'pending'));

    // While a change is being sent: ask again every 5 s, for up to a minute (the push normally lands in seconds).
    const rounds = useRef(0);
    useEffect(() => {
        if (!sending || !onRefresh) {
            rounds.current = 0;
            return;
        }
        const timer = setInterval(() => {
            rounds.current += 1;
            if (rounds.current > POLL_ROUNDS) {
                clearInterval(timer);
                return;
            }
            onRefresh();
        }, POLL_MS);
        return () => clearInterval(timer);
    }, [sending, onRefresh]);

    const isOwner = lc(user?.username) !== '' && lc(user?.username) === lc(activity.assignedTo);
    const canEdit = activity.viewer?.canEdit ?? false;
    if (!calendar || (!canEdit && !isOwner)) return null;

    const timeZone = activity.timeZone;
    const where = calendarProviderName(calendar.provider);
    const ownerName = personName(activity.assignedTo) || 'the owner';
    const theirs = isOwner ? `your ${where}` : `${ownerName}'s ${where}`;
    const planned = activity.status === PLANNED_STATUS;

    const act = async (work: () => Promise<unknown>, success: string, failure: string) => {
        setBusy(true);
        try {
            await work();
            onNotify(success);
        } catch (err: unknown) {
            onNotify(err instanceof Error ? err.message : failure, true);
        } finally {
            setBusy(false);
        }
    };
    const retry = (success: string) => void act(() => activityService.retryCalendarSync(activity.id), success, "Couldn't send it to the calendar.");
    const guests = activity.attendees.filter((a) => !(a.kind === 'user' && lc(a.username) === lc(activity.assignedTo))).length;
    const sendInvites = () => {
        const count = calendar.invites === 'withhold' ? guests : calendar.heldCount;
        if (!window.confirm(`Send invitations to ${plural(count, 'guest')} from your ${where}? Guests outside the company get an email invitation.`)) return;
        void act(() => activityService.sendCalendarInvites(activity.id), 'Invitations are on their way.', "Couldn't send the invitations.");
    };

    // ── State line ──
    let line: React.ReactNode;
    let errorBox: React.ReactNode = null;
    if (sending && calendar.state !== 'removed_remote' && calendar.state !== 'cancelled') {
        line = (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <CircularProgress size={12} thickness={5} sx={{ color: 'var(--crm-text-blue-600)' }} />
                <Typography sx={lineSx}>{`Sending to ${theirs}…`}</Typography>
            </Box>
        );
    } else if (calendar.state === 'synced') {
        line = <Typography sx={lineSx}>{`On ${theirs}${calendar.lastSyncedAt ? ` · synced ${ago(calendar.lastSyncedAt, timeZone)}` : ''}`}</Typography>;
    } else if (calendar.state === 'error') {
        line = <Typography sx={lineSx}>{`Not updated in ${theirs}`}</Typography>;
        errorBox = (
            <InfoBox
                tone="error"
                icon={<ErrorOutlineIcon sx={{ fontSize: 18, color: 'var(--mui-palette-error-main)', mt: '1px' }} />}
                action={
                    canEdit ? (
                        <Button size="small" startIcon={<ReplayIcon sx={{ fontSize: 16 }} />} onClick={() => retry('Sending to the calendar again.')} disabled={busy} sx={outlinedSx}>
                            Retry
                        </Button>
                    ) : undefined
                }
            >
                <Typography sx={{ fontSize: '0.8rem', color: 'var(--crm-slate-900)' }}>{errorSentence(calendar)}</Typography>
            </InfoBox>
        );
    } else if (calendar.state === 'removed_remote') {
        line = <Typography sx={lineSx}>{`Removed from ${theirs}`}</Typography>;
    } else if (calendar.state === 'unsupported') {
        line = <Typography sx={lineSx}>{`Turned into a repeating event in ${theirs}; the CRM keeps this meeting as it is.`}</Typography>;
    } else if (calendar.state === 'cancelled') {
        line = <Typography sx={lineSx}>{`Not in ${theirs}`}</Typography>;
        if (calendar.errorCode && planned) {
            errorBox = (
                <InfoBox
                    tone="error"
                    icon={<ErrorOutlineIcon sx={{ fontSize: 18, color: 'var(--mui-palette-error-main)', mt: '1px' }} />}
                    action={
                        canEdit ? (
                            <Button size="small" startIcon={<ReplayIcon sx={{ fontSize: 16 }} />} onClick={() => retry('Sending to the calendar again.')} disabled={busy} sx={outlinedSx}>
                                Retry
                            </Button>
                        ) : undefined
                    }
                >
                    <Typography sx={{ fontSize: '0.8rem', color: 'var(--crm-slate-900)' }}>{errorSentence(calendar)}</Typography>
                </InfoBox>
            );
        }
    } else {
        line = <Typography sx={lineSx}>{`Waiting to be sent to ${theirs}`}</Typography>;
    }

    // ── Invitations waiting for the owner (D41) ──
    const waiting = calendar.invitesWaiting ?? (calendar.canSendInvites || calendar.heldCount > 0);
    let invitesBox: React.ReactNode = null;
    // Not while the event is gone (cancelled, removed in the calendar): nothing could be sent (the API refuses).
    const eventGone = calendar.state === 'cancelled' || calendar.state === 'removed_remote';
    if (waiting && calendar.state !== 'unsupported' && !eventGone) {
        const privateCopy = calendar.invites === 'withhold';
        const reason =
            calendar.copyReason === 'connected'
                ? `Copied when ${isOwner ? 'your' : `${ownerName}'s`} calendar was connected.`
                : activity.createdBy && lc(activity.createdBy) !== lc(activity.assignedTo)
                  ? `Added by ${personName(activity.createdBy)}.`
                  : `Given to ${isOwner ? 'you' : ownerName} by someone else.`;
        const text = privateCopy
            ? "Private copy: attendees weren't invited."
            : `${plural(calendar.heldCount, 'guest')} added by someone else ${calendar.heldCount === 1 ? "hasn't" : "haven't"} been invited yet.`;
        invitesBox = (
            <InfoBox
                tone="info"
                icon={<InfoOutlinedIcon sx={{ fontSize: 18, color: 'var(--crm-text-blue-600)', mt: '1px' }} />}
                action={
                    calendar.canSendInvites ? (
                        <Button size="small" variant="contained" startIcon={<SendOutlinedIcon sx={{ fontSize: 16 }} />} onClick={sendInvites} disabled={busy} sx={primarySx}>
                            Send invitations
                        </Button>
                    ) : undefined
                }
            >
                <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--crm-slate-900)' }}>{text}</Typography>
                <Typography sx={{ ...lineSx, fontSize: '0.75rem' }}>
                    {privateCopy ? `${reason} ` : ''}
                    {calendar.canSendInvites
                        ? 'Invitations go out from your calendar only when you send them.'
                        : `Waiting for ${ownerName} to send the invitations.`}
                </Typography>
            </InfoBox>
        );
    }

    // Someone else's Add again doesn't invite the guests again from the owner's mailbox (D41): a private copy.
    const addAgainMessage =
        !isOwner && calendar.invites === 'send' && guests > 0
            ? `Adding it to ${theirs} again as a private copy: ${ownerName} sends the invitations.`
            : `Adding it to ${theirs} again.`;
    const addAgain =
        calendar.state === 'removed_remote' && canEdit && canAddAgain(activity) ? (
            <Button size="small" startIcon={<ReplayIcon sx={{ fontSize: 16 }} />} onClick={() => retry(addAgainMessage)} disabled={busy} sx={outlinedSx}>
                Add again
            </Button>
        ) : null;

    const openLink =
        calendar.htmlLink && calendar.state !== 'removed_remote' && calendar.state !== 'cancelled' ? (
            <Box
                component="a"
                href={calendar.htmlLink}
                target="_blank"
                rel="noopener noreferrer"
                sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.5,
                    minHeight: 32,
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: 'var(--crm-text-blue-700)',
                    textDecoration: 'none',
                    '&:hover': { color: 'var(--crm-text-blue-600)', textDecoration: 'underline' },
                }}
            >
                <OpenInNewIcon sx={{ fontSize: 15 }} />
                {`Open in ${where}`}
            </Box>
        ) : null;

    return (
        <Box
            component="section"
            aria-label="Calendar sync"
            sx={{ mt: 1.4, pt: 1.2, borderTop: '1px solid var(--mui-palette-border-light)', display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}
        >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', minWidth: 0 }}>
                <EventAvailableOutlinedIcon sx={{ fontSize: 16, color: 'var(--mui-palette-text-secondary)', flexShrink: 0 }} />
                <Box sx={{ flex: 1, minWidth: 0 }}>{line}</Box>
                {openLink}
                {addAgain}
            </Box>
            {calendar.externalUpdatedAt && (
                <Typography sx={mutedSx}>{`Updated from ${where} ${formatBusinessInstant(calendar.externalUpdatedAt, timeZone)}`}</Typography>
            )}
            {errorBox}
            {invitesBox}
            {calendar.warning && <Typography sx={mutedSx}>{calendar.warning}</Typography>}
        </Box>
    );
}

/**
 * The extra sentence of a delete / cancel confirmation when the activity has a copy in its owner's calendar (spec
 * §14.5, §13.2): the event is cancelled there too (its invited guests get the cancellation), also for a meeting brought
 * in from the calendar that its owner organizes; only deleting such an imported meeting leaves the event there. ''
 * when there is no event to cancel (not in a calendar, already cancelled or removed there, a repeating series).
 */
export function calendarRemovalNote(activity: Pick<Activity, 'calendar' | 'origin' | 'assignedTo' | 'attendees'>, viewerUsername: string | null | undefined, verb: 'delete' | 'cancel'): string {
    const calendar = activity.calendar;
    if (!calendar || calendar.state === 'unsupported' || calendar.state === 'removed_remote' || calendar.state === 'cancelled') return '';
    const where = calendarProviderName(calendar.provider);
    if (activity.origin === 'calendar' && verb === 'delete') return ` Removes it from the CRM only: the event stays in the ${where}.`;
    const whose = lc(activity.assignedTo) === lc(viewerUsername) ? 'your' : `${personName(activity.assignedTo)}'s`;
    const invited = calendar.invites === 'send' && (activity.attendees ?? []).some((a) => !(a.kind === 'user' && lc(a.username) === lc(activity.assignedTo)));
    return ` This also cancels it in ${whose} ${where}${invited ? ' and notifies the attendees' : ''}.`;
}
