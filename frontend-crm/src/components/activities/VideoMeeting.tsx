'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, CircularProgress, FormHelperText, Typography, type SxProps, type Theme } from '@mui/material';
import { useController, type FieldPath, type FieldValues } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import VideocamOutlinedIcon from '@mui/icons-material/VideocamOutlined';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import { FormField } from '@/components/forms/FormField';
import { StyledSelect } from '@/components/forms/StyledSelect';
import { DrawerCopyButton } from '@/components/common/Drawer/DrawerPrimitives';
import { useVideoOptions } from '@/hooks/queries/useActivities';
import { useDropdownOptionMeta } from '@/hooks/queries/useFormConfigs';
import { queryKeys } from '@/hooks/queries/queryKeys';
import { activityService } from '@/services/activity.service';
import {
    NOTE_TYPE,
    TASK_TYPE,
    VIDEO_MEETING_LOCKED_MESSAGE,
    VIDEO_MEETING_META_KEY,
    VIDEO_PROVIDER_LABELS,
    VIDEO_PROVIDERS,
    isVideoProvider,
    type Activity,
    type VideoProvider,
} from '@/types/activity.types';
import { FOLLOWUP_TYPE_CATEGORY_KEY } from '@/utils/formConfig';

/**
 * Video meetings on activities (Calendar Phase 3, P3-1): the form's Video meeting select, the Join button with a copy
 * icon, the drawer's progress / error panel and the small video icon of lists and calendars. The link itself is made
 * by the owner's company calendar (Google Meet with Google, Microsoft Teams with Microsoft 365); Zoom comes later.
 */

/** Whether a Followup Type offers a video meeting (option meta `videoMeeting`, and it goes to calendars). */
export function useTypeOffersVideo(): (followupType: string) => boolean {
    const optionMeta = useDropdownOptionMeta(FOLLOWUP_TYPE_CATEGORY_KEY);
    return (followupType: string) => {
        if (!followupType || followupType === TASK_TYPE || followupType === NOTE_TYPE) return false;
        const meta = optionMeta(followupType);
        return meta?.[VIDEO_MEETING_META_KEY] === true && meta?.calendarSync !== false;
    };
}

const NONE = 'none';

export interface RhfVideoMeetingFieldProps<T extends FieldValues> {
    name: FieldPath<T>;
    label?: string;
    /** The activity's owner (username): their company calendar decides which links can be made. */
    owner: string;
    /** The saved choice (edit): always listed, so an admin switching a type off keeps existing meetings. */
    saved?: VideoProvider | '';
    /** The saved owner (edit): picking another owner asks the new owner's calendar for a new link. */
    savedOwner?: string;
    /** A ready Teams link: its owner can't remove or change it (a new owner may). */
    locked?: boolean;
    /**
     * Locked by the activity itself (P2-8: a meeting organized outside the CRM, `lockedFields` has `videoMeeting`): read
     * only whatever the owner, with this reason under it. The Join link still shows in view mode.
     */
    lockedReason?: string;
    /** Not Planned: a new choice isn't allowed (a logged activity has no event to carry a link). */
    planned: boolean;
    /** The ready join link of the loaded activity (view mode shows Join beside the value). */
    joinUrl?: string | null;
    sx?: SxProps<Theme>;
}

/**
 * Video meeting select: None / Google Meet / Microsoft Teams / Zoom. Choices the owner's calendar can't make are
 * listed disabled, with the reason under the field. The API checks again (409 VIDEO_PROVIDER_NOT_CONNECTED).
 */
