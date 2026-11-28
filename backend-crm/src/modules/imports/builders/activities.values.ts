import { HttpError, type ApiFieldError } from '../../../utils/httpError.js';
import { ENTITY_CODE_PREFIX } from '../../../utils/codeGenerator.js';
import { instantToZonedWallClock, zonedDayOf, zonedWallClockToInstant } from '../../../utils/zonedTime.js';
import { detectEntityCode } from '../../shared/searchTerms.js';
import {
    ACTIVITY_MAX_DURATION_DAYS,
    ACTIVITY_RELATED_MODULE_LABELS,
    ACTIVITY_RELATED_MODULES,
    COMPLETED_STATUS,
    PLANNED_STATUS,
    TASK_TYPE,
    type ActivityRelatedModule,
} from '../../activities/activity.schedule.js';
import { optionKey } from '../importValues.js';

/**
 * Pure helpers of the activities import (builders/activities.ts): what a blank cell of an activity row becomes, how
 * Start / End / All Day / Duration cells become the create API's schedule, and which module a Related To names.
 * No database or env access, so the tests run them directly.
 */

/**
 * Values a blank cell becomes. Followup Type takes the admin's default option of the dropdown (as the form pre-fills
 * it), else `followupType` below when it is an active option, else the first active option. Status is Planned, or
 * Completed when the Start has already passed (a Planned activity can't start in the past, so a spreadsheet of past
 * calls logs them as done). Assigned to is the importing user. Mirrored by IMPORT_DEFAULTS.activities in
 * frontend-crm/src/components/common/import/importFields.ts, which shows them on the mapping step.
 */
export const ACTIVITY_IMPORT_DEFAULTS = {
    followupType: 'Call',
    status: PLANNED_STATUS,
    pastStatus: COMPLETED_STATUS,
} as const;

/** Import-only cells of an activity row (not fields of the activity form). */
export const ACTIVITY_IMPORT_ONLY_KEYS = {
    /** The Related To type picker: Lead, Opportunity, Contact, Organization, Quotation, Ticket, Contract. */
    relatedModule: 'relatedModule',
    /** Length of a timed activity whose End is blank, in minutes (else the Followup Type's default duration). */
    durationMinutes: 'durationMinutes',
} as const;

/** Same grace as the API's past check (activity.validator.ts `activityPastIssues`): "log it now" counts as now. */
const PAST_GRACE_MS = 5 * 60_000;
const MAX_DURATION_MINUTES = ACTIVITY_MAX_DURATION_DAYS * 24 * 60;

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** The Followup Type dropdown as the import reads it. */
export interface FollowupTypeOptions {
    options: readonly { value: string; isActive: boolean; isDefault: boolean; sortOrder: number }[];
}

