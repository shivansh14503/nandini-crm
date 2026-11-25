import { z } from 'zod';
import { booleanQuery } from '../../validators/common.js';

/** Page size of the bell list. */
export const NOTIFICATION_PAGE_DEFAULT = 20;
export const NOTIFICATION_PAGE_MAX = 50;

export const CURSOR_MESSAGE = 'before must be a cursor returned as nextCursor (<createdAt ISO>|<id>).';

/** Keyset cursor of the bell list: the last row's `createdAt` and `id` (newest first). */
export interface NotificationCursor {
    createdAt: Date;
    id: string;
}

export const formatNotificationCursor = (row: { createdAt: Date; id: string }): string => `${row.createdAt.toISOString()}|${row.id}`;

/** `2026-11-25T04:30:00.000Z|<id>` → cursor, or null when malformed. */
export function parseNotificationCursor(value: string): NotificationCursor | null {
    const at = value.indexOf('|');
    if (at <= 0) return null;
    const iso = value.slice(0, at);
    const id = value.slice(at + 1).trim();
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(iso) || !id || id.length > 50) return null;
    const createdAt = new Date(iso);
    return Number.isNaN(createdAt.getTime()) ? null : { createdAt, id };
}

const blankToUndefined = (value: unknown) => (value === null || value === '' ? undefined : value);

/** `GET /api/notifications?unreadOnly&limit&before` */
export const notificationListQuerySchema = z.object({
    unreadOnly: booleanQuery,
    limit: z.preprocess(
        blankToUndefined,
        z.coerce
            .number({ error: `limit must be a whole number from 1 to ${NOTIFICATION_PAGE_MAX}.` })
            .int({ error: `limit must be a whole number from 1 to ${NOTIFICATION_PAGE_MAX}.` })
            .min(1, { error: `limit must be a whole number from 1 to ${NOTIFICATION_PAGE_MAX}.` })
            .max(NOTIFICATION_PAGE_MAX, { error: `limit must be a whole number from 1 to ${NOTIFICATION_PAGE_MAX}.` })
            .default(NOTIFICATION_PAGE_DEFAULT),
    ),
    before: z.preprocess(
        blankToUndefined,
        z
            .string({ error: CURSOR_MESSAGE })
            .max(120, { error: CURSOR_MESSAGE })
            .transform((value, ctx) => {
                const cursor = parseNotificationCursor(value);
                if (!cursor) {
                    ctx.addIssue({ code: 'custom', message: CURSOR_MESSAGE });
                    return z.NEVER;
                }
                return cursor;
            })
            .optional(),
    ),
});

export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;
