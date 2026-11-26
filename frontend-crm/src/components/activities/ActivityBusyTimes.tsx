'use client';

import React, { useMemo, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Tooltip, Typography } from '@mui/material';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import ManageSearchOutlinedIcon from '@mui/icons-material/ManageSearchOutlined';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';

import { useBusyTimes } from '@/hooks/queries/useActivities';
import { activityService } from '@/services/activity.service';
import {
    BUSY_MAX_USERS,
    BUSY_SUGGEST_DAYS,
    BUSY_SUGGEST_MAX_MINUTES,
    BUSY_SUGGEST_MIN_MINUTES,
    type BusyKind,
    type BusyPerson,
    type BusyPersonStatus,
} from '@/types/activity.types';
import { addDays, instantToZonedWallClock, isWallClock, wallClockMinutesBetween, zonedStartOfDay } from '@/utils/zonedTime';
import { formatDayLabel, formatWallTime } from './activityTime';

/**
 * Busy times while picking a time (Calendar Phase 2, P2-6; spec §14.7): one row per person (owner first, then the
 * invited colleagues) on an 08:00–20:00 track of the start's business day, with their CRM activities and company
 * calendar busy blocks (times only), the chosen window outlined, and clashes in red. A row "Everyone free" offers the
 * common free gaps as buttons (tap / Enter → Start there, the length kept); "Find a free time" asks the server for the
 * first common free slot (the client never computes one). Wide content scrolls inside its own box on phones.
 */

const TRACK_START_MIN = 8 * 60;
const TRACK_END_MIN = 20 * 60;
const TRACK_SPAN_MIN = TRACK_END_MIN - TRACK_START_MIN;
const STEP_MIN = 15;
const MINUTE = 60_000;

const STATUS_TEXT: Readonly<Record<Exclude<BusyPersonStatus, 'ok'>, string>> = {
    not_connected: 'Not connected: CRM activities only',
    error: 'Calendar not syncing: CRM activities only',
    unavailable: "Couldn't load the calendar: CRM activities only",
    unknown: 'Not an active user',
};
const PROVIDER_TEXT: Readonly<Record<string, string>> = { google: 'CRM + Google Calendar', microsoft: 'CRM + Outlook', fake: 'CRM + test calendar' };
const KIND_TEXT: Readonly<Record<BusyKind, string>> = { busy: 'Busy', tentative: 'Tentative', away: 'Away' };

/** Block colours (tokens only; no module colours: spec §14.7). */
const KIND_SX: Readonly<Record<BusyKind, object>> = {
    busy: { backgroundColor: 'var(--mui-palette-background-hover)', border: '1px solid var(--mui-palette-border-strong)' },
    tentative: {
        border: '1px dashed var(--mui-palette-border-strong)',
        backgroundImage:
            'repeating-linear-gradient(135deg, color-mix(in srgb, var(--mui-palette-text-muted) 18%, transparent) 0 4px, transparent 4px 8px)',
    },
    away: { backgroundColor: 'var(--mui-palette-warning-soft)', border: '1px solid var(--mui-palette-warning-softBorder)' },
};

export interface ActivityBusyTimesProps {
    /** Usernames: the owner first, then invited colleagues (duplicates and blanks are dropped; at most 20). */
    people: readonly string[];
    /** Wall clocks in the business timezone (`YYYY-MM-DDTHH:mm`). */
    startAt: string;
    endAt: string;
    timeZone: string;
    now: () => Date;
    /** The activity being edited (its own block doesn't count). */
    excludeId?: string;
    /** Puts Start at this wall clock (the form keeps the length). */
    onPickStart: (wall: string) => void;
    /** Quick create: folded behind "Check availability" until asked for. */
    collapsible?: boolean;
    /** Times can't be changed here (a follow-up activity): the strip is shown, nothing can be picked. */
    readOnly?: boolean;
}

interface Segment {
    startMin: number;
    endMin: number;
}

/** Minutes after the day's midnight of an instant (business timezone), clipped to the track. */
function trackMinutes(iso: string, day: string, timeZone: string): number {
    const wall = instantToZonedWallClock(new Date(iso), timeZone);
    if (wall.slice(0, 10) < day) return TRACK_START_MIN;
    if (wall.slice(0, 10) > day) return TRACK_END_MIN;
    const minutes = Number(wall.slice(11, 13)) * 60 + Number(wall.slice(14, 16));
    return Math.min(TRACK_END_MIN, Math.max(TRACK_START_MIN, minutes));
}

