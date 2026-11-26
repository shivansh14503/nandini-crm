import { logger } from '../../config/logger.js';
import { prisma, type TransactionClient } from '../../config/prisma.js';
import type { ActivityAttendee, ActivityExternalLink, CalendarConnection } from '../../generated/prisma/client.js';
import { auditService, diffRecords } from '../../services/audit.service.js';
import { ENV } from '../../config/env.js';
import { toActivityDto, type ActivityRow } from '../activities/activity.mapper.js';
import { PLANNED_STATUS } from '../activities/activity.schedule.js';
import { loadActivityConfig, WITH_ATTENDEES, type ActivityCommitRow, type ActivityConfig } from '../activities/activity.service.js';
import { applySystemPatch, insertSystemActivity, type SystemActivityFields } from '../activities/activity.system.js';
import type { AttendeeInput } from '../activities/activity.validator.js';
import type { CalendarSyncSettings } from '../integrations/calendarSyncSettings.js';
import { lockRecords, runInTransaction } from '../shared/transactions.js';
import { zonedStartOfDay, zonedDayOf } from '../../utils/zonedTime.js';
import { attendeeInputsFromProvider, resolveAttendeeEmails } from './sync.attendees.js';
import { isTooLong } from './sync.classify.js';
import {
    AUTO_COMPLETE_BATCH,
    CALENDAR_SYNC_ACTOR,
    IMPORT_FUTURE_DAYS,
    IMPORT_LOOKUP_CHUNK,
    IMPORT_PAST_MS,
    IMPORT_UNTITLED,
    LOCATION_MAX,
    SUBJECT_MAX,
} from './sync.constants.js';
import { capAttendees, inboundCrmNow } from './sync.inbound.js';
import { eventKeyOf, requestedIdFor, syncKeyOf } from './sync.keys.js';
import { scheduleFieldsOf } from './sync.merge.js';
import { crmWhenOf, sameWhen, type AttendeeResponse, type CrmAttendee, type ProviderEvent } from './sync.shapes.js';

/**
 * Customer meetings from the calendar (Calendar Phase 2 spec §13.1–§13.2, D17, D18; P2-8), run by the pull
 * (sync.pull.ts) for the events of one employee's calendar it has no organizer link for.
 *
 * - `classifyImport` (pure): whether an unknown event becomes a CRM activity, attaches this person to the activity
 *   that already holds the meeting (`attend`: same `syncKey`, so two employees invited to one meeting share one
 *   activity with two links), or is left alone. Behind two switches: the company's `allowMeetingImport` and the
 *   person's admin-set `CalendarSyncUser.importMeetings`.
 * - Import: `origin='calendar'`, the type from the `importFollowupType` setting, the first matching contact (and its
 *   organization) linked, attendees mapped like inbound changes (§8.10), `createdBy='calendar-sync'`, written through
 *   the system path with this employee as actor, never marked for sync and notifying nobody (D38). The link is the
 *   organizer's (two-way, editable in the CRM) or an attendee's (`externalOrganizer`: locked, never pushed).
 * - Attendee links (`applyAttendeeLink`): the person's own reply on their copy comes back to their attendee row
 *   (three-way against the reply last agreed, kept on the link as `{ self }`; a calendar `needsAction` never undoes a
 *   CRM answer). For a meeting organized outside the CRM, one designated attendee link (the oldest live one) also
 *   mirrors the title, time, place and guest list: nobody can change those in the CRM (locks), and no organizer copy
 *   is linked that could. A cancelled copy cancels the activity when it is this person's own (they own it), else it
 *   counts as their decline.
 * - Nightly: imported activities without a related record that ended before today are completed (§10.1 step 6).
 *
 * Unique-index races (D45): the syncKey holder is read first inside the import's transaction; a concurrent import of
 * the same meeting that wins anyway makes the insert fail outside any catch here, and the pull retries the event once
 * from the start (sync.pull.ts `applySafely`), which then attends the activity the other pull created.
 */

const DAY_MS = 24 * 60 * 60_000;

const lc = (value: string | null | undefined) => (value ?? '').trim().toLowerCase();
const sameUser = (a: string | null | undefined, b: string | null | undefined) => lc(a) === lc(b);

// ── The rule (pure) ─────────────────────────────────────────────────────────────────────────────────────────────

export type ImportIgnoreReason =
    | 'import_off'
    | 'event_type'
    | 'no_identity'
    | 'removed_from_crm'
    | 'already_in_crm'
    | 'cancelled'
    | 'private'
    | 'recurring'
    | 'all_day'
    | 'too_long'
    | 'declined'
    | 'outside_window'
    | 'no_contact'
    | 'organizer_imports';

