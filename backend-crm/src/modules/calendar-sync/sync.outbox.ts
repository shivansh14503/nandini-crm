import type { TransactionClient } from '../../config/prisma.js';
import type { ActivityRow } from '../activities/activity.mapper.js';
import type { ActivityConfig } from '../activities/activity.service.js';
import type { ActivityWriteEvent } from '../activities/activity.writeHook.js';
import { attendeeIdentity } from '../activities/activity.validator.js';
import { calendarSyncFromMeta } from '../integrations/calendarSyncSettings.js';
import { isActivityOnlyFollowupType } from '../shared/followupTypes.js';
import { SERIES_SYNC_WINDOW_MS } from '../activities/activity.series.constants.js';
import { LIVE_CONNECTION_STATUSES } from './connection.constants.js';
import { isFakeProviderEnabled } from './providers/fakeSwitch.js';
import { heldKeyOf, isHeldIdentity, parseHeld, resolveAttendeeEmails, serializeHeld } from './sync.attendees.js';
import { CREATE_ELIGIBLE_PAST_MS, type LinkInvites } from './sync.constants.js';
import { requestedIdFor } from './sync.keys.js';
import { parseBase } from './sync.shapes.js';

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
 *    D41). A `detached` link on that connection (the row was re-activated) is re-attached (`reattachedState`).
 * 4. Every other organizer link (any connection: an owner change cancels on the old one) → dirty; `pending` unless
 *    it is `cancelled` / `removed_remote` (the plan needs to know the event is gone). `detached` links stay inert and
 *    `unsupported` ones are left alone.
 *    D41 on existing links (`heldChanges`, by address): addresses a non-owner puts on the activity are held
 *    (`heldAttendeesJson`) on every link that sends invitations, detached ones included, until the owner sends them;
 *    an owner change by anyone but the new owner makes the new owner's earlier link a new copy (guests not already
 *    on its event held, or `withhold` when its event is gone); an address removed in the CRM leaves the held lists.
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
    /** Calendar Phase 4: the occurrence's recurring series (one notice per series and day, sync.notifications.ts). */
    seriesId?: string | null;
}

export interface OutboxResult {
    links: DirtyLink[];
    notices: HeldNotice[];
    /** P2-8: connections that get one prompt pull (a restored meeting's invitation copies re-attached: read back there). */
    pulls?: string[];
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
        attendeeKeys(before) !== attendeeKeys(after) ||
        // Calendar Phase 3 (P3-1): a new video link wanted (choice, owner change, Retry) or the meeting removed.
        (before.conferenceProvider ?? null) !== (after.conferenceProvider ?? null) ||
        (before.conferenceRequest ?? 0) !== (after.conferenceRequest ?? 0)
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
 * now − 1 day (old activities are never sent: backfills, restores of old rows). Calendar Phase 4: an occurrence of a
 * recurring series starting more than SERIES_SYNC_WINDOW_DAYS ahead isn't yet (no invitation flood; the series
 * nightly marks occurrences as they come inside the window, activity.series.ts `markSeriesSyncWindow`).
 */
export function isCreateEligible(row: ActivityRow, config: Pick<ActivityConfig, 'followupTypes'> | null, now: Date): boolean {
    if (row.isDeleted || row.status !== 'Planned' || !row.startAt || row.externalOrganizer) return false;
    if (row.seriesId && row.startAt.getTime() > now.getTime() + SERIES_SYNC_WINDOW_MS) return false;
    if (!isTypeSyncable(row.followupType, config)) return false;
    const end = (row.endAt ?? row.startAt).getTime();
    return end > now.getTime() - CREATE_ELIGIBLE_PAST_MS;
}

