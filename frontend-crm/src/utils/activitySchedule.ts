import { ACTIVITY_MAX_DURATION_DAYS, NOTE_TYPE, PLANNED_STATUS, TASK_TYPE } from '../types/activity.types';
import {
    addDays,
    addMinutesToWallClock,
    daysBetween,
    instantToZonedWallClock,
    isDay,
    isWallClock,
    zonedDayOf,
    zonedWallClockToInstant,
} from './zonedTime';

/**
 * Schedule rules of the activity form, the same as the API's (backend-crm modules/activities activity.schedule.ts
 * `normalizeSchedule` and activity.validator.ts `activityPastIssues`, same messages; checked by backend-crm
 * validators/contractSync.test.ts). Relative imports only, so that test can load it.
 *
 * The form holds the schedule in the business timezone, in the two Form Builder fields `startAt` / `endAt`:
 *  • timed activities: `YYYY-MM-DDTHH:mm` wall clocks;
 *  • all-day activities: the first and the last day, `YYYY-MM-DD` (inclusive).
 * `toApiSchedule` turns them into the API's input (instants with a zone, or `startDay` / `endDay`); `fromApiSchedule`
 * reads an activity back (all-day ones from its inclusive days, never from the exclusive `endAt`).
 */

export const START_REQUIRED_MESSAGE = 'Start is required.';
export const END_BEFORE_START_MESSAGE = 'End cannot be before Start.';
export const TOO_LONG_MESSAGE = `An activity can last at most ${ACTIVITY_MAX_DURATION_DAYS} days.`;
export const RELATED_RECORD_MESSAGE = 'Pick the record this activity is related to.';
export const NOTE_REMARKS_MESSAGE = 'Remarks is required for a note.';
export const PAST_START_MESSAGE = 'Start cannot be in the past. Set Status to Completed to log an activity that already happened.';
export const INVALID_START_MESSAGE = 'Start must be a valid date and time.';
export const INVALID_END_MESSAGE = 'End must be a valid date and time.';

/** "Log it now" from a calendar slot: a Planned start up to this many minutes ago still passes. */
export const PAST_START_GRACE_MINUTES = 5;
const MINUTE_MS = 60_000;

export interface ScheduleIssue {
    path: string;
    message: string;
}

/** The schedule part of the form's values. */
export interface ScheduleValues {
    followupType: string;
    status?: string;
    allDay: boolean;
    /** Timed: wall clock; all-day: first day. */
    startAt: string;
    /** Timed: wall clock; all-day: last day (inclusive). */
    endAt: string;
}

/**
 * The schedule as the API takes it (one input mode at a time). Every key is sent, '' for none: updates are merge
 * patches, so a key left out would keep the stored value (an End the user cleared would come back).
 */
export type ApiSchedule =
    | { allDay: false; startAt: string; endAt: string; startDay: ''; endDay: '' }
    | { allDay: true; startDay: string; endDay: string; startAt: ''; endAt: '' };

/** The schedule fields of an activity the API returned. */
export interface StoredSchedule {
    allDay: boolean;
    /** ISO instants (`…Z`), '' on notes. */
    startAt: string;
    endAt: string;
    /** Inclusive business-timezone days, '' unless all-day. */
    startDay: string;
    endDay: string;
}

const isTimedValue = (allDay: boolean, value: string) => (allDay ? isDay(value) : isWallClock(value));

/**
 * Start required (every type but Note), valid values, End not before Start, at most 31 days. Tasks have no End.
 * Paths are `startAt` / `endAt` in both modes, the Form Builder fields the form shows.
 */
export function activityScheduleIssues(values: ScheduleValues, timeZone: string): ScheduleIssue[] {
    if (values.followupType === NOTE_TYPE) return [];
    const issues: ScheduleIssue[] = [];
    const start = values.startAt?.trim() ?? '';
    const end = values.followupType === TASK_TYPE ? '' : (values.endAt?.trim() ?? '');
    if (!start) return [{ path: 'startAt', message: START_REQUIRED_MESSAGE }];
    if (!isTimedValue(values.allDay, start)) return [{ path: 'startAt', message: INVALID_START_MESSAGE }];
    if (!end) return issues;
    if (!isTimedValue(values.allDay, end)) return [{ path: 'endAt', message: INVALID_END_MESSAGE }];
    if (values.allDay) {
        const span = daysBetween(start, end);
        if (span < 0) issues.push({ path: 'endAt', message: END_BEFORE_START_MESSAGE });
        else if (span > ACTIVITY_MAX_DURATION_DAYS - 1) issues.push({ path: 'endAt', message: TOO_LONG_MESSAGE });
        return issues;
    }
    const length = zonedWallClockToInstant(end, timeZone).getTime() - zonedWallClockToInstant(start, timeZone).getTime();
    if (length < 0) issues.push({ path: 'endAt', message: END_BEFORE_START_MESSAGE });
    else if (length > ACTIVITY_MAX_DURATION_DAYS * 24 * 60 * MINUTE_MS) issues.push({ path: 'endAt', message: TOO_LONG_MESSAGE });
    return issues;
}

