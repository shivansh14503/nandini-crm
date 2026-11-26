import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { pathToFileURL } from 'node:url';
import { DOCUMENT_DEST, expectedFrontendFiles } from '../../scripts/syncPdfDocument.js';
import { DRAWER_LAYOUT_DEST, expectedDrawerLayoutFiles } from '../../scripts/syncDrawerLayout.js';
import { DISPLAY_FORMATS_DEST, expectedDisplayFormatsFiles } from '../../scripts/syncDisplayFormats.js';
import { FIELD_MAX_LENGTH } from '../config/fieldLimits.js';
import { TALLY_SERIAL_LENGTH, tallySerialIssue } from './tallySerial.js';
import { leadSourceDetailIssues, PARTNER_LEAD_SOURCE, REFERRED_BY_LEAD_SOURCES } from '../modules/shared/leadSource.js';
import {
    ACTIVITY_ONLY_FOLLOWUP_TYPES,
    CRM_MODULES,
    CUSTOM_FIELD_TYPES,
    DEFAULT_CATEGORIES,
    DEFAULT_FIELDS,
    FIELD_TYPES,
    FOLLOWUP_TYPE_CATEGORY_KEY,
    MODULE_TABS,
    sectionKeyFromLabel,
} from '../modules/form-configs/formConfig.defaults.js';
import {
    ACTIVITY_MAX_DURATION_DAYS,
    ACTIVITY_NOT_APPLICABLE,
    ACTIVITY_RELATED_MODULE_LABELS,
    ACTIVITY_RELATED_MODULES,
    ACTIVITY_REMINDERS,
    ACTIVITY_STATUSES,
    END_BEFORE_START_MESSAGE,
    NOTE_TYPE,
    START_REQUIRED_MESSAGE,
    TASK_TYPE,
    TOO_LONG_MESSAGE,
    normalizeSchedule,
} from '../modules/activities/activity.schedule.js';
import { MAX_ATTENDEES, NOTE_REMARKS_MESSAGE, PAST_START_MESSAGE, RELATED_RECORD_MESSAGE, activityPastIssues } from '../modules/activities/activity.validator.js';
import * as zonedTime from '../utils/zonedTime.js';
import { FOLLOW_UP_ACTIVITY_LOCKED, FOLLOW_UP_ORIGIN } from '../modules/activities/activity.access.js';
import {
    BUSY_KINDS,
    BUSY_MAX_RANGE_DAYS,
    BUSY_MAX_USERS,
    BUSY_PERSON_STATUSES,
    BUSY_SUGGEST_DAYS,
    BUSY_SUGGEST_MAX_MINUTES,
    BUSY_SUGGEST_MIN_MINUTES,
    BUSY_WORKING_HOURS,
} from '../modules/calendar-sync/busy.constants.js';
import { ACTIVITY_ONLY_TYPE_MESSAGE, activityOnlyTypeIssues, isActivityOnlyFollowupType } from '../modules/shared/followupTypes.js';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, PASSWORD_RULES, passwordPolicyIssue } from '../modules/auth/passwordPolicy.js';
import { INTEGRATION_PROVIDERS, SECRET_EXPIRY_WARNING_DAYS } from '../modules/integrations/integration.constants.js';
import { PEOPLE_ISSUE_FILTERS, PERSON_CALENDAR_NOTE_MAX } from '../modules/integrations/integration.validator.js';
import { SERVICE_ACCOUNT_KEY_MAX_BYTES } from '../modules/calendar-sync/providers/googleServiceAccount.js';
import { BACKFILL_DAY_CHOICES, EVENT_VISIBILITIES, MAX_COMPANY_DOMAINS } from '../modules/integrations/calendarSyncSettings.js';
import { USER_EMAIL_ISSUES, USER_EMAIL_MAX_LENGTH } from '../modules/users/userEmail.service.js';
import {
    ADMIN_INTEGRATIONS_PAGE,
    CALENDAR_CONNECTIONS_PAGE,
    CALENDAR_PROVIDERS,
    CONNECTION_STATUSES,
    ENROLMENT_SOURCES,
    NOT_SYNCED_REASONS,
    OWN_CALENDAR_STATUSES,
} from '../modules/calendar-sync/connection.constants.js';
import { LINK_INVITES, LINK_STATES, PULL_REQUEST_STATUSES } from '../modules/calendar-sync/sync.constants.js';
import { CALENDAR_NOT_SYNCED, CALENDAR_SYNC_NOT_RETRYABLE } from '../modules/calendar-sync/sync.actions.js';
import { WORKER_STATUSES } from '../modules/calendar-sync/workerHeartbeat.js';
import { NOTIFICATION_KINDS } from '../modules/notifications/notification.producer.js';
import * as bookingConstants from '../modules/booking-links/bookingLink.constants.js';
import { normalizeUsername, RESERVED_USERNAMES, USERNAME_MAX_LENGTH, USERNAME_MIN_LENGTH, USERNAME_PATTERN, usernameIssue } from '../modules/user-admin/username.js';
import {
    ADMIN_ROLES,
    GLOBAL_ACCESS_ROLES,
    hasGlobalAccessRole,
    isAdminAccessRole,
    normalizeRole,
    ROLE_ACCESS_LEVELS,
    ROLE_NAME_MAX_LENGTH,
    roleAccess,
} from '../modules/user-admin/roles.js';
import { ADMIN_USER_STATUSES, DEPARTMENT_MAX_LENGTH, JOB_TITLE_MAX_LENGTH } from '../modules/user-admin/userAdmin.validator.js';
import { DEFAULT_REMINDER_NONE, IN_APP_NOTIFICATION_KINDS, OUT_OF_OFFICE_MAX_DAYS, OUT_OF_OFFICE_MESSAGE_MAX } from '../modules/preferences/preferences.constants.js';
import { isOutOfOfficeOn, outOfOfficeIssues, type OutOfOfficeRange } from '../modules/preferences/preferences.rules.js';

