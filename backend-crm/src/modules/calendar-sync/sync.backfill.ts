import { ENV } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { prisma } from '../../config/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { isUniqueViolation } from '../../utils/prismaErrors.js';
import type { ActivityRow } from '../activities/activity.mapper.js';
import { loadActivityConfig, WITH_ATTENDEES, type ActivityConfig } from '../activities/activity.service.js';
import { loadCalendarSettings } from '../integrations/integration.settings.js';
import { lockRecords, runInTransaction } from '../shared/transactions.js';
import { BACKFILL_PAGE_SIZE, type LinkInvites } from './sync.constants.js';
import { requestedIdFor } from './sync.keys.js';
import { isCreateEligible } from './sync.outbox.js';

/**
 * The first-sync backfill (Calendar Phase 2 spec D23, §8.12; admin-managed model: addendum §8.3, P2-3c). When a
 * person's CalendarConnection row first reaches `ok` (its `enrolled` job), their upcoming CRM activities are copied to
 * the calendar:
 *
 * - Which: owned by the person, Planned, create-eligible (a syncable type with a schedule, not organized outside the
 *   CRM), not over yet (ends after now) and starting within the company's `backfillDays` (30 / 60 / 90, Admin › API
 *   Integrations). Activities that already have a link on this row (saved while it was pending) are left alone.
 * - How: one organizer link per activity, dirty, pushed by the same `enrolled` job right after (100 per round,
 *   ENROLLED_PUSH_BATCH, one provider call at a time under the row's lease). An activity with guests becomes a
 *   **private copy** (`invites='withhold'`: no attendees on the event, nobody is mailed), so switching a provider on
 *   never sends customers a burst of invitations for meetings they already know about; its owner presses
 *   **Send invitations** in the activity drawer when they want the guests invited. An activity without guests gets
 *   `send` (there is nobody to mail; guests the owner adds later are invited, guests someone else adds are held, D41).
 * - No activity row is written (no audit entry, no `updatedAt` change); the links are the engine's own rows.
 * - One run stamp per row, kept across runs: the first run claims it by writing `backfilledAt` (compare-and-set on
 *   `backfilledAt IS NULL`) before it inserts anything; a run started again (a crash, a failed last write, the
 *   listener's and the poll's `enrolled` jobs at once) reads the stamp already there and uses it. Every backfilled
 *   link's `createdAt` is that stamp, which is how the drawer tells a backfilled private copy ("copied when your
 *   calendar was connected") from one someone else made (sync.view.ts).
 * - Done = `backfillCount` written (the number of organizer links on the row carrying the stamp, so it counts every
 *   run's copies, not only the last run's). Until then the row counts as not backfilled: the `enrolled` job and the
 *   poll tick's recovery (sync.maintenance.ts) run it again, and the profile card says the copy is under way.
 * - Idempotent: links are inserted in short transactions under the activities' record locks, after a re-read of the
 *   links that already exist (D45: a unique-index race aborts the transaction, which is run once more from the start,
 *   and the re-read then finds the row).
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const lc = (value: string | null | undefined) => (value ?? '').trim().toLowerCase();

/** Guests of an activity (attendees other than its owner): the people a sent invitation would mail. */
export const backfillGuestCount = (row: Pick<ActivityRow, 'assignedTo' | 'attendees'>): number =>
    row.attendees.filter((a) => !(a.kind === 'user' && lc(a.username) === lc(row.assignedTo))).length;

/** The window the backfill copies: activities not over at `now` and starting before `now + days`. Pure. */
export function backfillWindow(now: Date, days: number): { from: Date; to: Date } {
    return { from: now, to: new Date(now.getTime() + days * DAY_MS) };
}

export interface BackfillItem {
    activityId: string;
    invites: LinkInvites;
}

/**
 * Which of `rows` get a link and with which invitations (pure): create-eligible, not over at `now`, starting inside the
 * window, not linked on this row yet; `withhold` when the activity has guests (D23), else `send`.
 */
export function planBackfill(
    rows: readonly ActivityRow[],
    linked: ReadonlySet<string>,
    config: Pick<ActivityConfig, 'followupTypes'> | null,
    now: Date,
    days: number,
): BackfillItem[] {
    const { to } = backfillWindow(now, days);
    const out: BackfillItem[] = [];
    for (const row of rows) {
        if (linked.has(row.id) || !row.startAt) continue;
        if (!isCreateEligible(row, config, now)) continue;
        const end = (row.endAt ?? row.startAt).getTime();
        if (end <= now.getTime() || row.startAt.getTime() >= to.getTime()) continue;
        out.push({ activityId: row.id, invites: backfillGuestCount(row) > 0 ? 'withhold' : 'send' });
    }
    return out;
}

export type BackfillResult =
    /** Nothing done: kill switch off, row gone / not `ok` / already backfilled, or the user inactive. */
    | { status: 'skipped'; reason: string }
    /** `created` / `withheld`: links this run inserted; `copied`: every link of the row's backfill (all runs). */
    | { status: 'done'; created: number; withheld: number; copied: number };

export interface BackfillOptions {
    now?: Date;
}

