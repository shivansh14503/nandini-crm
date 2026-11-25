'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Alert, Box, Drawer, Fab, IconButton, Typography, useMediaQuery, useTheme } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import AutorenewOutlinedIcon from '@mui/icons-material/AutorenewOutlined';
import FullCalendar, {
    type CalendarRef,
    type DateClickInfo,
    type DateSelectInfo,
    type DatesSetInfo,
    type EventChangeInfo,
    type EventClickInfo,
    type EventDisplayInfo,
    type EventInput,
    type FormatterInput,
} from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/react/daygrid';
import timeGridPlugin from '@fullcalendar/react/timegrid';
import listPlugin from '@fullcalendar/react/list';
import interactionPlugin from '@fullcalendar/react/interaction';
import classicTheme from '@fullcalendar/react/themes/classic';
import '@fullcalendar/react/skeleton.css';
import '@fullcalendar/react/themes/classic/theme.css';
import './calendar.css';

import { ROUTES } from '@/config/constants';
import { useAuth } from '@/context/AuthContext';
import { AppToast } from '@/components/common/AppToast';
import { useCalendarFeed, useUpdateActivity } from '@/hooks/queries/useActivities';
import { useModuleFormConfig } from '@/hooks/queries/useFormConfigs';
import { FOLLOWUP_TYPE_CATEGORY_KEY } from '@/utils/formConfig';
import { addDays, instantToZonedWallClock, isDay, zonedDayOf, zonedStartOfDay } from '@/utils/zonedTime';
import {
    ACTIVITY_STATUSES,
    ACTIVITY_TYPES,
    NOTE_TYPE,
    TASK_TYPE,
    isActivityRelatedModule,
    type ActivityFormData,
    type ActivityRelatedModule,
    type ActivityStatus,
    type CalendarFeedParams,
    type CalendarItem,
} from '@/types/activity.types';
import type { ActivityFormValues } from '@/validations/activity.schema';
import { ActivityDetailDrawer } from '../ActivityDetailDrawer';
import { ActivityQuickCreateDialog } from '../ActivityQuickCreateDialog';
import { useActivityTypeIcon, useActivityTypeLabel } from '../ActivityBadges';
import { RelatedRecordDrawer } from '../relatedRecord';
import { timeZoneAbbr, useBusinessClock } from '../activityTime';
import { CalendarToolbar, type CalendarViewKey } from './CalendarToolbar';
import {
    CalendarFilters,
    DEFAULT_CALENDAR_FILTERS,
    DEFAULT_CALENDAR_SOURCES,
    countActiveFilters,
    type CalendarFilterValues,
    type MiniMonthProps,
} from './CalendarFilters';
import { EventContent } from './EventContent';

/** FullCalendar view per calendar view. */
const FC_VIEWS: Record<CalendarViewKey, string> = {
    month: 'dayGridMonth',
    week: 'timeGridWeek',
    '3day': 'timeGrid3Day',
    day: 'timeGridDay',
    agenda: 'listWeek',
};
const VIEW_OF_FC: Record<string, CalendarViewKey> = Object.fromEntries(Object.entries(FC_VIEWS).map(([k, v]) => [v, k as CalendarViewKey]));

const PHONE_VIEWS: CalendarViewKey[] = ['agenda', 'day', '3day', 'month'];
const TABLET_VIEWS: CalendarViewKey[] = ['month', 'week', '3day', 'day', 'agenda'];
const DESKTOP_VIEWS: CalendarViewKey[] = ['month', 'week', 'day', 'agenda'];

/** Weeks start on Monday. */
const FIRST_DAY = 1;
/** A plain click on the time grid selects one slot; that slot means "use the type's default length". */
const SLOT_MINUTES = 30;
const RAIL_WIDTH = 264;

