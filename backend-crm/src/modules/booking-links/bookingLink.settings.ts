import { z } from 'zod';
import { BOOKING_CREATOR_SCOPES, type BookingCreatorScope } from './bookingLink.constants.js';

/**
 * Company booking-link settings (Admin › API Integrations › Booking links card), stored as the module setting
 * `ModuleSetting (module='activities', key='bookingLinks')` and written through `formConfigService.updateModuleSetting`
 * (validated with `bookingSettingsSchema`, registered in formConfig.validator.ts; audited; form-config cache dropped).
 * A missing row or a malformed value reads as the defaults (switched off). The loaders live in bookingLink.service.ts.
 * `whoCanCreate` decides who may create and change links; links already made keep answering until they are turned
 * off (the public page checks the company switch and that the owner is an active, non-group user).
 */

export const BOOKING_SETTING_KEY = 'bookingLinks';

export interface BookingSettings {
    /** Company switch: off = no public page answers (404) and nobody can create or change links. */
    enabled: boolean;
    /** Who may create links for themselves (admins can always create one for anyone while the switch is on). */
    whoCanCreate: BookingCreatorScope;
}

export const BOOKING_SETTINGS_DEFAULTS: Readonly<BookingSettings> = Object.freeze({ enabled: false, whoCanCreate: 'everyone' });

const fields = {
    enabled: z.boolean({ error: '"Booking links" must be on or off.' }),
    whoCanCreate: z.enum(BOOKING_CREATOR_SCOPES, { error: `Who may create links must be one of: ${BOOKING_CREATOR_SCOPES.join(', ')}.` }),
};

/** The whole stored value (MODULE_SETTING_SCHEMAS['activities:bookingLinks']); missing fields take their defaults. */
export const bookingSettingsSchema = z
    .object({
        enabled: fields.enabled.default(BOOKING_SETTINGS_DEFAULTS.enabled),
        whoCanCreate: fields.whoCanCreate.default(BOOKING_SETTINGS_DEFAULTS.whoCanCreate),
    })
    .strict();

/** PUT /api/booking-links/settings: any subset, merged over the stored value. */
export const bookingSettingsPatchSchema = z
    .object({ enabled: fields.enabled.optional(), whoCanCreate: fields.whoCanCreate.optional() })
    .strict()
    .refine((body) => Object.keys(body).length > 0, { message: 'Nothing to update.' });

/** The stored JSON as settings: each missing or invalid field takes its default. */
export function readBookingSettings(raw: unknown): BookingSettings {
    const stored = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
    const enabled = fields.enabled.safeParse(stored.enabled);
    const whoCanCreate = fields.whoCanCreate.safeParse(stored.whoCanCreate);
    return {
        enabled: enabled.success ? enabled.data : BOOKING_SETTINGS_DEFAULTS.enabled,
        whoCanCreate: whoCanCreate.success ? whoCanCreate.data : BOOKING_SETTINGS_DEFAULTS.whoCanCreate,
    };
}