export type ImportDecision =
    | { kind: 'ignore'; reason: ImportIgnoreReason }
    /** The meeting is already an activity: link this person's copy to it as an attendee. */
    | { kind: 'attend'; activityId: string }
    /** A new activity, owned by `assignedTo`; this person's copy becomes a link with `role`. */
    | { kind: 'import'; role: 'organizer' | 'attendee'; assignedTo: string; externalOrganizer: boolean };

export interface ImportFacts {
    /** The company switch and this person's switch are both on. */
    enabled: boolean;
    now: Date;
    /** This connection's employee (username). */
    username: string;
    /** The activity holding this meeting's `syncKey` (soft-deleted ones included), if any. */
    existing: { id: string; isDeleted: boolean; assignedTo: string } | null;
    /** The organizer or an attendee is a CRM contact (a live contact's email). */
    hasContact: boolean;
    /** The organizer of an invitation copy, when they are an active colleague; `importsOwn`: their own pull imports it. */
    organizerUser: { username: string; importsOwn: boolean } | null;
}

/** Spec §13.1 (D17), in order. */
export function classifyImport(event: ProviderEvent, facts: ImportFacts): ImportDecision {
    if (!facts.enabled) return { kind: 'ignore', reason: 'import_off' };
    if (event.eventType !== 'default') return { kind: 'ignore', reason: 'event_type' };
    if (!event.iCalUid) return { kind: 'ignore', reason: 'no_identity' };

    const existing = facts.existing;
    if (existing) {
        // Removed from the CRM: the kept syncKey means the meeting is never brought in again.
        if (existing.isDeleted) return { kind: 'ignore', reason: 'removed_from_crm' };
        if (event.status === 'cancelled') return { kind: 'ignore', reason: 'cancelled' };
        // An invitation copy of a meeting the CRM holds is attached whatever its privacy (CRM events are pushed private, D42).
        if (!event.isOrganizerCopy) return { kind: 'attend', activityId: existing.id };
        // The organizer's own copy of someone else's activity (the pull relinks the owner's own through §8.2).
        return { kind: 'ignore', reason: 'already_in_crm' };
    }

    if (event.status === 'cancelled') return { kind: 'ignore', reason: 'cancelled' };
    if (event.isPrivate) return { kind: 'ignore', reason: 'private' };
    if (event.recurring) return { kind: 'ignore', reason: 'recurring' };
    if (event.shape.when.allDay) return { kind: 'ignore', reason: 'all_day' };
    if (isTooLong(event.shape.when)) return { kind: 'ignore', reason: 'too_long' };
    if (event.selfResponse === 'declined') return { kind: 'ignore', reason: 'declined' };
    const start = Date.parse(event.shape.when.start);
    const now = facts.now.getTime();
    if (Number.isNaN(start) || start < now - IMPORT_PAST_MS || start > now + IMPORT_FUTURE_DAYS * DAY_MS) return { kind: 'ignore', reason: 'outside_window' };
    if (!facts.hasContact) return { kind: 'ignore', reason: 'no_contact' };

    if (event.isOrganizerCopy) return { kind: 'import', role: 'organizer', assignedTo: facts.username, externalOrganizer: false };
    const organizer = facts.organizerUser;
    if (organizer && !sameUser(organizer.username, facts.username)) {
        // Their organizer copy creates it; this person's link attaches later by syncKey.
        if (organizer.importsOwn) return { kind: 'ignore', reason: 'organizer_imports' };
        // Until the organizer connects (then the relink makes it theirs: externalOrganizer=false, organizer link).
        return { kind: 'import', role: 'attendee', assignedTo: organizer.username, externalOrganizer: true };
    }
    return { kind: 'import', role: 'attendee', assignedTo: facts.username, externalOrganizer: true };
}

// ── Page lookups ────────────────────────────────────────────────────────────────────────────────────────────────

export interface ImportContact {
    id: string;
    name: string;
    organizationId: string | null;
}

export interface ImportContext {
    contactByEmail: Map<string, ImportContact>;
    userByEmail: Map<string, { username: string; importsOwn: boolean }>;
    bySyncKey: Map<string, { id: string; isDeleted: boolean; assignedTo: string }>;
}

const chunks = <T>(items: readonly T[], size: number = IMPORT_LOOKUP_CHUNK): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
};

