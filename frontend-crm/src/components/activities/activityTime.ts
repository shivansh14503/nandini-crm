'use client';

import { useMemo } from 'react';
import { useActivityMeta } from '@/hooks/queries/useActivities';
import type { Activity, ActivityFormData, ActivityMeta } from '@/types/activity.types';
import { NOTE_TYPE, isVideoProvider } from '@/types/activity.types';
import type { ActivityFormValues } from '@/validations/activity.schema';
import { fromApiSchedule, toApiSchedule } from '@/utils/activitySchedule';
import { instantToZonedWallClock, isDay, isWallClock } from '@/utils/zonedTime';
import { fmtDay, fmtShortDay, fmtTime, getDisplayFormats } from '@/utils/formats';
import { shortDayOrder } from '@/lib/display-formats/displayFormats';

/**
 * Time helpers of the activity screens. Activities are stored as true instants and entered, shown and grouped in the
 * business timezone (GET /api/activities/meta `timeZone`), whatever the device's own zone: see utils/zonedTime.ts
 * and utils/activitySchedule.ts (Intl only, so FullCalendar's Temporal polyfill loads with the calendar alone).
 */

/** Used until the meta loads (the API's default business timezone). */
export const DEFAULT_TIME_ZONE = 'Asia/Kolkata';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export interface BusinessClock {
    timeZone: string;
    /** The business clock: the server's time when the meta loaded, moved on by the time elapsed since. */
    now: () => Date;
    meta: ActivityMeta | undefined;
}

/**
 * The business timezone and clock. "Now" follows the server (meta `now` plus the time since it arrived), so a device
 * clock set wrong doesn't change what counts as past or overdue.
 */
export function useBusinessClock(): BusinessClock {
    const { data, dataUpdatedAt } = useActivityMeta();
    const serverNow = data?.now ? Date.parse(data.now) : NaN;
    const skew = Number.isFinite(serverNow) && dataUpdatedAt ? serverNow - dataUpdatedAt : 0;
    return useMemo(
        () => ({ timeZone: data?.timeZone || DEFAULT_TIME_ZONE, now: () => new Date(Date.now() + skew), meta: data }),
        [data, skew]
    );
}

/** Short name of the zone at `at` (`IST`), or its GMT offset when the locale has none. */
export function timeZoneAbbr(timeZone: string, at: Date = new Date()): string {
    try {
        const part = new Intl.DateTimeFormat('en-IN', { timeZone, timeZoneName: 'short' })
            .formatToParts(at)
            .find((p) => p.type === 'timeZoneName');
        return part?.value ?? timeZone;
    } catch {
        return timeZone;
    }
}

