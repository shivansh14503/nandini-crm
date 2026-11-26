import { z } from 'zod';
import { ACTIVITY_REMINDERS } from '../activities/activity.schedule.js';

/**
 * Company calendar-sync settings (Admin › API Integrations › settings card), stored as the module setting
 * `ModuleSetting (module='activities', key='calendarSync')` and written through `formConfigService.updateModuleSetting`
 * (validated with `calendarSyncSettingsSchema`, audited, form-config cache dropped). A missing row or a malformed
 * value reads as the defaults, field by field. Pure (no database): formConfig.validator.ts registers the schema.
 * Which Followup Types sync is option meta `calendarSync` on shared_followup_type (CALENDAR_SYNC_META_KEY).
 */

export const CALENDAR_SYNC_SETTING_KEY = 'calendarSync';
/** Option meta key on Followup Type options: false = never sent to calendars (missing = on, except Task / Note). */
export const CALENDAR_SYNC_META_KEY = 'calendarSync';

export const BACKFILL_DAY_CHOICES = [30, 60, 90] as const;
export const EVENT_VISIBILITIES = ['private', 'default'] as const;
export const DEFAULT_COMPANY_DOMAIN = 'nandiniinfosys.com';
export const MAX_COMPANY_DOMAINS = 10;

export interface CalendarSyncSettings {
    /** Identity checks on connect, the internal-only description rule, the People email check, busy-time directory. */
    companyDomains: string[];
    /** Reminder (ACTIVITY_REMINDERS label) on follow-up activities (P2-4); null = none. */
    followUpReminder: (typeof ACTIVITY_REMINDERS)[number] | null;
    /** How far ahead upcoming activities are copied to a calendar on connect (P2-3c). */
    backfillDays: (typeof BACKFILL_DAY_CHOICES)[number];
    /** 'private' = pushed events are private (colleagues see "busy"); 'default' = the calendar's own visibility. */
    eventVisibility: (typeof EVENT_VISIBILITIES)[number];
    /** Lead / opportunity follow-ups create activities (P2-4); off = Phase 1 behaviour. */
    followUpActivities: boolean;
    /** Employees may bring customer meetings in from their calendars (P2-8). */
    allowMeetingImport: boolean;
    /** Followup Type of imported meetings (P2-8). */
    importFollowupType: string;
}

export const CALENDAR_SYNC_DEFAULTS: Readonly<CalendarSyncSettings> = Object.freeze({
    companyDomains: [DEFAULT_COMPANY_DOMAIN],
    followUpReminder: '15 minutes before',
    backfillDays: 60,
    eventVisibility: 'private',
    followUpActivities: true,
    allowMeetingImport: false,
    importFollowupType: 'Meeting',
});

