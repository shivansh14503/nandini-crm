import { z } from 'zod';
import { CALENDAR_PROVIDERS } from '../calendar-sync/connection.constants.js';
import { SERVICE_ACCOUNT_KEY_MAX_BYTES } from '../calendar-sync/providers/googleServiceAccount.js';
import { INTEGRATION_PROVIDERS, MICROSOFT_TENANT_PATTERN, type IntegrationProviderKey } from './integration.constants.js';
import { calendarSyncSettingsPatchSchema, domainSchema, MAX_COMPANY_DOMAINS } from './calendarSyncSettings.js';
import { userEmailBodySchema } from '../users/userEmail.service.js';

/** Request schemas for /api/admin/integrations (integration.routes.ts). */

export const providerParamSchema = z.object({
    provider: z.enum(INTEGRATION_PROVIDERS, { error: `provider must be one of: ${INTEGRATION_PROVIDERS.join(', ')}.` }),
});

/** Client secrets: write-only. Long enough to catch a paste of the wrong field, short enough for any real secret. */
const secretValue = (label: string) =>
    z
        .string({ error: `${label} must be text.` })
        .trim()
        .min(8, { message: `${label} must be at least 8 characters.` })
        .max(2000, { message: `${label} is too long.` });

const blankToNull = (value: unknown) => (value === '' || (typeof value === 'string' && value.trim() === '') ? null : value);

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (value: string) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

/** The company email domains a calendar provider serves (each must also be a company domain; checked in the service). */
const providerDomains = z
    .array(domainSchema)
    .max(MAX_COMPANY_DOMAINS, { message: `At most ${MAX_COMPANY_DOMAINS} domains.` })
    .transform((domains) => [...new Set(domains)]);

/**
 * Per-provider non-secret settings. Microsoft's tenant is the only admin value that reaches a provider URL. A stored
 * `scopeProfile` / `pkce` (P2-2's OAuth settings) is ignored on read and refused on write.
 */
export const providerSettingsSchemas = {
    google: z.object({ domains: providerDomains.optional() }).strict(),
    microsoft: z
        .object({
            tenantId: z.preprocess(
                blankToNull,
                z
                    .string()
                    .trim()
                    .max(100)
                    .regex(MICROSOFT_TENANT_PATTERN, { message: 'Tenant ID must be the Directory (tenant) ID (a GUID) or the tenant domain.' })
                    .transform((value) => value.toLowerCase())
                    .nullable(),
            ).optional(),
            domains: providerDomains.optional(),
        })
        .strict(),
    zoom: z.object({}).strict(),
} satisfies Record<IntegrationProviderKey, z.ZodType>;

export interface GoogleProviderSettings {
    domains: string[];
}
export interface MicrosoftProviderSettings {
    tenantId: string | null;
    domains: string[];
}
export type ProviderSettings = GoogleProviderSettings | MicrosoftProviderSettings | Record<string, never>;

/** Settings a provider starts with. */
export const PROVIDER_SETTINGS_DEFAULTS: Readonly<Record<IntegrationProviderKey, Record<string, unknown>>> = {
    google: { domains: [] },
    microsoft: { tenantId: null, domains: [] },
    zoom: {},
};

/** Keys each provider's settings may hold (anything else stored, e.g. P2-2's scopeProfile / pkce, is dropped on read). */
export const PROVIDER_SETTINGS_KEYS: Readonly<Record<IntegrationProviderKey, readonly string[]>> = {
    google: ['domains'],
    microsoft: ['tenantId', 'domains'],
    zoom: [],
};

/**
 * PUT /providers/:provider. Every field optional; an omitted secret keeps the stored one. `settings` is checked
 * against the provider's own schema in the service (the provider comes from the path). Google: `serviceAccountKey`
 * (the whole key JSON as text, write-only; its client id becomes `clientId`, so `clientId` is refused for Google).
 */