export function RhfVideoMeetingField<T extends FieldValues>({
    name,
    label = 'Video meeting',
    owner,
    saved: savedChoice = '',
    savedOwner,
    locked: savedLocked = false,
    lockedReason,
    planned,
    joinUrl,
    sx,
}: RhfVideoMeetingFieldProps<T>) {
    const { field, fieldState } = useController<T>({ name });
    const raw: unknown = field.value;
    const value: VideoProvider | '' = isVideoProvider(raw) ? raw : '';
    // A new owner: the saved link goes with the old event, so the saved choice is checked like a new one and a Teams
    // lock no longer applies (the API marks a link the new owner's calendar can't make as failed).
    const ownerChanged = Boolean(savedOwner) && savedOwner?.trim().toLowerCase() !== owner.trim().toLowerCase();
    const saved = ownerChanged && planned ? '' : savedChoice;
    const locked = Boolean(lockedReason) || (savedLocked && !ownerChanged);
    const { data, isLoading } = useVideoOptions(owner, { enabled: Boolean(owner) && !locked });

    const available = useMemo(() => new Set((data?.options ?? []).filter((o) => o.available).map((o) => o.value)), [data]);
    const disabledOptions = VIDEO_PROVIDERS.filter((p) => p !== saved && p !== value && !available.has(p));
    const optionLabels: Record<string, string> = { [NONE]: 'None', ...VIDEO_PROVIDER_LABELS };
    if (disabledOptions.includes('zoom')) optionLabels.zoom = 'Zoom (later)';

    // Why the owner can't have Meet / Teams (one line; Zoom's "later" is in its label).
    const reason = available.size === 0 ? data?.options.find((o) => o.value !== 'zoom' && o.reason)?.reason : undefined;
    const hint = locked
        ? lockedReason || VIDEO_MEETING_LOCKED_MESSAGE
        : !planned && !value
          ? 'Only planned activities get a video link.'
          : isLoading
            ? undefined
            : value && !available.has(value) && value !== saved
              ? [data?.options.find((o) => o.value === value)?.reason, value === savedChoice ? 'Pick another video meeting or None.' : '']
                    .filter(Boolean)
                    .join(' ') || undefined
              : !value && reason
                ? reason
                : undefined;

    return (
        <FormField
            name={name}
            label={label}
            hint={hint}
            fit={null}
            sx={sx}
            viewValue={value ? VIDEO_PROVIDER_LABELS[value] : ''}
            viewActions={value && joinUrl && !ownerChanged ? <JoinMeetingActions url={joinUrl} provider={value} compact /> : undefined}
        >
            <StyledSelect
                value={value || NONE}
                onChange={(next: string) => field.onChange(next === NONE ? '' : next)}
                options={[NONE, ...VIDEO_PROVIDERS]}
                optionLabels={optionLabels}
                disabledOptions={disabledOptions}
                disabled={locked || (!planned && !value)}
            />
            {fieldState.error && (
                <FormHelperText error sx={{ mx: 1.75 }}>
                    {fieldState.error.message}
                </FormHelperText>
            )}
        </FormField>
    );
}

const joinButtonSx = {
    textTransform: 'none',
    fontWeight: 700,
    borderRadius: '8px',
    color: '#ffffff',
    boxShadow: 'none',
    whiteSpace: 'nowrap',
    background: 'linear-gradient(135deg, var(--crm-fill-blue-700) 0%, var(--crm-fill-blue-600) 100%)',
    '&:hover': {
        background: 'linear-gradient(135deg, var(--crm-fill-blue-800) 0%, var(--crm-fill-blue-700) 100%)',
        boxShadow: '0 4px 14px rgb(var(--crm-accent-rgb) / 0.28)',
    },
} as const;

/**
 * "Join meeting" (opens the link in a new tab) plus a copy icon (32 px tap target). `compact` = a small button for
 * rows. `data-calendar-action` tells the calendar not to open the drawer for clicks / keys inside (FullCalendar handles
 * eventClick natively, before React's stopPropagation could stop it).
 */
export function JoinMeetingActions({ url, provider, compact = false }: { url: string; provider: VideoProvider; compact?: boolean }) {
    return (
        <Box
            data-calendar-action=""
            // Enter / Space on Join or copy stay theirs (calendar entries and rows handle these keys themselves).
            onKeyDown={(e: React.KeyboardEvent) => {
                if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
            }}
            sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap', minWidth: 0 }}
        >
            <Button
                component="a"
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
                startIcon={<VideocamOutlinedIcon sx={{ fontSize: compact ? 16 : 18 }} />}
                aria-label={`Join ${VIDEO_PROVIDER_LABELS[provider]} meeting`}
                sx={{ ...joinButtonSx, fontSize: compact ? '0.76rem' : '0.85rem', minHeight: compact ? 32 : 40, px: compact ? 1.25 : 2 }}
            >
                {compact ? 'Join' : 'Join meeting'}
            </Button>
            <DrawerCopyButton text={url} title="Copy meeting link" iconColor="var(--mui-palette-text-secondary)" boxSize={32} />
        </Box>
    );
}

/** The provider of an allow-listed join link (the server only sends Meet / Teams / Zoom hosts). */
export function providerOfJoinUrl(url: string): VideoProvider {
    let host = '';
    try {
        host = new URL(url).hostname.toLowerCase();
    } catch {
        return 'meet';
    }
    if (host === 'teams.microsoft.com') return 'teams';
    if (host === 'zoom.us' || host.endsWith('.zoom.us')) return 'zoom';
    return 'meet';
}

