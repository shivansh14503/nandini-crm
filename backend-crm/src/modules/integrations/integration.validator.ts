import { z } from 'zod';
import { GOOGLE_SCOPE_PROFILES, INTEGRATION_PROVIDERS, MICROSOFT_TENANT_PATTERN, type IntegrationProviderKey } from './integration.constants.js';
import { calendarSyncSettingsPatchSchema } from './calendarSyncSettings.js';
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

/** Per-provider non-secret settings. Microsoft's tenant is the only admin value that reaches a provider URL. */
export const providerSettingsSchemas = {
    google: z
        .object({
            scopeProfile: z.enum(GOOGLE_SCOPE_PROFILES, { error: "Permission profile must be 'narrow' or 'broad'." }).optional(),
            pkce: z.boolean({ error: 'PKCE must be on or off.' }).optional(),
        })
        .strict(),
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
        })
        .strict(),
    zoom: z.object({}).strict(),
} satisfies Record<IntegrationProviderKey, z.ZodType>;

export interface GoogleProviderSettings {
    scopeProfile: 'narrow' | 'broad';
    pkce: boolean;
}
export interface MicrosoftProviderSettings {
    tenantId: string | null;
}
export type ProviderSettings = GoogleProviderSettings | MicrosoftProviderSettings | Record<string, never>;

/** Settings a provider starts with. */
export const PROVIDER_SETTINGS_DEFAULTS: Readonly<Record<IntegrationProviderKey, Record<string, unknown>>> = {
    google: { scopeProfile: 'narrow', pkce: true },
    microsoft: { tenantId: null },
    zoom: {},
};

/**
 * PUT /providers/:provider. Every field optional; an omitted secret keeps the stored one. `settings` is checked
 * against the provider's own schema in the service (the provider comes from the path).
 */
export const saveProviderSchema = z
    .object({
        enabled: z.boolean({ error: 'Enabled must be on or off.' }).optional(),
        clientId: z.preprocess(blankToNull, z.string().trim().max(200, { message: 'Client ID cannot exceed 200 characters.' }).nullable()).optional(),
        clientSecret: secretValue('Client secret').optional(),
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

export const PEOPLE_ISSUE_FILTERS = ['any', 'missing', 'duplicate', 'not_company'] as const;

export const peopleQuerySchema = z.object({
    search: z.string().trim().max(100).optional().catch(undefined),
    issue: z.enum(PEOPLE_ISSUE_FILTERS).optional().catch(undefined),
});
export type PeopleQuery = z.infer<typeof peopleQuerySchema>;

export const usernameParamSchema = z.object({ username: z.string().trim().min(1).max(50) });

/** POST /connections/:id/disconnect. */
export const connectionIdParamSchema = z.object({ id: z.string().trim().min(1).max(50) });

/** PUT /people/:username/email (the users email service owns the rule). */
export const personEmailBodySchema = userEmailBodySchema;
