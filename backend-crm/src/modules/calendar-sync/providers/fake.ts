import { createHash, randomBytes } from 'node:crypto';
import { TokenError, type SyncFailure } from '../syncErrors.js';
import { toGoogleEvent, toGooglePatch } from '../sync.mapping.google.js';
import { normalizeGoogle } from '../sync.shapes.js';
import { classifyFailure, ProviderAuthError, ProviderBadRequestError, type ProviderError, ProviderNotFoundError, ProviderPreconditionError, RequestedIdTakenError } from './http.js';
import type { AccessGrant, CalendarProviderAdapter, CallCtx, CreateEventInput, FreeBusyRequest, FreeBusyResult, ProviderBusyBlock } from './types.js';
import type { GoogleEventWire } from './wire.js';

/**
 * In-memory calendar provider `fake` in admin mode (addendum AC12). Two uses:
 *   - tests: the whole enrol → check → (later) push path without Google or Microsoft;
 *   - development: with CALENDAR_FAKE_PROVIDER=true (never in production, never on the shared server) `fake` serves
 *     every company domain no enabled real provider claims, and admins may set it as a per-person override.
 * Its token source mints `fake-at-…` tokens. Test controls make a given user fail with a user-level code, or the whole
 * app fail with an app-level code.
 *
 * Events (P2-3b): an in-memory Google-shaped calendar (`fakeProviderState.events`), written with the Google mapping and
 * read back through `normalizeGoogle`, with etags (412 on a stale `If-Match`), the 409 → adopt / taken rule, deletion
 * as `status: 'cancelled'` (so undelete works) and one-shot failure injection (`failNext`). Every event call checks
 * the token like the probe does (401 when it isn't the mailbox's).
 */

const ACCESS_TTL_MS = 60 * 60 * 1000;

export interface FakeProviderState {
    /** Lower-cased email → user-level failure of the token call (e.g. user_not_found). */
    userFailures: Map<string, SyncFailure>;
    /** App-level failure of every token call (e.g. delegation_missing); null = works. */
    appFailure: SyncFailure | null;
    /** Lower-cased email → HTTP status the probe answers with (e.g. 403 calendar off). */
    probeFailures: Map<string, number>;
    /** Lower-cased emails whose tokens the provider stops accepting once (next API call answers 401). */
    revokeOnce: Set<string>;
    /** Token calls made, newest last (subjects only). */
    mints: string[];
    /** Probe calls made, newest last (mailboxes). */
    probes: string[];
    /** Live tokens → subject. */
    tokens: Map<string, string>;
    /** Events by id (deleted ones stay with `status: 'cancelled'`). Ids are per connection (requestedIdFor). */
    events: Map<string, GoogleEventWire>;
    /** Event calls received, oldest first. */
    eventCalls: { op: FakeEventOp; id: string; mailbox: string; sendUpdates?: boolean; body?: Record<string, unknown> }[];
    /** The next call of an operation throws this error (then clears). */
    failNext: Partial<Record<FakeEventOp, ProviderError>>;
    /** Tests: runs at the start of every event call (something happening while the call is in flight). */
    onCall: ((op: FakeEventOp) => void | Promise<void>) | null;
    /** Lower-cased email → that calendar's busy blocks (free/busy, P2-6). */
    busy: Map<string, ProviderBusyBlock[]>;
    /** Calendars whose free/busy only their owner may read (anyone else gets `notFound`, like Workspace sharing). */
    freeBusyPrivate: Set<string>;
    /** Lower-cased mailbox → HTTP status every free/busy call made as that person answers with (e.g. 503). */
    freeBusyFailures: Map<string, number>;
    /** Free/busy calls made, newest last: as whom, for which calendars. */
    freeBusyCalls: { mailbox: string; emails: string[] }[];
    /** How a Meet createRequest ends (P3-1): `success` at once (default), `pending` (until `fakeFinishConference`) or `failure`. */
    /** How Google answers a Meet createRequest; `refused`: 400 'Invalid conference type value' (Meet off for the org). */
    conferenceMode: 'success' | 'pending' | 'failure' | 'refused';
}

