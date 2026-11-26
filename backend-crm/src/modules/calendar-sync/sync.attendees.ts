import type { TransactionClient } from '../../config/prisma.js';
import type { AttendeeInput } from '../activities/activity.validator.js';
import type { CrmAttendee, CrmShape, ProviderAttendee } from './sync.shapes.js';

/**
 * Attendees between the CRM and calendars (Calendar Phase 2 spec §8.10).
 *
 * CRM → provider (`resolveAttendeeEmails`, read at push time, nothing stored): a colleague → `User.email`; a contact →
 * the address on the attendee row, else the contact's primary email (`EntityEmail`, bounced addresses skipped); an
 * outside email as is; the owner is never listed (the organizer). Attendees without an address are skipped and
 * counted (`link.lastWarning`). Replies are never pushed: the provider owns them.
 *
 * Provider → CRM (`attendeeInputsFromProvider`, the 412 merge path; P2-5's pull reuses it): an address of an active
 * user → a colleague; of exactly one contact → that contact; else an outside email. Existing rows keep their identity.
 */

/** What `resolveAttendeeEmails` reads: the Prisma client or a transaction. */
export type AttendeeDb = Pick<TransactionClient, 'user' | 'entityEmail'>;

/** The stored attendee columns the push reads. */
export interface PushAttendeeRow {
    kind: string;
    username: string | null;
    contactId: string | null;
    email: string | null;
    name: string;
    responseStatus: string;
}

export interface ResolvedAttendees {
    /** Invitable attendees by lower-cased email. */
    attendees: Record<string, CrmAttendee>;
    /** Attendees left out for want of an address. */
    skipped: number;
    /** The address each stored row resolved to ('' when none; the owner's own row is left out). */
    emailOf: Map<PushAttendeeRow, string>;
}

const lc = (value: string | null | undefined) => (value ?? '').trim().toLowerCase();
const RESPONSES = new Set(['needsAction', 'accepted', 'tentative', 'declined']);
const asResponse = (value: string): CrmAttendee['response'] => (RESPONSES.has(value) ? (value as CrmAttendee['response']) : 'needsAction');

export async function resolveAttendeeEmails(db: AttendeeDb, rows: readonly PushAttendeeRow[], owner: string, ownerEmail: string | null = null): Promise<ResolvedAttendees> {
    const usernames = [...new Set(rows.filter((r) => r.kind === 'user' && r.username).map((r) => r.username as string))];
    const users = usernames.length ? await db.user.findMany({ where: { username: { in: usernames } }, select: { username: true, email: true } }) : [];
    const emailOfUser = new Map(users.map((u) => [u.username.toLowerCase(), lc(u.email)]));

    const contactIds = [...new Set(rows.filter((r) => r.kind === 'contact' && r.contactId && !lc(r.email)).map((r) => r.contactId as string))];
    const contactEmails = contactIds.length
        ? await db.entityEmail.findMany({
              where: { contactId: { in: contactIds }, isInvalidBounce: false },
              select: { contactId: true, email: true, isPrimary: true, sortOrder: true },
          })
        : [];
    const primaryOf = new Map<string, string>();
    for (const row of [...contactEmails].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.sortOrder - b.sortOrder)) {
        if (row.contactId && !primaryOf.has(row.contactId) && lc(row.email)) primaryOf.set(row.contactId, lc(row.email));
    }

    const attendees: Record<string, CrmAttendee> = {};
    const emailOf = new Map<PushAttendeeRow, string>();
    let skipped = 0;
    const ownerKey = lc(owner);
    const ownerAddress = lc(ownerEmail);
    for (const row of rows) {
        if (row.kind === 'user' && lc(row.username) === ownerKey) continue;
        const email = row.kind === 'user' ? (emailOfUser.get(lc(row.username)) ?? '') : row.kind === 'contact' ? lc(row.email) || (primaryOf.get(row.contactId ?? '') ?? '') : lc(row.email);
        emailOf.set(row, email.includes('@') ? email : '');
        if (!email || !email.includes('@')) {
            skipped += 1;
            continue;
        }
        if (email === ownerAddress || attendees[email]) continue;
        attendees[email] = { response: asResponse(row.responseStatus), ...(row.name ? { name: row.name } : {}) };
    }
    return { attendees, skipped, emailOf };
}

/** "1 attendee has no email and wasn't invited" (null when none). */
export function skippedWarning(skipped: number): string | null {
    if (skipped <= 0) return null;
    return skipped === 1 ? "1 attendee has no email and wasn't invited." : `${skipped} attendees have no email and weren't invited.`;
}

/** The held addresses (D41) stored on a link, lower-cased. */
export function parseHeld(json: string | null | undefined): string[] {
    if (!json) return [];
    try {
        const value = JSON.parse(json) as unknown;
        return Array.isArray(value) ? [...new Set(value.filter((v): v is string => typeof v === 'string').map(lc).filter(Boolean))] : [];
    } catch {
        return [];
    }
}

