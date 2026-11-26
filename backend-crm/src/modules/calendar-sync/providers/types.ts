import type { BusyKind } from '../busy.constants.js';

/**
 * Calendar provider adapters (Calendar Phase 2 spec §7.2; admin-managed connections: addendum §2, §8.1). Thin `fetch`
 * clients behind one interface, no SDKs (D1). Access tokens are minted per call from the company credentials
 * (tokenSource.ts) and handed to the adapter inside a `CallCtx`; minting is not on the adapter. P2-2b ships
 * `probeCalendar` (the per-row health check), P2-6 `freeBusy`; the event operations (create / patch / cancel / get) join
 * this interface with the push engine (P2-3b), pull / watch with P2-5 / P2-7. The engine never imports an adapter
 * directly: it goes through `getAdapter()` (providers/registry.ts), which tests replace with the in-memory fake.
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

/**
 * The adapter interface. P2-3b adds `createEvent`, `patchEvent`, `cancelEvent`, `getEvent` and `undeleteEvent?`
 * (its `CallCtx` gains nothing more: Graph URLs use `ctx.mailbox`).
 */
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

export interface CalendarProviderAdapter {
    readonly key: CalendarProviderKey;
    /**
     * Cheapest read that proves the CRM can use this person's calendar: Google
     * `GET /calendars/primary/events?maxResults=1`, Graph `GET /users/{mailbox}/events?$top=1`. Resolves on success;
     * rejects with a `ProviderError` (classified by `classifyApiError`).
     */
    probeCalendar(ctx: CallCtx): Promise<void>;
    /**
     * Busy times of `emails` in `[start, end)`, read **as `ctx`'s person** (P2-6; addendum §8.5): Google
     * `POST /freeBusy` with the impersonated token (`calendar.events.freebusy`), Graph
     * `POST /users/{mailbox}/calendar/getSchedule` with the app token. One interactive try, 5 s timeout. Every requested
     * email is in the answer (a calendar the provider left out is `{ error: 'missing' }`). Rejects with a
     * `ProviderError` when the whole call fails.
     */
    freeBusy(ctx: CallCtx, request: FreeBusyRequest): Promise<Map<string, FreeBusyResult>>;
}