/**
 * A Planned activity can't start in the past; Completed and Cancelled ones can (logging a call that happened).
 * All-day activities compare the business day (today is fine), timed ones the business wall clock with
 * {@link PAST_START_GRACE_MINUTES} of grace. A start equal to the one loaded (`initial`) passes, so an overdue
 * activity stays editable.
 */
export function activityPastIssues(
    values: ScheduleValues,
    initial: Pick<ScheduleValues, 'allDay' | 'startAt'> | undefined,
    now: Date,
    timeZone: string,
): ScheduleIssue[] {
    if ((values.status ?? PLANNED_STATUS) !== PLANNED_STATUS || values.followupType === NOTE_TYPE) return [];
    const start = values.startAt?.trim() ?? '';
    if (!isTimedValue(values.allDay, start)) return [];
    if (initial && initial.allDay === values.allDay && initial.startAt === start) return [];
    const wallNow = instantToZonedWallClock(new Date(now.getTime() - PAST_START_GRACE_MINUTES * MINUTE_MS), timeZone);
    const past = values.allDay ? start < wallNow.slice(0, 10) : start < wallNow;
    return past ? [{ path: 'startAt', message: PAST_START_MESSAGE }] : [];
}

const NO_SCHEDULE: ApiSchedule = { allDay: false, startAt: '', endAt: '', startDay: '', endDay: '' };

/**
 * The form's schedule as the API input. Timed: instants (`toISOString`) and `allDay: false`, End '' when empty
 * (the API defaults it from the type's duration) and for tasks. All-day: inclusive `startDay` / `endDay` (End
 * defaults to Start). Notes send no schedule.
 */
export function toApiSchedule(values: ScheduleValues, timeZone: string): ApiSchedule {
    if (values.followupType === NOTE_TYPE) return NO_SCHEDULE;
    const start = values.startAt?.trim() ?? '';
    const end = values.followupType === TASK_TYPE ? '' : (values.endAt?.trim() ?? '');
    if (values.allDay) {
        const startDay = start.slice(0, 10);
        return { allDay: true, startDay, endDay: end ? end.slice(0, 10) : startDay, startAt: '', endAt: '' };
    }
    if (!isWallClock(start)) return NO_SCHEDULE;
    return {
        allDay: false,
        startAt: zonedWallClockToInstant(start, timeZone).toISOString(),
        endAt: isWallClock(end) ? zonedWallClockToInstant(end, timeZone).toISOString() : '',
        startDay: '',
        endDay: '',
    };
}

/** A stored activity's schedule as the form holds it (wall clocks, or the inclusive days of an all-day one). */
export function fromApiSchedule(stored: StoredSchedule, timeZone: string): Pick<ScheduleValues, 'allDay' | 'startAt' | 'endAt'> {
    if (stored.allDay) {
        const startDay = stored.startDay || (stored.startAt ? zonedDayOf(new Date(stored.startAt), timeZone) : '');
        const endDay = stored.endDay || (stored.endAt ? addDays(zonedDayOf(new Date(stored.endAt), timeZone), -1) : startDay);
        return { allDay: true, startAt: startDay, endAt: endDay };
    }
    return {
        allDay: false,
        startAt: stored.startAt ? instantToZonedWallClock(new Date(stored.startAt), timeZone) : '',
        endAt: stored.endAt ? instantToZonedWallClock(new Date(stored.endAt), timeZone) : '',
    };
}

/** Default length (minutes) of a Followup Type: Task 0, else the API's per-type map, else its fallback. */
export function durationMinutesFor(
    followupType: string,
    durations: Readonly<Record<string, number>> | undefined,
    fallbackMinutes = 30,
): number {
    if (followupType === TASK_TYPE) return 0;
    const minutes = durations?.[followupType];
    return typeof minutes === 'number' && Number.isInteger(minutes) && minutes >= 0 ? minutes : fallbackMinutes;
}

/** The next quarter hour after `now`, as a business wall clock (where a new activity starts by default). */
export function nextQuarterHour(now: Date, timeZone: string): string {
    const wall = instantToZonedWallClock(now, timeZone);
    const minutes = Number(wall.slice(14, 16));
    const step = 15 - (minutes % 15);
    return addMinutesToWallClock(wall, step, timeZone);
}

/** Switches the form's schedule between the two modes, keeping the days (timed → all-day) or starting at 09:00. */
export function switchScheduleMode(
    values: Pick<ScheduleValues, 'startAt' | 'endAt'>,
    allDay: boolean,
    timeZone: string,
    durationMinutes: number,
    defaultStart: string,
): Pick<ScheduleValues, 'startAt' | 'endAt'> {
    if (allDay) {
        const startDay = values.startAt ? values.startAt.slice(0, 10) : defaultStart.slice(0, 10);
        const endDay = values.endAt ? values.endAt.slice(0, 10) : startDay;
        return { startAt: startDay, endAt: endDay < startDay ? startDay : endDay };
    }
    const startDay = values.startAt ? values.startAt.slice(0, 10) : '';
    const startAt = startDay && startDay !== defaultStart.slice(0, 10) ? `${startDay}T09:00` : defaultStart;
    return { startAt, endAt: addMinutesToWallClock(startAt, durationMinutes, timeZone) };
}
