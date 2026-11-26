import { StatusCodes } from 'http-status-codes';
import { prisma } from '../../config/prisma.js';
import type { AuthUser } from '../../types/user.types.js';
import { HttpError } from '../../utils/httpError.js';
import { reconcileAllQuietly } from '../calendar-sync/enrolment.js';
import { FOLLOWUP_TYPE_CATEGORY_KEY } from '../form-configs/formConfig.defaults.js';
import { isActivityOnlyFollowupType } from '../shared/followupTypes.js';
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
 * A company domain a calendar provider still serves can't be removed (409 DOMAIN_IN_USE); a change of the company
 * domains re-runs calendar enrolment (P2-2b). The type of imported meetings (P2-8) must be an active, calendar-able
 * Followup Type (400 otherwise).
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

/** Domains each calendar provider row serves (`settings.domains`), lower-cased. */
export async function providerDomainsInUse(): Promise<{ provider: string; domains: string[] }[]> {
    const rows = await prisma.integrationProvider.findMany({ where: { provider: { in: ['google', 'microsoft'] } }, select: { provider: true, settingsJson: true } });
    return rows.map((row) => {
        let domains: string[] = [];
        try {
            const settings = JSON.parse(row.settingsJson ?? '{}') as { domains?: unknown };
            domains = Array.isArray(settings.domains) ? settings.domains.filter((d): d is string => typeof d === 'string').map((d) => d.toLowerCase()) : [];
        } catch {
            domains = [];
        }
        return { provider: row.provider, domains };
    });
}

/**
 * P2-8: the type of imported meetings must be an active Followup Type that can sit in a calendar (never Task / Note,
 * which are activity-only). 400 on `importFollowupType` otherwise.
 */
function assertImportType(configs: Pick<FormConfigsPayload, 'categories'>, value: string): void {
    const category = configs.categories.find((c) => c.key === FOLLOWUP_TYPE_CATEGORY_KEY);
    const option = category?.options.find((o) => o.isActive && o.value.trim().toLowerCase() === value.trim().toLowerCase());
    const message = isActivityOnlyFollowupType(value)
        ? `${value} activities never go to calendars. Pick another type for imported meetings.`
        : 'Pick an active Followup Type for imported meetings.';
    if (!option || isActivityOnlyFollowupType(value)) {
        throw new HttpError(message, StatusCodes.BAD_REQUEST, { code: 'VALIDATION_ERROR', errors: [{ message, path: ['importFollowupType'] }] });
    }
}

const PROVIDER_NAMES: Record<string, string> = { google: 'Google Workspace', microsoft: 'Microsoft 365' };

/**
 * Merges a partial update over the stored settings and saves the whole value (audited, cache dropped). Removing a
 * company domain that a calendar provider still serves answers 409 DOMAIN_IN_USE naming the provider. A change of the
 * company domains re-runs calendar enrolment after the save.
 */
export async function saveCalendarSettings(patch: unknown, user: AuthUser): Promise<CalendarSyncSettings> {
    const changes = calendarSyncSettingsPatchSchema.parse(patch);
    const configs = await formConfigService.getAllConfigs();
    const before = calendarSettingsFrom(configs);
    const merged = calendarSyncSettingsSchema.parse({ ...before, ...changes });
    if (changes.importFollowupType !== undefined) assertImportType(configs, merged.importFollowupType);
    const domainsChanged = changes.companyDomains !== undefined && JSON.stringify([...before.companyDomains].sort()) !== JSON.stringify([...merged.companyDomains].sort());
    if (domainsChanged) {
        const kept = new Set(merged.companyDomains);
        for (const { provider, domains } of await providerDomainsInUse()) {
            const lost = domains.find((d) => !kept.has(d));
            if (lost) {
                const message = `${lost} is still served by ${PROVIDER_NAMES[provider] ?? provider}. Remove it from that provider first.`;
                throw new HttpError(message, StatusCodes.CONFLICT, { code: 'DOMAIN_IN_USE', errors: [{ message, path: ['companyDomains'] }] });
            }
        }
    }
    await formConfigService.updateModuleSetting('activities', CALENDAR_SYNC_SETTING_KEY, { value: merged }, user);
    if (domainsChanged) await reconcileAllQuietly('domains_saved', { actor: user.username });
    return merged as CalendarSyncSettings;
}