/**
 * Contract between backend-crm and frontend-crm: constants each side keeps its own copy of must agree, or the UI
 * accepts input the API rejects (field limits), renders fields the API doesn't know (field types / modules), or
 * places custom fields in sections the API keys differently (section keys).
 *
 * The frontend modules are loaded at runtime (both are dependency-free) so the backend's `tsc` never compiles
 * frontend files. Skipped, with the reason, only when frontend-crm isn't checked out next to backend-crm.
 */

const FRONTEND_SRC = path.resolve(import.meta.dirname, '../../../frontend-crm/src');
const skip = existsSync(FRONTEND_SRC) ? false : `frontend-crm/src not found at ${FRONTEND_SRC}`;

interface FrontendFieldLimits {
    FIELD_MAX_LENGTH: Record<string, number>;
}

interface FrontendTallySerial {
    TALLY_SERIAL_LENGTH: number;
    tallySerialIssue(value: string | null | undefined, field?: string): string | null;
}

interface FrontendLeadSource {
    REFERRED_BY_LEAD_SOURCES: readonly string[];
    PARTNER_LEAD_SOURCE: string;
    leadSourceDetailIssues(
        values: { leadSource?: string | null; referredBy?: string | null; partnerCompany?: string | null },
        paths?: { referredBy?: string; partnerCompany?: string },
    ): { path: string; message: string }[];
}

interface FrontendFormConfigTypes {
    CRM_MODULE_KEYS: readonly string[];
    CUSTOM_FIELD_TYPES: readonly string[];
    /** Keyed by every `FieldType` (custom types plus lookup / datetime). */
    FIELD_TYPE_LABELS: Record<string, string>;
    sectionKeyFromLabel(label: string): string;
}

interface FrontendActivityTypes {
    ACTIVITY_ONLY_FOLLOWUP_TYPES: readonly string[];
    ACTIVITY_TYPES: readonly string[];
    TASK_TYPE: string;
    NOTE_TYPE: string;
    ACTIVITY_STATUSES: readonly string[];
    ACTIVITY_REMINDERS: readonly string[];
    ACTIVITY_RELATED_MODULES: readonly string[];
    ACTIVITY_MAX_DURATION_DAYS: number;
}

interface FrontendBusyContract {
    BUSY_KINDS: readonly string[];
    BUSY_PERSON_STATUSES: readonly string[];
    BUSY_MAX_USERS: number;
    BUSY_MAX_RANGE_DAYS: number;
    BUSY_SUGGEST_MIN_MINUTES: number;
    BUSY_SUGGEST_MAX_MINUTES: number;
    BUSY_WORKING_HOURS: string;
    BUSY_SUGGEST_DAYS: number;
}

interface FrontendActivityContract {
    CALENDAR_LINK_STATES: readonly string[];
    CALENDAR_LINK_INVITES: readonly string[];
    FOLLOW_UP_ORIGIN: string;
    FOLLOW_UP_ACTIVITY_LOCKED: string;
    CALENDAR_NOT_SYNCED: string;
    CALENDAR_SYNC_NOT_RETRYABLE: string;
    ACTIVITY_MAX_ATTENDEES: number;
    ACTIVITY_NOT_APPLICABLE: Readonly<Record<string, readonly string[]>>;
    ACTIVITY_RELATED_MODULE_LABELS: Readonly<Record<string, string>>;
}

interface FrontendZonedTime {
    instantToZonedWallClock(instant: Date, timeZone: string): string;
    zonedWallClockToInstant(wall: string, timeZone: string): Date;
    zonedStartOfDay(day: string, timeZone: string): Date;
    zonedDayOf(instant: Date, timeZone: string): string;
    addDays(day: string, days: number): string;
    daysBetween(first: string, last: string): number;
}

interface FrontendScheduleValues {
    followupType: string;
    status?: string;
    allDay: boolean;
    startAt: string;
    endAt: string;
}

interface FrontendActivitySchedule {
    START_REQUIRED_MESSAGE: string;
    END_BEFORE_START_MESSAGE: string;
    TOO_LONG_MESSAGE: string;
    RELATED_RECORD_MESSAGE: string;
    NOTE_REMARKS_MESSAGE: string;
    PAST_START_MESSAGE: string;
    activityScheduleIssues(values: FrontendScheduleValues, timeZone: string): { path: string; message: string }[];
    activityPastIssues(
        values: FrontendScheduleValues,
        initial: Pick<FrontendScheduleValues, 'allDay' | 'startAt'> | undefined,
        now: Date,
        timeZone: string,
    ): { path: string; message: string }[];
    toApiSchedule(values: FrontendScheduleValues, timeZone: string): { allDay: boolean; startAt: string; endAt: string; startDay: string; endDay: string };
}

interface FrontendFollowupTypes {
    ACTIVITY_ONLY_TYPE_MESSAGE: string;
    isActivityOnlyFollowupType(value: string | null | undefined): boolean;
    activityOnlyTypeIssues(value: string | null | undefined, previous?: string | null, path?: string): { path: string; message: string }[];
}

interface FrontendPasswordPolicy {
    PASSWORD_MIN_LENGTH: number;
    PASSWORD_MAX_LENGTH: number;
    PASSWORD_RULES: readonly { key: string; label: string; message: string; test(password: string, ctx: { username: string; currentPassword?: string }): boolean }[];
    passwordPolicyIssue(newPassword: string, ctx: { username: string; currentPassword?: string }): string | null;
}

interface FrontendIntegrationTypes {
    INTEGRATION_PROVIDERS: readonly string[];
    BACKFILL_DAY_CHOICES: readonly number[];
    EVENT_VISIBILITIES: readonly string[];
    USER_EMAIL_ISSUES: readonly string[];
    PEOPLE_ISSUE_FILTERS: readonly string[];
    CONNECTION_STATUSES: readonly string[];
    ENROLMENT_SOURCES: readonly string[];
    SERVICE_ACCOUNT_KEY_MAX_BYTES: number;
    PERSON_CALENDAR_NOTE_MAX: number;
    SECRET_EXPIRY_WARNING_DAYS: number;
    MAX_COMPANY_DOMAINS: number;
    USER_EMAIL_MAX_LENGTH: number;
    WORKER_STATUSES: readonly string[];
}