export type FakeEventOp = 'create' | 'patch' | 'cancel' | 'get' | 'undelete';

export const fakeProviderState: FakeProviderState = {
    userFailures: new Map(),
    appFailure: null,
    probeFailures: new Map(),
    revokeOnce: new Set(),
    mints: [],
    probes: [],
    tokens: new Map(),
    events: new Map(),
    eventCalls: [],
    failNext: {},
    onCall: null,
    busy: new Map(),
    freeBusyPrivate: new Set(),
    freeBusyFailures: new Map(),
    freeBusyCalls: [],
    conferenceMode: 'success',
};

export function resetFakeProvider(): void {
    fakeProviderState.userFailures.clear();
    fakeProviderState.appFailure = null;
    fakeProviderState.probeFailures.clear();
    fakeProviderState.revokeOnce.clear();
    fakeProviderState.mints = [];
    fakeProviderState.probes = [];
    fakeProviderState.tokens.clear();
    fakeProviderState.events.clear();
    fakeProviderState.eventCalls = [];
    fakeProviderState.failNext = {};
    fakeProviderState.onCall = null;
    fakeProviderState.busy.clear();
    fakeProviderState.freeBusyPrivate.clear();
    fakeProviderState.freeBusyFailures.clear();
    fakeProviderState.freeBusyCalls = [];
    fakeProviderState.conferenceMode = 'success';
}

let etagCounter = 0;
const nextEtag = () => `"fake-${(etagCounter += 1)}"`;

/** Tests: someone edits the event in the calendar (new etag, `updated` = `at`). */
export function fakeEditEvent(id: string, changes: Partial<GoogleEventWire>, at: Date = new Date()): void {
    const event = fakeProviderState.events.get(id);
    if (!event) throw new Error(`fakeEditEvent: no event ${id}`);
    fakeProviderState.events.set(id, { ...event, ...changes, etag: nextEtag(), updated: at.toISOString() });
}

/** The Meet link the fake gives a conference id (allow-listed host, like Google's `abc-defg-hij`). */
export const fakeMeetUrl = (conferenceId: string) => `https://meet.google.com/${conferenceId}`;

function meetConference(requestId: string, statusCode: 'success' | 'pending' | 'failure', conferenceId: string): Pick<GoogleEventWire, 'conferenceData' | 'hangoutLink'> {
    const createRequest = { requestId, conferenceSolutionKey: { type: 'hangoutsMeet' }, status: { statusCode } };
    if (statusCode !== 'success') return { conferenceData: { createRequest, conferenceSolution: { key: { type: 'hangoutsMeet' } } }, hangoutLink: null };
    return {
        conferenceData: {
            createRequest,
            conferenceId,
            conferenceSolution: { key: { type: 'hangoutsMeet' } },
            entryPoints: [{ entryPointType: 'video', uri: fakeMeetUrl(conferenceId) }],
        },
        hangoutLink: fakeMeetUrl(conferenceId),
    };
}

/** Tests: Google finishes (or fails) a pending Meet createRequest of this event. */
export function fakeFinishConference(id: string, statusCode: 'success' | 'failure' = 'success', at: Date = new Date()): void {
    const event = fakeProviderState.events.get(id);
    const requestId = event?.conferenceData?.createRequest?.requestId;
    if (!event || !requestId) throw new Error(`fakeFinishConference: no conference request on ${id}`);
    fakeEditEvent(id, meetConference(requestId, statusCode, conferenceIdOf(requestId)), at);
}

const conferenceIdOf = (requestId: string) => {
    const hex = createHash('sha256').update(requestId).digest('hex');
    return `${hex.slice(0, 3)}-${hex.slice(3, 7)}-${hex.slice(7, 10)}`;
};