/** The organizer and every guest of an event (lower-cased, resources left out), the organizer first. */
export function peopleOfEvent(event: ProviderEvent): string[] {
    const emails = [lc(event.organizerEmail), ...Object.entries(event.shape.attendees).filter(([, a]) => !a.resource).map(([email]) => lc(email))];
    return [...new Set(emails.filter((email) => email.includes('@')))];
}

/** The lookups `classifyImport` needs for one page of unknown events (chunked IN lists, a handful of queries). */
export async function loadImportContext(events: readonly ProviderEvent[], companyOn: boolean): Promise<ImportContext> {
    const context: ImportContext = { contactByEmail: new Map(), userByEmail: new Map(), bySyncKey: new Map() };
    if (events.length === 0) return context;

    const syncKeys = [...new Set(events.filter((e) => e.iCalUid).map((e) => syncKeyOf(e.iCalUid)))];
    for (const part of chunks(syncKeys)) {
        const rows = await prisma.activity.findMany({ where: { syncKey: { in: part } }, select: { id: true, isDeleted: true, assignedTo: true, syncKey: true } });
        for (const row of rows) if (row.syncKey) context.bySyncKey.set(row.syncKey, { id: row.id, isDeleted: row.isDeleted, assignedTo: row.assignedTo });
    }

    const emails = [...new Set(events.flatMap(peopleOfEvent))];
    const contactIdsByEmail = new Map<string, string[]>();
    for (const part of chunks(emails)) {
        const rows = await prisma.entityEmail.findMany({ where: { email: { in: part }, contactId: { not: null } }, select: { email: true, contactId: true } });
        for (const row of rows) if (row.contactId) contactIdsByEmail.set(lc(row.email), [...(contactIdsByEmail.get(lc(row.email)) ?? []), row.contactId]);
    }
    const contactIds = [...new Set([...contactIdsByEmail.values()].flat())];
    const contactById = new Map<string, ImportContact>();
    for (const part of chunks(contactIds)) {
        const rows = await prisma.contact.findMany({ where: { id: { in: part }, isDeleted: false }, select: { id: true, name: true, organizationId: true } });
        for (const row of rows) contactById.set(row.id, { id: row.id, name: row.name, organizationId: row.organizationId ?? null });
    }
    for (const [email, ids] of contactIdsByEmail) {
        const live = [...ids].sort().map((id) => contactById.get(id)).find(Boolean);
        if (live) context.contactByEmail.set(email, live);
    }

    // Organizers of invitation copies: an active colleague? Do they bring in their own meetings?
    const organizers = [...new Set(events.filter((e) => !e.isOrganizerCopy).map((e) => lc(e.organizerEmail)).filter((email) => email.includes('@')))];
    const users: { username: string; email: string | null }[] = [];
    for (const part of chunks(organizers)) {
        users.push(...(await prisma.user.findMany({ where: { email: { in: part }, isActive: true, isGroupUser: false }, select: { username: true, email: true } })));
    }
    if (users.length > 0) {
        const usernames = users.map((u) => u.username);
        const [connections, choices] = await Promise.all([
            prisma.calendarConnection.findMany({ where: { username: { in: usernames }, status: 'ok' }, select: { username: true } }),
            prisma.calendarSyncUser.findMany({ where: { username: { in: usernames }, importMeetings: true, excluded: false }, select: { username: true } }),
        ]);
        const connected = new Set(connections.map((c) => lc(c.username)));
        const importing = new Set(choices.map((c) => lc(c.username)));
        for (const user of users) {
            const key = lc(user.username);
            context.userByEmail.set(lc(user.email), { username: user.username, importsOwn: companyOn && connected.has(key) && importing.has(key) });
        }
    }
    return context;
}

// ── Helpers ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** The reply last agreed on an attendee link (`baseJson = { self }`); null when none. */
export function parseSelfBase(json: string | null | undefined): AttendeeResponse | null {
    if (!json) return null;
    try {
        const value = JSON.parse(json) as { self?: unknown };
        return value && typeof value.self === 'string' && RESPONSES.has(value.self) ? (value.self as AttendeeResponse) : null;
    } catch {
        return null;
    }
}
const RESPONSES = new Set(['needsAction', 'accepted', 'tentative', 'declined']);
export const selfBaseJson = (self: AttendeeResponse) => JSON.stringify({ self });

/**
 * Provider → CRM reply of the connected person (three-way): the calendar's reply is applied when it changed since the
 * last agreed one and differs from the CRM's; a calendar `needsAction` never replaces a CRM answer. Pure.
 */
export function selfReplyToApply(base: AttendeeResponse | null, provider: AttendeeResponse, crm: string): AttendeeResponse | null {
    if (base === provider) return null;
    if (provider === 'needsAction') return null;
    return provider === crm ? null : provider;
}

