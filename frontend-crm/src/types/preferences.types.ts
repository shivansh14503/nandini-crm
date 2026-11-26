import type { ActivityReminder } from './activity.types';
import type { InAppNotificationKind } from '../utils/notificationPreferences';

/**
 * My Profile › Notifications: the contract of `GET` / `PATCH /api/me/preferences`
 * (backend-crm/src/modules/preferences, docs/api-plan.md). Days are `YYYY-MM-DD` on the business-timezone calendar.
 */

/** The signed-in user's notification and availability preferences; every default when never saved. */
export interface PreferencesDto {
    /** Bell (in-app) notifications per configurable kind; false = that kind is not created for this user. */
    inApp: Record<InAppNotificationKind, boolean>;
    /** The 9 AM morning summary email. */
    morningSummaryEmail: boolean;
    /** Pre-fills Reminder on activities the user creates: a reminder label, `'none'` (No reminder), null = company default. */
    defaultReminder: ActivityReminder | 'none' | null;
    /** Inclusive range; null when none is set or the stored one has ended. `active` = today is inside it. */
    outOfOffice: { from: string; to: string; message: string | null; active: boolean } | null;
    /** The admin's On leave switch (Admin › Users), read-only here. */
    onLeave: boolean;
    /** The account's email address ('' when it has none: no email can be sent). */
    email: string;
    /** Server switches: the morning summary is scheduled (`summaryEnabled`) and SMTP is configured (`mailEnabled`). */
    mail: { summaryEnabled: boolean; mailEnabled: boolean };
    /** ISO instant of the last save; null = never saved (all defaults). */
    updatedAt: string | null;
}

/** `PATCH /api/me/preferences` body: every key optional, a missing key is left unchanged. */
export interface PreferencesPatch {
    inApp?: Partial<Record<InAppNotificationKind, boolean>>;
    morningSummaryEmail?: boolean;
    defaultReminder?: ActivityReminder | 'none' | null;
    /** null clears the range and its message. */
    outOfOffice?: { from: string; to: string; message?: string | null } | null;
}
