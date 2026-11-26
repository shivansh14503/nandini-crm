/**
 * My Profile › Notifications: the configurable bell kinds and the limits of the user's preferences. Pure.
 *
 * Mirrored by frontend-crm/src/utils/notificationPreferences.ts; contractSync.test.ts checks the two agree.
 */

/**
 * Bell (in-app) kinds a user can turn off, in the order My Profile lists them. A kind added later (e.g.
 * `calendar_sync_issue`, `calendar_sync_error`, `calendar_invites_held`, `integration_secret_expiring`) is not
 * configurable unless it is added here with a UserPreference column: it always delivers.
 */
export const IN_APP_NOTIFICATION_KINDS = ['activity_reminder', 'activity_assigned', 'activity_invited', 'contract_renewal'] as const;
export type InAppNotificationKind = (typeof IN_APP_NOTIFICATION_KINDS)[number];

/** UserPreference column holding each configurable kind's switch. */
export type InAppPreferenceColumn = 'inAppActivityReminder' | 'inAppActivityAssigned' | 'inAppActivityInvited' | 'inAppContractRenewal';

export const IN_APP_PREFERENCE_COLUMN: Readonly<Record<InAppNotificationKind, InAppPreferenceColumn>> = Object.freeze({
    activity_reminder: 'inAppActivityReminder',
    activity_assigned: 'inAppActivityAssigned',
    activity_invited: 'inAppActivityInvited',
    contract_renewal: 'inAppContractRenewal',
});

/** Whether `kind` has a switch on My Profile (else it always delivers). */
export const isConfigurableKind = (kind: string): kind is InAppNotificationKind => Object.hasOwn(IN_APP_PREFERENCE_COLUMN, kind);

/** `defaultReminder` value for "No reminder" (NULL means "Company default"). */
export const DEFAULT_REMINDER_NONE = 'none';
/** Longest out-of-office range, in days, both ends included. */
export const OUT_OF_OFFICE_MAX_DAYS = 365;
/** Longest out-of-office message, in characters (UserPreference.outOfOfficeMessage is NVARCHAR(200)). */
export const OUT_OF_OFFICE_MESSAGE_MAX = 200;

/** A user's stored preferences as the API reads them (a UserPreference row without its keys and timestamps). */
export interface PreferenceValues {
    inAppActivityReminder: boolean;
    inAppActivityAssigned: boolean;
    inAppActivityInvited: boolean;
    inAppContractRenewal: boolean;
    emailMorningSummary: boolean;
    /** An ACTIVITY_REMINDERS label, 'none', or null (company default). */
    defaultReminder: string | null;
    /** UTC midnight of inclusive business days; both set or both null. */
    outOfOfficeFrom: Date | null;
    outOfOfficeTo: Date | null;
    outOfOfficeMessage: string | null;
}

/** What a user without a UserPreference row has: the behaviour before Profile Phase 3. */
export const PREFERENCE_DEFAULTS: Readonly<PreferenceValues> = Object.freeze({
    inAppActivityReminder: true,
    inAppActivityAssigned: true,
    inAppActivityInvited: true,
    inAppContractRenewal: true,
    emailMorningSummary: true,
    defaultReminder: null,
    outOfOfficeFrom: null,
    outOfOfficeTo: null,
    outOfOfficeMessage: null,
});
