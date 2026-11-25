import type { TransactionClient } from '../../config/prisma.js';
import { HttpError } from '../../utils/httpError.js';
import { assertReference } from '../shared/references.js';
import { attendeeIdentity, type AttendeeInput, type AttendeeResponse } from './activity.validator.js';

/**
 * Attendees of an activity: colleagues (username), contacts and outside emails. Saves sync them by identity
 * (`attendeeIdentity`): only added, removed or changed rows are written, nothing at all when the set is unchanged,
 * and the replies of attendees who stay are kept. The planning is pure (`planAttendeeSync`) so it can be tested
 * without a database.
 */

export const NEEDS_ACTION: AttendeeResponse = 'needsAction';

/** An attendee ready to store: checked, with its display name filled. */
export interface NormalizedAttendee {
    kind: 'user' | 'contact' | 'email';
    username: string | null;
    contactId: string | null;
    email: string | null;
    name: string;
    /** Reply sent with the save (owners record contacts' replies; a colleague only their own). */
    responseStatus?: AttendeeResponse;
}

/** A stored attendee row (what the sync compares with). */
export interface StoredAttendee {
    id: string;
    kind: string;
    username: string | null;
    contactId: string | null;
    email: string | null;
    name: string;
    responseStatus: string;
    respondedAt: Date | null;
    sortOrder: number;
}

export interface AttendeeCreate {
    kind: string;
    username: string | null;
    contactId: string | null;
    email: string | null;
    name: string;
    responseStatus: string;
    respondedAt: Date | null;
    sortOrder: number;
}

export interface AttendeePlan {
    create: AttendeeCreate[];
    remove: string[];
    update: { id: string; data: Partial<Pick<StoredAttendee, 'name' | 'email' | 'sortOrder' | 'responseStatus' | 'respondedAt'>> }[];
    /** True when attendees were added or removed (a schedule-relevant change: bumps `revision`). */
    setChanged: boolean;
}