function dayParts(day: string) {
    const [y, m, d] = day.slice(0, 10).split('-').map(Number);
    return { y, m, d, weekday: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}

/**
 * `2026-11-25` → `Wed 25 Nov` (`Wed Nov 25` for a saved MM/DD/YYYY). With the year: `Wed 25 Nov 2026` until the
 * company formats are saved, then the company date format (`Wed 25/11/2026`). Company formats: utils/formats.
 */
export function formatDayLabel(day: string, { weekday = true, withYear = false }: { weekday?: boolean; withYear?: boolean } = {}): string {
    if (!isDay(day.slice(0, 10))) return day;
    if (!withYear) return fmtShortDay(day, { weekday });
    return fmtDay(day, { weekday, legacy: weekday ? 'ddd D MMM YYYY' : 'D MMM YYYY' });
}

/** `…T14:05` → `2:05 PM` (`14:05` for a saved 24-hour format). */
export function formatWallTime(wall: string): string {
    return fmtTime(wall.slice(11, 16));
}

/** The schedule fields of an activity or calendar item. */
export interface ScheduleLike {
    allDay: boolean;
    startAt?: string | null;
    endAt?: string | null;
    startDay?: string | null;
    endDay?: string | null;
}

/**
 * The time an activity takes place, in the business timezone:
 *  • timed: `Wed 25 Nov, 10:30 AM – 11:30 AM IST` (the end's day only when it differs);
 *  • all-day: `Wed 25 Nov` or `Wed 25 – Thu 26 Nov`.
 * The year shows when it isn't the current one. '' when there is no schedule (notes). Dates and times follow the
 * company formats (utils/formats) once saved.
 */
export function formatActivityWhen(item: ScheduleLike, timeZone: string, now: Date = new Date()): string {
    const thisYear = Number(instantToZonedWallClock(now, timeZone).slice(0, 4));
    if (item.allDay) {
        const first = item.startDay || (item.startAt ? fromApiSchedule({ allDay: true, startAt: item.startAt, endAt: item.endAt ?? '', startDay: '', endDay: '' }, timeZone).startAt : '');
        if (!first) return '';
        const last = item.endDay || first;
        const a = dayParts(first);
        const b = dayParts(last);
        const withYear = a.y !== thisYear || b.y !== thisYear;
        if (first === last) return formatDayLabel(first, { withYear });
        const formats = getDisplayFormats();
        // Saved formats print a year in the company pattern (`Wed 25/11/2026`): both ends then carry it in full.
        if (a.y !== b.y || (withYear && formats.customized)) return `${formatDayLabel(first, { withYear: true })} – ${formatDayLabel(last, { withYear: true })}`;
        // `Wed 25 – Thu 26 Nov` reads well only with the day before the month.
        if (a.m === b.m && shortDayOrder(formats) === 'DM') return `${WEEKDAYS[a.weekday]} ${a.d} – ${formatDayLabel(last, { withYear })}`;
        return `${formatDayLabel(first)} – ${formatDayLabel(last, { withYear })}`;
    }
    if (!item.startAt) return '';
    const start = new Date(item.startAt);
    if (Number.isNaN(start.getTime())) return '';
    const startWall = instantToZonedWallClock(start, timeZone);
    const zone = timeZoneAbbr(timeZone, start);
    const startDay = startWall.slice(0, 10);
    const withYear = Number(startDay.slice(0, 4)) !== thisYear;
    const head = `${formatDayLabel(startDay, { withYear })}, ${formatWallTime(startWall)}`;
    const end = item.endAt ? new Date(item.endAt) : null;
    if (!end || Number.isNaN(end.getTime()) || end.getTime() <= start.getTime()) return `${head} ${zone}`;
    const endWall = instantToZonedWallClock(end, timeZone);
    const tail = endWall.slice(0, 10) === startDay ? formatWallTime(endWall) : `${formatDayLabel(endWall.slice(0, 10), { withYear })}, ${formatWallTime(endWall)}`;
    return `${head} – ${tail} ${zone}`;
}

/** An instant as `25 Nov 2026, 10:30 AM` in the business timezone ('' when missing). */
export function formatBusinessInstant(iso: string | null | undefined, timeZone: string): string {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    const wall = instantToZonedWallClock(date, timeZone);
    return `${formatDayLabel(wall.slice(0, 10), { weekday: false, withYear: true })}, ${formatWallTime(wall)}`;
}

/** A form value (wall clock or day) as text: `Wed 25 Nov 2026, 10:30 AM` / `Wed 25 Nov 2026`. */
export function formatFormValue(value: string): string {
    if (isWallClock(value)) return `${formatDayLabel(value.slice(0, 10), { withYear: true })}, ${formatWallTime(value)}`;
    if (isDay(value)) return formatDayLabel(value, { withYear: true });
    return value;
}

/** The activity's start as a sortable instant (ms); notes and missing starts sort by when they were written. */
export function activitySortTime(activity: Pick<Activity, 'startAt' | 'createdAt'>): number {
    const t = Date.parse(activity.startAt || activity.createdAt);
    return Number.isFinite(t) ? t : 0;
}

/** Planned, timed or all-day, and its end (or start) already behind the business clock. */
export function isActivityOverdue(activity: Pick<Activity, 'status' | 'followupType' | 'startAt' | 'endAt'>, now: Date): boolean {
    if (activity.status !== 'Planned' || activity.followupType === NOTE_TYPE) return false;
    const due = Date.parse(activity.endAt || activity.startAt);
    return Number.isFinite(due) && due < now.getTime();
}

// ── Form values ⇄ API ──────────────────────────────────────────────────────────

/** The form's values of a stored activity (schedule as business-timezone wall clocks or inclusive days). */
export function activityToFormValues(activity: Activity, timeZone: string): ActivityFormValues {
    const schedule = fromApiSchedule(activity, timeZone);
    return {
        followupType: activity.followupType ?? '',
        subject: activity.subject ?? '',
        status: activity.status ?? 'Planned',
        assignedTo: activity.assignedTo ?? '',
        relatedModule: activity.relatedModule ?? '',
        relatedId: activity.relatedId ?? '',
        relatedTo: activity.relatedTo ?? '',
        organizationName: activity.organizationName ?? '',
        organizationId: activity.organizationId ?? '',
        contact: activity.contact ?? '',
        contactId: activity.contactId ?? '',
        allDay: schedule.allDay,
        startAt: schedule.startAt,
        endAt: schedule.endAt,
        reminder: activity.reminder ?? '',
        location: activity.location ?? '',
        videoMeeting: isVideoProvider(activity.videoMeeting) ? activity.videoMeeting : '',
        attendees: activity.attendees ?? [],
        customerResponse: activity.customerResponse ?? '',
        remarks: activity.remarks ?? '',
        customFields: activity.customFields ?? {},
    };
}

/** The API input of the form's values: the schedule converted to instants (timed) or inclusive days (all-day). */
export function formValuesToPayload(values: ActivityFormValues, timeZone: string): Partial<ActivityFormData> {
    const schedule = toApiSchedule(
        { followupType: values.followupType, status: values.status, allDay: Boolean(values.allDay), startAt: values.startAt, endAt: values.endAt },
        timeZone
    );
    // Attendees keep only their identity keys and reply (no blank keys: the API's "empty entry" check reads them).
    const attendees = (values.attendees ?? []).map((a) =>
        Object.fromEntries(Object.entries(a).filter(([key, v]) => key !== 'respondedAt' && v !== undefined && v !== ''))
    ) as ActivityFormData['attendees'];
    return {
        ...values,
        relatedModule: values.relatedModule || '',
        ...schedule,
        reminder: (values.reminder || '') as ActivityFormData['reminder'],
        attendees,
    };
}
