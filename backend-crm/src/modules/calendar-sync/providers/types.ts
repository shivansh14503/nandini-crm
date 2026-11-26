import type { BusyKind } from '../busy.constants.js';
import type { ConferenceWrite } from '../conference.rules.js';
import type { EventContext } from '../sync.mapping.google.js';
import type { CrmShape, FieldGroup, ProviderAttendee, ProviderEvent } from '../sync.shapes.js';

/**
 * Calendar provider adapters (Calendar Phase 2 spec §7.2; admin-managed connections: addendum §2, §8.1). Thin `fetch`
 * clients behind one interface, no SDKs (D1). Access tokens are minted per call from the company credentials
 * (tokenSource.ts) and handed to the adapter inside a `CallCtx`; minting is not on the adapter. P2-2b shipped
 * `probeCalendar` (the per-row health check); P2-3b adds the event operations (create / patch / cancel / get /
 * undelete) of the push engine, P2-6 `freeBusy`; pull / watch join with P2-5 / P2-7. The engine never imports an
 * adapter directly: it goes through `getAdapter()` (providers/registry.ts), which tests replace with the in-memory fake.
 *
 * Nothing here is ever logged with its values: tokens stay inside these objects.
 */

/** Providers with a calendar adapter. `fake` is the dev-only admin-mode test provider (CALENDAR_FAKE_PROVIDER). */
export type CalendarProviderKey = 'google' | 'microsoft' | 'fake';
/** Same set, as the token source names it. */
export type SyncProvider = CalendarProviderKey;

/** Injected `fetch` (tests replay documented provider answers; production uses the global one). */
export type FetchImpl = (input: string, init?: RequestInit) => Promise<Response>;

/** An access token and when it stops working. Lives only in process memory (tokenSource.ts). */
export interface AccessGrant {
    accessToken: string;
    expiresAt: Date;
}

/** One employee's company calendar, for one call. The token never leaves the adapter call. */
export interface CallCtx {
    accessToken: string;
    /** 'primary' (Google) / '' = the default calendar (Graph). */
    calendarId: string;
    /** Lower-cased company email (identifies the organizer copy). */
    accountEmail: string;
    /** = accountEmail: the Graph path segment `/users/{mailbox}`. Google ignores it (the impersonated token is the user's). */
    mailbox: string;
}

/** `createEvent` / `undeleteEvent` input: the CRM's event and who is invited. */
export interface CreateEventInput {
    crm: CrmShape;
    event: EventContext;
    /** Google `id` / Graph `transactionId` (sync.keys.ts `requestedIdFor`). */
    requestedId: string;
    /** Invited people (empty on a private copy). */
    attendees: Record<string, ProviderAttendee>;
    /** Google `sendUpdates=all` (else `none`); Graph has no switch (invitations go to whoever is listed). */
    sendUpdates: boolean;
    /** The video meeting to create with the event (P3-1): Meet createRequest / Teams online meeting; none when unset. */
    conference?: ConferenceWrite | null;
}

/** `patchEvent` input: only the changed groups are written. */
export interface PatchEventInput {
    groups: readonly FieldGroup[];
    crm: CrmShape;
    /** Zone the event is shown in (the provider event's own zone). */
    timeZone: string;
    /** The full attendee list the event should end up with, when `attendees` is among the groups. */
    attendees?: Record<string, ProviderAttendee>;
    /** Set (also to '') to write the description in the same request (D15 clear-on-external). */
    description?: string;
    /** `If-Match` (412 on mismatch). */
    etag?: string;
    sendUpdates: boolean;
    /** Video meeting change (P3-1, when the `conference` group changed): new Meet request / Teams / Meet removed. */
    conference?: ConferenceWrite | null;
}

/** One busy block of a calendar (times only: subjects, locations and privacy flags are never read into the CRM). */
export interface ProviderBusyBlock {
    start: Date;
    end: Date;
    kind: BusyKind;
}

/** Free/busy of one calendar: its blocks, or why the provider wouldn't give them (a fixed code, never provider text). */
export type FreeBusyResult = { busy: ProviderBusyBlock[] } | { error: string };

export interface FreeBusyRequest {
    /** Lower-cased company emails (≤ 50 Google, ≤ 20 Graph per call). */
    emails: readonly string[];
    start: Date;
    end: Date;
}

/**
 * The adapter interface: the health probe (P2-2b), the event operations of the push engine (P2-3b) and free/busy
 * (P2-6). Pull (`listChanges`), watch and RSVP join with P2-5, P2-7 and P2-8. Graph URLs use `ctx.mailbox` (`/users/{mailbox}`).
 */
export interface CalendarProviderAdapter {
    readonly key: CalendarProviderKey;
    /**
     * Cheapest read that proves the CRM can use this person's calendar: Google
     * `GET /calendars/primary/events?maxResults=1`, Graph `GET /users/{mailbox}/events?$top=1`. Resolves on success;
     * rejects with a `ProviderError` (classified by `classifyApiError`).
     */
    probeCalendar(ctx: CallCtx): Promise<void>;
    /**
     * Creates the organizer copy. A retried create never duplicates: Google 409 on our id → the existing event is
     * adopted when its marker is ours (re-written with the full body; a cancelled copy is undeleted), else
     * `RequestedIdTakenError`; Graph dedupes on `transactionId`.
     */
    createEvent(ctx: CallCtx, input: CreateEventInput): Promise<ProviderEvent>;
    patchEvent(ctx: CallCtx, id: string, input: PatchEventInput): Promise<ProviderEvent>;
    /** Deletes the event (attendees get a cancellation when `sendUpdates`); `gone` when it no longer existed. */
    cancelEvent(ctx: CallCtx, id: string, o: { sendUpdates: boolean }): Promise<'cancelled' | 'gone'>;
    /** Null when the provider no longer has it (404 / 410); a Google event deleted in place comes back `cancelled`. */
    getEvent(ctx: CallCtx, id: string): Promise<ProviderEvent | null>;
    /** Google only [U]: brings a deleted event of ours back with the full body; null when it can't (404 / 400). */
    undeleteEvent?(ctx: CallCtx, id: string, input: CreateEventInput): Promise<ProviderEvent | null>;
    /**
     * Busy times of `emails` in `[start, end)`, read **as `ctx`'s person** (P2-6; addendum §8.5): Google
     * `POST /freeBusy` with the impersonated token (`calendar.events.freebusy`), Graph
     * `POST /users/{mailbox}/calendar/getSchedule` with the app token. One interactive try, 5 s timeout. Every requested
     * email is in the answer (a calendar the provider left out is `{ error: 'missing' }`). Rejects with a
     * `ProviderError` when the whole call fails.
     */
    freeBusy(ctx: CallCtx, request: FreeBusyRequest): Promise<Map<string, FreeBusyResult>>;
}
