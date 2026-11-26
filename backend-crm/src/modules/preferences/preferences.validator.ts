import { z } from 'zod';
import { ACTIVITY_REMINDERS } from '../activities/activity.schedule.js';
import { requiredDate } from '../../validators/common.js';
import { clearable } from '../profile/profile.validator.js';
import { DEFAULT_REMINDER_NONE, OUT_OF_OFFICE_MESSAGE_MAX, type InAppNotificationKind } from './preferences.constants.js';

/**
 * PATCH /api/me/preferences (My Profile › Notifications). Every key is optional (keys left out stay as they are; an
 * empty body changes nothing); unknown keys, top-level or nested, are refused. The out-of-office date rules that
 * need today and the stored range (preferences.rules.ts) are applied by the service.
 */

const onOff = (label: string) => z.boolean({ error: `"${label}" must be on or off.` });

/** Row labels of My Profile › Notifications, used in the messages. */
const IN_APP_LABELS: Readonly<Record<InAppNotificationKind, string>> = {
    activity_reminder: 'Activity reminders',
    activity_assigned: 'Assignments',
    activity_invited: 'Invitations',
    contract_renewal: 'Contract renewals',
};

export const preferencesPatchSchema = z.strictObject({
    inApp: z
        .strictObject(
            {
                activity_reminder: onOff(IN_APP_LABELS.activity_reminder).optional(),
                activity_assigned: onOff(IN_APP_LABELS.activity_assigned).optional(),
                activity_invited: onOff(IN_APP_LABELS.activity_invited).optional(),
                contract_renewal: onOff(IN_APP_LABELS.contract_renewal).optional(),
            },
            { error: (issue) => (issue.code === 'unrecognized_keys' ? undefined : 'In-app notification switches must be an object.') },
        )
        .optional(),
    morningSummaryEmail: onOff('Morning summary email').optional(),
    /** A reminder label, 'none' (No reminder) or null (company default). */
    defaultReminder: z
        .union([z.enum(ACTIVITY_REMINDERS), z.literal(DEFAULT_REMINDER_NONE)], { error: 'Pick a reminder from the list.' })
        .nullable()
        .optional(),
    /** null clears the range and its message. `message` left out keeps the stored one; '' / null clears it. */
    outOfOffice: z
        .strictObject(
            {
                from: requiredDate('Start Date'),
                to: requiredDate('End Date'),
                message: clearable(
                    z.string({ error: 'Message must be text.' }).trim().max(OUT_OF_OFFICE_MESSAGE_MAX, {
                        message: `Message cannot exceed ${OUT_OF_OFFICE_MESSAGE_MAX} characters.`,
                    }),
                ),
            },
            { error: (issue) => (issue.code === 'unrecognized_keys' ? undefined : 'Out of office needs a Start Date and an End Date.') },
        )
        .nullable()
        .optional(),
});
export type PreferencesPatch = z.infer<typeof preferencesPatchSchema>;