/** The meeting's guest list as the CRM should hold it (attendee view): every guest plus the organizer, minus the owner. */
export function attendeeViewOf(event: ProviderEvent, ownerEmail: string): Record<string, CrmAttendee> {
    const target: Record<string, CrmAttendee> = {};
    for (const [email, attendee] of Object.entries(event.shape.attendees)) {
        if (attendee.resource) continue;
        target[lc(email)] = { response: attendee.response, ...(attendee.name ? { name: attendee.name } : {}) };
    }
    const organizer = lc(event.organizerEmail);
    if (organizer.includes('@')) target[organizer] = { response: 'accepted', ...(event.organizerName ? { name: event.organizerName } : {}) };
    delete target[lc(ownerEmail)];
    return target;
}

/** A stored attendee as the input that keeps it unchanged (colleagues without a reply: theirs is kept). */
function inputOf(row: ActivityAttendee): AttendeeInput | null {
    if (row.kind === 'user' && row.username) return { kind: 'user', username: row.username };
    if (row.kind === 'contact' && row.contactId) return { kind: 'contact', contactId: row.contactId, ...(row.email ? { email: row.email } : {}), responseStatus: row.responseStatus as AttendeeResponse };
    if (row.email) return { kind: 'email', email: row.email, name: row.name, responseStatus: row.responseStatus as AttendeeResponse };
    return null;
}

const parseInstant = (value: string): Date | null => {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? null : new Date(ms);
};

// ── The importer (one per pull run) ─────────────────────────────────────────────────────────────────────────────

export type ImportOutcomeKind = 'imported' | 'attended' | 'applied' | 'deleted' | 'unchanged' | 'ignored' | 'skippedUnlinked';

export interface ImportOutcome {
    rows: ActivityCommitRow[];
    outcome: ImportOutcomeKind;
}

const UNCHANGED: ImportOutcome = { rows: [], outcome: 'unchanged' };
const IGNORED: ImportOutcome = { rows: [], outcome: 'ignored' };
const NOT_IMPORTED: ImportOutcome = { rows: [], outcome: 'skippedUnlinked' };

export class MeetingImporter {
    private personOn = false;
    private context: ImportContext = { contactByEmail: new Map(), userByEmail: new Map(), bySyncKey: new Map() };
    private readonly connection: CalendarConnection;
    private readonly settings: CalendarSyncSettings;
    private readonly config: ActivityConfig;
    private readonly clock: () => Date;

    constructor(connection: CalendarConnection, settings: CalendarSyncSettings, config: ActivityConfig, clock: () => Date) {
        this.connection = connection;
        this.settings = settings;
        this.config = config;
        this.clock = clock;
    }

    /** Both switches (company + this person). Existing attendee links keep working when they're turned off. */
    get enabled(): boolean {
        return this.settings.allowMeetingImport && this.personOn;
    }

    async init(): Promise<void> {
        if (!this.settings.allowMeetingImport) return;
        const choice = await prisma.calendarSyncUser.findUnique({ where: { username: this.connection.username }, select: { importMeetings: true, excluded: true } });
        this.personOn = Boolean(choice?.importMeetings && !choice.excluded);
    }

    /** Loads the page's lookups for its unknown events (nothing when the switches are off). */
    async preparePage(unknown: readonly ProviderEvent[]): Promise<void> {
        this.context = this.enabled && unknown.length > 0 ? await loadImportContext(unknown, this.settings.allowMeetingImport) : { contactByEmail: new Map(), userByEmail: new Map(), bySyncKey: new Map() };
    }

    /** An event of this calendar the CRM has no link for (and no §8.2 match). */
    async applyUnlinked(event: ProviderEvent): Promise<ImportOutcome> {
        if (!this.enabled) return NOT_IMPORTED;
        const decision = this.decide(event);
        if (decision.kind === 'ignore') return NOT_IMPORTED;
        if (decision.kind === 'attend') return this.attend(event, decision.activityId);
        return this.importEvent(event, decision);
    }

    decide(event: ProviderEvent): ImportDecision {
        const people = peopleOfEvent(event);
        return classifyImport(event, {
            enabled: this.enabled,
            now: this.clock(),
            username: this.connection.username,
            existing: event.iCalUid ? (this.context.bySyncKey.get(syncKeyOf(event.iCalUid)) ?? null) : null,
            hasContact: people.some((email) => this.context.contactByEmail.has(email)),
            organizerUser: event.isOrganizerCopy ? null : (this.context.userByEmail.get(lc(event.organizerEmail)) ?? null),
        });
    }

