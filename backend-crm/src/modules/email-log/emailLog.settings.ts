import { z } from 'zod';
import { EMAIL_VISIBILITIES, MAILBOX_MODES, RETENTION_MONTH_CHOICES, type EmailVisibility, type MailboxMode, type RetentionMonths } from './emailLog.constants.js';

/**
 * Company email-logging settings (Admin › API Integrations › Email logging card), stored as the module setting
 * `ModuleSetting (module='activities', key='emailLogging')` and written through `formConfigService.updateModuleSetting`
 * (validated with `emailLoggingSettingsSchema`, registered in formConfig.validator.ts; audited ModuleSetting UPDATE).
 * A missing row or a malformed value reads as the defaults (switched off). Pure.
 */

export const EMAIL_LOGGING_SETTING_KEY = 'emailLogging';

export interface EmailLoggingSettings {
    /** Company switch "Log emails with customers" (default off). */
    enabled: boolean;
    /** Mode of people without their own switch (default off: an admin picks people). */
    defaultForPeople: MailboxMode;
    /** restricted = record owner, managers / admins and the participants; record = everyone who can open the record. */
    visibility: EmailVisibility;
    /** Logged emails older than this (by sent date) are deleted by the nightly. */
    retentionMonths: RetentionMonths;
    /** Keep a ≤ 500-character plain-text preview of each email (off = headers only; turning it off clears kept ones). */
    storeSnippets: boolean;
    /**
     * Server-stamped (never in a PUT body): when the company switch last went off → on, and when "Default for people"
     * last went off → on (ISO). Mail from before them is never logged (`loggingStartOf`), so switching off and on
     * again can't catch up on the off period. Null = never switched on through the admin API.
     */
    enabledAt: string | null;
    defaultOnAt: string | null;
}

export const EMAIL_LOGGING_DEFAULTS: Readonly<EmailLoggingSettings> = Object.freeze({
    enabled: false,
    defaultForPeople: 'off',
    visibility: 'restricted',
    retentionMonths: 24,
    storeSnippets: true,
    enabledAt: null,
    defaultOnAt: null,
});

const fields = {
    enabled: z.boolean({ error: '"Log emails with customers" must be on or off.' }),
    defaultForPeople: z.enum(MAILBOX_MODES, { error: "The default for people must be 'on' or 'off'." }),
    visibility: z.enum(EMAIL_VISIBILITIES, { error: `Who can see logged emails must be one of: ${EMAIL_VISIBILITIES.join(', ')}.` }),
    retentionMonths: z.union(
        RETENTION_MONTH_CHOICES.map((m) => z.literal(m)) as unknown as [z.ZodLiteral<6>, z.ZodLiteral<12>, z.ZodLiteral<24>, z.ZodLiteral<36>],
        { error: `Keep logged emails for ${RETENTION_MONTH_CHOICES.join(', ')} months.` },
    ),
    storeSnippets: z.boolean({ error: '"Keep a short preview" must be on or off.' }),
    enabledAt: z.iso.datetime({ error: 'enabledAt must be an ISO date-time.' }).nullable(),
    defaultOnAt: z.iso.datetime({ error: 'defaultOnAt must be an ISO date-time.' }).nullable(),
};

/** The whole stored value (MODULE_SETTING_SCHEMAS['activities:emailLogging']); missing fields take their defaults. */
export const emailLoggingSettingsSchema = z
    .object({
        enabled: fields.enabled.default(EMAIL_LOGGING_DEFAULTS.enabled),
        defaultForPeople: fields.defaultForPeople.default(EMAIL_LOGGING_DEFAULTS.defaultForPeople),
        visibility: fields.visibility.default(EMAIL_LOGGING_DEFAULTS.visibility),
        retentionMonths: fields.retentionMonths.default(EMAIL_LOGGING_DEFAULTS.retentionMonths),
        storeSnippets: fields.storeSnippets.default(EMAIL_LOGGING_DEFAULTS.storeSnippets),
        enabledAt: fields.enabledAt.default(EMAIL_LOGGING_DEFAULTS.enabledAt),
        defaultOnAt: fields.defaultOnAt.default(EMAIL_LOGGING_DEFAULTS.defaultOnAt),
    })
    .strict();

/** PUT /api/admin/email-logging/settings: any subset, merged over the stored value. */
export const emailLoggingSettingsPatchSchema = z
    .object({
        enabled: fields.enabled.optional(),
        defaultForPeople: fields.defaultForPeople.optional(),
        visibility: fields.visibility.optional(),
        retentionMonths: fields.retentionMonths.optional(),
        storeSnippets: fields.storeSnippets.optional(),
    })
    .strict()
    .refine((body) => Object.keys(body).length > 0, { message: 'Nothing to update.' });

/** The stored JSON as settings: each missing or invalid field takes its default. Pure. */
export function readEmailLoggingSettings(raw: unknown): EmailLoggingSettings {
    const stored = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
    const pick = <K extends keyof EmailLoggingSettings>(key: K): EmailLoggingSettings[K] => {
        const parsed = fields[key].safeParse(stored[key]);
        return parsed.success ? (parsed.data as EmailLoggingSettings[K]) : EMAIL_LOGGING_DEFAULTS[key];
    };
    return {
        enabled: pick('enabled'),
        defaultForPeople: pick('defaultForPeople'),
        visibility: pick('visibility'),
        retentionMonths: pick('retentionMonths'),
        storeSnippets: pick('storeSnippets'),
        enabledAt: pick('enabledAt'),
        defaultOnAt: pick('defaultOnAt'),
    };
}

/**
 * The settings to store after an admin's patch: stamps `enabledAt` / `defaultOnAt` when the company switch / the
 * default for people turns on (the patch schema never accepts them). Pure.
 */
export function stampSettings(before: EmailLoggingSettings, merged: EmailLoggingSettings, now: Date): EmailLoggingSettings {
    const at = now.toISOString();
    return {
        ...merged,
        enabledAt: merged.enabled && !before.enabled ? at : before.enabledAt,
        defaultOnAt: merged.defaultForPeople === 'on' && before.defaultForPeople !== 'on' ? at : before.defaultOnAt,
    };
}

/** The mailbox fields that bound when logging (re)started for a person. */
export interface LoggingStartRow {
    mode: string | null;
    loggingSince: Date | null;
    purgedAt: Date | null;
}

/**
 * The moment from which a person's mail may be logged: the latest of the company switch turning on, the person's own
 * switch turning on (or the company default turning on, for people without their own switch) and the last purge.
 * Null when none is known (then only the FULL_SYNC_DAYS bound applies). Pure.
 */
export function loggingStartOf(row: LoggingStartRow | null, settings: Pick<EmailLoggingSettings, 'enabledAt' | 'defaultOnAt'>): Date | null {
    const times: number[] = [];
    const push = (value: Date | string | null | undefined) => {
        const t = value instanceof Date ? value.getTime() : typeof value === 'string' ? Date.parse(value) : NaN;
        if (Number.isFinite(t)) times.push(t);
    };
    push(settings.enabledAt);
    push(row?.loggingSince);
    push(row?.purgedAt);
    if (row?.mode !== 'on' && row?.mode !== 'off') push(settings.defaultOnAt);
    return times.length ? new Date(Math.max(...times)) : null;
}

/** The person's effective switch: their own mode, else the company default. Pure. */
export function effectiveMode(mode: string | null | undefined, settings: Pick<EmailLoggingSettings, 'defaultForPeople'>): MailboxMode {
    return mode === 'on' || mode === 'off' ? mode : settings.defaultForPeople;
}
