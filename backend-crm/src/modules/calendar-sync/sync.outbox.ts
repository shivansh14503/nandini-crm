import type { TransactionClient } from '../../config/prisma.js';
import type { ActivityRow } from '../activities/activity.mapper.js';
import type { ActivityConfig } from '../activities/activity.service.js';
import type { ActivityWriteEvent } from '../activities/activity.writeHook.js';
import { attendeeIdentity } from '../activities/activity.validator.js';
import { calendarSyncFromMeta } from '../integrations/calendarSyncSettings.js';
import { isActivityOnlyFollowupType } from '../shared/followupTypes.js';
import { LIVE_CONNECTION_STATUSES } from './connection.constants.js';
import { isFakeProviderEnabled } from './providers/fakeSwitch.js';
import { parseHeld, resolveAttendeeEmails, serializeHeld } from './sync.attendees.js';
import { CREATE_ELIGIBLE_PAST_MS, INERT_LINK_STATES, type LinkInvites } from './sync.constants.js';
import { requestedIdFor } from './sync.keys.js';

/**
 * The durable push outbox (Calendar Phase 2 spec §8.3, D11, D41, D43). `markActivityForSync` runs inside every activity
 * write's own transaction (through `activityWriteHook.onWrite`), so a committed change always leaves its calendar links
 * dirty (`dirtyAt`) even if the process dies before the push: the after-commit wake-up is only an optimisation and the
 * worker's sweep pushes anything left. It reads and writes only through `tx` and loads no configuration (the caller
 * loaded the activity configuration before the transaction).
 *
 * 1. Nothing pushable changed (remarks, customer response, custom fields) → nothing happens.
 * 2. The owner's connection (admin-managed, addendum §8): the owner's live CalendarConnection row (`pending`, `ok` or
 *    `error`: a row in error keeps its links dirty and pushes after it recovers), its provider switched on, the
 *    owner's user active and not a group login (D43). No live row → the user isn't synced: nothing is written.
 * 3. No organizer link on that connection and the activity is create-eligible → a link is inserted, dirty, with
 *    `invites='send'` only when the actor is the owner; otherwise `withhold` (a private copy, the owner is told,
 *    D41). A `detached` link on that connection (the row was re-activated) is re-attached.
 * 4. Every other live organizer link (any connection: an owner change cancels on the old one) → dirty; `pending`
 *    unless it is `cancelled` / `removed_remote` (the plan needs to know the event is gone).
 *    Attendees a non-owner adds to a link that invites are held (`heldAttendeesJson`) until the owner sends them;
 *    an attendee removed in the CRM leaves the held list.
 * 5. The dirty links and any "invitations held" notice are remembered for `runActivityPostCommit` (keyed by the
 *    written row object, so a rolled-back transaction leaves nothing behind).
 */

/** What `markActivityForSync` reads and writes: an interactive transaction. */
export type OutboxDb = Pick<TransactionClient, 'calendarConnection' | 'activityExternalLink' | 'integrationProvider' | 'user' | 'entityEmail'>;

/** One link left dirty by a write (the push job id carries `dirtyAt`). */
export interface DirtyLink {
    id: string;
    dirtyAt: Date;
}

/** "Invitations held" (D41): someone other than the owner put invitable guests on the owner's calendar event. */
export interface HeldNotice {
    activityId: string;
    owner: string;
    actor: string;
    subject: string;
    /** How many guests wait for the owner. */
    guests: number;
    /** A new private copy (`withhold`) rather than guests added to an event already sent. */
    newCopy: boolean;
}

export interface OutboxResult {
    links: DirtyLink[];
    notices: HeldNotice[];
}

/** Outbox results of written rows, read (and dropped) after commit by `takeOutboxResult`. */
const pending = new WeakMap<object, OutboxResult>();

/** The dirty links / notices a write left for this committed row (each row's result is handed out once). */
export function takeOutboxResult(row: object): OutboxResult | null {
    const result = pending.get(row) ?? null;
    pending.delete(row);
    return result;
}