    private linkIdentity(event: ProviderEvent, now: Date) {
        return {
            externalEventId: event.id,
            externalEventKey: eventKeyOf(event.id),
            iCalUid: event.iCalUid || null,
            etag: event.etag || null,
            htmlLink: event.htmlLink ?? null,
            providerUpdatedAt: parseInstant(event.updated),
            lastSyncedAt: now,
        };
    }

    /** A new activity for the meeting, and this person's link (spec §13.1). */
    private async importEvent(event: ProviderEvent, decision: Extract<ImportDecision, { kind: 'import' }>): Promise<ImportOutcome> {
        const schedule = scheduleFieldsOf(event.shape.when);
        if (!schedule || schedule.allDay) return NOT_IMPORTED;
        const now = this.clock();
        const syncKey = syncKeyOf(event.iCalUid);
        const contact = peopleOfEvent(event)
            .map((email) => this.context.contactByEmail.get(email))
            .find(Boolean);
        const username = this.connection.username;

        const result = await runInTransaction(async (tx): Promise<ImportOutcome | { attend: string }> => {
            // D45: whoever holds the meeting's identity (deleted rows included: removed from the CRM = never again).
            const holder = await tx.activity.findFirst({ where: { syncKey }, select: { id: true, isDeleted: true } });
            if (holder) return holder.isDeleted ? NOT_IMPORTED : { attend: holder.id };
            const taken = await tx.activityExternalLink.findFirst({ where: { connectionId: this.connection.id, externalEventKey: eventKeyOf(event.id) }, select: { id: true } });
            if (taken) return IGNORED;

            const target = attendeeViewOf(event, sameUser(decision.assignedTo, username) ? this.connection.accountEmail : '');
            let inputs = await attendeeInputsFromProvider(tx, [], new Map(), target, decision.assignedTo);
            if (!sameUser(decision.assignedTo, username) && event.selfResponse && event.selfResponse !== 'needsAction') {
                // This person's own reply (the actor's: `canSetResponse` honours it).
                inputs = inputs.map((input) => (input.kind === 'user' && sameUser(input.username, username) ? { ...input, responseStatus: event.selfResponse } : input));
            }
            const fields: SystemActivityFields = {
                followupType: this.settings.importFollowupType,
                subject: event.shape.subject.trim().slice(0, SUBJECT_MAX) || IMPORT_UNTITLED,
                status: PLANNED_STATUS,
                assignedTo: decision.assignedTo,
                ...(contact ? { contactId: contact.id, ...(contact.organizationId ? { organizationId: contact.organizationId } : {}) } : {}),
                ...schedule,
                reminder: null,
                location: event.shape.location.trim().slice(0, LOCATION_MAX) || null,
                attendees: capAttendees(inputs),
            };
            const written = await insertSystemActivity(tx, fields, username, now, {
                activityConfig: this.config,
                createdBy: CALENDAR_SYNC_ACTOR,
                rowData: {
                    origin: 'calendar',
                    iCalUid: event.iCalUid,
                    syncKey,
                    organizerEmail: lc(event.organizerEmail).slice(0, 254) || null,
                    organizerName: (event.organizerName ?? '').trim().slice(0, 200) || null,
                    externalOrganizer: decision.externalOrganizer,
                },
                markSync: false,
                notify: false,
            });

            let baseJson: string;
            if (decision.role === 'organizer') {
                const { crmNow } = await inboundCrmNow(
                    tx,
                    written.after,
                    { invites: 'send', heldAttendeesJson: null, externalEventId: null },
                    null,
                    this.connection.accountEmail,
                    this.settings.companyDomains,
                );
                baseJson = JSON.stringify({ crm: crmNow, provider: event.shape });
            } else {
                baseJson = selfBaseJson(event.selfResponse ?? 'needsAction');
            }
            await tx.activityExternalLink.create({
                data: {
                    activityId: written.after.id,
                    connectionId: this.connection.id,
                    provider: this.connection.provider,
                    role: decision.role,
                    state: 'synced',
                    invites: 'send',
                    requestedId: requestedIdFor(written.after.id, this.connection.id, 0),
                    ...this.linkIdentity(event, now),
                    baseJson,
                    crmSyncedAt: written.after.updatedAt,
                },
                select: { id: true },
            });
            logger.info({ activityId: written.after.id, connectionId: this.connection.id, role: decision.role }, 'Customer meeting brought in from the calendar');
            return { rows: [written], outcome: 'imported' };
        });
        if ('attend' in result) return this.attend(event, result.attend);
        return result;
    }

