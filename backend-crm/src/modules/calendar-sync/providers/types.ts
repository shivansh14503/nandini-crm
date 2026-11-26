/**
 * Calendar provider adapters (Calendar Phase 2 spec §7.2; admin-managed connections: addendum §2, §8.1). Thin `fetch`
 * clients behind one interface, no SDKs (D1). Access tokens are minted per call from the company credentials
 * (tokenSource.ts) and handed to the adapter inside a `CallCtx`; minting is not on the adapter. P2-2b ships
 * `probeCalendar` (the per-row health check); the event operations (create / patch / cancel / get) join this interface
 * with the push engine (P2-3b), pull / free-busy / watch with P2-5…P2-7. The engine never imports an adapter
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
export interface CalendarProviderAdapter {
    readonly key: CalendarProviderKey;
    /**
     * Cheapest read that proves the CRM can use this person's calendar: Google
     * `GET /calendars/primary/events?maxResults=1`, Graph `GET /users/{mailbox}/events?$top=1`. Resolves on success;
     * rejects with a `ProviderError` (classified by `classifyApiError`).
     */
    probeCalendar(ctx: CallCtx): Promise<void>;
}