const lc = (value: string | null | undefined) => (value ?? '').trim().toLowerCase();
const sameUser = (a: string | null | undefined, b: string | null | undefined) => lc(a) !== '' && lc(a) === lc(b);
const time = (value: Date | null | undefined) => value?.getTime() ?? null;

const attendeeKeys = (row: ActivityRow) =>
    row.attendees
        .map((a) => `${attendeeIdentity(a)}|${lc(a.email)}`)
        .sort()
        .join(',');

/**
 * Whether a write changed something calendars show (pure): subject, type, times, all-day, location, status, owner,
 * attendees (who, and a contact's address), reminder, related code / module (the description) or deletion. Remarks,
 * customer response, custom fields and replies never reach calendars.
 */
export function pushableChanged(before: ActivityRow | null, after: ActivityRow): boolean {
    if (!before) return true;
    return (
        before.subject !== after.subject ||
        before.followupType !== after.followupType ||
        time(before.startAt) !== time(after.startAt) ||
        time(before.endAt) !== time(after.endAt) ||
        before.allDay !== after.allDay ||
        (before.location ?? '') !== (after.location ?? '') ||
        before.status !== after.status ||
        !sameUser(before.assignedTo, after.assignedTo) ||
        (before.reminder ?? '') !== (after.reminder ?? '') ||
        (before.relatedCode ?? '') !== (after.relatedCode ?? '') ||
        (before.relatedModule ?? '') !== (after.relatedModule ?? '') ||
        before.isDeleted !== after.isDeleted ||
        attendeeKeys(before) !== attendeeKeys(after)
    );
}

/**
 * Whether a Followup Type goes to calendars (D5, §9.1): never Task / Note; otherwise its option's meta
 * `calendarSync` (missing = on). Without the configuration (or an option no longer listed) only the Task / Note rule
 * applies.
 */
export function isTypeSyncable(followupType: string, config: Pick<ActivityConfig, 'followupTypes'> | null): boolean {
    const activityOnly = isActivityOnlyFollowupType(followupType);
    if (activityOnly) return false;
    const option = config?.followupTypes?.options.find((o) => lc(o.value) === lc(followupType));
    return calendarSyncFromMeta(option?.meta, false);
}

/**
 * Create-eligible (§8.3 step 3): Planned, live, a syncable type, a schedule, not organized outside the CRM, ends after
 * now − 1 day (old activities are never sent: backfills, restores of old rows).
 */
export function isCreateEligible(row: ActivityRow, config: Pick<ActivityConfig, 'followupTypes'> | null, now: Date): boolean {
    if (row.isDeleted || row.status !== 'Planned' || !row.startAt || row.externalOrganizer) return false;
    if (!isTypeSyncable(row.followupType, config)) return false;
    const end = (row.endAt ?? row.startAt).getTime();
    return end > now.getTime() - CREATE_ELIGIBLE_PAST_MS;
}

/** The owner's live calendar connection row (§8.3 step 2), read through `tx`; null when the owner isn't synced. */
export async function ownerConnectionOf(db: OutboxDb, owner: string): Promise<{ id: string; provider: string } | null> {
    const conn = await db.calendarConnection.findFirst({
        where: { username: owner, status: { in: [...LIVE_CONNECTION_STATUSES] } },
        orderBy: { enrolledAt: 'desc' },
        select: { id: true, provider: true },
    });
    if (!conn) return null;
    if (conn.provider === 'fake') {
        if (!isFakeProviderEnabled()) return null;
    } else {
        const provider = await db.integrationProvider.findUnique({ where: { provider: conn.provider }, select: { enabled: true } });
        if (!provider?.enabled) return null;
    }
    const user = await db.user.findUnique({ where: { username: owner }, select: { isActive: true, isGroupUser: true } });
    if (!user?.isActive || user.isGroupUser) return null;
    return conn;
}