const pct = (minutes: number) => `${((minutes - TRACK_START_MIN) / TRACK_SPAN_MIN) * 100}%`;
const wallOf = (day: string, minutes: number) => `${day}T${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const ceilStep = (minutes: number) => Math.ceil(minutes / STEP_MIN) * STEP_MIN;
const hourLabel = (day: string, hour: number) => formatWallTime(wallOf(day, hour * 60)).replace(':00', '');

/** Common free gaps on the track: not busy for anyone, not before `notBeforeMin`, on the 15-minute grid. */
function freeGaps(people: readonly BusyPerson[], day: string, timeZone: string, notBeforeMin: number): Segment[] {
    const blocked = people
        .flatMap((p) => p.busy.map((b) => ({ startMin: trackMinutes(b.start, day, timeZone), endMin: trackMinutes(b.end, day, timeZone) })))
        .filter((s) => s.endMin > s.startMin)
        .sort((a, b) => a.startMin - b.startMin);
    const gaps: Segment[] = [];
    let cursor = Math.max(TRACK_START_MIN, ceilStep(notBeforeMin));
    for (const block of blocked) {
        if (block.startMin > cursor) gaps.push({ startMin: cursor, endMin: block.startMin });
        cursor = Math.max(cursor, ceilStep(block.endMin));
    }
    if (cursor < TRACK_END_MIN) gaps.push({ startMin: cursor, endMin: TRACK_END_MIN });
    return gaps.filter((g) => g.endMin - g.startMin >= STEP_MIN);
}

export function ActivityBusyTimes({ people, startAt, endAt, timeZone, now, excludeId, onPickStart, collapsible = false, readOnly = false }: ActivityBusyTimesProps) {
    const [open, setOpen] = useState(!collapsible);
    const [finding, setFinding] = useState(false);
    const [findMessage, setFindMessage] = useState<string | null>(null);

    const users = useMemo(() => {
        const seen = new Set<string>();
        return people
            .map((p) => p.trim())
            .filter((p) => p && !seen.has(p.toLowerCase()) && seen.add(p.toLowerCase()))
            .slice(0, BUSY_MAX_USERS);
    }, [people]);
    const validStart = isWallClock(startAt);
    const day = validStart ? startAt.slice(0, 10) : '';
    const params = useMemo(
        () =>
            day && users.length > 0
                ? { users, from: zonedStartOfDay(day, timeZone).toISOString(), to: zonedStartOfDay(addDays(day, 1), timeZone).toISOString(), exclude: excludeId }
                : undefined,
        [day, users, timeZone, excludeId]
    );
    const { data, isFetching, isError, refetch } = useBusyTimes(params, { enabled: open });

    if (!validStart || users.length === 0) return null;

    const length = isWallClock(endAt) ? Math.max(0, wallClockMinutesBetween(startAt, endAt, timeZone)) : 0;
    const chosen: Segment = {
        startMin: Number(startAt.slice(11, 13)) * 60 + Number(startAt.slice(14, 16)),
        endMin: 0,
    };
    chosen.endMin = endAt.slice(0, 10) === day ? chosen.startMin + Math.max(length, STEP_MIN) : 24 * 60;
    const chosenOnTrack = { startMin: Math.max(chosen.startMin, TRACK_START_MIN), endMin: Math.min(chosen.endMin, TRACK_END_MIN) };
    const showChosen = chosenOnTrack.endMin > chosenOnTrack.startMin;

    const shown = data && data.people.length > 0 ? data.people : [];
    const nowWall = instantToZonedWallClock(now(), timeZone);
    const notBefore = nowWall.slice(0, 10) > day ? TRACK_END_MIN : nowWall.slice(0, 10) < day ? 0 : Number(nowWall.slice(11, 13)) * 60 + Number(nowWall.slice(14, 16));
    const gaps = freeGaps(shown, day, timeZone, notBefore);
    const clashes = shown.filter((p) =>
        p.busy.some((b) => {
            const s = new Date(b.start).getTime();
            const e = new Date(b.end).getTime();
            const cs = zonedStartOfDay(day, timeZone).getTime() + chosen.startMin * MINUTE;
            const ce = zonedStartOfDay(day, timeZone).getTime() + chosen.endMin * MINUTE;
            return s < ce && e > cs;
        })
    );

    const findFreeTime = async () => {
        setFinding(true);
        setFindMessage(null);
        try {
            const dayStart = zonedStartOfDay(day, timeZone).getTime();
            const from = new Date(Math.max(dayStart, now().getTime()));
            const to = new Date(from.getTime() + BUSY_SUGGEST_DAYS * 24 * 60 * MINUTE);
            const suggest = Math.min(BUSY_SUGGEST_MAX_MINUTES, Math.max(BUSY_SUGGEST_MIN_MINUTES, length || STEP_MIN));
            const answer = await activityService.busy({ users, from: from.toISOString(), to: to.toISOString(), exclude: excludeId, suggest });
            if (answer.suggestion) {
                const wall = instantToZonedWallClock(new Date(answer.suggestion.start), timeZone);
                onPickStart(wall);
                setFindMessage(`Moved to ${formatDayLabel(wall.slice(0, 10))}, ${formatWallTime(wall)}: everyone is free.`);
            } else {
                setFindMessage(`No common free time in the next ${BUSY_SUGGEST_DAYS} days (9 AM–7 PM).`);
            }
        } catch (err: unknown) {
            setFindMessage(err instanceof Error ? err.message : "Couldn't look for a free time.");
        } finally {
            setFinding(false);
        }
    };

    const outlinedSx = {
        textTransform: 'none',
        fontWeight: 600,
        fontSize: '0.8rem',
        minHeight: 36,
        borderRadius: '8px',
        border: '1px solid var(--mui-palette-border-main)',
        color: 'var(--crm-slate-700)',
        backgroundColor: 'var(--mui-palette-background-paper)',
        transition: 'all 0.15s ease',
        '&:hover': { borderColor: 'var(--crm-blue-300)', backgroundColor: 'var(--mui-palette-primary-soft)', color: 'var(--crm-text-blue-700)' },
    } as const;

    if (!open) {
        return (
            <Button onClick={() => setOpen(true)} startIcon={<EventAvailableOutlinedIcon sx={{ fontSize: 18 }} />} sx={outlinedSx}>
                Check availability
            </Button>
        );
    }

    const nameColumn = { xs: 104, sm: 148 };
    const rowHeight = 36;

    return (
        <Box
            role="group"
            aria-label="Availability"
            sx={{ border: '1px solid var(--mui-palette-border-main)', borderRadius: '10px', backgroundColor: 'var(--mui-palette-background-paper)', minWidth: 0 }}
        >
            {/* Header: title, day, actions (wraps on phones) */}
            <Box
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 1,
                    px: { xs: 1.25, sm: 1.5 },
                    py: 1,
                    borderBottom: '1px solid var(--mui-palette-border-light)',
                    backgroundColor: 'var(--mui-palette-background-subtle)',
                    borderRadius: '10px 10px 0 0',
                }}
            >
                <EventAvailableOutlinedIcon sx={{ fontSize: 18, color: 'var(--mui-palette-text-secondary)' }} />
                <Box sx={{ minWidth: 0, flex: '1 1 160px' }}>
                    <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--crm-slate-900)' }}>Availability · {formatDayLabel(day)}</Typography>
                    <Typography sx={{ fontSize: '0.72rem', color: 'var(--mui-palette-text-secondary)' }}>
                        {clashes.length === 0
                            ? shown.length > 0
                                ? 'Everyone is free at the chosen time.'
                                : 'Busy times of the owner and invited colleagues (times only).'
                            : `${clashes.map((p) => p.name).join(', ')} ${clashes.length === 1 ? 'is' : 'are'} busy at the chosen time.`}
                    </Typography>
                </Box>
                {isFetching && <CircularProgress size={16} aria-label="Loading busy times" />}
                {!readOnly && (
                    <Button
                        onClick={findFreeTime}
                        disabled={finding}
                        startIcon={finding ? <CircularProgress size={14} /> : <ManageSearchOutlinedIcon sx={{ fontSize: 18 }} />}
                        sx={outlinedSx}
                    >
                        Find a free time
                    </Button>
                )}
                {collapsible && (
                    <Button onClick={() => setOpen(false)} aria-label="Hide availability" sx={{ ...outlinedSx, minWidth: 40, px: 1 }}>
                        <ExpandLessIcon sx={{ fontSize: 20 }} />
                    </Button>
                )}
            </Box>

            {findMessage && (
                <Typography role="status" sx={{ px: 1.5, pt: 1, fontSize: '0.78rem', color: 'var(--mui-palette-text-secondary)' }}>
                    {findMessage}
                </Typography>
            )}
            {isError && !data && (
                <Alert
                    severity="warning"
                    sx={{ m: 1.5, fontSize: '0.8rem' }}
                    action={
                        <Button onClick={() => refetch()} sx={{ ...outlinedSx, minHeight: 32 }}>
                            Retry
                        </Button>
                    }
                >
                    Couldn&apos;t load busy times.
                </Alert>
            )}

            {/* Track: scrolls sideways inside this box on narrow screens */}
            <Box sx={{ overflowX: 'auto', px: { xs: 1.25, sm: 1.5 }, py: 1.25 }}>
                <Box sx={{ minWidth: 640, display: 'grid', gridTemplateColumns: { xs: `${nameColumn.xs}px minmax(0, 1fr)`, sm: `${nameColumn.sm}px minmax(0, 1fr)` }, rowGap: 0.75, columnGap: 1.25 }}>
                    {/* Hour scale */}
                    <Box />
                    <Box sx={{ position: 'relative', height: 16 }} aria-hidden>
                        {Array.from({ length: 7 }, (_, i) => TRACK_START_MIN / 60 + i * 2).map((hour) => (
                            <Typography
                                key={hour}
                                component="span"
                                sx={{
                                    position: 'absolute',
                                    left: pct(hour * 60),
                                    transform: hour === TRACK_START_MIN / 60 ? 'none' : hour === TRACK_END_MIN / 60 ? 'translateX(-100%)' : 'translateX(-50%)',
                                    fontSize: '0.68rem',
                                    color: 'var(--mui-palette-text-muted)',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                {hourLabel(day, hour)}
                            </Typography>
                        ))}
                    </Box>

                    {/* Everyone free: the common gaps as buttons */}
                    <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--crm-slate-700)', alignSelf: 'center' }}>Everyone free</Typography>
                    <Box sx={{ position: 'relative', height: rowHeight, borderRadius: '6px', backgroundColor: 'var(--mui-palette-background-subtle)' }}>
                        {shown.length > 0 &&
                            gaps.map((gap) => {
                                const label = `${formatWallTime(wallOf(day, gap.startMin))} – ${formatWallTime(wallOf(day, gap.endMin))}`;
                                return (
                                    <Tooltip key={gap.startMin} title={readOnly ? `Free ${label}` : `Free ${label}: start here`}>
                                        <Box
                                            component="button"
                                            type="button"
                                            disabled={readOnly}
                                            aria-label={readOnly ? `Everyone free ${label}` : `Everyone free ${label}. Start at ${formatWallTime(wallOf(day, gap.startMin))}`}
                                            onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
                                                if (readOnly) return;
                                                // A pointer picks the 15-minute slot under it; Enter / Space the gap's start.
                                                let minutes = gap.startMin;
                                                if (event.detail > 0) {
                                                    const rect = event.currentTarget.getBoundingClientRect();
                                                    const ratio = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0;
                                                    minutes = gap.startMin + Math.floor((ratio * (gap.endMin - gap.startMin)) / STEP_MIN) * STEP_MIN;
                                                    minutes = Math.min(Math.max(gap.startMin, minutes), gap.endMin - STEP_MIN);
                                                }
                                                onPickStart(wallOf(day, minutes));
                                            }}
                                            sx={{
                                                position: 'absolute',
                                                top: 2,
                                                bottom: 2,
                                                left: pct(gap.startMin),
                                                width: `calc(${pct(TRACK_START_MIN + gap.endMin - gap.startMin)} - 2px)`,
                                                minHeight: 32,
                                                p: 0,
                                                border: '1px solid var(--mui-palette-success-softBorder)',
                                                borderRadius: '5px',
                                                backgroundColor: 'var(--mui-palette-success-soft)',
                                                cursor: readOnly ? 'default' : 'pointer',
                                                transition: 'all 0.15s ease',
                                                '&:hover:not(:disabled)': { borderColor: 'var(--crm-blue-300)', backgroundColor: 'var(--mui-palette-primary-soft)' },
                                                '&:focus-visible': { outline: 'none', boxShadow: '0 0 0 3px rgb(var(--crm-accent-rgb) / 0.22)' },
                                            }}
                                        />
                                    </Tooltip>
                                );
                            })}
                        {showChosen && <ChosenWindow segment={chosenOnTrack} />}
                    </Box>

                    {/* One row per person */}
                    {(shown.length > 0 ? shown : users.map((username) => ({ username, name: username, status: 'ok' as const, provider: null, busy: [], sources: [] }))).map((person) => {
                        const clash = clashes.includes(person as BusyPerson);
                        const note = person.status === 'ok' ? (person.provider ? PROVIDER_TEXT[person.provider] : data ? 'CRM activities' : '') : STATUS_TEXT[person.status];
                        return (
                            <React.Fragment key={person.username}>
                                <Box sx={{ minWidth: 0, alignSelf: 'center' }}>
                                    <Typography noWrap title={person.name} sx={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--crm-slate-900)' }}>
                                        {person.name}
                                    </Typography>
                                    {note && (
                                        <Typography
                                            noWrap
                                            title={note}
                                            sx={{ fontSize: '0.66rem', color: person.status === 'ok' ? 'var(--mui-palette-text-muted)' : 'var(--mui-palette-warning-main)' }}
                                        >
                                            {note}
                                        </Typography>
                                    )}
                                </Box>
                                <Box
                                    aria-label={`${person.name}: ${person.busy.length === 0 ? 'free all day' : `${person.busy.length} busy ${person.busy.length === 1 ? 'block' : 'blocks'}`}`}
                                    role="img"
                                    sx={{
                                        position: 'relative',
                                        height: rowHeight,
                                        borderRadius: '6px',
                                        border: '1px solid var(--mui-palette-border-light)',
                                        backgroundImage:
                                            'repeating-linear-gradient(90deg, transparent 0, transparent calc(100% / 12 - 1px), var(--mui-palette-border-light) calc(100% / 12 - 1px), var(--mui-palette-border-light) calc(100% / 12))',
                                    }}
                                >
                                    {person.busy.map((block) => {
                                        const s = trackMinutes(block.start, day, timeZone);
                                        const e = trackMinutes(block.end, day, timeZone);
                                        if (e <= s) return null;
                                        const startWall = instantToZonedWallClock(new Date(block.start), timeZone);
                                        const endWall = instantToZonedWallClock(new Date(block.end), timeZone);
                                        return (
                                            <Tooltip key={`${block.kind}-${block.start}`} title={`${KIND_TEXT[block.kind]} ${formatWallTime(startWall)} – ${formatWallTime(endWall)}`}>
                                                <Box
                                                    sx={{
                                                        position: 'absolute',
                                                        top: 4,
                                                        bottom: 4,
                                                        left: pct(s),
                                                        width: pct(TRACK_START_MIN + e - s),
                                                        borderRadius: '4px',
                                                        ...KIND_SX[block.kind],
                                                    }}
                                                />
                                            </Tooltip>
                                        );
                                    })}
                                    {showChosen && <ChosenWindow segment={chosenOnTrack} clash={clash} />}
                                </Box>
                            </React.Fragment>
                        );
                    })}
                </Box>
            </Box>

            {/* Legend */}
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, px: { xs: 1.25, sm: 1.5 }, pb: 1.25 }}>
                {(['busy', 'tentative', 'away'] as const).map((kind) => (
                    <Box key={kind} sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>
                        <Box sx={{ width: 16, height: 10, borderRadius: '3px', ...KIND_SX[kind] }} />
                        <Typography sx={{ fontSize: '0.7rem', color: 'var(--mui-palette-text-secondary)' }}>{KIND_TEXT[kind]}</Typography>
                    </Box>
                ))}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>
                    <Box sx={{ width: 16, height: 10, borderRadius: '3px', border: '2px solid var(--crm-text-blue-600)', backgroundColor: 'rgb(var(--crm-accent-rgb) / 0.10)' }} />
                    <Typography sx={{ fontSize: '0.7rem', color: 'var(--mui-palette-text-secondary)' }}>Chosen time</Typography>
                </Box>
                <Typography sx={{ fontSize: '0.7rem', color: 'var(--mui-palette-text-muted)', ml: { sm: 'auto' } }}>Times only; titles stay private.</Typography>
            </Box>
        </Box>
    );
}

/** The chosen Start–End over a row (red when it clashes with that person's busy time). Never takes clicks. */
function ChosenWindow({ segment, clash = false }: { segment: Segment; clash?: boolean }) {
    return (
        <Box
            aria-hidden
            sx={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: pct(segment.startMin),
                width: pct(TRACK_START_MIN + segment.endMin - segment.startMin),
                minWidth: 3,
                borderRadius: '5px',
                pointerEvents: 'none',
                border: clash ? '2px solid var(--mui-palette-error-main)' : '2px solid var(--crm-text-blue-600)',
                backgroundColor: clash ? 'color-mix(in srgb, var(--mui-palette-error-soft) 70%, transparent)' : 'rgb(var(--crm-accent-rgb) / 0.10)',
            }}
        />
    );
}