/** The Followup Type a blank cell becomes (see ACTIVITY_IMPORT_DEFAULTS). */
export function defaultFollowupType(category: FollowupTypeOptions | null | undefined): string {
    const active = [...(category?.options ?? [])].filter((option) => option.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
    const preferred = active.find((option) => option.isDefault) ?? active.find((option) => option.value === ACTIVITY_IMPORT_DEFAULTS.followupType) ?? active[0];
    return preferred?.value ?? ACTIVITY_IMPORT_DEFAULTS.followupType;
}

/** The schedule fields of the create API (activity.validator.ts): instants when timed, days when all-day. */
export interface ImportSchedule {
    allDay: boolean;
    startAt?: string;
    endAt?: string;
    startDay?: string;
    endDay?: string;
}

const fail = (issues: ApiFieldError[]): never => {
    throw HttpError.badRequest(issues[0].message, issues);
};

/** A Duration (minutes) cell: a whole number of minutes, 0 to 31 days. Undefined when blank. */
export function parseDurationMinutes(cell: unknown): number | undefined {
    const value = text(cell).replace(/\s*(min|mins|minutes?)$/i, '');
    if (!value) return undefined;
    const minutes = Number(value);
    if (!/^\d+$/.test(value) || minutes > MAX_DURATION_MINUTES) {
        return fail([{ path: [ACTIVITY_IMPORT_ONLY_KEYS.durationMinutes], message: `Duration (minutes) must be a whole number of minutes, at most ${MAX_DURATION_MINUTES}.` }]);
    }
    return minutes;
}

/**
 * Start / End / All Day of a row (cells as `buildImportPayload` reads them: `YYYY-MM-DD` or `YYYY-MM-DDTHH:mm`, All Day
 * a boolean) as the create API takes them. All Day Yes, or a Start without a time when All Day is blank, makes an
 * all-day activity (End's day, when given, is its last day). Otherwise the times are business-timezone wall clocks;
 * a blank End is Start + Duration when a duration is given (not on Tasks), else left to the Followup Type's default
 * length. A missing Start is left to the API ("Start is required."; Notes need none).
 */
export function activityImportSchedule(
    payload: Record<string, unknown>,
    followupType: string,
    durationMinutes: number | undefined,
    timeZone: string,
): ImportSchedule {
    const [startDate, startTime] = text(payload.startAt).split('T');
    const [endDate, endTime] = text(payload.endAt).split('T');
    const allDayCell = typeof payload.allDay === 'boolean' ? payload.allDay : undefined;
    const allDay = allDayCell ?? Boolean(startDate && !startTime);

    if (allDay) return { allDay: true, startDay: startDate || undefined, endDay: endDate || undefined };

    const issues: ApiFieldError[] = [];
    if (startDate && !startTime) issues.push({ path: ['startAt'], message: 'Start needs a time (DD-MM-YYYY HH:mm), or set All Day to Yes.' });
    if (endDate && !endTime) issues.push({ path: ['endAt'], message: 'End needs a time (DD-MM-YYYY HH:mm), or set All Day to Yes.' });
    if (issues.length) fail(issues);
    if (!startDate) return { allDay: false };

    const start = zonedWallClockToInstant(`${startDate}T${startTime}`, timeZone);
    let endAt: string | undefined;
    if (endDate) endAt = zonedWallClockToInstant(`${endDate}T${endTime}`, timeZone).toISOString();
    else if (durationMinutes !== undefined && followupType !== TASK_TYPE) endAt = new Date(start.getTime() + durationMinutes * 60_000).toISOString();
    return { allDay: false, startAt: start.toISOString(), endAt };
}

/**
 * The Status of a row: the cell when given, else Planned, or Completed when the Start has already passed (timed: more
 * than 5 minutes ago; all-day: a day before today in the business timezone).
 */
export function activityImportStatus(cell: unknown, schedule: ImportSchedule, now: Date, timeZone: string): string {
    const given = text(cell);
    if (given) return given;
    const past = schedule.allDay
        ? Boolean(schedule.startDay && schedule.startDay < zonedDayOf(now, timeZone))
        : Boolean(schedule.startAt && instantToZonedWallClock(new Date(schedule.startAt), timeZone) < instantToZonedWallClock(new Date(now.getTime() - PAST_GRACE_MS), timeZone));
    return past ? ACTIVITY_IMPORT_DEFAULTS.pastStatus : ACTIVITY_IMPORT_DEFAULTS.status;
}

/** Record-number prefix → the module it numbers (ORG-0042 → organizations), for the modules an activity can link. */
const MODULE_BY_CODE_PREFIX: Readonly<Record<string, ActivityRelatedModule>> = {
    [ENTITY_CODE_PREFIX.lead]: 'leads',
    [ENTITY_CODE_PREFIX.opportunity]: 'opportunities',
    [ENTITY_CODE_PREFIX.contact]: 'contacts',
    [ENTITY_CODE_PREFIX.organization]: 'organizations',
    [ENTITY_CODE_PREFIX.quotation]: 'quotations',
    [ENTITY_CODE_PREFIX.ticket]: 'tickets',
    [ENTITY_CODE_PREFIX.contract]: 'contracts',
};

const TYPE_NAMES = ACTIVITY_RELATED_MODULES.map((module) => ACTIVITY_RELATED_MODULE_LABELS[module]).join(', ');

/**
 * The module a row's Related To names: the Related To Type cell (the picker's label "Opportunity", its plural, or
 * the module key, any case), else the record number's prefix (`OPP-0042`). Null when the row names no record.
 * Throws when the type is unknown, or a record is named without a type that can be told from it.
 */
export function relatedModuleOf(typeCell: unknown, recordCell: unknown): ActivityRelatedModule | null {
    const type = optionKey(text(typeCell));
    const record = text(recordCell);
    if (!type && !record) return null;
    let module: ActivityRelatedModule | undefined;
    if (type) {
        module = ACTIVITY_RELATED_MODULES.find((key) => {
            const label = optionKey(ACTIVITY_RELATED_MODULE_LABELS[key]);
            return type === key || type === label || type === `${label}s` || type === optionKey(key.replace(/-/g, ' '));
        });
        if (!module) fail([{ path: [ACTIVITY_IMPORT_ONLY_KEYS.relatedModule], message: `"${text(typeCell)}" is not a Related To Type. Allowed: ${TYPE_NAMES}.` }]);
    } else {
        const code = detectEntityCode(record);
        module = code ? MODULE_BY_CODE_PREFIX[code.prefix] : undefined;
        if (!module) fail([{ path: [ACTIVITY_IMPORT_ONLY_KEYS.relatedModule], message: `Related To Type is required when Related To names a record (${TYPE_NAMES}).` }]);
    }
    if (!record) fail([{ path: ['relatedTo'], message: 'Related To is required when Related To Type is given: the record number or exact name.' }]);
    return module ?? null;
}
