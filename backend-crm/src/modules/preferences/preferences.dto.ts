import type { ActivityReminder } from '../activities/activity.schedule.js';
import {
    IN_APP_NOTIFICATION_KINDS,
    IN_APP_PREFERENCE_COLUMN,
    PREFERENCE_DEFAULTS,
    type InAppNotificationKind,
    type PreferenceValues,
} from './preferences.constants.js';
import { isOutOfOfficeOn, type OutOfOfficeRange } from './preferences.rules.js';

/**
 * What /api/me/preferences returns, and the out-of-office every user list carries. No database access here, so pure
 * code and tests can use it. Mirrored by frontend-crm/src/types/preferences.types.ts.
 */

/** UserPreference columns the API reads (no key, no createdAt). */
export const PREFERENCE_SELECT = {
    inAppActivityReminder: true,
    inAppActivityAssigned: true,
    inAppActivityInvited: true,
    inAppContractRenewal: true,
    emailMorningSummary: true,
    defaultReminder: true,
    outOfOfficeFrom: true,
    outOfOfficeTo: true,
    outOfOfficeMessage: true,
    updatedAt: true,
} as const;

export type PreferenceRow = PreferenceValues & { updatedAt: Date };

/** UserPreference columns a user list (lookups, Admin › Users) reads to show "Out of office until …". */
export const OUT_OF_OFFICE_SELECT = { outOfOfficeFrom: true, outOfOfficeTo: true, outOfOfficeMessage: true } as const;

export type OutOfOfficeColumns = Pick<PreferenceValues, 'outOfOfficeFrom' | 'outOfOfficeTo' | 'outOfOfficeMessage'>;

/** A user's out-of-office as user lists show it. The client decides whether it is active on the business day. */
export interface OutOfOfficeDto {
    /** `YYYY-MM-DD`, inclusive. */
    from: string;
    to: string;
    message: string | null;
}

export interface PreferencesDto {
    inApp: Record<InAppNotificationKind, boolean>;
    morningSummaryEmail: boolean;
    /** null = company default. */
    defaultReminder: ActivityReminder | 'none' | null;
    /** null when none is set or it has ended; `active` when today is in the range. */
    outOfOffice: (OutOfOfficeDto & { active: boolean }) | null;
    /** The admin On leave switch (read-only here). */
    onLeave: boolean;
    /** '' when the account has none (no email can be sent to them). */
    email: string;
    /** Server switches: the morning summary is scheduled; outgoing email (SMTP) is configured. */
    mail: { summaryEnabled: boolean; mailEnabled: boolean };
    /** null = never saved (every default). */
    updatedAt: string | null;
}

export interface PreferencesDtoContext {
    /** Business-timezone today, `YYYY-MM-DD`. */
    today: string;
    onLeave: boolean;
    email: string | null;
    summaryEnabled: boolean;
    mailEnabled: boolean;
}

/** `YYYY-MM-DD` of a DATE column (stored at UTC midnight). */
const dayOf = (value: Date) => value.toISOString().slice(0, 10);

/** The stored range as days, or null when unset (or half set, which the API never writes). */
export function outOfOfficeRangeOf(pref: Pick<PreferenceValues, 'outOfOfficeFrom' | 'outOfOfficeTo'> | null | undefined): OutOfOfficeRange | null {
    if (!pref?.outOfOfficeFrom || !pref.outOfOfficeTo) return null;
    return { from: dayOf(pref.outOfOfficeFrom), to: dayOf(pref.outOfOfficeTo) };
}

/** The user's out-of-office for user lists (lookups, Admin › Users): null when unset or ended before `today`. */
export function outOfOfficeOf(pref: OutOfOfficeColumns | null | undefined, today: string): OutOfOfficeDto | null {
    const range = outOfOfficeRangeOf(pref);
    if (!range || range.to < today) return null;
    return { ...range, message: pref?.outOfOfficeMessage ?? null };
}

/** Whether the user is out of office on `day` (the morning summary skips them). */
export const isOutOfOfficeToday = (pref: Pick<PreferenceValues, 'outOfOfficeFrom' | 'outOfOfficeTo'> | null | undefined, day: string): boolean =>
    isOutOfOfficeOn(outOfOfficeRangeOf(pref), day);

export function toPreferencesDto(row: PreferenceRow | null, ctx: PreferencesDtoContext): PreferencesDto {
    const values: PreferenceValues = row ?? PREFERENCE_DEFAULTS;
    const outOfOffice = outOfOfficeOf(values, ctx.today);
    return {
        inApp: Object.fromEntries(IN_APP_NOTIFICATION_KINDS.map((kind) => [kind, values[IN_APP_PREFERENCE_COLUMN[kind]]])) as Record<InAppNotificationKind, boolean>,
        morningSummaryEmail: values.emailMorningSummary,
        defaultReminder: values.defaultReminder as PreferencesDto['defaultReminder'],
        outOfOffice: outOfOffice ? { ...outOfOffice, active: isOutOfOfficeOn(outOfOffice, ctx.today) } : null,
        onLeave: ctx.onLeave,
        email: (ctx.email ?? '').trim(),
        mail: { summaryEnabled: ctx.summaryEnabled, mailEnabled: ctx.mailEnabled },
        updatedAt: row ? row.updatedAt.toISOString() : null,
    };
}

/** The 9 stored preferences as the audit diff compares them (dates as `YYYY-MM-DD`). */
export function preferenceAuditSnapshot(values: PreferenceValues) {
    return {
        inAppActivityReminder: values.inAppActivityReminder,
        inAppActivityAssigned: values.inAppActivityAssigned,
        inAppActivityInvited: values.inAppActivityInvited,
        inAppContractRenewal: values.inAppContractRenewal,
        emailMorningSummary: values.emailMorningSummary,
        defaultReminder: values.defaultReminder,
        outOfOfficeFrom: values.outOfOfficeFrom ? dayOf(values.outOfOfficeFrom) : null,
        outOfOfficeTo: values.outOfOfficeTo ? dayOf(values.outOfOfficeTo) : null,
        outOfOfficeMessage: values.outOfOfficeMessage,
    };
}