interface FrontendCalendarConnectionTypes {
    CALENDAR_PROVIDERS: readonly string[];
    OWN_CALENDAR_STATUSES: readonly string[];
    NOT_SYNCED_REASONS: readonly string[];
    NOT_SYNCED_REASON_MESSAGES: Record<string, string>;
    PULL_REQUEST_STATUSES: readonly string[];
}

interface FrontendSafeNextPath {
    safeNextPath(value: string | null | undefined, fallback: string): string;
}

interface FrontendUsername {
    USERNAME_MIN_LENGTH: number;
    USERNAME_MAX_LENGTH: number;
    USERNAME_PATTERN: RegExp;
    RESERVED_USERNAMES: readonly string[];
    normalizeUsername(value: string): string;
    usernameIssue(value: string): string | null;
}

interface FrontendRoleAccess {
    ROLE_ACCESS_LEVELS: readonly string[];
    ADMIN_ROLES: readonly string[];
    GLOBAL_ACCESS_ROLES: readonly string[];
    ROLE_NAME_MAX_LENGTH: number;
    normalizeRole(role: string): string;
    isAdminAccessRole(role: string | null | undefined): boolean;
    hasGlobalAccessRole(role: string | null | undefined): boolean;
    roleAccess(role: string): string;
}

interface FrontendUserAdminTypes {
    USER_STATUS_FILTERS: readonly string[];
    JOB_TITLE_MAX_LENGTH: number;
    DEPARTMENT_MAX_LENGTH: number;
}

interface FrontendNotificationPreferences {
    IN_APP_NOTIFICATION_KINDS: readonly string[];
    DEFAULT_REMINDER_NONE: string;
    OUT_OF_OFFICE_MAX_DAYS: number;
    OUT_OF_OFFICE_MESSAGE_MAX: number;
    isOutOfOfficeOn(range: OutOfOfficeRange | null | undefined, day: string): boolean;
    outOfOfficeIssues(next: OutOfOfficeRange, today: string, previous?: OutOfOfficeRange | null): { path: string; message: string }[];
}

type BookingConstants = typeof import('../modules/booking-links/bookingLink.constants.js');

async function loadFrontend<T>(relativePath: string): Promise<T> {
    return (await import(pathToFileURL(path.join(FRONTEND_SRC, relativePath)).href)) as T;
}