/** Applies a write's `conferenceData` like Google (`conferenceDataVersion=1`): a createRequest → a Meet, null → removed. */
function withConferenceWrite(body: Record<string, unknown>, previous: GoogleEventWire | undefined): Record<string, unknown> {
    if (!('conferenceData' in body)) return body;
    const { conferenceData, ...rest } = body as { conferenceData?: { createRequest?: { requestId?: string } } | null };
    if (conferenceData === null) return { ...rest, conferenceData: null, hangoutLink: null };
    const requestId = conferenceData?.createRequest?.requestId;
    if (!requestId) return rest;
    const mode = fakeProviderState.conferenceMode;
    if (mode === 'refused') throw new ProviderBadRequestError({ provider: 'fake', operation: 'event', status: 400, code: 'invalid', providerMessage: 'Invalid conference type value.' });
    // The same requestId again is a no-op (Google answers with the existing conference).
    if (previous?.conferenceData?.createRequest?.requestId === requestId) return rest;
    return { ...rest, ...meetConference(requestId, mode, conferenceIdOf(requestId)) };
}

/** 401 unless the token is a live one of this mailbox (a `revokeOnce` mailbox fails once). */
function checkToken(ctx: CallCtx, operation: string): void {
    const mailbox = ctx.mailbox.toLowerCase();
    if (fakeProviderState.revokeOnce.delete(mailbox) || fakeProviderState.tokens.get(ctx.accessToken) !== mailbox) {
        fakeProviderState.tokens.delete(ctx.accessToken);
        throw new ProviderAuthError({ provider: 'fake', operation, status: 401, code: 'http_401' });
    }
}

/** The fake's token "endpoint": one token per subject, an hour long. Throws TokenError per the test controls. */
export async function mintFakeToken(subject: string, now: Date = new Date()): Promise<AccessGrant> {
    const email = subject.toLowerCase();
    fakeProviderState.mints.push(email);
    if (fakeProviderState.appFailure) throw new TokenError('fake', fakeProviderState.appFailure);
    const userFailure = fakeProviderState.userFailures.get(email);
    if (userFailure) throw new TokenError('fake', userFailure);
    const accessToken = `fake-at-${randomBytes(12).toString('base64url')}`;
    fakeProviderState.tokens.set(accessToken, email);
    return { accessToken, expiresAt: new Date(now.getTime() + ACCESS_TTL_MS) };
}

export function createFakeAdapter(options: { now?: () => Date } = {}): CalendarProviderAdapter {
    const now = options.now ?? (() => new Date());
    return {
        key: 'fake',

        async probeCalendar(ctx: CallCtx): Promise<void> {
            const mailbox = ctx.mailbox.toLowerCase();
            fakeProviderState.probes.push(mailbox);
            checkToken(ctx, 'probe');
            const status = fakeProviderState.probeFailures.get(mailbox);
            if (status) throw new ProviderBadRequestError({ provider: 'fake', operation: 'probe', status, code: `http_${status}`, providerMessage: 'Calendar unavailable (fake).' });
        },

        async freeBusy(ctx: CallCtx, request: FreeBusyRequest): Promise<Map<string, FreeBusyResult>> {
            const mailbox = ctx.mailbox.toLowerCase();
            const emails = [...new Set(request.emails.map((e) => e.toLowerCase()))];
            fakeProviderState.freeBusyCalls.push({ mailbox, emails });
            checkToken(ctx, 'freebusy');
            const status = fakeProviderState.freeBusyFailures.get(mailbox);
            if (status) throw classifyFailure(status, { code: '', message: '' }, { provider: 'fake', operation: 'freebusy' });
            const start = request.start.getTime();
            const end = request.end.getTime();
            return new Map(
                emails.map((email): [string, FreeBusyResult] => {
                    if (email !== mailbox && fakeProviderState.freeBusyPrivate.has(email)) return [email, { error: 'notFound' }];
                    const blocks = (fakeProviderState.busy.get(email) ?? []).filter((b) => b.start.getTime() < end && b.end.getTime() > start);
                    return [email, { busy: blocks.map((b) => ({ ...b })) }];
                }),
            );
        },

        ...fakeEventOps(now),
    };
}

const notFound = (operation: string) => new ProviderNotFoundError({ provider: 'fake', operation, status: 404, code: 'notFound' });