export const saveProviderSchema = z
    .object({
        enabled: z.boolean({ error: 'Enabled must be on or off.' }).optional(),
        clientId: z.preprocess(blankToNull, z.string().trim().max(200, { message: 'Client ID cannot exceed 200 characters.' }).nullable()).optional(),
        clientSecret: secretValue('Client secret').optional(),
        /** Google only: the service account key file's text (validated and parsed in the service). */
        serviceAccountKey: z
            .string({ error: 'The service account key must be the text of the .json file.' })
            .min(2, { message: 'Upload or paste the service account key (.json).' })
            .max(SERVICE_ACCOUNT_KEY_MAX_BYTES, { message: 'That file is too large to be a service account key.' })
            .optional(),
        /** Zoom only: the event subscription's Secret Token. */
        webhookSecret: secretValue('Webhook secret').optional(),
        /** YYYY-MM-DD (Microsoft / Zoom secrets expire); null clears it. A replaced secret starts without one. */
        clientSecretExpiresOn: z
            .preprocess(
                blankToNull,
                z
                    .string()
                    .regex(DATE_ONLY, { message: 'Use a date like 2027-01-31.' })
                    .refine(validDate, { message: 'That date does not exist.' })
                    .nullable(),
            )
            .optional(),
        settings: z.record(z.string(), z.unknown()).optional(),
    })
    .strict()
    .refine((body) => Object.keys(body).length > 0, { message: 'Nothing to update.' });
export type SaveProviderBody = z.infer<typeof saveProviderSchema>;

/** PUT /settings. */
export const settingsBodySchema = calendarSyncSettingsPatchSchema;

/** PUT /sync-types: `{ "<Followup Type>": true | false }`. */
export const syncTypesBodySchema = z
    .record(z.string().trim().min(1).max(200), z.boolean({ error: 'Each type must be on or off.' }))
    .refine((body) => Object.keys(body).length > 0, { message: 'Nothing to update.' })
    .refine((body) => Object.keys(body).length <= 200, { message: 'Too many types.' });

/** Email issues, plus `calendar_problem` (a live calendar row in `error`). */
export const PEOPLE_ISSUE_FILTERS = ['any', 'missing', 'duplicate', 'not_company', 'calendar_problem'] as const;

export const peopleQuerySchema = z.object({
    search: z.string().trim().max(100).optional().catch(undefined),
    issue: z.enum(PEOPLE_ISSUE_FILTERS).optional().catch(undefined),
});
export type PeopleQuery = z.infer<typeof peopleQuerySchema>;

export const usernameParamSchema = z.object({ username: z.string().trim().min(1).max(50) });

/** POST /providers/:provider/test: optionally also try one person's calendar as that person. */
export const testProviderBodySchema = z
    .object({ asUsername: z.string().trim().min(1).max(50).optional() })
    .strict()
    .optional()
    .transform((body) => body ?? {});

/** Longest admin note on a person's calendar choice (CalendarSyncUser.note). */
export const PERSON_CALENDAR_NOTE_MAX = 200;

/**
 * PUT /people/:username/calendar: the admin's choice for one person (any subset). `provider: null` = by email domain;
 * `fake` is accepted only while CALENDAR_FAKE_PROVIDER is on (checked in the service).
 */
export const personCalendarBodySchema = z
    .object({
        provider: z.enum(CALENDAR_PROVIDERS, { error: `Provider must be one of: ${CALENDAR_PROVIDERS.join(', ')}, or empty for "by email domain".` }).nullable().optional(),
        excluded: z.boolean({ error: 'Exclude must be on or off.' }).optional(),
        note: z.preprocess(blankToNull, z.string().trim().max(PERSON_CALENDAR_NOTE_MAX, { message: `Note cannot exceed ${PERSON_CALENDAR_NOTE_MAX} characters.` }).nullable()).optional(),
        /** P2-8: bring this person's customer meetings into the CRM (needs the company switch; 409 MEETING_IMPORT_OFF). */
        importMeetings: z.boolean({ error: 'Import customer meetings must be on or off.' }).optional(),
    })
    .strict()
    .refine((body) => Object.keys(body).length > 0, { message: 'Nothing to update.' });
export type PersonCalendarBody = z.infer<typeof personCalendarBodySchema>;

/** PUT /people/:username/email (the users email service owns the rule). */
export const personEmailBodySchema = userEmailBodySchema;
