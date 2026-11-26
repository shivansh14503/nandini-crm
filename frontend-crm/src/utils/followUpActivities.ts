import { useMemo } from 'react';
import { useFormConfigs } from '@/hooks/queries/useFormConfigs';
import type { FormConfigsPayload } from '@/types/formConfig.types';

/**
 * Lead / opportunity follow-ups as activities (Calendar Phase 2 P2-4). Saving a next follow-up on a lead or an
 * opportunity also creates (or moves) one Planned activity of its owner, unless an admin turned the company switch
 * off (Admin › API Integrations › Calendar sync settings › "Follow-ups create activities"; backend
 * `CalendarSyncSettings.followUpActivities`, stored as the `activities` / `calendarSync` module setting).
 */

/** Module setting that holds the calendar sync settings (backend CALENDAR_SYNC_SETTING_KEY). */
const CALENDAR_SYNC_SETTING = 'calendarSync';

/** Hint beside a lead / opportunity Next Followup Date while the switch is on. */
export const FOLLOW_UP_ACTIVITY_HINT = "Also added to the owner's activities and calendar";
/** Short form of the hint (fits beside the field label). */
export const FOLLOW_UP_ACTIVITY_SHORT_HINT = 'Also in Activities & calendar';
/** Appended to the save message when a save set a next follow-up while the switch is on. */
export const FOLLOW_UP_ACTIVITY_FLASH = 'Next follow-up added to the activities.';

/** Whether follow-ups create activities (on unless an admin turned it off; older settings without the key read as on). */
export function followUpActivitiesOn(configs: FormConfigsPayload | null | undefined): boolean {
    const raw = configs?.moduleSettings?.activities?.[CALENDAR_SYNC_SETTING];
    if (!raw || typeof raw !== 'object') return true;
    return (raw as { followUpActivities?: unknown }).followUpActivities !== false;
}

export function useFollowUpActivitiesOn(): boolean {
    const configs = useFormConfigs();
    return useMemo(() => followUpActivitiesOn(configs), [configs]);
}

/** The save message, with the follow-up activity line when this save left the record with a next follow-up. */
export function withFollowUpActivityFlash(message: string, on: boolean, hasNextFollowUp: boolean): string {
    return on && hasNextFollowUp ? `${message} ${FOLLOW_UP_ACTIVITY_FLASH}` : message;
}
