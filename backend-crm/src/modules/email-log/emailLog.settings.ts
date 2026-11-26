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
    /** Keep a ≤ 500-character plain-text preview of each email (off = headers only). */
    storeSnippets: boolean;
}

export const EMAIL_LOGGING_DEFAULTS: Readonly<EmailLoggingSettings> = Object.freeze({
    enabled: false,
    defaultForPeople: 'off',
    visibility: 'restricted',
    retentionMonths: 24,
    storeSnippets: true,
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
};

/** The whole stored value (MODULE_SETTING_SCHEMAS['activities:emailLogging']); missing fields take their defaults. */
export const emailLoggingSettingsSchema = z
    .object({
        enabled: fields.enabled.default(EMAIL_LOGGING_DEFAULTS.enabled),
        defaultForPeople: fields.defaultForPeople.default(EMAIL_LOGGING_DEFAULTS.defaultForPeople),
        visibility: fields.visibility.default(EMAIL_LOGGING_DEFAULTS.visibility),
        retentionMonths: fields.retentionMonths.default(EMAIL_LOGGING_DEFAULTS.retentionMonths),
        storeSnippets: fields.storeSnippets.default(EMAIL_LOGGING_DEFAULTS.storeSnippets),
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
    };
}

/** The person's effective switch: their own mode, else the company default. Pure. */
export function effectiveMode(mode: string | null | undefined, settings: Pick<EmailLoggingSettings, 'defaultForPeople'>): MailboxMode {
    return mode === 'on' || mode === 'off' ? mode : settings.defaultForPeople;
}
