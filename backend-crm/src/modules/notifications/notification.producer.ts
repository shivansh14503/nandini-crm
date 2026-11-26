import { logger } from '../../config/logger.js';
import { prisma, type TransactionClient } from '../../config/prisma.js';
import { redis } from '../../config/redis.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { CACHE_KEYS, cacheService } from '../../services/cache.service.js';
import { isUniqueViolation } from '../../utils/prismaErrors.js';
import { truncate } from './notification.format.js';
import { withoutMutedRecipients } from './notification.preferences.js';

/**
 * Writes Notification rows (the navbar bell). Every row carries a dedupe key, one per event and recipient
 * (notification.reminders.ts builds them), so producing the same event twice (a retried job, two worker processes,
 * a sweep after the delayed job) never notifies twice. SQL Server has no `skipDuplicates`: the keys already stored are
 * read first and only the missing rows are inserted, in chunks under the 2,100-parameter limit.
 *
 * Every row goes through `withoutMutedRecipients` first: a recipient who turned that kind off in My Profile ›
 * Notifications gets no row (kinds without a switch, such as `calendar_reconnect`, always deliver).
 */

/**
 * `calendar_reconnect` (Calendar Phase 2 P2-2): an employee's calendar connection needs a reconnect (entityModule
 * `calendar-connections`, entityId the connection id; it opens the Connected calendars page).
 */
export const NOTIFICATION_KINDS = ['activity_reminder', 'activity_assigned', 'activity_invited', 'contract_renewal', 'calendar_reconnect'] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export interface NotificationInput {
    /** Recipient (username). */
    username: string;
    kind: NotificationKind;
    title: string;
    body?: string | null;
    /** CrmModuleKey of the record it is about (activities | contracts), or `calendar-connections`, and its id. */
    entityModule?: string | null;
    entityId?: string | null;
    /** The moment it is about (activity start, renewal reminder). */
    dueAt?: Date | null;
    /** Who caused it (username) or 'system'. */
    actor?: string | null;
    dedupeKey: string;
}

/** Rows per INSERT: at most 11 parameters each, so 150 rows stay well under SQL Server's 2,100-parameter limit. */
export const NOTIFICATION_INSERT_CHUNK = 150;
/** Dedupe keys read per query (one parameter each). */
export const DEDUPE_KEY_READ_CHUNK = 500;

const TITLE_MAX = 200;
const BODY_MAX = 500;
const KEY_MAX = 200;

/** `items` in slices of at most `size`. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
    if (size < 1) throw new RangeError('chunk size must be at least 1');
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
}

/** Keys compare case-insensitively, as the unique index does under SQL Server's default collation. */
const keyOf = (dedupeKey: string) => dedupeKey.trim().toLowerCase();

