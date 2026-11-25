import { prisma } from '../../config/prisma.js';
import type { Notification, Prisma } from '../../generated/prisma/client.js';
import { CACHE_KEYS, cacheService } from '../../services/cache.service.js';
import type { AuthUser } from '../../types/user.types.js';
import { HttpError } from '../../utils/httpError.js';
import { text, toIso } from '../../utils/mappers.js';
import { invalidateUnreadCounts } from './notification.producer.js';
import { formatNotificationCursor, notificationListQuerySchema } from './notification.validator.js';

/**
 * The signed-in user's notifications (navbar bell). Personal rows: every query is limited to `username =` the caller,
 * nothing is audited. The unread count is cached in Redis (an open tab polls it every minute, which must not keep
 * Azure SQL Serverless awake); every write to a user's notifications drops their cached count.
 */

/** Seconds the unread count stays cached (writes invalidate it sooner). */
export const UNREAD_COUNT_TTL_SECONDS = 60 * 60;

/** `Notification` in frontend-crm/src/types: empty values are '' (not null). */
export interface NotificationDto {
    id: string;
    /** activity_reminder | activity_assigned | activity_invited | contract_renewal */
    kind: string;
    title: string;
    body: string;
    /** activities | contracts, '' when none. */
    entityModule: string;
    entityId: string;
    /** ISO instant the notification is about (activity start, renewal reminder), '' when none. */
    dueAt: string;
    /** Username of who caused it, or 'system'. */
    actor: string;
    /** ISO instant, '' while unread. */
    readAt: string;
    createdAt: string;
    /** Where a click goes in the app, '' when nowhere. */
    href: string;
}

export interface NotificationPage {
    data: NotificationDto[];
    /** Pass as `before` for the next (older) page; null on the last page. */
    nextCursor: string | null;
    unreadCount: number;
}

/** App route of the record a notification is about: activities open in the calendar's drawer. */
export function notificationHref(entityModule: string | null, entityId: string | null): string {
    if (!entityId) return '';
    const id = encodeURIComponent(entityId);
    if (entityModule === 'activities') return `/calendar?activity=${id}`;
    if (entityModule === 'contracts') return `/contracts/${id}`;
    return '';
}

export function toNotificationDto(row: Notification): NotificationDto {
    return {
        id: row.id,
        kind: row.kind,
        title: row.title,
        body: text(row.body),
        entityModule: text(row.entityModule),
        entityId: text(row.entityId),
        dueAt: row.dueAt ? toIso(row.dueAt) : '',
        actor: text(row.actor),
        readAt: row.readAt ? toIso(row.readAt) : '',
        createdAt: toIso(row.createdAt),
        href: notificationHref(row.entityModule, row.entityId),
    };
}

/** The user's unread count, from Redis when cached (falls through to SQL while Redis is down). */
function unreadCountOf(username: string): Promise<number> {
    return cacheService.getOrSet(CACHE_KEYS.notificationsUnread(username), UNREAD_COUNT_TTL_SECONDS, () =>
        prisma.notification.count({ where: { username, readAt: null } }),
    );
}

export const notificationService = {
    /** `GET /`: newest first, keyset-paged by (createdAt, id). */
    async list(query: unknown, user: AuthUser): Promise<NotificationPage> {
        const { unreadOnly, limit, before } = notificationListQuerySchema.parse(query ?? {});
        const and: Prisma.NotificationWhereInput[] = [{ username: user.username }];
        if (unreadOnly) and.push({ readAt: null });
        if (before) and.push({ OR: [{ createdAt: { lt: before.createdAt } }, { createdAt: before.createdAt, id: { lt: before.id } }] });
        const [rows, unreadCount] = await Promise.all([
            prisma.notification.findMany({ where: { AND: and }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1 }),
            unreadCountOf(user.username),
        ]);
        const page = rows.slice(0, limit);
        return {
            data: page.map(toNotificationDto),
            nextCursor: rows.length > limit ? formatNotificationCursor(page[page.length - 1]) : null,
            unreadCount,
        };
    },

    /** `GET /unread-count` (polled by the bell). */
    async unreadCount(user: AuthUser): Promise<{ count: number }> {
        return { count: await unreadCountOf(user.username) };
    },

    /** `POST /:id/read`: idempotent; an already-read notification keeps its first read time. */
    async markRead(id: string, user: AuthUser): Promise<{ id: string; readAt: string }> {
        const row = await prisma.notification.findFirst({ where: { id, username: user.username }, select: { id: true, readAt: true } });
        if (!row) throw HttpError.notFound('Notification not found');
        if (row.readAt) return { id: row.id, readAt: toIso(row.readAt) };
        const now = new Date();
        const { count } = await prisma.notification.updateMany({ where: { id, username: user.username, readAt: null }, data: { readAt: now } });
        if (count === 0) {
            // Read in another tab in the meantime.
            const again = await prisma.notification.findFirst({ where: { id, username: user.username }, select: { readAt: true } });
            return { id, readAt: again?.readAt ? toIso(again.readAt) : toIso(now) };
        }
        await invalidateUnreadCounts([user.username]);
        return { id, readAt: toIso(now) };
    },

    /** `POST /read-all` */
    async markAllRead(user: AuthUser): Promise<{ updated: number }> {
        const { count } = await prisma.notification.updateMany({ where: { username: user.username, readAt: null }, data: { readAt: new Date() } });
        if (count > 0) await invalidateUnreadCounts([user.username]);
        return { updated: count };
    },
};
