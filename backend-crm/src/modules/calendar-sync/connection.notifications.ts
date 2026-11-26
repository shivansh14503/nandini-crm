import type { NotificationInput } from '../notifications/notification.producer.js';
import { CALENDAR_CONNECTIONS_ENTITY_MODULE, CALENDAR_PROVIDER_LABELS, isCalendarProvider } from './connection.constants.js';

/**
 * `calendar_reconnect` notifications (spec §4.7, D38): the bell tells an employee their calendar needs a reconnect.
 * They open My Profile › Connected accounts (notificationHref: entityModule `calendar-connections`). Pure.
 *
 * Dedupe keys are per grant: they carry the connection's `connectedAt` (set again by every connect or reconnect, never
 * by a token refresh), because a reconnect of the same account re-activates the same row (same id). So a reconnected
 * calendar warns again. One per grant and ISO week for a refused sign-in or a changed company app (re-armed weekly
 * from P2-3b's nightly step), and one per grant for "your time-limited access ends soon".
 */

export type ReconnectCause = 'invalid_grant' | 'client_changed' | 'grant_expired' | 'expiring';

/** `2026-W48` (ISO 8601 week, UTC). Pure. */
export function isoWeekKey(date: Date): string {
    const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const weekday = day.getUTCDay() || 7;
    day.setUTCDate(day.getUTCDate() + 4 - weekday);
    const yearStart = Date.UTC(day.getUTCFullYear(), 0, 1);
    const week = Math.ceil(((day.getTime() - yearStart) / 86_400_000 + 1) / 7);
    return `${day.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

const labelOf = (provider: string) => (isCalendarProvider(provider) ? CALENDAR_PROVIDER_LABELS[provider] : 'calendar');

/** The connection fields a `calendar_reconnect` notification needs. */
export interface ReconnectRow {
    id: string;
    username: string;
    provider: string;
    /** When this grant was made (connect / reconnect); scopes the dedupe key to the grant. */
    connectedAt: Date;
}

/** `calendar_reconnect:<id>:<connectedAt ms>:expiring` or `calendar_reconnect:<id>:<connectedAt ms>:<ISO week>`. Pure. */
export function reconnectDedupeKey(row: Pick<ReconnectRow, 'id' | 'connectedAt'>, cause: ReconnectCause, now: Date): string {
    const grant = `calendar_reconnect:${row.id}:${row.connectedAt.getTime()}`;
    return cause === 'expiring' ? `${grant}:expiring` : `${grant}:${isoWeekKey(now)}`;
}

export function reconnectNotification(
    row: ReconnectRow,
    cause: ReconnectCause,
    now: Date,
    accessEndsAt?: Date | null,
): NotificationInput {
    const label = labelOf(row.provider);
    const texts: Record<ReconnectCause, { title: string; body: string }> = {
        invalid_grant: {
            title: `Reconnect your ${label}`,
            body: 'Your sign-in expired or was removed. Reconnect it so your CRM meetings keep reaching your calendar.',
        },
        client_changed: {
            title: `Reconnect your ${label}`,
            body: "The company's calendar app was changed by an admin. Reconnect your calendar to keep it in sync.",
        },
        grant_expired: {
            title: `Reconnect your ${label}`,
            body: 'The time-limited access you gave the CRM has ended. Reconnect your calendar to keep it in sync.',
        },
        expiring: {
            title: `Your ${label} access ends soon`,
            body: 'You gave the CRM time-limited access. Reconnect before it ends so your calendar stays in sync.',
        },
    };
    return {
        username: row.username,
        kind: 'calendar_reconnect',
        title: texts[cause].title,
        body: texts[cause].body,
        entityModule: CALENDAR_CONNECTIONS_ENTITY_MODULE,
        entityId: row.id,
        dueAt: cause === 'expiring' ? (accessEndsAt ?? null) : null,
        actor: 'system',
        dedupeKey: reconnectDedupeKey(row, cause, now),
    };
}