/** The first row of each dedupe key. */
export function uniqueByKey(rows: readonly NotificationInput[]): NotificationInput[] {
    const seen = new Set<string>();
    return rows.filter((row) => {
        const key = keyOf(row.dedupeKey);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

/** Columns of one row (texts cut to their column widths; `createdAt` set here so cursor paging is exact). */
export function toNotificationData(row: NotificationInput, now: Date): Prisma.NotificationCreateManyInput {
    return {
        username: row.username,
        kind: row.kind,
        title: truncate(row.title, TITLE_MAX),
        body: row.body ? truncate(row.body, BODY_MAX) : null,
        entityModule: row.entityModule ?? null,
        entityId: row.entityId ?? null,
        dueAt: row.dueAt ?? null,
        actor: row.actor ?? null,
        dedupeKey: row.dedupeKey.slice(0, KEY_MAX),
        createdAt: now,
    };
}

/** What the producer needs from Prisma: the root client or an interactive transaction. */
export type NotificationDb = Pick<TransactionClient, 'notification' | 'userPreference'>;

/** The dedupe keys (lowercased) among `keys` that are already stored. */
export async function storedKeys(db: NotificationDb, keys: readonly string[]): Promise<Set<string>> {
    const found = new Set<string>();
    for (const part of chunk([...new Set(keys)], DEDUPE_KEY_READ_CHUNK)) {
        const rows = await db.notification.findMany({ where: { dedupeKey: { in: part } }, select: { dedupeKey: true } });
        for (const row of rows) found.add(keyOf(row.dedupeKey));
    }
    return found;
}

/**
 * Inserts the rows whose dedupe key isn't stored yet, in chunks of at most NOTIFICATION_INSERT_CHUNK, and returns
 * them. A unique violation (another process inserted a key between the read and the insert) is thrown: inside a
 * transaction that rolls it back so the caller can retry; `notify` handles it outside one.
 */
export async function insertMissingNotifications(db: NotificationDb, rows: readonly NotificationInput[], now = new Date()): Promise<NotificationInput[]> {
    const unique = uniqueByKey(rows);
    if (unique.length === 0) return [];
    const allowed = await withoutMutedRecipients(db, unique);
    if (allowed.length === 0) return [];
    const stored = await storedKeys(db, allowed.map((row) => row.dedupeKey));
    const missing = allowed.filter((row) => !stored.has(keyOf(row.dedupeKey)));
    for (const part of chunk(missing, NOTIFICATION_INSERT_CHUNK)) {
        await db.notification.createMany({ data: part.map((row) => toNotificationData(row, now)) });
    }
    return missing;
}

/** Drops the cached unread counts of these users (after their notifications changed). */
export async function invalidateUnreadCounts(usernames: Iterable<string>): Promise<void> {
    const keys = [...new Set([...usernames].map((username) => CACHE_KEYS.notificationsUnread(username)))];
    if (keys.length > 0) await cacheService.invalidate(...keys);
}

/** Drops every user's cached unread count (nightly job; Redis reconnect). */
export function invalidateAllUnreadCounts(): Promise<void> {
    return cacheService.invalidatePattern(CACHE_KEYS.notificationsUnread('*'));
}

let watchingReconnects = false;

/**
 * Invalidations made while Redis was unreachable are lost (`cacheService.invalidate` does nothing then), so on every
 * `ready` of the shared client (start-up and each reconnect) every cached unread count is dropped. Call once per
 * process: the API (`app.ts`) and the standalone worker (`jobs/worker.ts`), since both write notifications.
 */
export function dropUnreadCountsOnRedisReady(): void {
    if (watchingReconnects) return;
    watchingReconnects = true;
    redis.on('ready', () => void invalidateAllUnreadCounts());
}

/**
 * Produces notifications outside a transaction (after a committed write, from the sweep). Rows whose key is already
 * stored are skipped; when a chunk loses a race on the unique key, its rows are inserted one by one and the
 * duplicates count as already sent. Never call it inside a transaction (use `insertMissingNotifications`).
 *
 * Each chunk commits on its own, so a failure partway leaves the earlier chunks stored, and a retry skips their keys
 * (it never sees them as created). So when an insert fails, every recipient of the rows it tried has their cached
 * unread count dropped before the error is thrown (a failed INSERT may also have committed on the server).
 */
export async function notify(rows: readonly NotificationInput[], db: NotificationDb = prisma, now = new Date()): Promise<{ created: number }> {
    const unique = uniqueByKey(rows);
    if (unique.length === 0) return { created: 0 };
    const allowed = await withoutMutedRecipients(db, unique);
    if (allowed.length === 0) return { created: 0 };
    const stored = await storedKeys(db, allowed.map((row) => row.dedupeKey));
    const missing = allowed.filter((row) => !stored.has(keyOf(row.dedupeKey)));
    const created: NotificationInput[] = [];

    try {
        for (const part of chunk(missing, NOTIFICATION_INSERT_CHUNK)) {
            try {
                await db.notification.createMany({ data: part.map((row) => toNotificationData(row, now)) });
                created.push(...part);
            } catch (err) {
                if (!isUniqueViolation(err)) throw err;
                logger.debug({ rows: part.length }, 'Notification batch raced another writer; inserting one by one');
                for (const row of part) {
                    try {
                        await db.notification.create({ data: toNotificationData(row, now) });
                        created.push(row);
                    } catch (rowErr) {
                        if (!isUniqueViolation(rowErr)) throw rowErr;
                    }
                }
            }
        }
    } catch (err) {
        await invalidateUnreadCounts(missing.map((row) => row.username));
        throw err;
    }

    await invalidateUnreadCounts(created.map((row) => row.username));
    return { created: created.length };
}