const sameUser = (a: string | null | undefined, b: string | null | undefined) => (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();

/** The name part of an email address (`asha.k@acme.com` → `asha.k`), the name of an outside attendee given none. */
const emailName = (email: string) => email.split('@')[0] || email;

/**
 * Whether a reply sent with a save is honoured: the owner records the replies of contacts and outside emails, and a
 * colleague may only set their own (through the RSVP endpoint, or a save of an activity they may edit).
 */
export function canSetResponse(attendee: { kind: string; username?: string | null }, editor: string): boolean {
    return attendee.kind !== 'user' || sameUser(attendee.username, editor);
}

/**
 * Checks the submitted attendees and fills their names: colleagues must be active users (one query; a colleague
 * already on the activity stays even if since deactivated), contacts must exist and be live (an unchanged one may
 * have been deleted since). The owner is never an attendee of their own activity and is dropped silently.
 */
export async function normalizeAttendees(
    tx: TransactionClient,
    attendees: readonly AttendeeInput[],
    owner: string,
    previous: readonly StoredAttendee[] = [],
): Promise<NormalizedAttendee[]> {
    const wanted = attendees.filter((attendee) => !(attendee.kind === 'user' && sameUser(attendee.username, owner)));
    const previousUsers = new Set(previous.filter((row) => row.kind === 'user').map((row) => (row.username ?? '').toLowerCase()));
    const previousContacts = new Set(previous.filter((row) => row.kind === 'contact').map((row) => row.contactId ?? ''));

    const usernames = [...new Set(wanted.flatMap((a) => (a.kind === 'user' ? [a.username] : [])))];
    const users = usernames.length
        ? await tx.user.findMany({ where: { username: { in: usernames } }, select: { username: true, fullName: true, isActive: true } })
        : [];
    const userByKey = new Map(users.map((user) => [user.username.toLowerCase(), user]));

    const contactIds = [...new Set(wanted.flatMap((a) => (a.kind === 'contact' ? [a.contactId] : [])))];
    const contacts = contactIds.length
        ? await tx.contact.findMany({ where: { id: { in: contactIds } }, select: { id: true, name: true, isDeleted: true } })
        : [];
    const contactById = new Map(contacts.map((contact) => [contact.id, contact]));

    return wanted.map((attendee): NormalizedAttendee => {
        const responseStatus = attendee.responseStatus;
        if (attendee.kind === 'user') {
            const key = attendee.username.toLowerCase();
            const user = userByKey.get(key);
            if (!user || (!user.isActive && !previousUsers.has(key))) {
                throw HttpError.badRequest(`"${attendee.username}" is not an active user.`, [{ message: 'Select active users only.', path: ['attendees'] }]);
            }
            return { kind: 'user', username: user.username, contactId: null, email: null, name: user.fullName.trim() || user.username, responseStatus };
        }
        if (attendee.kind === 'contact') {
            const contact = contactById.get(attendee.contactId) ?? null;
            const keep = previousContacts.has(attendee.contactId) ? attendee.contactId : undefined;
            assertReference(contact, attendee.contactId, keep, 'contact', 'attendees');
            return { kind: 'contact', username: null, contactId: contact.id, email: attendee.email ?? null, name: contact.name, responseStatus };
        }
        return { kind: 'email', username: null, contactId: null, email: attendee.email, name: attendee.name ?? emailName(attendee.email), responseStatus };
    });
}

/**
 * What a save writes: rows to insert (new identities), delete (identities no longer listed) and update (a kept row
 * whose name, email, order or an allowed reply changed). Replies are kept for attendees who stay; a reply sent with
 * the save is honoured only where `canSetResponse` allows it.
 */
export function planAttendeeSync(next: readonly NormalizedAttendee[], previous: readonly StoredAttendee[], editor: string, now: Date): AttendeePlan {
    const stored = new Map(previous.map((row) => [attendeeIdentity(row), row]));
    const plan: AttendeePlan = { create: [], remove: [], update: [], setChanged: false };
    const kept = new Set<string>();

    next.forEach((attendee, sortOrder) => {
        const identity = attendeeIdentity(attendee);
        const reply = attendee.responseStatus && canSetResponse(attendee, editor) ? attendee.responseStatus : undefined;
        const row = stored.get(identity);
        if (!row) {
            const responseStatus = reply ?? NEEDS_ACTION;
            plan.create.push({
                kind: attendee.kind,
                username: attendee.username,
                contactId: attendee.contactId,
                email: attendee.email,
                name: attendee.name,
                responseStatus,
                respondedAt: responseStatus === NEEDS_ACTION ? null : now,
                sortOrder,
            });
            return;
        }
        kept.add(identity);
        const data: AttendeePlan['update'][number]['data'] = {};
        if (row.name !== attendee.name) data.name = attendee.name;
        if (attendee.kind === 'contact' && (row.email ?? null) !== attendee.email) data.email = attendee.email;
        if (row.sortOrder !== sortOrder) data.sortOrder = sortOrder;
        if (reply && reply !== row.responseStatus) {
            data.responseStatus = reply;
            data.respondedAt = reply === NEEDS_ACTION ? null : now;
        }
        if (Object.keys(data).length > 0) plan.update.push({ id: row.id, data });
    });

    for (const [identity, row] of stored) if (!kept.has(identity)) plan.remove.push(row.id);
    plan.setChanged = plan.create.length > 0 || plan.remove.length > 0;
    return plan;
}

/** Applies `planAttendeeSync` inside the caller's transaction. Returns the plan (callers read `setChanged`). */
export async function syncAttendees(
    tx: TransactionClient,
    activityId: string,
    next: readonly NormalizedAttendee[],
    previous: readonly StoredAttendee[],
    editor: string,
    now: Date,
): Promise<AttendeePlan> {
    const plan = planAttendeeSync(next, previous, editor, now);
    // Deletes first: a re-added identity (removed, then listed again) can't clash with its old row.
    if (plan.remove.length > 0) await tx.activityAttendee.deleteMany({ where: { id: { in: plan.remove }, activityId } });
    for (const { id, data } of plan.update) await tx.activityAttendee.update({ where: { id }, data });
    if (plan.create.length > 0) await tx.activityAttendee.createMany({ data: plan.create.map((row) => ({ ...row, activityId })) });
    return plan;
}
