import { StatusCodes } from 'http-status-codes';
import { ENV } from '../../config/env.js';
import { prisma } from '../../config/prisma.js';
import { auditService, diffRecords } from '../../services/audit.service.js';
import { isMailConfigured } from '../../services/mail.service.js';
import type { AuthUser } from '../../types/user.types.js';
import { HttpError, type ApiFieldError } from '../../utils/httpError.js';
import { fromDateOnly } from '../../utils/mappers.js';
import { businessToday } from '../../validators/notInPast.js';
import { invalidateUserLookupCaches } from '../lookups/lookup.service.js';
import { ACCOUNT_NOT_FOUND, lockUser } from '../profile/profile.service.js';
import { runInTransaction } from '../shared/transactions.js';
import { IN_APP_NOTIFICATION_KINDS, IN_APP_PREFERENCE_COLUMN, PREFERENCE_DEFAULTS, type PreferenceValues } from './preferences.constants.js';
import { outOfOfficeRangeOf, PREFERENCE_SELECT, preferenceAuditSnapshot, toPreferencesDto, type PreferenceRow, type PreferencesDto } from './preferences.dto.js';
import { outOfOfficeIssues } from './preferences.rules.js';
import type { PreferencesPatch } from './preferences.validator.js';

/**
 * My Profile › Notifications (/api/me/preferences): the caller's own notification switches, default reminder and out
 * of office. One UserPreference row per user, written on the first save that changes something; no row = defaults.
 * Changes are audited as a User UPDATE (like profile edits).
 */

const OUT_OF_OFFICE_KEYS = ['outOfOfficeFrom', 'outOfOfficeTo', 'outOfOfficeMessage'] as const;

/** The stored values with `patch` applied (keys left out stay as they are). */
export function applyPreferencesPatch(before: PreferenceValues, patch: PreferencesPatch): PreferenceValues {
    const next: PreferenceValues = { ...before };
    for (const kind of IN_APP_NOTIFICATION_KINDS) {
        const value = patch.inApp?.[kind];
        if (value !== undefined) next[IN_APP_PREFERENCE_COLUMN[kind]] = value;
    }
    if (patch.morningSummaryEmail !== undefined) next.emailMorningSummary = patch.morningSummaryEmail;
    if (patch.defaultReminder !== undefined) next.defaultReminder = patch.defaultReminder;
    if (patch.outOfOffice === null) {
        next.outOfOfficeFrom = null;
        next.outOfOfficeTo = null;
        next.outOfOfficeMessage = null;
    } else if (patch.outOfOffice !== undefined) {
        next.outOfOfficeFrom = fromDateOnly(patch.outOfOffice.from);
        next.outOfOfficeTo = fromDateOnly(patch.outOfOffice.to);
        if (patch.outOfOffice.message !== undefined) next.outOfOfficeMessage = patch.outOfOffice.message;
    }
    return next;
}

const valuesOf = (row: PreferenceRow): PreferenceValues => {
    const { updatedAt: _updatedAt, ...values } = row;
    return values;
};

const mailSwitches = () => ({ summaryEnabled: ENV.NOTIFICATIONS.MORNING_SUMMARY_ENABLED, mailEnabled: isMailConfigured() });

export const preferencesService = {
    async get(user: AuthUser): Promise<PreferencesDto> {
        const row = await prisma.user.findUnique({
            where: { id: user.id },
            select: { onLeave: true, email: true, preference: { select: PREFERENCE_SELECT } },
        });
        if (!row) throw HttpError.unauthorized(ACCOUNT_NOT_FOUND);
        return toPreferencesDto(row.preference, { today: businessToday(), onLeave: row.onLeave, email: row.email, ...mailSwitches() });
    },

    /**
     * Applies the caller's changes. The out-of-office rules run against the business day and the stored range (a
     * range saved earlier never blocks a save of something else). Nothing is written or audited when nothing changes.
     */
    async update(user: AuthUser, patch: PreferencesPatch): Promise<PreferencesDto> {
        const today = businessToday();
        const { account, row, outOfOfficeChanged } = await runInTransaction(async (tx) => {
            await lockUser(tx, user.id);
            const account = await tx.user.findUnique({
                where: { id: user.id },
                select: { onLeave: true, email: true, preference: { select: PREFERENCE_SELECT } },
            });
            if (!account) throw HttpError.unauthorized(ACCOUNT_NOT_FOUND);
            const before = account.preference ? valuesOf(account.preference) : PREFERENCE_DEFAULTS;
            const next = applyPreferencesPatch(before, patch);

            const nextRange = outOfOfficeRangeOf(next);
            const issues = nextRange ? outOfOfficeIssues(nextRange, today, outOfOfficeRangeOf(before)) : [];
            if (issues.length > 0) {
                throw new HttpError(issues[0].message, StatusCodes.BAD_REQUEST, {
                    code: 'VALIDATION_ERROR',
                    errors: issues.map((issue) => ({ message: issue.message, path: ['outOfOffice', issue.path] })) satisfies ApiFieldError[],
                });
            }

            const changes = diffRecords(preferenceAuditSnapshot(before), preferenceAuditSnapshot(next));
            if (Object.keys(changes).length === 0) return { account, row: account.preference, outOfOfficeChanged: false };

            const saved = await tx.userPreference.upsert({
                where: { userId: user.id },
                create: { userId: user.id, ...next },
                update: next,
                select: PREFERENCE_SELECT,
            });
            await auditService.record(tx, { entityType: 'User', entityId: String(user.id), action: 'UPDATE', changedBy: user.username, changes });
            return { account, row: saved, outOfOfficeChanged: OUT_OF_OFFICE_KEYS.some((key) => key in changes) };
        });
        // User lists carry the out-of-office dates ("Out of office until …" in pickers and Admin › Users).
        if (outOfOfficeChanged) await invalidateUserLookupCaches();
        return toPreferencesDto(row, { today, onLeave: account.onLeave, email: account.email, ...mailSwitches() });
    },
};
