import type { NotificationInput } from '../notifications/notification.producer.js';
import { ADMIN_INTEGRATIONS_ENTITY_MODULE } from './connection.constants.js';
import type { HeldNotice } from './sync.outbox.js';
import { businessDateOf } from './syncIssue.notifications.js';

/**
 * Bell notifications of the push engine (Calendar Phase 2 spec §4.7; admin-managed model: addendum §8). Pure builders;
 * the callers pass the rows to `notify()` (dedupe keys make repeats harmless; each key ends with the recipient's
 * lower-cased username, like `calendar_sync_issue`). All three are system kinds: no preference switch, they always
 * deliver.
 *   - `calendar_sync_error` → the activity's owner: the calendar refused a change of one activity (once per activity
 *     and business day). Connection-wide problems stay admin-only (`calendar_sync_issue`).
 *   - `calendar_invites_held` → the owner (D41): someone else put guests on the owner's event; nobody was invited.
 *   - `integration_secret_expiring` → every admin: a provider's client secret expires within 30 days (once a week).
 */

const PROVIDER_LABEL: Readonly<Record<string, string>> = { google: 'Google Calendar', microsoft: 'Outlook', fake: 'Test calendar' };
export const calendarLabel = (provider: string) => PROVIDER_LABEL[provider] ?? 'your calendar';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const lc = (value: string) => value.trim().toLowerCase();

/** ISO week of a `YYYY-MM-DD` day, as `2026-W48` (Monday-based; the week of its Thursday). Pure. */
export function isoWeekKey(day: string): string {
    const date = new Date(`${day}T00:00:00Z`);
    const weekday = (date.getUTCDay() + 6) % 7; // Monday = 0
    date.setUTCDate(date.getUTCDate() - weekday + 3); // Thursday of this week
    const year = date.getUTCFullYear();
    const firstThursday = new Date(Date.UTC(year, 0, 4));
    firstThursday.setUTCDate(firstThursday.getUTCDate() - ((firstThursday.getUTCDay() + 6) % 7) + 3);
    const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60_000));
    return `${year}-W${String(week).padStart(2, '0')}`;
}

/** `calendar_sync_error`: the calendar refused a change (one per activity, owner and business day). */
export function syncErrorNotification(input: { activityId: string; owner: string; subject: string; provider: string; now: Date }): NotificationInput {
    return {
        username: input.owner,
        kind: 'calendar_sync_error',
        title: `Couldn't update ${calendarLabel(input.provider)}: ${input.subject}`,
        body: 'The calendar refused the last change. It is tried again after your next edit, or overnight.',
        entityModule: 'activities',
        entityId: input.activityId,
        actor: 'system',
        dedupeKey: `calendar_sync_error:${input.activityId}:${businessDateOf(input.now)}:${lc(input.owner)}`,
    };
}

/**
 * `calendar_invites_held` (D41): someone else put invitable guests on the owner's calendar event; nothing went to
 * them. "Asha added a meeting with 2 guests to your calendar. Invitations go out when you send them."
 */
export function invitesHeldNotification(notice: HeldNotice, actorName: string, now: Date): NotificationInput {
    const guests = plural(notice.guests, 'guest', 'guests');
    const title = notice.newCopy ? `${actorName} added a meeting with ${guests} to your calendar` : `${actorName} added ${guests} to ${notice.subject}`;
    return {
        username: notice.owner,
        kind: 'calendar_invites_held',
        title,
        body: notice.newCopy ? `${notice.subject}. Invitations go out when you send them.` : "They haven't been invited yet. Invitations go out when you send them.",
        entityModule: 'activities',
        entityId: notice.activityId,
        actor: notice.actor,
        dedupeKey: `calendar_invites_held:${notice.activityId}:${businessDateOf(now)}:${lc(notice.owner)}`,
    };
}

/** `integration_secret_expiring`: a provider's client secret expires within 30 days (each admin, once a week). */
export function secretExpiringNotifications(admins: readonly string[], input: { provider: string; expiresOn: string; now: Date }): NotificationInput[] {
    const name = input.provider === 'microsoft' ? 'Microsoft' : input.provider === 'google' ? 'Google' : input.provider;
    const week = isoWeekKey(businessDateOf(input.now));
    return admins.map((admin) => ({
        username: admin,
        kind: 'integration_secret_expiring',
        title: `${name} client secret expires on ${input.expiresOn}`,
        body: 'Create a new client secret and paste it in Admin › API Integrations before then, or calendar sync stops.',
        entityModule: ADMIN_INTEGRATIONS_ENTITY_MODULE,
        entityId: input.provider,
        actor: 'system',
        dedupeKey: `integration_secret_expiring:${input.provider}:${input.expiresOn}:${week}:${lc(admin)}`,
    }));
}