/** Inserts the planned links of one page (D45: never catches the unique index inside the transaction). */
async function insertLinks(
    connection: { id: string; provider: string; username: string },
    items: readonly BackfillItem[],
    now: Date,
    stamp: Date,
): Promise<BackfillItem[]> {
    const ids = items.map((i) => i.activityId);
    return runInTransaction(async (tx) => {
        await lockRecords(tx, 'activity', ids);
        const [taken, still] = await Promise.all([
            tx.activityExternalLink.findMany({ where: { connectionId: connection.id, activityId: { in: ids } }, select: { activityId: true } }),
            // Changed since the page was read (deleted, reassigned, no longer planned): left out.
            tx.activity.findMany({ where: { id: { in: ids }, isDeleted: false, status: 'Planned', assignedTo: connection.username }, select: { id: true } }),
        ]);
        const takenIds = new Set(taken.map((l) => l.activityId));
        const live = new Set(still.map((a) => a.id));
        const fresh = items.filter((i) => !takenIds.has(i.activityId) && live.has(i.activityId));
        for (const item of fresh) {
            await tx.activityExternalLink.create({
                data: {
                    activityId: item.activityId,
                    connectionId: connection.id,
                    provider: connection.provider,
                    role: 'organizer',
                    state: 'pending',
                    invites: item.invites,
                    requestedId: requestedIdFor(item.activityId, connection.id, 0),
                    dirtyAt: now,
                    createdAt: stamp,
                },
                select: { id: true },
            });
        }
        return fresh;
    });
}

/**
 * Runs the backfill of one connection row (the `enrolled` job calls it before pushing the row's dirty links). Reads
 * the company settings and the activity configuration once, before any transaction.
 */
export async function runBackfill(connectionId: string, options: BackfillOptions = {}): Promise<BackfillResult> {
    if (!ENV.INTEGRATIONS.SYNC_ENABLED) return { status: 'skipped', reason: 'sync_disabled' };
    const now = options.now ?? new Date();
    const connection = await prisma.calendarConnection.findUnique({
        where: { id: connectionId },
        select: { id: true, username: true, provider: true, status: true, backfilledAt: true, backfillCount: true },
    });
    if (!connection) return { status: 'skipped', reason: 'gone' };
    if (connection.backfillCount !== null) return { status: 'skipped', reason: 'already_done' };
    if (connection.status !== 'ok') return { status: 'skipped', reason: `status_${connection.status}` };
    const user = await prisma.user.findUnique({ where: { username: connection.username }, select: { isActive: true, isGroupUser: true } });
    if (!user?.isActive || user.isGroupUser) return { status: 'skipped', reason: 'user_inactive' };

    const [settings, config] = await Promise.all([loadCalendarSettings(), loadActivityConfig()]);
    const stamp = await claimStamp(connection.id, connection.backfilledAt, now);
    if (!stamp) return { status: 'skipped', reason: 'gone' };
    const { to } = backfillWindow(now, settings.backfillDays);
    let created = 0;
    let withheld = 0;
    let after: { startAt: Date; id: string } | null = null;
    for (;;) {
        // Keyset pages in (startAt, id) order on the [isDeleted, assignedTo, startAt] index.
        const keyset: Prisma.ActivityWhereInput[] = after
            ? [{ OR: [{ startAt: { gt: after.startAt } }, { startAt: after.startAt, id: { gt: after.id } }] }]
            : [];
        const page = (await prisma.activity.findMany({
            where: {
                AND: [
                    {
                        isDeleted: false,
                        assignedTo: connection.username,
                        status: 'Planned',
                        externalOrganizer: false,
                        startAt: { not: null, lt: to },
                        OR: [{ endAt: { gt: now } }, { endAt: null, startAt: { gt: now } }],
                    },
                    ...keyset,
                ],
            },
            include: WITH_ATTENDEES,
            orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
            take: BACKFILL_PAGE_SIZE,
        })) as ActivityRow[];
        if (page.length === 0) break;
        const linked = await prisma.activityExternalLink.findMany({
            where: { connectionId: connection.id, activityId: { in: page.map((a) => a.id) } },
            select: { activityId: true },
        });
        const items = planBackfill(page, new Set(linked.map((l) => l.activityId)), config, now, settings.backfillDays);
        if (items.length > 0) {
            let inserted: BackfillItem[];
            try {
                inserted = await insertLinks(connection, items, now, stamp);
            } catch (err) {
                // D45: an activity saved at the same moment created its link first; the second run's re-read finds it.
                if (!isUniqueViolation(err)) throw err;
                inserted = await insertLinks(connection, items, now, stamp);
            }
            created += inserted.length;
            withheld += inserted.filter((i) => i.invites === 'withhold').length;
        }
        if (page.length < BACKFILL_PAGE_SIZE) break;
        const last = page[page.length - 1];
        after = { startAt: last.startAt as Date, id: last.id };
    }

    // Every run's copies carry the stamp ([connectionId, state] index prefix, then the row's links only).
    const copied = await prisma.activityExternalLink.count({ where: { connectionId: connection.id, role: 'organizer', createdAt: stamp } });
    await prisma.calendarConnection.updateMany({ where: { id: connection.id, backfillCount: null }, data: { backfillCount: copied } });
    logger.info({ connectionId, created, withheld, copied, days: settings.backfillDays }, 'Calendar first-sync backfill done');
    return { status: 'done', created, withheld, copied };
}

/**
 * The row's backfill stamp: the one an earlier (unfinished or concurrent) run wrote, else `now`, claimed with a
 * compare-and-set so two runs at once end up with the same stamp. Null when the row is gone.
 */
async function claimStamp(connectionId: string, existing: Date | null, now: Date): Promise<Date | null> {
    if (existing) return existing;
    const claimed = await prisma.calendarConnection.updateMany({ where: { id: connectionId, backfilledAt: null }, data: { backfilledAt: now } });
    if (claimed.count === 1) return now;
    const row = await prisma.calendarConnection.findUnique({ where: { id: connectionId }, select: { backfilledAt: true } });
    return row?.backfilledAt ?? null;
}