function fakeEventOps(now: () => Date): Pick<CalendarProviderAdapter, 'createEvent' | 'patchEvent' | 'cancelEvent' | 'getEvent' | 'undeleteEvent'> {
    const state = fakeProviderState;
    const begin = async (ctx: CallCtx, op: FakeEventOp, call: { id: string; sendUpdates?: boolean; body?: Record<string, unknown> }) => {
        state.eventCalls.push({ op, mailbox: ctx.mailbox.toLowerCase(), ...call });
        checkToken(ctx, `${op}-event`);
        if (state.onCall) await state.onCall(op);
        const error = state.failNext[op];
        if (error) {
            delete state.failNext[op];
            throw error;
        }
    };
    const store = (ctx: CallCtx, id: string, body: Record<string, unknown>, previous?: GoogleEventWire): GoogleEventWire => {
        const event: GoogleEventWire = {
            ...(previous ?? {}),
            ...(withConferenceWrite(body, previous) as Partial<GoogleEventWire>),
            id,
            iCalUID: previous?.iCalUID ?? `${id}@fake.calendar`,
            etag: nextEtag(),
            updated: now().toISOString(),
            status: (body.status as string | undefined) ?? previous?.status ?? 'confirmed',
            organizer: { email: ctx.accountEmail, self: true },
            htmlLink: `https://calendar.fake.test/event?eid=${id}`,
        };
        state.events.set(id, event);
        return event;
    };
    const rewrite = (ctx: CallCtx, input: CreateEventInput, id: string) => {
        // Like Google's PATCH rewrite: the attendee list is always replaced (none on a private copy).
        const { id: _id, ...body } = toGoogleEvent(input.crm, { ...input.event, requestedId: id, attendees: input.attendees, conference: input.conference });
        return normalizeGoogle(store(ctx, id, { attendees: undefined, ...body, status: 'confirmed' }, state.events.get(id)), ctx.accountEmail);
    };

    return {
        async createEvent(ctx, input) {
            await begin(ctx, 'create', { id: input.requestedId, sendUpdates: input.sendUpdates });
            const existing = state.events.get(input.requestedId);
            if (existing) {
                if (existing.extendedProperties?.private?.crmActivityId !== input.event.activityId) {
                    throw new RequestedIdTakenError({ provider: 'fake', operation: 'create-event', status: 409, code: 'requested_id_taken' });
                }
                return rewrite(ctx, input, input.requestedId);
            }
            const body = toGoogleEvent(input.crm, { ...input.event, requestedId: input.requestedId, attendees: input.attendees, conference: input.conference });
            return normalizeGoogle(store(ctx, input.requestedId, body as unknown as Record<string, unknown>), ctx.accountEmail);
        },

        async patchEvent(ctx, id, input) {
            const body = toGooglePatch(input.groups, input.crm, { timeZone: input.timeZone, attendees: input.attendees, description: input.description, conference: input.conference });
            await begin(ctx, 'patch', { id, sendUpdates: input.sendUpdates, body });
            const existing = state.events.get(id);
            if (!existing || existing.status === 'cancelled') throw notFound('patch-event');
            if (input.etag && input.etag !== existing.etag) throw new ProviderPreconditionError({ provider: 'fake', operation: 'patch-event', status: 412, code: 'conditionNotMet' });
            return normalizeGoogle(store(ctx, id, body, existing), ctx.accountEmail);
        },

        async cancelEvent(ctx, id, o) {
            await begin(ctx, 'cancel', { id, sendUpdates: o.sendUpdates });
            const existing = state.events.get(id);
            if (!existing || existing.status === 'cancelled') return 'gone';
            store(ctx, id, { status: 'cancelled' }, existing);
            return 'cancelled';
        },

        async getEvent(ctx, id) {
            await begin(ctx, 'get', { id });
            const existing = state.events.get(id);
            return existing ? normalizeGoogle(existing, ctx.accountEmail) : null;
        },

        async undeleteEvent(ctx, id, input) {
            await begin(ctx, 'undelete', { id, sendUpdates: input.sendUpdates });
            if (!state.events.has(id)) return null;
            return rewrite(ctx, input, id);
        },
    };
}