export const serializeHeld = (emails: readonly string[]): string | null => (emails.length > 0 ? JSON.stringify([...new Set(emails.map(lc))].sort()) : null);

/** `attendees` minus the held addresses. */
export function withoutHeld(attendees: Record<string, CrmAttendee>, held: readonly string[]): Record<string, CrmAttendee> {
    if (held.length === 0) return attendees;
    const skip = new Set(held);
    return Object.fromEntries(Object.entries(attendees).filter(([email]) => !skip.has(email)));
}

/**
 * The attendee list a patch writes (§8.6 step 6): what the provider had (`base.provider`), minus the people removed in
 * the CRM since the base, plus the people added. Provider-only entries (rooms, people added in the calendar) and the
 * provider's replies stay. New people start without a reply.
 */
export function patchAttendees(baseProvider: Record<string, ProviderAttendee>, baseCrm: Record<string, CrmAttendee>, crmNow: Record<string, CrmAttendee>): Record<string, ProviderAttendee> {
    const out: Record<string, ProviderAttendee> = {};
    for (const [email, a] of Object.entries(baseProvider)) {
        if (email in baseCrm && !(email in crmNow)) continue;
        out[email] = { ...a };
    }
    for (const [email, a] of Object.entries(crmNow)) {
        if (email in baseCrm || email in out) continue;
        out[email] = { response: 'needsAction', optional: false, resource: false, ...(a.name ? { name: a.name } : {}) };
    }
    return out;
}

/** The stored attendee rows a merge may change (identity + reply). */
export interface StoredAttendeeRow extends PushAttendeeRow {
    responseStatus: string;
}

/**
 * The attendee inputs that make the CRM's list match `target` (lower-cased email → reply), for `applySystemPatch`:
 * stored rows whose resolved address stays are kept (identity unchanged; contact / email replies follow the target),
 * stored rows without an address are kept, rows whose address left are dropped, new addresses become a colleague
 * (active user with that email), a contact (exactly one contact has it) or an outside email.
 */
export async function attendeeInputsFromProvider(
    db: Pick<TransactionClient, 'user' | 'entityEmail'>,
    stored: readonly StoredAttendeeRow[],
    resolvedByIdentity: ReadonlyMap<PushAttendeeRow, string>,
    target: Record<string, CrmAttendee>,
    owner: string,
): Promise<AttendeeInput[]> {
    const inputs: AttendeeInput[] = [];
    const covered = new Set<string>();
    for (const row of stored) {
        const email = resolvedByIdentity.get(row) ?? '';
        if (email && !(email in target)) continue;
        if (email) covered.add(email);
        const reply = email ? target[email].response : asResponse(row.responseStatus);
        if (row.kind === 'user' && row.username) inputs.push({ kind: 'user', username: row.username });
        else if (row.kind === 'contact' && row.contactId) inputs.push({ kind: 'contact', contactId: row.contactId, ...(row.email ? { email: row.email } : {}), responseStatus: reply });
        else if (row.email) inputs.push({ kind: 'email', email: row.email, name: row.name, responseStatus: reply });
    }
    const added = Object.keys(target).filter((email) => !covered.has(email));
    if (added.length === 0) return inputs;

    const users = await db.user.findMany({ where: { email: { in: added }, isActive: true, isGroupUser: false }, select: { username: true, email: true } });
    const userOf = new Map(users.map((u) => [lc(u.email), u.username]));
    const contactRows = await db.entityEmail.findMany({ where: { email: { in: added }, contactId: { not: null } }, select: { contactId: true, email: true } });
    const contactsOf = new Map<string, Set<string>>();
    for (const row of contactRows) {
        const key = lc(row.email);
        if (!row.contactId) continue;
        contactsOf.set(key, (contactsOf.get(key) ?? new Set()).add(row.contactId));
    }
    for (const email of added) {
        const reply = target[email].response;
        const username = userOf.get(email);
        if (username && lc(username) === lc(owner)) continue;
        if (username) inputs.push({ kind: 'user', username });
        else if (contactsOf.get(email)?.size === 1) inputs.push({ kind: 'contact', contactId: [...(contactsOf.get(email) as Set<string>)][0], email, responseStatus: reply });
        else inputs.push({ kind: 'email', email, ...(target[email].name ? { name: target[email].name } : {}), responseStatus: reply });
    }
    return inputs;
}

/** Whether the CRM shape invites anyone outside the company. */
export const hasExternal = (crm: Pick<CrmShape, 'attendees'>, isInternal: (email: string) => boolean) => Object.keys(crm.attendees).some((email) => !isInternal(email));