    /** This person's invitation copy of a meeting the CRM holds: an attendee link, and they're on the guest list. */
    private async attend(event: ProviderEvent, activityId: string): Promise<ImportOutcome> {
        const now = this.clock();
        const username = this.connection.username;
        return runInTransaction(async (tx) => {
            await lockRecords(tx, 'activity', [activityId]);
            const activity = (await tx.activity.findUnique({ where: { id: activityId }, include: WITH_ATTENDEES })) as ActivityRow | null;
            if (!activity || activity.isDeleted) return NOT_IMPORTED;
            // One link per activity and calendar (the owner's organizer link, or an attendee link made before).
            const existing = await tx.activityExternalLink.findFirst({ where: { activityId, connectionId: this.connection.id }, select: { id: true, role: true, state: true } });
            // An attendee link whose copy is gone (the meeting was made again, e.g. after an owner change) moves to this copy.
            const repoint = existing?.role === 'attendee' && existing.state === 'cancelled' ? existing.id : null;
            if (existing && !repoint) return IGNORED;
            const taken = await tx.activityExternalLink.findFirst({ where: { connectionId: this.connection.id, externalEventKey: eventKeyOf(event.id) }, select: { id: true } });
            if (taken) return IGNORED;

            const rows: ActivityCommitRow[] = [];
            const self = event.selfResponse ?? 'needsAction';
            if (!sameUser(activity.assignedTo, username)) {
                const mine = activity.attendees.find((a) => a.kind === 'user' && sameUser(a.username, username));
                if (!mine) {
                    const inputs = activity.attendees.map(inputOf).filter((input): input is AttendeeInput => input !== null);
                    const added: AttendeeInput = { kind: 'user', username, ...(self !== 'needsAction' ? { responseStatus: self } : {}) };
                    rows.push(
                        await applySystemPatch(tx, activityId, { attendees: capAttendees([...inputs, added]) }, username, now, {
                            activityConfig: this.config,
                            markSync: false,
                            notify: false,
                        }),
                    );
                } else if (self !== 'needsAction' && mine.responseStatus !== self) {
                    rows.push(await writeOwnReply(tx, activity, mine, self, username, now));
                }
            }
            const linkData = { state: 'synced', ...this.linkIdentity(event, now), baseJson: selfBaseJson(self), crmSyncedAt: rows.at(-1)?.after.updatedAt ?? activity.updatedAt };
            if (repoint) {
                await tx.activityExternalLink.update({ where: { id: repoint }, data: { ...linkData, lastErrorCode: null, lastErrorMessage: null }, select: { id: true } });
            } else {
                await tx.activityExternalLink.create({
                    data: {
                        activityId,
                        connectionId: this.connection.id,
                        provider: this.connection.provider,
                        role: 'attendee',
                        invites: 'send',
                        requestedId: requestedIdFor(activityId, this.connection.id, 0),
                        ...linkData,
                    },
                    select: { id: true },
                });
            }
            return { rows, outcome: 'attended' };
        });
    }