/** Attendee rows a write added / removed (by identity). */
function attendeeDelta(before: ActivityRow | null, after: ActivityRow) {
    const was = new Map((before?.attendees ?? []).map((a) => [attendeeIdentity(a), a]));
    const now = new Map(after.attendees.map((a) => [attendeeIdentity(a), a]));
    return {
        added: [...now].filter(([id]) => !was.has(id)).map(([, a]) => a),
        removed: [...was].filter(([id]) => !now.has(id)).map(([, a]) => a),
    };
}

/** Attendees other than the owner (who could get an invitation). */
const guestCount = (row: ActivityRow) => row.attendees.filter((a) => !(a.kind === 'user' && sameUser(a.username, row.assignedTo))).length;

export async function markActivityForSync(db: OutboxDb, event: ActivityWriteEvent): Promise<OutboxResult | null> {
    const { before, after, actor, now, config } = event;
    if (!event.markSync || !pushableChanged(before, after)) return null;

    const owner = after.assignedTo;
    const ownerConn = await ownerConnectionOf(db, owner);
    const links = before ? await db.activityExternalLink.findMany({ where: { activityId: after.id, role: 'organizer' } }) : [];
    if (!ownerConn && links.length === 0) return null;

    const result: OutboxResult = { links: [], notices: [] };
    const actorIsOwner = sameUser(actor, owner);
    const eligible = isCreateEligible(after, config, now);
    const ownerLink = ownerConn ? links.find((l) => l.connectionId === ownerConn.id) : undefined;

    if (ownerConn && !ownerLink && eligible) {
        const invites: LinkInvites = actorIsOwner ? 'send' : 'withhold';
        const created = await db.activityExternalLink.create({
            data: {
                activityId: after.id,
                connectionId: ownerConn.id,
                provider: ownerConn.provider,
                role: 'organizer',
                state: 'pending',
                invites,
                requestedId: requestedIdFor(after.id, ownerConn.id, 0),
                dirtyAt: now,
            },
            select: { id: true },
        });
        result.links.push({ id: created.id, dirtyAt: now });
        const guests = guestCount(after);
        if (invites === 'withhold' && guests > 0) result.notices.push({ activityId: after.id, owner, actor, subject: after.subject, guests, newCopy: true });
    }

    const delta = attendeeDelta(before, after);
    const needsHeld = !actorIsOwner && (delta.added.length > 0 || delta.removed.length > 0);
    const deltaEmails = needsHeld || delta.removed.length > 0 ? await resolveAttendeeEmails(db, [...delta.added, ...delta.removed], owner) : null;

    for (const link of links) {
        const reattach = link.state === 'detached' && ownerConn !== null && link.connectionId === ownerConn.id && (eligible || Boolean(link.externalEventId));
        if (INERT_LINK_STATES.has(link.state) && !reattach) continue;

        let held = parseHeld(link.heldAttendeesJson);
        const heldBefore = held.length;
        if (deltaEmails && link.invites === 'send') {
            const removed = new Set(delta.removed.map((a) => deltaEmails.emailOf.get(a) ?? '').filter(Boolean));
            held = held.filter((email) => !removed.has(email));
            if (!actorIsOwner && link.connectionId === ownerConn?.id) {
                const added = delta.added.map((a) => deltaEmails.emailOf.get(a) ?? '').filter(Boolean);
                held = [...new Set([...held, ...added])];
            }
        }
        const heldJson = serializeHeld(held);
        const keepState = link.state === 'cancelled' || link.state === 'removed_remote';
        await db.activityExternalLink.update({
            where: { id: link.id },
            data: {
                dirtyAt: now,
                ...(keepState ? {} : { state: 'pending' }),
                heldAttendeesJson: heldJson,
                ...(reattach || link.state === 'error' ? { attempts: 0, nextAttemptAt: null } : {}),
            },
        });
        result.links.push({ id: link.id, dirtyAt: now });
        if (held.length > heldBefore) {
            result.notices.push({ activityId: after.id, owner, actor, subject: after.subject, guests: held.length - heldBefore, newCopy: false });
        }
    }

    if (result.links.length === 0 && result.notices.length === 0) return null;
    pending.set(after, result);
    return result;
}
