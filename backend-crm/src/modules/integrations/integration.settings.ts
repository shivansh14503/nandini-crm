import type { AuthUser } from '../../types/user.types.js';
import { FOLLOWUP_TYPE_CATEGORY_KEY } from '../form-configs/formConfig.defaults.js';
import { formConfigService, type FormConfigsPayload } from '../form-configs/formConfig.service.js';
import {
    CALENDAR_SYNC_DEFAULTS,
    CALENDAR_SYNC_SETTING_KEY,
    calendarSyncSettingsPatchSchema,
    calendarSyncSettingsSchema,
    readCalendarSyncSettings,
    type CalendarSyncSettings,
} from './calendarSyncSettings.js';

/**
 * Loading and saving the company calendar-sync settings (`ModuleSetting activities/calendarSync`). Reads come from
 * the form-config payload (`getAllConfigs`, cached for an hour and dropped by every config write), so there is no
 * second cache key; saves go through `formConfigService.updateModuleSetting`, which validates, audits
 * (`ModuleSetting UPDATE`) and drops that cache, so `loadActivityConfig` and calendar sync see the change at once.
 */

/** Type for imported meetings when none is stored: the active Followup Type whose meta.icon is 'meeting', else 'Meeting'. */
export function defaultImportType(configs: Pick<FormConfigsPayload, 'categories'>): string {
    const category = configs.categories.find((c) => c.key === FOLLOWUP_TYPE_CATEGORY_KEY);
    const meeting = category?.options.find((o) => o.isActive && o.meta && (o.meta as Record<string, unknown>).icon === 'meeting');
    return meeting?.value ?? CALENDAR_SYNC_DEFAULTS.importFollowupType;
}

/** Settings from a form-config payload (defaults for anything missing or invalid). */
export function calendarSettingsFrom(configs: Pick<FormConfigsPayload, 'categories' | 'moduleSettings'>): CalendarSyncSettings {
    return readCalendarSyncSettings(configs.moduleSettings.activities?.[CALENDAR_SYNC_SETTING_KEY], defaultImportType(configs));
}

export async function loadCalendarSettings(): Promise<CalendarSyncSettings> {
    return calendarSettingsFrom(await formConfigService.getAllConfigs());
}

/** Merges a partial update over the stored settings and saves the whole value (audited, cache dropped). */
export async function saveCalendarSettings(patch: unknown, user: AuthUser): Promise<CalendarSyncSettings> {
    const changes = calendarSyncSettingsPatchSchema.parse(patch);
    const merged = calendarSyncSettingsSchema.parse({ ...(await loadCalendarSettings()), ...changes });
    await formConfigService.updateModuleSetting('activities', CALENDAR_SYNC_SETTING_KEY, { value: merged }, user);
    return merged as CalendarSyncSettings;
}