    /**
     * A change on one of this person's invitation copies (attendee link): their reply, the cancel / revive of the copy,
     * and, for the designated link of a meeting organized outside the CRM, its title, time, place and guests.
     */
    async applyAttendeeLink(event: ProviderEvent, link: ActivityExternalLink): Promise<ImportOutcome> {
        const now = this.clock();
        const username = this.connection.username;
        const ownerEmailOf = async (tx: TransactionClient, owner: string) =>
            sameUser(owner, username) ? this.connection.accountEmail : lc((await tx.user.findUnique({ where: { username: owner }, select: { email: true } }))?.email);

        return runInTransaction(async (tx) => {
            await lockRecords(tx, 'activity', [link.activityId]);
            const current = await tx.activityExternalLink.findUnique({ where: { id: link.id } });
            if (!current || current.role !== 'attendee' || current.state === 'detached' || current.externalEventId !== event.id) return IGNORED;
            const activity = (await tx.activity.findUnique({ where: { id: link.activityId }, include: WITH_ATTENDEES })) as ActivityRow | null;
            if (!activity || activity.isDeleted) {
                // Removed from the CRM: the copy is left alone from now on.
                await tx.activityExternalLink.updateMany({ where: { id: link.id }, data: { state: 'detached', dirtyAt: null, nextAttemptAt: null } });
                return IGNORED;
            }
            if (current.etag && event.etag && current.etag === event.etag && current.state !== 'cancelled') return UNCHANGED;

            const isOwner = sameUser(activity.assignedTo, username);
            const rows: ActivityCommitRow[] = [];
            const patch: Partial<SystemActivityFields> = {};
            const base = parseSelfBase(current.baseJson);
            let self: AttendeeResponse = event.selfResponse ?? 'needsAction';

            if (event.status === 'cancelled') {
                // The copy is gone: the organizer cancelled, or this person removed it from their calendar. The owner's
                // activity is cancelled; for anyone else's copy of a meeting organized outside the CRM it counts as their
                // decline (below). A CRM-held meeting is the organizer link's business: a copy gone (the CRM made the
                // event again, e.g. after an owner change) changes no reply.
                if (isOwner && activity.status === PLANNED_STATUS) patch.status = 'Cancelled';
                self = activity.externalOrganizer || isOwner ? 'declined' : (base ?? 'needsAction');
            } else if (isOwner && activity.externalOrganizer) {
                // The owner's own meeting organized outside the CRM (they have no attendee row): declining it there
                // cancels it here, accepting it again (or the copy coming back) brings it back.
                const revived = current.state === 'cancelled' && self !== 'declined';
                const reply = selfReplyToApply(base, self, activity.status === 'Cancelled' ? 'declined' : 'accepted');
                if (reply === 'declined' && activity.status === PLANNED_STATUS) patch.status = 'Cancelled';
                else if ((revived || (reply && reply !== 'declined')) && activity.status === 'Cancelled') patch.status = PLANNED_STATUS;
            }

            // Mirror of a meeting organized outside the CRM (one designated link; nobody can change these in the CRM).
            if (activity.externalOrganizer && event.status === 'active' && !event.recurring && (await this.isDesignated(tx, activity.id, current.id))) {
                const mirror = await this.mirrorPatch(tx, activity, event, await ownerEmailOf(tx, activity.assignedTo));
                Object.assign(patch, mirror);
            }

            let after: ActivityRow = activity;
            if (Object.keys(patch).length > 0) {
                const written = await applySystemPatch(tx, activity.id, patch, username, now, { activityConfig: this.config, markSync: false, notify: true });
                rows.push(written);
                after = written.after;
                await tx.activity.updateMany({ where: { id: activity.id, updatedAt: after.updatedAt }, data: { externalUpdatedAt: now, updatedAt: after.updatedAt } });
            }

            if (!isOwner) {
                const mine = after.attendees.find((a) => a.kind === 'user' && sameUser(a.username, username));
                const gone = event.status === 'cancelled';
                const reply = !mine ? null : gone ? (activity.externalOrganizer && mine.responseStatus !== 'declined' ? 'declined' : null) : selfReplyToApply(base, self, mine.responseStatus);
                if (mine && reply) rows.push(await writeOwnReply(tx, after, mine, reply, username, now));
            }

            await tx.activityExternalLink.updateMany({
                where: { id: current.id },
                data: {
                    state: event.status === 'cancelled' ? 'cancelled' : 'synced',
                    etag: event.etag || null,
                    htmlLink: event.htmlLink ?? current.htmlLink,
                    providerUpdatedAt: parseInstant(event.updated),
                    baseJson: selfBaseJson(self),
                    lastSyncedAt: now,
                    crmSyncedAt: rows.at(-1)?.after.updatedAt ?? activity.updatedAt,
                },
            });
            if (rows.length === 0) return UNCHANGED;
            return { rows, outcome: event.status === 'cancelled' && patch.status === 'Cancelled' ? 'deleted' : 'applied' };
        });
    }

    /** The oldest live attendee link of the activity mirrors it (so two employees' copies never take turns). */
    private async isDesignated(tx: TransactionClient, activityId: string, linkId: string): Promise<boolean> {
        const first = await tx.activityExternalLink.findFirst({
            where: { activityId, role: 'attendee', state: { notIn: ['detached', 'cancelled'] } },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            select: { id: true },
        });
        return !first || first.id === linkId;
    }