/** Small video icon (calendar entries, record rows); brand-coloured, with the provider as its title. */
export function VideoMeetingIcon({ provider, size = 14 }: { provider?: string; size?: number }) {
    const title = isVideoProvider(provider) ? VIDEO_PROVIDER_LABELS[provider] : 'Video meeting';
    return <VideocamOutlinedIcon titleAccess={title} sx={{ fontSize: size, color: 'var(--crm-text-blue-600)', flexShrink: 0 }} />;
}

/** How often, and how many times, the drawer re-reads an activity whose link is being created. */
const POLL_MS = 5_000;
const POLL_TRIES = 12;

/**
 * The drawer's video meeting: Join + copy when ready; "Creating Meet link…" while the calendar makes it (the activity
 * is re-read every 5 s for a minute); a note when a recurring occurrence isn't in the calendar yet (no polling); the
 * error with Retry when it failed. Nothing when the activity has none.
 */
export function VideoMeetingPanel({ activity, onMessage }: { activity: Activity; onMessage: (message: string, error?: boolean) => void }) {
    const conference = activity.conference;
    const queryClient = useQueryClient();
    const [retrying, setRetrying] = useState(false);
    // An occurrence of a recurring activity not yet in its owner's calendar gets its link about two weeks before it
    // starts: a note, no spinner and no polling until then.
    const waiting = conference?.state === 'requested' && Boolean(conference.waitingForCalendar);
    const requested = conference?.state === 'requested' && !waiting;

    useEffect(() => {
        if (!requested) return;
        let tries = 0;
        const timer = window.setInterval(() => {
            tries += 1;
            void queryClient.invalidateQueries({ queryKey: queryKeys.activities.detail(activity.id) });
            if (tries >= POLL_TRIES) window.clearInterval(timer);
        }, POLL_MS);
        return () => window.clearInterval(timer);
    }, [requested, activity.id, queryClient]);

    if (!conference) return null;
    const label = VIDEO_PROVIDER_LABELS[conference.provider] ?? 'Video';
    const short = conference.provider === 'meet' ? 'Meet' : conference.provider === 'teams' ? 'Teams' : label;

    const retry = async () => {
        setRetrying(true);
        try {
            await activityService.retryConference(activity.id);
            onMessage(`Asking the calendar for a new ${short} link.`);
        } catch (err: unknown) {
            onMessage(err instanceof Error ? err.message : 'Could not ask for the link again.', true);
        } finally {
            setRetrying(false);
        }
    };

    return (
        <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--mui-palette-text-secondary)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                {label}
            </Typography>
            <Box sx={{ mt: 0.6, minWidth: 0 }}>
                {conference.state === 'ready' && conference.joinUrl && <JoinMeetingActions url={conference.joinUrl} provider={conference.provider} />}
                {requested && (
                    <Box role="status" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, color: 'var(--mui-palette-text-secondary)', fontSize: '0.85rem' }}>
                        <CircularProgress size={14} thickness={5} sx={{ color: 'var(--crm-text-blue-600)' }} />
                        {`Creating ${short} link…`}
                    </Box>
                )}
                {waiting && (
                    <Box role="status" sx={{ display: 'inline-flex', alignItems: 'flex-start', gap: 1, color: 'var(--mui-palette-text-secondary)', fontSize: '0.85rem', minWidth: 0 }}>
                        <ScheduleOutlinedIcon sx={{ fontSize: 16, mt: '2px', color: 'var(--mui-palette-text-muted)', flexShrink: 0 }} />
                        <Box component="span" sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                            {`The ${short} link is created when this event goes to the calendar, about two weeks before it starts.`}
                        </Box>
                    </Box>
                )}
                {conference.state === 'failed' && (
                    <Alert
                        severity="error"
                        sx={{ fontSize: '0.82rem', alignItems: 'center', '& .MuiAlert-message': { minWidth: 0, overflowWrap: 'anywhere' } }}
                        action={
                            conference.canRetry ? (
                                <Button
                                    size="small"
                                    onClick={() => void retry()}
                                    disabled={retrying}
                                    sx={{ textTransform: 'none', fontWeight: 700, minHeight: 32, color: 'var(--mui-palette-error-main)', whiteSpace: 'nowrap' }}
                                >
                                    {retrying ? 'Retrying…' : 'Retry'}
                                </Button>
                            ) : undefined
                        }
                    >
                        {conference.errorMessage ?? `The ${short} link couldn't be created.`}
                    </Alert>
                )}
            </Box>
        </Box>
    );
}