const DOMAIN_PATTERN = /^(?=.{3,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

/** One domain: trimmed, lower-cased, a leading `@` dropped. */
const domainSchema = z.preprocess(
    (value) => (typeof value === 'string' ? value.trim().toLowerCase().replace(/^@/, '') : value),
    z.string().regex(DOMAIN_PATTERN, { message: 'Enter a domain such as nandiniinfosys.com.' }),
);

/** Field schemas without defaults (the patch schema makes each optional). */
const fields = {
    companyDomains: z
        .array(domainSchema)
        .min(1, { message: 'Add at least one company domain.' })
        .max(MAX_COMPANY_DOMAINS, { message: `At most ${MAX_COMPANY_DOMAINS} company domains.` })
        .transform((domains) => [...new Set(domains)]),
    followUpReminder: z.enum(ACTIVITY_REMINDERS, { error: 'Pick a reminder from the list.' }).nullable(),
    backfillDays: z.union([z.literal(30), z.literal(60), z.literal(90)], { error: 'Pick 30, 60 or 90 days.' }),
    eventVisibility: z.enum(EVENT_VISIBILITIES, { error: "Event visibility must be 'private' or 'default'." }),
    followUpActivities: z.boolean({ error: '"Follow-ups create activities" must be on or off.' }),
    allowMeetingImport: z.boolean({ error: '"Let employees bring in customer meetings" must be on or off.' }),
    importFollowupType: z.string().trim().min(1, { message: 'Pick a type for imported meetings.' }).max(200),
};

/** The whole value (MODULE_SETTING_SCHEMAS['activities:calendarSync']); missing fields take their defaults. */
export const calendarSyncSettingsSchema = z
    .object({
        companyDomains: fields.companyDomains.default([...CALENDAR_SYNC_DEFAULTS.companyDomains]),
        followUpReminder: fields.followUpReminder.default(CALENDAR_SYNC_DEFAULTS.followUpReminder),
        backfillDays: fields.backfillDays.default(CALENDAR_SYNC_DEFAULTS.backfillDays),
        eventVisibility: fields.eventVisibility.default(CALENDAR_SYNC_DEFAULTS.eventVisibility),
        followUpActivities: fields.followUpActivities.default(CALENDAR_SYNC_DEFAULTS.followUpActivities),
        allowMeetingImport: fields.allowMeetingImport.default(CALENDAR_SYNC_DEFAULTS.allowMeetingImport),
        importFollowupType: fields.importFollowupType.default(CALENDAR_SYNC_DEFAULTS.importFollowupType),
    })
    .strict();

/** PUT /api/admin/integrations/settings: any subset of the fields, merged over the stored value. */
export const calendarSyncSettingsPatchSchema = z
    .object(Object.fromEntries(Object.entries(fields).map(([key, schema]) => [key, schema.optional()])) as {
        [K in keyof typeof fields]: z.ZodOptional<(typeof fields)[K]>;
    })
    .strict()
    .refine((body) => Object.keys(body).length > 0, { message: 'Nothing to update.' });
export type CalendarSyncSettingsPatch = z.infer<typeof calendarSyncSettingsPatchSchema>;

/**
 * The stored JSON as settings: each field that is missing or invalid takes its default (an older or hand-edited row
 * never breaks the page). `importFollowupType` falls back to `fallbackImportType` when not stored.
 */
export function readCalendarSyncSettings(raw: unknown, fallbackImportType: string = CALENDAR_SYNC_DEFAULTS.importFollowupType): CalendarSyncSettings {
    const stored = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
    const pick = <K extends keyof CalendarSyncSettings>(key: K, fallback: CalendarSyncSettings[K]): CalendarSyncSettings[K] => {
        if (!(key in stored)) return fallback;
        const parsed = fields[key].safeParse(stored[key]);
        return parsed.success ? (parsed.data as CalendarSyncSettings[K]) : fallback;
    };
    return {
        companyDomains: pick('companyDomains', [...CALENDAR_SYNC_DEFAULTS.companyDomains]),
        followUpReminder: pick('followUpReminder', CALENDAR_SYNC_DEFAULTS.followUpReminder),
        backfillDays: pick('backfillDays', CALENDAR_SYNC_DEFAULTS.backfillDays),
        eventVisibility: pick('eventVisibility', CALENDAR_SYNC_DEFAULTS.eventVisibility),
        followUpActivities: pick('followUpActivities', CALENDAR_SYNC_DEFAULTS.followUpActivities),
        allowMeetingImport: pick('allowMeetingImport', CALENDAR_SYNC_DEFAULTS.allowMeetingImport),
        importFollowupType: pick('importFollowupType', fallbackImportType),
    };
}

/** A Followup Type option's "send to calendars" switch: Task / Note never; otherwise meta `calendarSync`, missing = on. */
export function calendarSyncFromMeta(meta: unknown, activityOnly: boolean): boolean {
    if (activityOnly) return false;
    const value = meta && typeof meta === 'object' ? (meta as Record<string, unknown>)[CALENDAR_SYNC_META_KEY] : undefined;
    return value !== false;
}
