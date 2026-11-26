import { ENV } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { prisma } from '../../config/prisma.js';
import { notify, type NotificationInput } from '../notifications/notification.producer.js';
import { ADMIN_ROLES } from '../user-admin/roles.js';
import { ADMIN_INTEGRATIONS_ENTITY_MODULE, CALENDAR_PROVIDER_LABELS, PEOPLE_CALENDAR_PROBLEMS_ENTITY_ID, type CalendarProvider } from './connection.constants.js';
import { ADMIN_ERROR_MESSAGES, type TokenErrorCode } from './syncErrors.js';

/**
 * `calendar_sync_issue` (addendum AC9, §4.4): calendar sync problems go to **admins** (ADMIN_ROLES), never to the
 * employee, who can't fix anything themselves. A system kind: always delivers (no UserPreference column).
 *   - app-level (a provider can't be used): one per provider + code + business day,
 *     dedupe `calendar_sync_issue:<provider>:<code>:<business date>:<admin>`; opens Admin › API Integrations.
 *   - user-level digest (written by the nightly run when ≥ 1 row went to `error` that business day): one per day,
 *     dedupe `calendar_sync_issue:users:<business date>:<admin>`; opens the People tab filtered to calendar problems.
 */

/** `YYYY-MM-DD` of `now` in the business timezone. Pure. */
export function businessDateOf(now: Date): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: ENV.BUSINESS_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Active admin logins (the recipients). */
export async function adminRecipients(): Promise<string[]> {
    const rows = await prisma.user.findMany({ where: { isActive: true, role: { in: [...ADMIN_ROLES] } }, select: { username: true } });
    return rows.map((row) => row.username);
}

/** Notification rows for an app-level problem of one provider. Pure. */
export function appIssueNotifications(admins: readonly string[], provider: CalendarProvider, code: TokenErrorCode, now: Date): NotificationInput[] {
    const date = businessDateOf(now);
    const label = CALENDAR_PROVIDER_LABELS[provider];
    return admins.map((username) => ({
        username,
        kind: 'calendar_sync_issue',
        title: `Calendar sync stopped: ${label}`,
        body: ADMIN_ERROR_MESSAGES[code] ?? ADMIN_ERROR_MESSAGES.provider_error,
        entityModule: ADMIN_INTEGRATIONS_ENTITY_MODULE,
        entityId: provider,
        actor: 'system',
        dedupeKey: `calendar_sync_issue:${provider}:${code}:${date}:${username.toLowerCase()}`,
    }));
}

/** Notification rows for the daily digest of people whose calendar sync has a problem. Pure. */
export function userIssuesDigest(admins: readonly string[], count: number, now: Date): NotificationInput[] {
    if (count < 1) return [];
    const date = businessDateOf(now);
    return admins.map((username) => ({
        username,
        kind: 'calendar_sync_issue',
        title: count === 1 ? "1 person's calendar isn't syncing" : `${count} people's calendars aren't syncing`,
        body: 'Open Admin › API Integrations › People to see why.',
        entityModule: ADMIN_INTEGRATIONS_ENTITY_MODULE,
        entityId: PEOPLE_CALENDAR_PROBLEMS_ENTITY_ID,
        actor: 'system',
        dedupeKey: `calendar_sync_issue:users:${date}:${username.toLowerCase()}`,
    }));
}

/** Best effort: an app-level problem to every admin (never throws). */
export async function notifyAppIssue(provider: CalendarProvider, code: TokenErrorCode, now: Date = new Date()): Promise<void> {
    try {
        await notify(appIssueNotifications(await adminRecipients(), provider, code, now));
    } catch (err) {
        logger.warn({ provider, code, err: (err as Error).message }, 'Could not write the calendar_sync_issue notification');
    }
}
