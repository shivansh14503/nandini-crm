import { IN_APP_NOTIFICATION_KINDS, IN_APP_PREFERENCE_COLUMN, isConfigurableKind, type InAppPreferenceColumn } from '../preferences/preferences.constants.js';
import { chunk, DEDUPE_KEY_READ_CHUNK, type NotificationDb, type NotificationInput } from './notification.producer.js';

/**
 * The bell kinds each user turned off (My Profile › Notifications), applied by the producer to every row it writes:
 * a muted kind gets no row at all. Kinds without a UserPreference column (`calendar_reconnect`) always deliver and
 * cost no query. Users without a row have every kind on.
 */

const usernameOf = (username: string) => username.trim().toLowerCase();

const PREFERENCE_COLUMNS = Object.fromEntries(IN_APP_NOTIFICATION_KINDS.map((kind) => [IN_APP_PREFERENCE_COLUMN[kind], true])) as Record<InAppPreferenceColumn, true>;

/**
 * `rows` without those whose recipient turned their kind off. One batched read of the recipients' preferences per
 * DEDUPE_KEY_READ_CHUNK usernames, and none when no row is of a configurable kind. Usernames compare lower-cased (as
 * SQL Server's default collation does). Inside the reminder-claim transaction `db` is that transaction.
 */
export async function withoutMutedRecipients(db: NotificationDb, rows: readonly NotificationInput[]): Promise<NotificationInput[]> {
    const usernames = [...new Set(rows.filter((row) => isConfigurableKind(row.kind)).map((row) => usernameOf(row.username)))];
    if (usernames.length === 0) return [...rows];

    const muted = new Map<string, Set<InAppPreferenceColumn>>();
    for (const part of chunk(usernames, DEDUPE_KEY_READ_CHUNK)) {
        const prefs = await db.userPreference.findMany({
            where: { user: { username: { in: part } } },
            select: { user: { select: { username: true } }, ...PREFERENCE_COLUMNS },
        });
        for (const pref of prefs) {
            const off = new Set((Object.keys(PREFERENCE_COLUMNS) as InAppPreferenceColumn[]).filter((column) => pref[column] === false));
            if (off.size > 0) muted.set(usernameOf(pref.user.username), off);
        }
    }
    if (muted.size === 0) return [...rows];

    return rows.filter((row) => !isConfigurableKind(row.kind) || !muted.get(usernameOf(row.username))?.has(IN_APP_PREFERENCE_COLUMN[row.kind]));
}