describe('backend ↔ frontend contract', { skip }, () => {
    it('frontend lib/pdf-document is an exact copy of the PDF document model (run npm run sync:pdf-document)', () => {
        const expected = expectedFrontendFiles();
        assert.deepEqual(readdirSync(DOCUMENT_DEST).sort(), Object.keys(expected).sort());
        for (const [name, content] of Object.entries(expected)) {
            assert.equal(readFileSync(path.join(DOCUMENT_DEST, name), 'utf8'), content, `${name} is out of date`);
        }
    });

    it('frontend lib/drawer-layout is an exact copy of the drawer layout model (run npm run sync:drawer-layout)', () => {
        const expected = expectedDrawerLayoutFiles();
        assert.deepEqual(readdirSync(DRAWER_LAYOUT_DEST).sort(), Object.keys(expected).sort());
        for (const [name, content] of Object.entries(expected)) {
            assert.equal(readFileSync(path.join(DRAWER_LAYOUT_DEST, name), 'utf8'), content, `${name} is out of date`);
        }
    });

    it('frontend lib/display-formats is an exact copy of the company display formats core (run npm run sync:display-formats)', () => {
        const expected = expectedDisplayFormatsFiles();
        assert.deepEqual(readdirSync(DISPLAY_FORMATS_DEST).sort(), Object.keys(expected).sort());
        for (const [name, content] of Object.entries(expected)) {
            assert.equal(readFileSync(path.join(DISPLAY_FORMATS_DEST, name), 'utf8'), content, `${name} is out of date`);
        }
    });

    it('fieldLimits.ts has identical keys and values', async () => {
        const frontend = await loadFrontend<FrontendFieldLimits>('config/fieldLimits.ts');
        const sorted = (limits: Record<string, number>) => Object.fromEntries(Object.entries(limits).sort(([a], [b]) => a.localeCompare(b)));
        assert.deepEqual(sorted(frontend.FIELD_MAX_LENGTH), sorted(FIELD_MAX_LENGTH));
    });

    it('Tally Serial No rule and messages match', async () => {
        const frontend = await loadFrontend<FrontendTallySerial>('utils/tallySerial.ts');
        assert.equal(frontend.TALLY_SERIAL_LENGTH, TALLY_SERIAL_LENGTH);
        assert.equal(FIELD_MAX_LENGTH.tallySerialNo, TALLY_SERIAL_LENGTH);
        const samples = ['', '   ', '712345678', ' 712345678 ', '612345678', '71234567', '7123456789', '71234A678', '7-1234567', null, undefined];
        for (const value of samples) {
            assert.equal(frontend.tallySerialIssue(value), tallySerialIssue(value), `value: ${JSON.stringify(value)}`);
        }
    });

    it('Lead Source follow-up rules (Referred By / Partner Company) and messages match', async () => {
        const frontend = await loadFrontend<FrontendLeadSource>('utils/leadSource.ts');
        assert.deepEqual([...frontend.REFERRED_BY_LEAD_SOURCES], [...REFERRED_BY_LEAD_SOURCES]);
        assert.equal(frontend.PARTNER_LEAD_SOURCE, PARTNER_LEAD_SOURCE);
        const sources = ['', 'CA', ' reference ', 'Partner', 'partner', 'Client Referral', 'Website Enquiry', null, undefined];
        for (const leadSource of sources) {
            for (const referredBy of ['', 'Anita Desai', undefined]) {
                for (const partnerCompany of ['', 'ACME PARTNERS', undefined]) {
                    const values = { leadSource, referredBy, partnerCompany };
                    const expected = leadSourceDetailIssues(values).map((i) => ({ path: String(i.path[0]), message: i.message }));
                    assert.deepEqual(frontend.leadSourceDetailIssues(values), expected, JSON.stringify(values));
                }
            }
        }
    });

        it('CRM modules match, in the same (navbar) order', async () => {
        const frontend = await loadFrontend<FrontendFormConfigTypes>('types/formConfig.types.ts');
        assert.deepEqual([...frontend.CRM_MODULE_KEYS], [...CRM_MODULES]);
    });

    it('field types match', async () => {
        const frontend = await loadFrontend<FrontendFormConfigTypes>('types/formConfig.types.ts');
        assert.deepEqual([...frontend.CUSTOM_FIELD_TYPES], [...CUSTOM_FIELD_TYPES]);
        // FIELD_TYPE_LABELS is a Record<FieldType, …>, so its keys are exactly the frontend's FieldType union.
        assert.deepEqual(Object.keys(frontend.FIELD_TYPE_LABELS).sort(), [...FIELD_TYPES].sort());
    });

    it('sectionKeyFromLabel produces the same keys', async () => {
        const frontend = await loadFrontend<FrontendFormConfigTypes>('types/formConfig.types.ts');
        const labels = [
            ...new Set([
                ...DEFAULT_FIELDS.map((f) => f.sectionLabel),
                ...Object.values(MODULE_TABS).flatMap((tabs) => tabs.map((t) => t.label)),
                'PIPELINE & FOLLOW-UP',
                '  Address   Information  ',
                'Compliance/Legal (India)',
                '__Leading_and_trailing__',
                'Ünïcødé — Section',
                '123 Starts With Digits',
                '',
                '!!!',
                'x'.repeat(120),
            ]),
        ];
        for (const label of labels) {
            assert.equal(frontend.sectionKeyFromLabel(label), sectionKeyFromLabel(label), `label: ${JSON.stringify(label)}`);
        }
    });

    it('frontend types/activity.types.ts matches the activity constants', async () => {
        const frontend = await loadFrontend<FrontendActivityTypes>('types/activity.types.ts');
        assert.deepEqual([...frontend.ACTIVITY_ONLY_FOLLOWUP_TYPES], [...ACTIVITY_ONLY_FOLLOWUP_TYPES]);
        assert.equal(frontend.TASK_TYPE, TASK_TYPE);
        assert.equal(frontend.NOTE_TYPE, NOTE_TYPE);
        assert.deepEqual([...frontend.ACTIVITY_STATUSES], [...ACTIVITY_STATUSES]);
        assert.deepEqual([...frontend.ACTIVITY_REMINDERS], [...ACTIVITY_REMINDERS]);
        assert.deepEqual([...frontend.ACTIVITY_RELATED_MODULES], [...ACTIVITY_RELATED_MODULES]);
        assert.equal(frontend.ACTIVITY_MAX_DURATION_DAYS, ACTIVITY_MAX_DURATION_DAYS);
        // The activity form's fallback Followup Type list is the seeded shared_followup_type list.
        const seeded = DEFAULT_CATEGORIES.find((category) => category.key === FOLLOWUP_TYPE_CATEGORY_KEY);
        assert.ok(seeded, `${FOLLOWUP_TYPE_CATEGORY_KEY} is seeded`);
        assert.deepEqual([...frontend.ACTIVITY_TYPES].sort(), seeded.options.map((option) => (typeof option === 'string' ? option : option.value)).sort());
        // Fields each type hides (the form's relaxedFields, the API's notApplicableKeys) and the "Related To" labels.
        const contract = frontend as unknown as FrontendActivityContract;
        assert.deepEqual(contract.ACTIVITY_NOT_APPLICABLE, ACTIVITY_NOT_APPLICABLE);
        assert.equal(contract.ACTIVITY_MAX_ATTENDEES, MAX_ATTENDEES);
        assert.deepEqual(contract.ACTIVITY_RELATED_MODULE_LABELS, ACTIVITY_RELATED_MODULE_LABELS);
        // Follow-up activities (P2-4): their origin and the 409 code of a locked-field write.
        assert.equal(contract.FOLLOW_UP_ORIGIN, FOLLOW_UP_ORIGIN);
        assert.equal(contract.FOLLOW_UP_ACTIVITY_LOCKED, FOLLOW_UP_ACTIVITY_LOCKED);
        // Calendar sync (P2-3b): ActivityView.calendar's state / invites vocabulary.
        assert.deepEqual([...contract.CALENDAR_LINK_STATES], [...LINK_STATES]);
        assert.deepEqual([...contract.CALENDAR_LINK_INVITES], [...LINK_INVITES]);
        // The drawer's calendar actions (P2-3c): their 409 codes.
        assert.equal(contract.CALENDAR_NOT_SYNCED, CALENDAR_NOT_SYNCED);
        assert.equal(contract.CALENDAR_SYNC_NOT_RETRYABLE, CALENDAR_SYNC_NOT_RETRYABLE);
        // Busy times (P2-6): kinds, person statuses and the request limits the form's strip works within.
        const busy = frontend as unknown as FrontendBusyContract;
        assert.deepEqual([...busy.BUSY_KINDS], [...BUSY_KINDS]);
        assert.deepEqual([...busy.BUSY_PERSON_STATUSES], [...BUSY_PERSON_STATUSES]);
        assert.equal(busy.BUSY_MAX_USERS, BUSY_MAX_USERS);
        assert.equal(busy.BUSY_MAX_RANGE_DAYS, BUSY_MAX_RANGE_DAYS);
        assert.equal(busy.BUSY_SUGGEST_MIN_MINUTES, BUSY_SUGGEST_MIN_MINUTES);
        assert.equal(busy.BUSY_SUGGEST_MAX_MINUTES, BUSY_SUGGEST_MAX_MINUTES);
        assert.equal(busy.BUSY_WORKING_HOURS, BUSY_WORKING_HOURS);
        assert.equal(busy.BUSY_SUGGEST_DAYS, BUSY_SUGGEST_DAYS);
    });

    it('frontend utils/zonedTime.ts converts times exactly as the backend', async () => {
        const frontend = await loadFrontend<FrontendZonedTime>('utils/zonedTime.ts');
        // The business timezone, a DST zone (gap and overlap days), a half-hour DST zone and UTC.
        const zones = ['Asia/Kolkata', 'America/New_York', 'Europe/London', 'Australia/Lord_Howe', 'UTC'];
        const instants = ['2026-11-25T05:00:00.000Z', '2026-03-08T07:30:00.000Z', '2026-11-01T05:30:00.000Z', '2026-10-25T00:59:00.000Z', '2026-12-31T23:59:00.000Z'];
        const walls = ['2026-11-25T10:30', '2026-03-08T02:30', '2026-11-01T01:30', '2026-03-29T01:15', '2026-04-05T01:45', '2026-01-01T00:00'];
        const days = ['2026-11-25', '2026-03-08', '2026-11-01', '2026-02-28', '2028-02-29'];
        for (const zone of zones) {
            for (const iso of instants) {
                const instant = new Date(iso);
                assert.equal(frontend.instantToZonedWallClock(instant, zone), zonedTime.instantToZonedWallClock(instant, zone), `${iso} in ${zone}`);
                assert.equal(frontend.zonedDayOf(instant, zone), zonedTime.zonedDayOf(instant, zone), `${iso} in ${zone}`);
            }
            for (const wall of walls) {
                assert.equal(frontend.zonedWallClockToInstant(wall, zone).toISOString(), zonedTime.zonedWallClockToInstant(wall, zone).toISOString(), `${wall} in ${zone}`);
            }
            for (const day of days) {
                assert.equal(frontend.zonedStartOfDay(day, zone).toISOString(), zonedTime.zonedStartOfDay(day, zone).toISOString(), `${day} in ${zone}`);
            }
        }
        for (const day of days) {
            for (const n of [-400, -1, 0, 1, 31, 366]) assert.equal(frontend.addDays(day, n), zonedTime.addDays(day, n), `${day} + ${n}`);
            assert.equal(frontend.daysBetween(day, '2026-11-25'), zonedTime.daysBetween(day, '2026-11-25'), day);
        }
    });

    it('frontend utils/activitySchedule.ts applies the API schedule rules with the same messages', async () => {
        const frontend = await loadFrontend<FrontendActivitySchedule>('utils/activitySchedule.ts');
        assert.equal(frontend.START_REQUIRED_MESSAGE, START_REQUIRED_MESSAGE);
        assert.equal(frontend.END_BEFORE_START_MESSAGE, END_BEFORE_START_MESSAGE);
        assert.equal(frontend.TOO_LONG_MESSAGE, TOO_LONG_MESSAGE);
        assert.equal(frontend.RELATED_RECORD_MESSAGE, RELATED_RECORD_MESSAGE);
        assert.equal(frontend.NOTE_REMARKS_MESSAGE, NOTE_REMARKS_MESSAGE);
        assert.equal(frontend.PAST_START_MESSAGE, PAST_START_MESSAGE);

        const tz = 'Asia/Kolkata';
        // The form's values → the API input (toApiSchedule) → the API's issues must equal the form's own issues.
        const cases: FrontendScheduleValues[] = [
            { followupType: 'Meeting', allDay: false, startAt: '2026-11-25T10:30', endAt: '2026-11-25T11:30' },
            { followupType: 'Meeting', allDay: false, startAt: '2026-11-25T10:30', endAt: '2026-11-25T09:30' },
            { followupType: 'Meeting', allDay: false, startAt: '2026-11-25T10:30', endAt: '2026-12-26T10:31' },
            { followupType: 'Meeting', allDay: false, startAt: '2026-11-25T10:30', endAt: '2026-12-26T10:30' },
            { followupType: 'Call', allDay: false, startAt: '2026-11-25T10:30', endAt: '' },
            { followupType: 'Meeting', allDay: true, startAt: '2026-11-25', endAt: '2026-11-26' },
            { followupType: 'Meeting', allDay: true, startAt: '2026-11-25', endAt: '2026-11-24' },
            { followupType: 'Meeting', allDay: true, startAt: '2026-11-01', endAt: '2026-12-01' },
            { followupType: 'Meeting', allDay: true, startAt: '2026-11-01', endAt: '2026-12-02' },
            { followupType: 'Task', allDay: false, startAt: '2026-11-25T10:30', endAt: '2026-11-25T09:00' },
            { followupType: 'Task', allDay: true, startAt: '2026-11-25', endAt: '' },
            { followupType: 'Note', allDay: false, startAt: '', endAt: '' },
        ];
        for (const values of cases) {
            const input = frontend.toApiSchedule(values, tz);
            const api = normalizeSchedule(
                {
                    followupType: values.followupType,
                    allDay: input.allDay,
                    startAt: input.startAt || undefined,
                    endAt: input.endAt || undefined,
                    startDay: input.startDay || undefined,
                    endDay: input.endDay || undefined,
                },
                tz,
                30,
            ).issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
            assert.deepEqual(frontend.activityScheduleIssues(values, tz), api, JSON.stringify(values));
        }

        // Past starts: Planned only, today is fine all day, 5 minutes' grace, an unchanged start passes.
        const now = new Date('2026-11-25T05:00:00.000Z'); // 10:30 IST
        const pastCases: { values: FrontendScheduleValues; initial?: Pick<FrontendScheduleValues, 'allDay' | 'startAt'> }[] = [
            { values: { followupType: 'Call', status: 'Planned', allDay: false, startAt: '2026-11-25T10:26', endAt: '' } },
            { values: { followupType: 'Call', status: 'Planned', allDay: false, startAt: '2026-11-25T10:24', endAt: '' } },
            { values: { followupType: 'Call', status: 'Completed', allDay: false, startAt: '2026-11-20T10:00', endAt: '' } },
            { values: { followupType: 'Meeting', status: 'Planned', allDay: true, startAt: '2026-11-25', endAt: '' } },
            { values: { followupType: 'Meeting', status: 'Planned', allDay: true, startAt: '2026-11-24', endAt: '' } },
            { values: { followupType: 'Call', status: 'Planned', allDay: false, startAt: '2026-11-20T10:00', endAt: '' }, initial: { allDay: false, startAt: '2026-11-20T10:00' } },
            { values: { followupType: 'Meeting', status: 'Planned', allDay: true, startAt: '2026-11-20', endAt: '' }, initial: { allDay: true, startAt: '2026-11-20' } },
        ];
        for (const { values, initial } of pastCases) {
            const input = frontend.toApiSchedule(values, tz);
            const startAt = values.allDay ? zonedTime.zonedStartOfDay(input.startDay, tz) : new Date(input.startAt);
            const before = initial
                ? initial.allDay
                    ? { allDay: true, startAt: zonedTime.zonedStartOfDay(initial.startAt, tz).toISOString(), startDay: initial.startAt }
                    : { allDay: false, startAt: zonedTime.zonedWallClockToInstant(initial.startAt, tz).toISOString(), startDay: '' }
                : undefined;
            const api = activityPastIssues({ followupType: values.followupType, status: values.status ?? 'Planned', allDay: values.allDay, startAt }, before, now, tz).map(
                (issue) => ({ path: issue.path.join('.'), message: issue.message }),
            );
            assert.deepEqual(frontend.activityPastIssues(values, initial, now, tz), api, JSON.stringify(values));
        }
    });

    it('frontend utils/followupTypes.ts applies the same Task / Note rule', async () => {
        const frontend = await loadFrontend<FrontendFollowupTypes>('utils/followupTypes.ts');
        assert.equal(frontend.ACTIVITY_ONLY_TYPE_MESSAGE, ACTIVITY_ONLY_TYPE_MESSAGE);
        const cases: [string | null | undefined, string | null | undefined][] = [
            ['Task', undefined],
            [' note ', undefined],
            ['Task', 'Task'],
            ['task', 'Task'],
            ['Note', 'Call'],
            ['Call', undefined],
            ['', undefined],
            [null, 'Note'],
        ];
        for (const [value, previous] of cases) {
            assert.equal(frontend.isActivityOnlyFollowupType(value), isActivityOnlyFollowupType(value), JSON.stringify(value));
            const expected = activityOnlyTypeIssues(value, previous).map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
            assert.deepEqual(frontend.activityOnlyTypeIssues(value, previous), expected, JSON.stringify([value, previous]));
        }
    });

    it('frontend utils/passwordPolicy.ts applies the same password rules with the same messages', async () => {
        const frontend = await loadFrontend<FrontendPasswordPolicy>('utils/passwordPolicy.ts');
        assert.equal(frontend.PASSWORD_MIN_LENGTH, PASSWORD_MIN_LENGTH);
        assert.equal(frontend.PASSWORD_MAX_LENGTH, PASSWORD_MAX_LENGTH);
        const describeRules = (rules: readonly { key: string; label: string; message: string }[]) =>
            rules.map(({ key, label, message }) => ({ key, label, message }));
        assert.deepEqual(describeRules(frontend.PASSWORD_RULES), describeRules(PASSWORD_RULES));

        const contexts = [
            { username: 'palak' },
            { username: 'Palak2026', currentPassword: 'OldPass123' },
            { username: ' rahul ', currentPassword: '' },
            { username: '' },
        ];
        const passwords = ['', 'abc', 'abcdefgh', '12345678', 'abcd1234', 'Palak2026', 'palak2026', 'PALAK2026', 'OldPass123', 'oldpass123', 'पासवर्ड1234', ' rahul ', 'rahul', 'a1'.repeat(64), 'a1'.repeat(65), '!!!!!!!!1'];
        for (const ctx of contexts) {
            for (const password of passwords) {
                const label = JSON.stringify({ password, ctx });
                assert.equal(frontend.passwordPolicyIssue(password, ctx), passwordPolicyIssue(password, ctx), label);
                assert.deepEqual(
                    frontend.PASSWORD_RULES.map((rule) => rule.test(password, ctx)),
                    PASSWORD_RULES.map((rule) => rule.test(password, ctx)),
                    label,
                );
            }
        }
    });

    it('frontend types/integration.types.ts matches the integrations constants', async () => {
        const frontend = await loadFrontend<FrontendIntegrationTypes>('types/integration.types.ts');
        assert.deepEqual([...frontend.INTEGRATION_PROVIDERS], [...INTEGRATION_PROVIDERS]);
        assert.deepEqual([...frontend.BACKFILL_DAY_CHOICES], [...BACKFILL_DAY_CHOICES]);
        assert.deepEqual([...frontend.EVENT_VISIBILITIES], [...EVENT_VISIBILITIES]);
        assert.deepEqual([...frontend.USER_EMAIL_ISSUES], [...USER_EMAIL_ISSUES]);
        assert.deepEqual([...frontend.PEOPLE_ISSUE_FILTERS], [...PEOPLE_ISSUE_FILTERS]);
        assert.deepEqual([...frontend.CONNECTION_STATUSES], [...CONNECTION_STATUSES]);
        assert.deepEqual([...frontend.ENROLMENT_SOURCES], [...ENROLMENT_SOURCES]);
        assert.equal(frontend.SERVICE_ACCOUNT_KEY_MAX_BYTES, SERVICE_ACCOUNT_KEY_MAX_BYTES);
        assert.equal(frontend.PERSON_CALENDAR_NOTE_MAX, PERSON_CALENDAR_NOTE_MAX);
        assert.equal(frontend.SECRET_EXPIRY_WARNING_DAYS, SECRET_EXPIRY_WARNING_DAYS);
        assert.equal(frontend.MAX_COMPANY_DOMAINS, MAX_COMPANY_DOMAINS);
        assert.equal(frontend.USER_EMAIL_MAX_LENGTH, USER_EMAIL_MAX_LENGTH);
        assert.deepEqual([...frontend.WORKER_STATUSES], [...WORKER_STATUSES]);
    });

    it('frontend components/integrations/calendarConnections.types.ts matches the calendar connection constants', async () => {
        const frontend = await loadFrontend<FrontendCalendarConnectionTypes>('components/integrations/calendarConnections.types.ts');
        assert.deepEqual([...frontend.CALENDAR_PROVIDERS], [...CALENDAR_PROVIDERS]);
        assert.deepEqual([...frontend.OWN_CALENDAR_STATUSES], [...OWN_CALENDAR_STATUSES]);
        assert.deepEqual([...frontend.NOT_SYNCED_REASONS], [...NOT_SYNCED_REASONS]);
        assert.deepEqual(Object.keys(frontend.NOT_SYNCED_REASON_MESSAGES).sort(), [...NOT_SYNCED_REASONS].sort(), 'every reason has a sentence');
        assert.deepEqual([...frontend.PULL_REQUEST_STATUSES], [...PULL_REQUEST_STATUSES]);
    });

    it('frontend notification kinds, the Connected accounts route and the admin page match', async () => {
        const frontend = await loadFrontend<{ NOTIFICATION_KINDS: readonly string[] }>('types/notification.types.ts');
        assert.deepEqual([...frontend.NOTIFICATION_KINDS], [...NOTIFICATION_KINDS]);
        const constants = readFileSync(path.join(FRONTEND_SRC, 'config/constants.ts'), 'utf8');
        assert.ok(constants.includes(`PROFILE_CONNECTED_ACCOUNTS: '${CALENDAR_CONNECTIONS_PAGE}'`), 'ROUTES.PROFILE_CONNECTED_ACCOUNTS');
        const target = new URL(CALENDAR_CONNECTIONS_PAGE, 'http://crm.invalid');
        assert.ok(existsSync(path.join(FRONTEND_SRC, `app${target.pathname}/page.tsx`)), 'the Connected accounts page exists');
        const tab = target.searchParams.get('tab');
        assert.ok(tab, 'Connected accounts is a My Profile tab');
        const profileView = readFileSync(path.join(FRONTEND_SRC, 'components/profile/ProfileView.tsx'), 'utf8');
        assert.ok(profileView.includes(`key: '${tab}'`), `My Profile has a '${tab}' tab`);
        // Old bookmarks still land somewhere.
        assert.ok(existsSync(path.join(FRONTEND_SRC, 'app/connected-calendars/page.tsx')), 'the old /connected-calendars redirect exists');
        // calendar_sync_issue opens Admin › API Integrations (notificationHref).
        assert.ok(constants.includes(`API_INTEGRATIONS: '${ADMIN_INTEGRATIONS_PAGE}'`), 'ROUTES.API_INTEGRATIONS');
        assert.ok(existsSync(path.join(FRONTEND_SRC, `app${ADMIN_INTEGRATIONS_PAGE}/page.tsx`)), 'the admin integrations page exists');
    });

    it('the login page follows ?next= back to CRM paths only', async () => {
        const { safeNextPath } = await loadFrontend<FrontendSafeNextPath>('utils/safeNextPath.ts');
        assert.equal(safeNextPath(CALENDAR_CONNECTIONS_PAGE, '/dashboard'), CALENDAR_CONNECTIONS_PAGE);
        for (const bad of ['//evil.example', '/\\evil.example', 'https://evil.example', 'javascript:alert(1)', '/login', '', null, '/a\nb', '/.//evil.example', '/%2e//evil.example', '/a/..//evil.example', '/./\\evil.example']) {
            assert.equal(safeNextPath(bad, '/d'), '/d', String(bad));
        }
    });

    it('frontend utils/username.ts applies the same username rules with the same messages', async () => {
        const frontend = await loadFrontend<FrontendUsername>('utils/username.ts');
        assert.equal(frontend.USERNAME_MIN_LENGTH, USERNAME_MIN_LENGTH);
        assert.equal(frontend.USERNAME_MAX_LENGTH, USERNAME_MAX_LENGTH);
        assert.equal(frontend.USERNAME_PATTERN.source, USERNAME_PATTERN.source);
        assert.equal(frontend.USERNAME_PATTERN.flags, USERNAME_PATTERN.flags);
        assert.deepEqual([...frontend.RESERVED_USERNAMES], [...RESERVED_USERNAMES]);
        const values = ['', '  ', 'ab', 'abc', ' Palak.Sharma ', 'r.k-sharma_2', '.rahul', '-x1', 'a b', 'राहुल', 'rahul@x', 'a'.repeat(50), 'a'.repeat(51), 'ABC', 'system', ' System ', 'systems'];
        for (const value of values) {
            assert.equal(frontend.normalizeUsername(value), normalizeUsername(value), JSON.stringify(value));
            assert.equal(frontend.usernameIssue(value), usernameIssue(value), JSON.stringify(value));
        }
    });

    it('frontend utils/roleAccess.ts classifies roles exactly as the API enforces them', async () => {
        const frontend = await loadFrontend<FrontendRoleAccess>('utils/roleAccess.ts');
        assert.deepEqual([...frontend.ROLE_ACCESS_LEVELS], [...ROLE_ACCESS_LEVELS]);
        assert.deepEqual([...frontend.ADMIN_ROLES], [...ADMIN_ROLES]);
        assert.deepEqual([...frontend.GLOBAL_ACCESS_ROLES], [...GLOBAL_ACCESS_ROLES]);
        assert.equal(frontend.ROLE_NAME_MAX_LENGTH, ROLE_NAME_MAX_LENGTH);
        const roles = [
            ...ADMIN_ROLES,
            ...GLOBAL_ACCESS_ROLES,
            'admin',
            'SUPER ADMIN',
            'Super  Admin',
            ' Admin',
            'Director - Operations',
            'director — operations',
            'Director − Operations',
            'Sales Executive',
            'Field Engineer',
            '',
        ];
        for (const role of roles) {
            assert.equal(frontend.normalizeRole(role), normalizeRole(role), role);
            assert.equal(frontend.isAdminAccessRole(role), isAdminAccessRole(role), role);
            assert.equal(frontend.hasGlobalAccessRole(role), hasGlobalAccessRole(role), role);
            assert.equal(frontend.roleAccess(role), roleAccess(role), role);
        }
    });

    it('frontend utils/notificationPreferences.ts matches the preference constants and out-of-office rules', async () => {
        const frontend = await loadFrontend<FrontendNotificationPreferences>('utils/notificationPreferences.ts');
        assert.deepEqual([...frontend.IN_APP_NOTIFICATION_KINDS], [...IN_APP_NOTIFICATION_KINDS]);
        assert.ok(IN_APP_NOTIFICATION_KINDS.every((kind) => (NOTIFICATION_KINDS as readonly string[]).includes(kind)), 'every configurable kind is a bell kind');
        assert.equal(frontend.DEFAULT_REMINDER_NONE, DEFAULT_REMINDER_NONE);
        assert.equal(frontend.OUT_OF_OFFICE_MAX_DAYS, OUT_OF_OFFICE_MAX_DAYS);
        assert.equal(frontend.OUT_OF_OFFICE_MESSAGE_MAX, OUT_OF_OFFICE_MESSAGE_MAX);

        const today = '2026-11-26';
        const cases: [OutOfOfficeRange, (OutOfOfficeRange | null)?][] = [
            [{ from: today, to: today }],
            [{ from: '2026-12-01', to: '2027-11-30' }], // 365 days
            [{ from: '2026-12-01', to: '2027-12-01' }], // 366 days
            [{ from: '2026-12-05', to: '2026-12-01' }],
            [{ from: '2026-11-20', to: '2026-11-25' }], // past end, new
            [{ from: '2026-11-20', to: '2026-11-25' }, { from: '2026-11-20', to: '2026-11-25' }], // past end, unchanged
            [{ from: '2026-11-20', to: '2026-11-25' }, { from: '2026-11-20', to: '2026-11-24' }], // past end, changed
            [{ from: '2026-11-20', to: today }], // start in the past, end today
            [{ from: '2027-11-26', to: '2027-11-27' }], // start exactly a year ahead
            [{ from: '2027-11-27', to: '2027-11-28' }], // start beyond a year
            [{ from: '2028-01-10', to: '2026-11-20' }],
            [{ from: '2026-02-30', to: '2026-03-01' }],
            [{ from: '', to: '' }],
        ];
        for (const [next, previous] of cases) {
            assert.deepEqual(frontend.outOfOfficeIssues(next, today, previous), outOfOfficeIssues(next, today, previous), JSON.stringify({ next, previous }));
        }
        const range = { from: '2026-12-01', to: '2026-12-05' };
        for (const day of ['2026-11-30', '2026-12-01', '2026-12-05', '2026-12-06']) {
            assert.equal(frontend.isOutOfOfficeOn(range, day), isOutOfOfficeOn(range, day), day);
        }
        assert.equal(frontend.isOutOfOfficeOn(null, today), false);
    });

    it('frontend types/userAdmin.types.ts matches the Admin › Users limits and status filter', async () => {
        const frontend = await loadFrontend<FrontendUserAdminTypes>('types/userAdmin.types.ts');
        assert.deepEqual([...frontend.USER_STATUS_FILTERS], [...ADMIN_USER_STATUSES]);
        assert.equal(frontend.JOB_TITLE_MAX_LENGTH, JOB_TITLE_MAX_LENGTH);
        assert.equal(frontend.DEPARTMENT_MAX_LENGTH, DEPARTMENT_MAX_LENGTH);
    });
    it('frontend types/bookingLink.types.ts matches the booking-link constants', async () => {
        const frontend = await loadFrontend<BookingConstants & { BOOKING_CREATOR_SCOPE_LABELS: Record<string, string>; BOOKING_WEEKDAY_LABELS: Record<string, string> }>(
            'types/bookingLink.types.ts',
        );
        assert.deepEqual([...frontend.BOOKING_CREATOR_SCOPES], [...bookingConstants.BOOKING_CREATOR_SCOPES]);
        assert.deepEqual(Object.keys(frontend.BOOKING_CREATOR_SCOPE_LABELS).sort(), [...bookingConstants.BOOKING_CREATOR_SCOPES].sort());
        assert.deepEqual([...frontend.BOOKING_WEEKDAYS], [...bookingConstants.BOOKING_WEEKDAYS]);
        assert.deepEqual(Object.keys(frontend.BOOKING_WEEKDAY_LABELS), [...bookingConstants.BOOKING_WEEKDAYS]);
        assert.deepEqual([...frontend.BOOKING_SLOT_STEPS], [...bookingConstants.BOOKING_SLOT_STEPS]);
        assert.deepEqual(frontend.BOOKING_ERROR_CODES, bookingConstants.BOOKING_ERROR_CODES);
        for (const key of [
            'BOOKING_DURATION_MIN_MINUTES',
            'BOOKING_DURATION_MAX_MINUTES',
            'BOOKING_MAX_DURATIONS',
            'BOOKING_MAX_WINDOWS_PER_DAY',
            'BOOKING_MAX_BUFFER_MINUTES',
            'BOOKING_MAX_NOTICE_MINUTES',
            'BOOKING_MAX_HORIZON_DAYS',
            'BOOKING_MAX_PER_DAY',
            'BOOKING_MAX_LINKS_PER_OWNER',
            'BOOKING_TITLE_MAX',
            'BOOKING_LOCATION_MAX',
            'BOOKING_NOTE_MAX',
            'BOOKING_VISITOR_NAME_MAX',
            'BOOKING_VISITOR_COMPANY_MAX',
            'BOOKING_VISITOR_MESSAGE_MAX',
        ] as const) {
            assert.equal(frontend[key], bookingConstants[key], key);
        }
        const constants = readFileSync(path.join(FRONTEND_SRC, 'config/constants.ts'), 'utf8');
        assert.ok(constants.includes("BOOK: (slug: string) => `/book/${encodeURIComponent(slug)}`"), 'ROUTES.BOOK is the DTO path /book/<slug>');
        assert.ok(existsSync(path.join(FRONTEND_SRC, 'app/book/[slug]/page.tsx')), 'the public booking page exists');
    });
});