    /** Title, time, place and guests of the copy where they differ from the activity (calendar wins: CRM-locked). */
    private async mirrorPatch(tx: TransactionClient, activity: ActivityRow, event: ProviderEvent, ownerEmail: string): Promise<Partial<SystemActivityFields>> {
        const patch: Partial<SystemActivityFields> = {};
        const subject = event.shape.subject.trim().slice(0, SUBJECT_MAX) || IMPORT_UNTITLED;
        if (subject !== activity.subject) patch.subject = subject;
        const location = event.shape.location.trim().slice(0, LOCATION_MAX);
        if (location !== (activity.location ?? '')) patch.location = location || null;
        if (!isTooLong(event.shape.when) && !sameWhen(crmWhenOf(activity), { allDay: event.shape.when.allDay, start: event.shape.when.start, end: event.shape.when.end })) {
            const fields = scheduleFieldsOf(event.shape.when);
            if (fields) Object.assign(patch, fields);
        }

        const target = attendeeViewOf(event, ownerEmail);
        const resolved = await resolveAttendeeEmails(tx, activity.attendees, activity.assignedTo, ownerEmail);
        const rowByEmail = new Map<string, ActivityAttendee>();
        for (const row of activity.attendees) {
            const email = resolved.emailOf.get(row);
            if (email) rowByEmail.set(email, row);
        }
        const stored = Object.keys(resolved.attendees);
        const changed =
            stored.length !== Object.keys(target).length ||
            stored.some((email) => !(email in target)) ||
            Object.entries(target).some(([email, a]) => {
                const row = rowByEmail.get(email);
                // Colleagues' replies are theirs (their own copy / the RSVP button), never the organizer's view.
                return !row || (row.kind !== 'user' && row.responseStatus !== a.response);
            });
        if (changed) {
            const inputs = await attendeeInputsFromProvider(tx, activity.attendees, resolved.emailOf, target, activity.assignedTo);
            patch.attendees = capAttendees(inputs);
        }
        return patch;
    }
}

/** A colleague's own reply written to their attendee row (audited RSVP with them as the changer, like the RSVP button). */
async function writeOwnReply(tx: TransactionClient, activity: ActivityRow, mine: ActivityAttendee, reply: AttendeeResponse, username: string, now: Date): Promise<ActivityCommitRow> {
    const before = toActivityDto(activity);
    await tx.activityAttendee.update({ where: { id: mine.id }, data: { responseStatus: reply, respondedAt: reply === 'needsAction' ? null : now } });
    const after = (await tx.activity.findUniqueOrThrow({ where: { id: activity.id }, include: WITH_ATTENDEES })) as ActivityRow;
    const changes = diffRecords(before, toActivityDto(after));
    if (Object.keys(changes).length > 0) await auditService.record(tx, { entityType: 'Activity', entityId: activity.id, action: 'RSVP', changedBy: username, changes });
    return { before: activity, after, notify: false };
}

// ── Nightly auto-complete (§10.1 step 6) ────────────────────────────────────────────────────────────────────────

/**
 * Imported activities without a related record that are still Planned and ended before today (business timezone)
 * become Completed (`completedBy='calendar-sync'`), through the system path (audited, never pushed, nobody notified),
 * so imported meetings nobody filed under a record don't pile up as overdue. In batches; returns how many.
 */
export async function autoCompleteImported(now: Date = new Date(), config?: ActivityConfig): Promise<number> {
    const today = zonedStartOfDay(zonedDayOf(now, ENV.BUSINESS_TIMEZONE), ENV.BUSINESS_TIMEZONE);
    const resolvedConfig = config ?? (await loadActivityConfig());
    let completed = 0;
    const seen = new Set<string>();
    for (;;) {
        const due = await prisma.activity.findMany({
            where: { origin: 'calendar', relatedId: null, status: PLANNED_STATUS, isDeleted: false, endAt: { lt: today } },
            select: { id: true },
            orderBy: [{ endAt: 'asc' }, { id: 'asc' }],
            take: AUTO_COMPLETE_BATCH,
        });
        const batch = due.filter((row) => !seen.has(row.id));
        if (batch.length === 0) break;
        for (const { id } of batch) {
            seen.add(id);
            try {
                await runInTransaction(async (tx) => {
                    const row = await tx.activity.findFirst({ where: { id, origin: 'calendar', relatedId: null, status: PLANNED_STATUS, isDeleted: false }, select: { id: true } });
                    if (!row) return;
                    await applySystemPatch(tx, id, { status: 'Completed' }, CALENDAR_SYNC_ACTOR, now, { activityConfig: resolvedConfig, markSync: false, notify: false });
                    completed += 1;
                });
            } catch (err) {
                logger.warn({ activityId: id, err: (err as Error).message }, 'Could not auto-complete an imported activity');
            }
        }
        if (due.length < AUTO_COMPLETE_BATCH) break;
    }
    if (completed > 0) {
        const { cacheService } = await import('../../services/cache.service.js');
        await cacheService.invalidateEntityCaches('activities').catch(() => undefined);
        logger.info({ completed }, 'Imported calendar meetings auto-completed');
    }
    return completed;
}