/** The owner's live calendar connection row (§8.3 step 2), read through `tx`; null when the owner isn't synced. */
export async function ownerConnectionOf(db: Pick<OutboxDb, 'calendarConnection' | 'integrationProvider' | 'user'>, owner: string): Promise<{ id: string; provider: string } | null> {
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

/** The notice's series (Calendar Phase 4), only for an occurrence of one. */
const seriesOf = (row: ActivityRow): Pick<HeldNotice, 'seriesId'> => (row.seriesId ? { seriesId: row.seriesId } : {});

/** Attendees other than the owner (who could get an invitation). */
const guestCount = (row: ActivityRow) => row.attendees.filter((a) => !(a.kind === 'user' && sameUser(a.username, row.assignedTo))).length;

/** The calendar event of this link exists (it isn't gone: `cancelled` / `removed_remote` keep the id of a deleted one). */
const hasLiveEvent = (link: { externalEventId: string | null; state: string }) => Boolean(link.externalEventId) && link.state !== 'cancelled' && link.state !== 'removed_remote';

/**
 * P2-8: what a re-attached invitation copy (attendee link) becomes (a restore, a re-activated connection row): live,
 * with no etag, so the next pull reads it back once (`readReattached`, sync.pull.ts) and applies its current state.
 */
export const REATTACHED_COPY = { state: 'synced', etag: null, dirtyAt: null, nextAttemptAt: null, lastErrorCode: null, lastErrorMessage: null } as const;

/**
 * The state a `detached` link goes back to when its row is re-activated: `cancelled` when the CRM had deleted its
 * event before the row stopped (an event id kept without a base, §8.6), else `pending`. A gone event must not be
 * patched (a 404 there reads as a deletion in the calendar and would cancel the activity).
 */
export function reattachedState(link: { externalEventId: string | null; baseJson: string | null }): 'cancelled' | 'pending' {
    return link.externalEventId && !link.baseJson ? 'cancelled' : 'pending';
}

/**
 * P2-8: a meeting brought back from the bin (Admin › Audit Log restore; imported or CRM-made). Deleting it detached
 * the invitation copies (attendee links) of employees who import, on their next pull. On live connections they are
 * made live again as `synced` with no etag: every pull reads such a copy back once before its listing
 * (`readReattached`, sync.pull.ts), so the copy's current state is applied whatever the cursor or the listing shows (a
 * time moved meanwhile, or a copy cancelled or deleted while the meeting was in the bin). Returns those connection
 * ids, which get one prompt pull (none: nothing was detached). Only on a restore, so it adds no regular database wake-up.
 */
async function reattachAttendeeCopies(db: OutboxDb, activityId: string): Promise<string[]> {
    const detached = await db.activityExternalLink.findMany({ where: { activityId, role: 'attendee', state: 'detached' }, select: { id: true, connectionId: true } });
    if (detached.length === 0) return [];
    const live = await db.calendarConnection.findMany({
        where: { id: { in: [...new Set(detached.map((l) => l.connectionId))] }, status: { in: [...LIVE_CONNECTION_STATUSES] } },
        select: { id: true },
    });
    const liveIds = live.map((c) => c.id);
    if (liveIds.length === 0) return [];
    await db.activityExternalLink.updateMany({
        where: { id: { in: detached.filter((l) => liveIds.includes(l.connectionId)).map((l) => l.id) }, state: 'detached' },
        data: REATTACHED_COPY,
    });
    return liveIds;
}

export async function markActivityForSync(db: OutboxDb, event: ActivityWriteEvent): Promise<OutboxResult | null> {
    const { before, after, actor, now, config } = event;
    if (!event.markSync || !pushableChanged(before, after)) return null;

    const pulls = before?.isDeleted && !after.isDeleted ? await reattachAttendeeCopies(db, after.id) : [];
    const owner = after.assignedTo;
    const ownerConn = await ownerConnectionOf(db, owner);
    const links = before ? await db.activityExternalLink.findMany({ where: { activityId: after.id, role: 'organizer' } }) : [];
    if (!ownerConn && links.length === 0) {
        if (pulls.length === 0) return null;
        const only: OutboxResult = { links: [], notices: [], pulls };
        pending.set(after, only);
        return only;
    }

    const result: OutboxResult = { links: [], notices: [], ...(pulls.length > 0 ? { pulls } : {}) };
    const actorIsOwner = sameUser(actor, owner);
    const eligible = isCreateEligible(after, config, now);
    const ownerLink = ownerConn ? links.find((l) => l.connectionId === ownerConn.id) : undefined;

    if (ownerConn && !ownerLink && eligible) {
        const invites: LinkInvites = actorIsOwner ? 'send' : 'withhold';
        // P2-8: the new owner was an invitee whose copy is linked (attendee role). One link per activity and calendar:
        // that link becomes their organizer link, starting afresh (their invitation copy is the old owner's event).
        const attendeeLink = before ? await db.activityExternalLink.findFirst({ where: { activityId: after.id, connectionId: ownerConn.id, role: 'attendee' }, select: { id: true } }) : null;
        const fresh = { role: 'organizer', state: 'pending', invites, dirtyAt: now } as const;
        const created = attendeeLink
            ? await db.activityExternalLink.update({
                  where: { id: attendeeLink.id },
                  data: {
                      ...fresh,
                      externalEventId: null,
                      externalEventKey: null,
                      iCalUid: null,
                      etag: null,
                      htmlLink: null,
                      baseJson: null,
                      heldAttendeesJson: null,
                      providerUpdatedAt: null,
                      attempts: 0,
                      nextAttemptAt: null,
                      lastErrorCode: null,
                      lastErrorMessage: null,
                  },
                  select: { id: true },
              })
            : await db.activityExternalLink.create({
                  data: { activityId: after.id, connectionId: ownerConn.id, provider: ownerConn.provider, ...fresh, requestedId: requestedIdFor(after.id, ownerConn.id, 0) },
                  select: { id: true },
              });
        result.links.push({ id: created.id, dirtyAt: now });
        const guests = guestCount(after);
        if (invites === 'withhold' && guests > 0) result.notices.push({ activityId: after.id, ...seriesOf(after), owner, actor, subject: after.subject, guests, newCopy: true });
    }

    const held = await heldChanges(db, links, before, after, actorIsOwner);

    for (const link of links) {
        if (link.state === 'unsupported') continue;
        const reattach = link.state === 'detached' && ownerConn !== null && link.connectionId === ownerConn.id && (eligible || Boolean(link.externalEventId));
        const change = held.get(link.id);
        if (link.state === 'detached' && !reattach) {
            // Inert until its row is re-activated, but who added which guest is still recorded (D41), so the
            // re-attach push never invites people the owner didn't.
            if (change?.changed) await db.activityExternalLink.update({ where: { id: link.id }, data: change.data });
            if (change?.notice) result.notices.push({ activityId: after.id, ...seriesOf(after), owner, actor, subject: after.subject, ...change.notice });
            continue;
        }
        const keepState = link.state === 'cancelled' || link.state === 'removed_remote';
        const state = reattach ? reattachedState(link) : keepState ? null : 'pending';
        await db.activityExternalLink.update({
            where: { id: link.id },
            data: {
                dirtyAt: now,
                ...(state ? { state } : {}),
                ...(change?.changed ? change.data : {}),
                ...(reattach || link.state === 'error' ? { attempts: 0, nextAttemptAt: null } : {}),
            },
        });
        result.links.push({ id: link.id, dirtyAt: now });
        if (change?.notice) result.notices.push({ activityId: after.id, ...seriesOf(after), owner, actor, subject: after.subject, ...change.notice });
    }

    // One "invitations held" notice per write (a guest held on the old owner's link too is the same news).
    if (result.notices.length > 1) {
        const [first, ...rest] = result.notices;
        result.notices = [{ ...first, guests: Math.max(...result.notices.map((n) => n.guests)), newCopy: [first, ...rest].some((n) => n.newCopy) }];
    }
    if (result.links.length === 0 && result.notices.length === 0 && !result.pulls) return null;
    pending.set(after, result);
    return result;
}

/** What a write changes on one existing link's invitations (D41). */
interface HeldChange {
    changed: boolean;
    data: { heldAttendeesJson?: string | null; invites?: LinkInvites };
    notice: Pick<HeldNotice, 'guests' | 'newCopy'> | null;
}

type LinkRow = Awaited<ReturnType<OutboxDb['activityExternalLink']['findMany']>>[number];

/**
 * D41 on existing links: new invitations leave the owner's mailbox only on the owner's own action. Decided by held
 * keys (sync.attendees.ts `heldKeyOf`: a colleague's or contact's identity, an outside email's address), so a contact
 * added without an address, or whose address changes later, is still held when the address arrives; and on every link
 * that sends invitations whatever its state or whether the owner's row is live right now (provider switched off, row
 * stopped: the push after the re-activation must not invite the people added meanwhile).
 * - An entry whose attendee is no longer on the activity leaves every held list (identities by identity, plain
 *   addresses of older entries by address).
 * - The actor isn't the owner: every guest the write put on the activity (a new identity, or a known one now
 *   resolving to an address that wasn't on it) is held on every `send` link.
 * - The owner changed and the actor isn't the new owner: the new owner's own earlier link is a new copy for them. With
 *   its event still in the calendar, every guest not already on that event (`base.crm`; guests without an address
 *   too) is held; with the event gone (cancelled, removed in the calendar, never created) it becomes a private copy
 *   (`withhold`), as a new link would.
 */
async function heldChanges(db: OutboxDb, links: readonly LinkRow[], before: ActivityRow | null, after: ActivityRow, actorIsOwner: boolean): Promise<Map<string, HeldChange>> {
    const out = new Map<string, HeldChange>();
    const sendLinks = links.filter((l) => l.invites === 'send' && l.state !== 'unsupported');
    if (!before || sendLinks.length === 0) return out;
    const owner = after.assignedTo;
    const attendeesChanged = attendeeKeys(before) !== attendeeKeys(after);
    const ownerChanged = !sameUser(before.assignedTo, owner);
    if (!attendeesChanged && !(ownerChanged && !actorIsOwner)) return out;
    // The owner's own edit only ever releases held entries (it holds nothing).
    if (actorIsOwner && sendLinks.every((l) => !l.heldAttendeesJson)) return out;

    const resolved = await resolveAttendeeEmails(db, [...before.attendees, ...after.attendees], owner);
    const isGuest = (a: ActivityRow['attendees'][number]) => !(a.kind === 'user' && sameUser(a.username, owner));
    const emailOf = (a: ActivityRow['attendees'][number]) => resolved.emailOf.get(a) ?? '';
    const guestsNow = after.attendees.filter(isGuest);
    const wasEmails = new Set(before.attendees.map(emailOf).filter(Boolean));
    const wasKeys = new Set(before.attendees.map(heldKeyOf).filter(Boolean));
    const nowEmails = new Set(guestsNow.map(emailOf).filter(Boolean));
    const nowKeys = new Set(guestsNow.map(heldKeyOf).filter(Boolean));
    const addedKeys = guestsNow.filter((a) => !wasKeys.has(heldKeyOf(a)) || (emailOf(a) !== '' && !wasEmails.has(emailOf(a)))).map(heldKeyOf).filter(Boolean);
    const stillOn = (entry: string) => (isHeldIdentity(entry) ? nowKeys.has(entry) : nowEmails.has(entry));

    let ownersCalendar = new Set<string>();
    if (ownerChanged && !actorIsOwner) {
        const conns = await db.calendarConnection.findMany({ where: { id: { in: [...new Set(sendLinks.map((l) => l.connectionId))] } }, select: { id: true, username: true } });
        ownersCalendar = new Set(conns.filter((c) => sameUser(c.username, owner)).map((c) => c.id));
    }

    for (const link of sendLinks) {
        const current = parseHeld(link.heldAttendeesJson);
        let held = current.filter(stillOn);
        let invites: LinkInvites = 'send';
        if (!actorIsOwner) {
            let hold = addedKeys;
            if (ownersCalendar.has(link.connectionId)) {
                const base = parseBase(link.baseJson);
                if (hasLiveEvent(link) && base) hold = [...hold, ...guestsNow.filter((a) => !(emailOf(a) in base.crm.attendees)).map(heldKeyOf).filter(Boolean)];
                else invites = 'withhold';
            }
            if (invites === 'send') held = [...new Set([...held, ...hold])];
        }
        const heldJson = serializeHeld(held);
        const changed = invites !== link.invites || heldJson !== (link.heldAttendeesJson ?? null);
        const fresh = held.filter((email) => !current.includes(email)).length;
        const guests = guestCount(after);
        const notice = invites === 'withhold' ? (guests > 0 ? { guests, newCopy: true } : null) : fresh > 0 ? { guests: fresh, newCopy: false } : null;
        out.set(link.id, { changed, data: { heldAttendeesJson: heldJson, ...(invites !== link.invites ? { invites } : {}) }, notice });
    }
    return out;
}