// Option values FullCalendar compares by reference: kept stable so a re-render doesn't rebuild the calendar.
const PLUGINS = [classicTheme, dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin];
const CUSTOM_VIEWS = { timeGrid3Day: { type: 'timeGrid', duration: { days: 3 } } };
const MONTH_HEADER_FORMAT: FormatterInput = { weekday: 'short' };
const DAY_HEADER_FORMAT: FormatterInput = { weekday: 'short', day: 'numeric' };
const EVENT_TIME_FORMAT: FormatterInput = { hour: 'numeric', minute: '2-digit', meridiem: 'short' };
const LIST_DAY_FORMAT: FormatterInput = { weekday: 'long', day: 'numeric', month: 'short' };
const noEventsContent = () => 'Nothing scheduled in this period.';

const isViewKey = (value: string | null | undefined): value is CalendarViewKey => Boolean(value && value in FC_VIEWS);
const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x));

/** `YYYY-MM-DD` formatted for the title ("25 Nov 2026"); `day` is a calendar day, so UTC noon avoids any shift. */
const fmtDay = (day: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-IN', { ...options, timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`));

/** The toolbar title of a view showing `[start, end)` (calendar days). */
function viewTitle(view: CalendarViewKey, start: string, end: string): string {
    if (view === 'month') return fmtDay(start, { month: 'long', year: 'numeric' });
    if (view === 'day') return fmtDay(start, { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
    const last = addDays(end, -1);
    if (start.slice(0, 4) !== last.slice(0, 4)) return `${fmtDay(start, { day: 'numeric', month: 'short', year: 'numeric' })} – ${fmtDay(last, { day: 'numeric', month: 'short', year: 'numeric' })}`;
    if (start.slice(0, 7) !== last.slice(0, 7)) return `${fmtDay(start, { day: 'numeric', month: 'short' })} – ${fmtDay(last, { day: 'numeric', month: 'short', year: 'numeric' })}`;
    return `${fmtDay(start, { day: 'numeric' })} – ${fmtDay(last, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

/** Days on screen (`[start, end)`), the date the view is about and its type, as FullCalendar last reported them. */
interface ShownRange {
    view: CalendarViewKey;
    /** First and (exclusive) last day loaded: the active range, padding days of the month grid included. */
    start: string;
    end: string;
    /** The period the title names (a month without its padding days). */
    currentStart: string;
    currentEnd: string;
    /** The calendar's date (`?date=`). */
    date: string;
}

/** A calendar entry as FullCalendar takes it. All-day entries use days (the end exclusive); timed ones instants. */
function toEventInput(item: CalendarItem, timeZone: string, coarsePointer: boolean): EventInput {
    const draggable = item.editable && item.source === 'activity';
    const base: EventInput = {
        id: item.key,
        title: item.title,
        // The chip draws its own tint (EventContent).
        color: 'transparent',
        contrastColor: 'inherit',
        className: 'crm-cal-event',
        editable: draggable,
        startEditable: draggable,
        // Resize handles are too small for a finger; a task has no End to stretch.
        durationEditable: draggable && !coarsePointer && item.followupType !== TASK_TYPE,
        extendedProps: { item },
    };
    if (item.allDay) {
        const startDay = item.startDay || zonedDayOf(new Date(item.start), timeZone);
        const endDay = item.endDay && item.endDay >= startDay ? item.endDay : startDay;
        return { ...base, allDay: true, start: startDay, end: addDays(endDay, 1) };
    }
    return { ...base, allDay: false, start: item.start, end: item.end ?? undefined };
}

/** Initial filters from the query string (`?users=a,b`). */
function filtersFromQuery(searchParams: URLSearchParams | null): CalendarFilterValues {
    const users = (searchParams?.get('users') ?? '')
        .split(',')
        .map((u) => u.trim())
        .filter(Boolean);
    const status = (searchParams?.get('status') ?? '')
        .split(',')
        .filter((s): s is ActivityStatus => (ACTIVITY_STATUSES as readonly string[]).includes(s));
    return { ...DEFAULT_CALENDAR_FILTERS, users, ...(status.length > 0 && { status }) };
}

/**
 * The activity calendar (`/calendar?view=&date=&users=&activity=`): activities, lead / opportunity follow-ups and
 * contract renewals in month, week, 3-day, day and agenda views, in the business timezone. Activities drag and resize
 * to reschedule (long press on touch); follow-ups and renewals open their record. Selecting empty time creates an
 * activity there. Loaded with `next/dynamic` (`ssr: false`) so FullCalendar stays out of other routes.
 */
export default function CalendarView() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const theme = useTheme();
    const isPhone = useMediaQuery(theme.breakpoints.down('sm'), { noSsr: true });
    const isSmallTablet = useMediaQuery(theme.breakpoints.between('sm', 'md'), { noSsr: true });
    const isDesktop = useMediaQuery(theme.breakpoints.up('lg'), { noSsr: true });
    const coarsePointer = useMediaQuery('(pointer: coarse)', { noSsr: true });
    const { user } = useAuth();
    const me = user?.username ?? '';
    const clock = useBusinessClock();
    const timeZone = clock.timeZone;
    const today = zonedDayOf(clock.now(), timeZone);

    const calendarRef = useRef<CalendarRef>(null);
    const views = isPhone ? PHONE_VIEWS : isDesktop ? DESKTOP_VIEWS : TABLET_VIEWS;
    const defaultView: CalendarViewKey = isPhone ? 'agenda' : isSmallTablet ? '3day' : 'week';

    // The query string is read once; afterwards the state is the source and is written back to it.
    const [initial] = useState(() => {
        const view = searchParams?.get('view');
        const date = searchParams?.get('date');
        return {
            view: isViewKey(view) ? view : defaultView,
            date: isDay(date) ? date : undefined,
            activity: searchParams?.get('activity') || null,
        };
    });
    const [range, setRange] = useState<ShownRange | null>(null);
    const [filters, setFilters] = useState<CalendarFilterValues>(() => filtersFromQuery(searchParams));
    const [activityId, setActivityId] = useState<string | null>(initial.activity);
    const [related, setRelated] = useState<{ module: ActivityRelatedModule; id: string } | null>(null);
    const [quickCreate, setQuickCreate] = useState<{ open: boolean; prefill?: Partial<ActivityFormValues> }>({ open: false });
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [toast, setToast] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });
    /** Entries moved by drag / resize while the save is on its way (so a re-render doesn't snap them back). */
    const [moved, setMoved] = useState<Record<string, Partial<CalendarItem>>>({});
    const lastSelectAt = useRef(0);

    const showToast = useCallback((message: string, severity: 'success' | 'error') => setToast({ open: true, message, severity }), [setToast]);

    // ── Feed ────────────────────────────────────────────────────────────────
    const feedParams = useMemo<CalendarFeedParams | undefined>(() => {
        if (!range) return undefined;
        return {
            from: zonedStartOfDay(range.start, timeZone).toISOString(),
            to: zonedStartOfDay(range.end, timeZone).toISOString(),
            users: filters.users.length > 0 ? filters.users : undefined,
            types: filters.types.length > 0 ? filters.types : undefined,
            sources: sameSet(filters.sources, DEFAULT_CALENDAR_SOURCES) ? undefined : filters.sources,
            status: filters.status,
        };
    }, [range, timeZone, filters]);
    // Keeps the previous window's entries while the next one loads (FullCalendar shows only those in range).
    const feed = useCalendarFeed(feedParams);
    const items = useMemo(() => feed.data?.items ?? [], [feed.data]);

    const events = useMemo<EventInput[]>(
        () => items.map((item) => toEventInput(moved[item.key] ? { ...item, ...moved[item.key] } : item, timeZone, coarsePointer)),
        [items, moved, timeZone, coarsePointer]
    );

    // ── Query string ────────────────────────────────────────────────────────
    useEffect(() => {
        if (!range) return;
        const params = new URLSearchParams();
        params.set('view', range.view);
        params.set('date', range.date);
        if (filters.users.length > 0) params.set('users', filters.users.join(','));
        if (activityId) params.set('activity', activityId);
        const next = `${ROUTES.CALENDAR}?${params.toString()}`;
        if (typeof window !== 'undefined' && `${window.location.pathname}${window.location.search}` !== next) {
            router.replace(next, { scroll: false });
        }
    }, [range, filters.users, activityId, router]);

    // ── Types ───────────────────────────────────────────────────────────────
    const getOptions = useModuleFormConfig('activities').getOptions;
    const typeOptions = useMemo(() => getOptions(FOLLOWUP_TYPE_CATEGORY_KEY, ACTIVITY_TYPES).filter((t) => t !== NOTE_TYPE), [getOptions]);
    const typeLabel = useActivityTypeLabel();
    const typeIcon = useActivityTypeIcon();

    // ── Calendar callbacks ──────────────────────────────────────────────────
    const api = useCallback(() => calendarRef.current?.getApi(), []);

    // Days come from FullCalendar's zoned strings (`2026-11-23T00:00:00+05:30`), never from its Date objects.
    const onDatesSet = useCallback((info: DatesSetInfo) => {
        const view = VIEW_OF_FC[info.view.type] ?? 'week';
        const start = info.startStr.slice(0, 10);
        const end = info.endStr.slice(0, 10);
        let currentStart = start;
        let currentEnd = end;
        if (view === 'month') {
            // The month grid starts and ends with days of the neighbouring months; the title names the middle one.
            const month = addDays(start, 15).slice(0, 7);
            const [y, m] = month.split('-').map(Number);
            currentStart = `${month}-01`;
            currentEnd = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
        }
        let date = currentStart;
        try {
            const calendar = info.view.calendar;
            date = calendar.formatIso(calendar.getDate(), true).slice(0, 10) || currentStart;
        } catch {
            // Keep the period's first day.
        }
        const next: ShownRange = { view, start, end, currentStart, currentEnd, date };
        setRange((prev) =>
            prev && prev.view === next.view && prev.start === next.start && prev.end === next.end && prev.date === next.date && prev.currentStart === next.currentStart
                ? prev
                : next
        );
    }, []);

    const openQuickCreate = useCallback((prefill?: Partial<ActivityFormValues>) => setQuickCreate({ open: true, prefill }), [setQuickCreate]);

    const onSelect = useCallback(
        (info: DateSelectInfo) => {
            lastSelectAt.current = Date.now();
            api()?.unselect();
            if (info.allDay) {
                const startDay = info.startStr.slice(0, 10);
                const lastDay = info.endStr ? addDays(info.endStr.slice(0, 10), -1) : startDay;
                openQuickCreate({ allDay: true, startAt: startDay, endAt: lastDay < startDay ? startDay : lastDay });
                return;
            }
            const start = new Date(info.startStr);
            const end = new Date(info.endStr);
            const oneSlot = end.getTime() - start.getTime() <= SLOT_MINUTES * 60_000;
            openQuickCreate({
                allDay: false,
                startAt: instantToZonedWallClock(start, timeZone),
                // One slot (a plain click or tap): the type's default length decides the End.
                ...(oneSlot ? {} : { endAt: instantToZonedWallClock(end, timeZone) }),
            });
        },
        [api, openQuickCreate, timeZone]
    );

    // A tap on touch (no long press) creates there too. A selection made by the same gesture wins.
    const onDateClick = useCallback(
        (info: DateClickInfo) => {
            window.setTimeout(() => {
                if (Date.now() - lastSelectAt.current < 600) return;
                if (info.allDay) {
                    const day = info.dateStr.slice(0, 10);
                    openQuickCreate({ allDay: true, startAt: day, endAt: day });
                } else {
                    openQuickCreate({ allDay: false, startAt: instantToZonedWallClock(new Date(info.dateStr), timeZone) });
                }
            }, 0);
        },
        [openQuickCreate, timeZone]
    );

    const onEventClick = useCallback((info: EventClickInfo) => {
        info.jsEvent.preventDefault();
        const item = info.event.extendedProps.item as CalendarItem | undefined;
        if (!item) return;
        if (item.source === 'activity') {
            setActivityId(item.recordId);
            return;
        }
        // Follow-ups and renewals belong to their record: open it.
        if (isActivityRelatedModule(item.module)) setRelated({ module: item.module, id: item.recordId });
    }, [setActivityId, setRelated]);

    const updateActivity = useUpdateActivity();
    const reschedule = useCallback(
        async (info: EventChangeInfo) => {
            const item = info.event.extendedProps.item as CalendarItem | undefined;
            const ev = info.event;
            if (!item || !ev.start) {
                info.revert();
                return;
            }
            // Always carries allDay, so a drag between the all-day row and the time grid converts the activity.
            let patch: Partial<ActivityFormData>;
            let shown: Partial<CalendarItem>;
            if (ev.allDay) {
                const startDay = ev.startStr.slice(0, 10);
                const lastDay = ev.endStr ? addDays(ev.endStr.slice(0, 10), -1) : startDay;
                const endDay = lastDay < startDay ? startDay : lastDay;
                patch = { allDay: true, startDay, endDay, startAt: '', endAt: '' };
                shown = { allDay: true, startDay, endDay, start: zonedStartOfDay(startDay, timeZone).toISOString(), end: zonedStartOfDay(addDays(endDay, 1), timeZone).toISOString() };
            } else {
                const startAt = new Date(ev.startStr).toISOString();
                // No end (dragged out of the all-day row): the API gives it the type's default length.
                const endAt = ev.endStr ? new Date(ev.endStr).toISOString() : '';
                patch = { allDay: false, startAt, endAt, startDay: '', endDay: '' };
                shown = { allDay: false, start: startAt, end: endAt || null, startDay: null, endDay: null };
            }
            setMoved((prev) => ({ ...prev, [item.key]: shown }));
            try {
                await updateActivity.mutateAsync({ id: item.recordId, data: patch });
                showToast('Activity rescheduled.', 'success');
            } catch (err: unknown) {
                info.revert();
                showToast(err instanceof Error ? err.message : 'Failed to reschedule the activity.', 'error');
            } finally {
                setMoved((prev) => {
                    const next = { ...prev };
                    delete next[item.key];
                    return next;
                });
            }
        },
        [timeZone, updateActivity, showToast]
    );

    const renderEvent = useCallback(
        (info: EventDisplayInfo) => {
            const item = info.event.extendedProps.item as CalendarItem | undefined;
            if (!item) return null;
            const list = info.view.type.startsWith('list');
            const compact = info.isShort || info.isNarrow || info.view.type.startsWith('dayGrid');
            const Icon = item.source === 'contractRenewal' ? AutorenewOutlinedIcon : typeIcon(item.followupType);
            return <EventContent item={item} Icon={Icon} timeText={info.timeText} list={list} compact={compact} />;
        },
        [typeIcon]
    );

    // ── Toolbar actions ─────────────────────────────────────────────────────
    const changeView = (view: CalendarViewKey) => api()?.changeView(FC_VIEWS[view]);
    const currentView = range?.view ?? initial.view;
    const title = range ? viewTitle(range.view, range.currentStart, range.currentEnd) : '';

    // A view the width no longer offers (a week on a phone after rotating) switches to that width's default.
    useEffect(() => {
        if (range && !views.includes(range.view)) api()?.changeView(FC_VIEWS[defaultView]);
    }, [api, range, views, defaultView]);

    const miniMonth: MiniMonthProps = {
        date: range?.date ?? initial.date ?? today,
        today,
        rangeStart: range?.currentStart ?? today,
        rangeEnd: range?.currentEnd ?? addDays(today, 1),
        firstDay: FIRST_DAY,
        onPick: (day) => {
            api()?.gotoDate(day);
            if (!isDesktop) setFiltersOpen(false);
        },
    };
    const activeFilterCount = countActiveFilters(filters, me);
    const filtersPanel = (
        <CalendarFilters
            values={filters}
            onChange={setFilters}
            me={me}
            typeOptions={typeOptions}
            typeLabel={typeLabel}
            typeIcon={typeIcon}
            miniMonth={miniMonth}
        />
    );

    const closeActivity = useCallback(() => setActivityId(null), [setActivityId]);

    return (
        <Box
            sx={{
                flex: 1,
                display: 'flex',
                gap: 2,
                minWidth: 0,
                px: { xs: 1.5, sm: 2, md: 3 },
                py: { xs: 1.5, md: 2 },
                height: { md: 'calc(100dvh - 88px)' },
                minHeight: { md: 640 },
            }}
        >
            {isDesktop && (
                <Box
                    component="aside"
                    aria-label="Calendar filters"
                    sx={{
                        width: RAIL_WIDTH,
                        flexShrink: 0,
                        overflowY: 'auto',
                        p: 2,
                        borderRadius: '14px',
                        border: '1px solid var(--mui-palette-border-main)',
                        backgroundColor: 'var(--mui-palette-background-paper)',
                    }}
                >
                    {filtersPanel}
                </Box>
            )}

            <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <CalendarToolbar
                    title={title}
                    view={currentView}
                    views={views}
                    onViewChange={changeView}
                    onPrev={() => api()?.prev()}
                    onNext={() => api()?.next()}
                    onToday={() => api()?.today()}
                    onNew={() => openQuickCreate()}
                    onRefresh={() => feed.refetch()}
                    refreshing={feed.isFetching}
                    onOpenFilters={isDesktop ? undefined : () => setFiltersOpen(true)}
                    activeFilterCount={activeFilterCount}
                    compact={isPhone}
                />
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
                    <Typography sx={{ fontSize: '0.75rem', color: 'var(--mui-palette-text-secondary)' }}>
                        {`Times in ${timeZoneAbbr(timeZone)} (${timeZone})`}
                        {!coarsePointer && ' · Drag an activity to reschedule it, or select empty time to add one.'}
                        {coarsePointer && ' · Long-press an activity to move it; tap empty time to add one.'}
                    </Typography>
                </Box>
                {feed.data?.truncated && (
                    <Alert severity="warning" sx={{ py: 0.25, fontSize: '0.8rem' }}>
                        This period has more entries than the calendar can show. Narrow it with the filters or a shorter view.
                    </Alert>
                )}
                {feed.isError && (
                    <Alert severity="error" sx={{ py: 0.25, fontSize: '0.8rem' }}>
                        {feed.error instanceof Error ? feed.error.message : 'Failed to load the calendar.'}
                    </Alert>
                )}
                <Box
                    className="crm-calendar"
                    sx={{
                        flex: { md: 1 },
                        // Phones and tablets scroll the page; the calendar keeps a definite height so its grid scrolls inside.
                        height: { xs: 'max(420px, calc(100dvh - 220px))', md: 'auto' },
                        minHeight: { md: 0 },
                        borderRadius: '14px',
                        border: '1px solid var(--mui-palette-border-main)',
                        overflow: 'hidden',
                        p: { xs: 0.5, sm: 1 },
                        display: 'flex',
                        flexDirection: 'column',
                        '& > *': { flex: 1, minHeight: 0 },
                    }}
                >
                    <FullCalendar
                        ref={calendarRef}
                        plugins={PLUGINS}
                        className="crm-cal-root"
                        dayHeaderClass="crm-cal-day-header"
                        allDayHeaderClass="crm-cal-day-header"
                        listDayHeaderClass="crm-cal-list-day"
                        slotHeaderClass="crm-cal-slot-label"
                        rowMoreLinkClass="crm-cal-more"
                        moreLinkClass="crm-cal-more"
                        popoverClass="crm-cal-popover"
                        listItemEventBeforeClass="crm-cal-hidden"
                        headerToolbar={false}
                        timeZone={timeZone}
                        initialView={FC_VIEWS[initial.view]}
                        initialDate={initial.date}
                        views={CUSTOM_VIEWS}
                        firstDay={FIRST_DAY}
                        height="100%"
                        expandRows
                        nowIndicator
                        navLinks
                        dayMaxEvents
                        eventDisplay="block"
                        allDayText="All day"
                        scrollTime="08:00:00"
                        slotDuration={`00:${SLOT_MINUTES}:00`}
                        defaultTimedEventDuration="00:30:00"
                        eventMinHeight={20}
                        dayHeaderFormat={currentView === 'month' ? MONTH_HEADER_FORMAT : DAY_HEADER_FORMAT}
                        eventTimeFormat={EVENT_TIME_FORMAT}
                        listDayFormat={LIST_DAY_FORMAT}
                        noEventsContent={noEventsContent}
                        events={events}
                        eventContent={renderEvent}
                        eventClick={onEventClick}
                        datesSet={onDatesSet}
                        selectable
                        selectMirror
                        select={onSelect}
                        dateClick={onDateClick}
                        eventDrop={reschedule}
                        eventResize={reschedule}
                        eventLongPressDelay={350}
                        selectLongPressDelay={500}
                    />
                </Box>
            </Box>

            {/* Tablet: a right drawer; phone: a bottom sheet. */}
            {!isDesktop && (
                <Drawer
                    anchor={isPhone ? 'bottom' : 'right'}
                    open={filtersOpen}
                    onClose={() => setFiltersOpen(false)}
                    slotProps={{
                        paper: {
                            sx: {
                                width: isPhone ? '100%' : 'min(360px, calc(100vw - 32px))',
                                maxHeight: isPhone ? '85dvh' : '100%',
                                borderRadius: isPhone ? '16px 16px 0 0' : 0,
                                backgroundColor: 'var(--mui-palette-background-paper)',
                                backgroundImage: 'none',
                            },
                        },
                    }}
                >
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1.25, borderBottom: '1px solid var(--mui-palette-border-light)' }}>
                        <Typography sx={{ fontWeight: 800, fontSize: '1rem', color: 'var(--crm-slate-900)' }}>Calendar filters</Typography>
                        <IconButton
                            onClick={() => setFiltersOpen(false)}
                            aria-label="Close filters"
                            sx={{
                                width: 40,
                                height: 40,
                                borderRadius: '8px',
                                color: 'var(--mui-palette-text-secondary)',
                                '&:hover': { color: 'var(--mui-palette-error-main)', backgroundColor: 'var(--mui-palette-error-soft)' },
                            }}
                        >
                            <CloseIcon />
                        </IconButton>
                    </Box>
                    <Box sx={{ p: 2, overflowY: 'auto' }}>{filtersPanel}</Box>
                </Drawer>
            )}

            {isPhone && (
                <Fab
                    aria-label="New activity"
                    onClick={() => openQuickCreate()}
                    sx={{
                        position: 'fixed',
                        right: 16,
                        bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
                        width: 56,
                        height: 56,
                        color: '#ffffff',
                        backgroundColor: 'var(--crm-fill-blue-600)',
                        boxShadow: '0 6px 18px rgb(var(--crm-accent-rgb) / 0.32)',
                        '&:hover': { backgroundColor: 'var(--crm-fill-blue-700)' },
                    }}
                >
                    <AddIcon />
                </Fab>
            )}

            <ActivityDetailDrawer activityId={activityId} open={Boolean(activityId)} onClose={closeActivity} onEdit={(id) => router.push(ROUTES.ACTIVITY_EDIT(id))} />
            {related && <RelatedRecordDrawer module={related.module} id={related.id} onClose={() => setRelated(null)} />}
            <ActivityQuickCreateDialog
                open={quickCreate.open}
                prefill={quickCreate.prefill}
                onClose={() => setQuickCreate({ open: false })}
                onSaved={(activity) => {
                    showToast(activity.followupType === NOTE_TYPE ? 'Note saved.' : 'Activity saved.', 'success');
                }}
            />
            <AppToast open={toast.open} message={toast.message} severity={toast.severity} onClose={() => setToast((t) => ({ ...t, open: false }))} />
        </Box>
    );
}
