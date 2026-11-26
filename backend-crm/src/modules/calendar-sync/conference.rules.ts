import type { GoogleEventWire, GraphEventWire } from './providers/wire.js';

/**
 * Video meetings on calendar events (Calendar Phase 3, P3-1; spec §16, admin-managed model: addendum §8.8). Pure.
 *
 * - The activity's Video meeting (`Activity.conferenceProvider`) is created **with** the owner's calendar event by the
 *   push: Google Meet through `conferenceData.createRequest` (`conferenceDataVersion=1`, requestId
 *   '<requestedId>-c<n>', solution `hangoutsMeet`), Microsoft Teams through `isOnlineMeeting` +
 *   `onlineMeetingProvider: 'teamsForBusiness'`. The calendar decides which one an owner can have: a Google (or the
 *   dev `fake`) calendar → Meet, a Microsoft 365 calendar → Teams. Zoom (P3-2) is never offered.
 * - The provider answers with the link (`ready`), "still creating" (Meet: `pending`, read again by the `conference`
 *   job) or a failure. Join URLs are kept only when they are https on an allowed host.
 * - A Teams link can't be removed or changed once it exists [V]: the API refuses teams → none after `ready`.
 *
 * Mirrored by frontend-crm/src/types/activity.types.ts (contractSync.test.ts checks the vocabulary).
 */

/** `Activity.conferenceProvider` values (the form's Video meeting field). `zoom` is P3-2: stored nowhere yet. */
export const VIDEO_PROVIDERS = ['meet', 'teams', 'zoom'] as const;
export type VideoProvider = (typeof VIDEO_PROVIDERS)[number];
export const isVideoProvider = (value: unknown): value is VideoProvider => typeof value === 'string' && (VIDEO_PROVIDERS as readonly string[]).includes(value);

/** Providers a calendar can create a link for (Zoom needs its own connection, P3-2). */
export type CalendarVideoProvider = Exclude<VideoProvider, 'zoom'>;

export const VIDEO_PROVIDER_LABELS: Readonly<Record<VideoProvider, string>> = {
    meet: 'Google Meet',
    teams: 'Microsoft Teams',
    zoom: 'Zoom',
};

/** `Activity.conferenceState`. */
export const CONFERENCE_STATES = ['requested', 'ready', 'failed'] as const;
export type ConferenceState = (typeof CONFERENCE_STATES)[number];

/** Followup Type option meta that offers the Video meeting field for the type (missing = not offered). */
export const VIDEO_MEETING_META_KEY = 'videoMeeting';
export const videoMeetingFromMeta = (meta: unknown): boolean =>
    Boolean(meta && typeof meta === 'object' && (meta as Record<string, unknown>)[VIDEO_MEETING_META_KEY] === true);

/** 409: the chosen provider isn't available for the activity's owner (spec §6.5). */
export const VIDEO_PROVIDER_NOT_CONNECTED = 'VIDEO_PROVIDER_NOT_CONNECTED';
/** 409: a Teams link exists and can't be removed or changed (spec §16.3). */
export const VIDEO_MEETING_LOCKED = 'VIDEO_MEETING_LOCKED';
export const VIDEO_MEETING_LOCKED_MESSAGE = 'Cancel and create a new meeting to remove the Teams link.';
export const ZOOM_LATER_MESSAGE = 'Zoom meetings are coming later.';

/** Why an owner can't have a provider (409 VIDEO_PROVIDER_NOT_CONNECTED text, and the form's disabled option). */
export function videoUnavailableMessage(provider: VideoProvider, ownerCalendar: CalendarVideoProvider | null): string {
    if (provider === 'zoom') return ZOOM_LATER_MESSAGE;
    if (!ownerCalendar) return `${VIDEO_PROVIDER_LABELS[provider]} needs the owner's company calendar to be connected (Admin › API Integrations).`;
    return `The owner's company calendar creates ${VIDEO_PROVIDER_LABELS[ownerCalendar]} links, not ${VIDEO_PROVIDER_LABELS[provider]}.`;
}

/** The video provider a calendar creates links for (google / fake → meet, microsoft → teams), else null. */
export function videoProviderForCalendar(calendarProvider: string | null | undefined): CalendarVideoProvider | null {
    if (calendarProvider === 'google' || calendarProvider === 'fake') return 'meet';
    if (calendarProvider === 'microsoft') return 'teams';
    return null;
}

/** Fixed codes of `Activity.conferenceError` (stored as `<code>: <text>`, ≤ 300 characters). */
export const CONFERENCE_ERROR_TEXT = {
    conference_failed: 'Google couldn’t create the Meet link.',
    not_created: 'The calendar didn’t add a video link (Teams may need a licence for the owner, or Meet may be off for the organisation).',
    join_url_rejected: 'The calendar returned a link the CRM doesn’t trust.',
    conference_timeout: 'The calendar is taking too long to create the link.',
    provider_unavailable: 'The owner’s calendar can’t create this kind of video link.',
} as const;
export type ConferenceErrorCode = keyof typeof CONFERENCE_ERROR_TEXT;

export const conferenceErrorOf = (code: ConferenceErrorCode): string => `${code}: ${CONFERENCE_ERROR_TEXT[code]}`.slice(0, 300);

/** `{ code, message }` of a stored `conferenceError` (null when none). */
export function parseConferenceError(value: string | null | undefined): { code: string; message: string } | null {
    if (!value) return null;
    const at = value.indexOf(': ');
    return at < 0 ? { code: value, message: value } : { code: value.slice(0, at), message: value.slice(at + 2) };
}

// ── Join URLs ─────────────────────────────────────────────────────────────────────────────────────────────────

export const JOIN_URL_MAX = 1000;
const MEET_HOSTS: readonly string[] = ['meet.google.com'];
const TEAMS_HOSTS: readonly string[] = ['teams.microsoft.com'];

/** Hosts a join URL of each provider may point at (spec §16.1: meet.google.com, teams.microsoft.com, *.zoom.us). */
function hostAllowed(host: string, provider: VideoProvider): boolean {
    if (provider === 'meet') return MEET_HOSTS.includes(host);
    if (provider === 'teams') return TEAMS_HOSTS.includes(host);
    return host === 'zoom.us' || host.endsWith('.zoom.us');
}

/** The URL when it is a safe join link of `provider` (https, allowed host, no credentials / port, ≤ 1000), else null. */
export function safeJoinUrl(value: string | null | undefined, provider: VideoProvider): string | null {
    const text = (value ?? '').trim();
    if (!text || text.length > JOIN_URL_MAX) return null;
    let url: URL;
    try {
        url = new URL(text);
    } catch {
        return null;
    }
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    return hostAllowed(url.hostname.toLowerCase(), provider) ? url.toString() : null;
}

// ── Provider answers ──────────────────────────────────────────────────────────────────────────────────────────

/** A video meeting as the provider reports it on an event. */
export interface ProviderConference {
    provider: CalendarVideoProvider;
    /** pending: being created (Meet's createRequest), ready: link known, failed: the provider gave up. */
    status: 'pending' | 'ready' | 'failed';
    /** The allow-listed join URL (null while pending, or when the provider's URL isn't trusted). */
    joinUrl: string | null;
    /** True when the provider reported a URL that failed the allow-list. */
    urlRejected: boolean;
    conferenceId: string | null;
    /** Meet: the createRequest's id (null for links not created through the CRM). */
    requestId: string | null;
}

const MEET_SOLUTION = 'hangoutsMeet';
const clip = (value: string | null | undefined, max: number) => (value ? value.slice(0, max) : null);

/**
 * Google `hangoutLink` / `conferenceData` (spec §9.3). Only Meet is read (an add-on conference, e.g. Zoom's Calendar
 * add-on, isn't a Meet and is ignored). `createRequest.status.statusCode` pending / failure win over a link.
 */
export function readGoogleConference(raw: Pick<GoogleEventWire, 'hangoutLink' | 'conferenceData'>): ProviderConference | undefined {
    const data = raw.conferenceData;
    const solution = data?.conferenceSolution?.key?.type ?? data?.createRequest?.conferenceSolutionKey?.type ?? null;
    if (solution && solution !== MEET_SOLUTION) return undefined;
    const video = data?.entryPoints?.find((e) => e.entryPointType === 'video')?.uri ?? null;
    const reported = video || raw.hangoutLink || null;
    if (!data && !reported) return undefined;
    const statusCode = data?.createRequest?.status?.statusCode ?? null;
    const joinUrl = safeJoinUrl(reported, 'meet');
    const base = { provider: 'meet' as const, conferenceId: clip(data?.conferenceId, 200), requestId: data?.createRequest?.requestId ?? null };
    if (statusCode === 'failure') return { ...base, status: 'failed', joinUrl: null, urlRejected: false };
    if (statusCode === 'pending' || !reported) return { ...base, status: 'pending', joinUrl: null, urlRejected: false };
    return { ...base, status: 'ready', joinUrl, urlRejected: !joinUrl };
}

/** Graph `isOnlineMeeting` + `onlineMeeting.joinUrl` (never the deprecated `onlineMeetingUrl`, spec §9.4). */
export function readGraphConference(raw: Pick<GraphEventWire, 'isOnlineMeeting' | 'onlineMeetingProvider' | 'onlineMeeting'>): ProviderConference | undefined {
    if (raw.isOnlineMeeting !== true) return undefined;
    const provider = (raw.onlineMeetingProvider ?? '').toLowerCase();
    if (provider && provider !== 'teamsforbusiness' && provider !== 'unknown') return undefined;
    const reported = raw.onlineMeeting?.joinUrl ?? null;
    const joinUrl = safeJoinUrl(reported, 'teams');
    const base = { provider: 'teams' as const, conferenceId: clip(raw.onlineMeeting?.conferenceId, 200), requestId: null };
    if (!reported) return { ...base, status: 'pending', joinUrl: null, urlRejected: false };
    return { ...base, status: 'ready', joinUrl, urlRejected: !joinUrl };
}

// ── What the push asks for ────────────────────────────────────────────────────────────────────────────────────

/** The CRM side of the event's video meeting (`CrmShape.conference`): which provider, and which request of it. */
export interface CrmConference {
    provider: VideoProvider;
    /** `Activity.conferenceRequest`: a new number = a new link is wanted. */
    request: number;
}

/** `CrmShape.conference` of an activity (null when it has no video meeting). */
export function crmConferenceOf(row: { conferenceProvider: string | null; conferenceRequest: number }): CrmConference | null {
    return isVideoProvider(row.conferenceProvider) ? { provider: row.conferenceProvider, request: row.conferenceRequest } : null;
}

export function sameConference(a: CrmConference | null | undefined, b: CrmConference | null | undefined): boolean {
    if (!a || !b) return !a && !b;
    return a.provider === b.provider && a.request === b.request;
}

/** What one provider write carries about the video meeting. */
export type ConferenceWrite =
    /** Google: create a Meet with this requestId. */
    | { kind: 'meet'; requestId: string }
    /** Graph: make the event a Teams meeting. */
    | { kind: 'teams' }
    /** Google: remove the Meet (`conferenceData: null`). Teams links can't be removed [V]. */
    | { kind: 'remove' };

/** Google `conferenceData.createRequest.requestId`: '<requestedId>-c<n>' (spec §16.3). */
export const conferenceRequestId = (requestedId: string, request: number) => `${requestedId}-c${request}`;

/**
 * The conference part of a provider write. `create`: the event is new, so any wanted link is asked for. `patch`: only
 * when the `conference` field group changed (a new request, or the meeting removed). Null = nothing to send (no
 * meeting, a provider this calendar can't create, or a Teams link to remove).
 */
export function conferenceWriteFor(
    calendarProvider: string,
    now: CrmConference | null | undefined,
    before: CrmConference | null | undefined,
    requestedId: string,
): ConferenceWrite | null {
    const supported = videoProviderForCalendar(calendarProvider);
    if (now) {
        if (now.provider !== supported) return null;
        return now.provider === 'meet' ? { kind: 'meet', requestId: conferenceRequestId(requestedId, now.request) } : { kind: 'teams' };
    }
    if (before?.provider === 'meet' && supported === 'meet') return { kind: 'remove' };
    return null;
}

/** Google request body part (`conferenceDataVersion=1` must be on the URL). */
export function googleConferenceBody(write: ConferenceWrite | null | undefined): Record<string, unknown> {
    if (!write || write.kind === 'teams') return {};
    if (write.kind === 'remove') return { conferenceData: null };
    return { conferenceData: { createRequest: { requestId: write.requestId, conferenceSolutionKey: { type: MEET_SOLUTION } } } };
}

/** Graph request body part. */
export function graphConferenceBody(write: ConferenceWrite | null | undefined): Record<string, unknown> {
    return write?.kind === 'teams' ? { isOnlineMeeting: true, onlineMeetingProvider: 'teamsForBusiness' } : {};
}

// ── Join details in the description (spec §16.3: allowed in external descriptions) ───────────────────────────

/** `Join with Google Meet: <url>` / `Join Microsoft Teams meeting: <url>`. */
export function joinLine(provider: VideoProvider, url: string): string {
    return provider === 'teams' ? `Join Microsoft Teams meeting: ${url}` : `Join with ${VIDEO_PROVIDER_LABELS[provider]}: ${url}`;
}

/** The event description with the join details of a ready meeting appended ('' + details for external guests). */
export function withJoinDetails(description: string, row: { conferenceProvider: string | null; conferenceState: string | null; conferenceJoinUrl: string | null }): string {
    if (!isVideoProvider(row.conferenceProvider) || row.conferenceState !== 'ready' || !row.conferenceJoinUrl) return description;
    const line = joinLine(row.conferenceProvider, row.conferenceJoinUrl);
    return description ? `${description}\n${line}` : line;
}

// ── Applying an answer ────────────────────────────────────────────────────────────────────────────────────────

/** The Activity conference columns a sync result writes. */
export interface ConferenceColumns {
    conferenceProvider?: string | null;
    conferenceState: string | null;
    conferenceJoinUrl: string | null;
    conferenceId: string | null;
    conferenceError: string | null;
}

/** What the activity holds now (read before applying an answer). */
export interface ActivityConference {
    conferenceProvider: string | null;
    conferenceState: string | null;
    conferenceJoinUrl: string | null;
    conferenceId: string | null;
    conferenceRequest: number;
}

export interface ConferenceOutcome {
    /** Columns to write (CAS on provider + request), or null when nothing changes. */
    columns: ConferenceColumns | null;
    /** The link is still being created: read the event again (the `conference` job). */
    poll: boolean;
    /** A link made in the calendar (not asked for by the CRM) was taken over (inbound, read only). */
    adopted: boolean;
}

const NOTHING: ConferenceOutcome = { columns: null, poll: false, adopted: false };

/**
 * How a provider's answer changes the activity's video meeting (pure).
 * - `sent`: what this write carried (`null` = nothing: a read, or a write that didn't touch the conference).
 * - Without a provider on the activity, a ready link of the calendar's own kind is adopted (spec §16.3 Inbound: made
 *   in Google / Outlook directly) unless this write just removed one.
 * - With one: ready → `ready` with the URL (a URL failing the allow-list → `failed join_url_rejected`); pending →
 *   poll; failure → `failed`; no conference after a request → poll (the job gives up after its tries).
 */
export function conferenceOutcome(
    activity: ActivityConference,
    response: ProviderConference | undefined,
    calendarProvider: string,
    sent: ConferenceWrite | null,
): ConferenceOutcome {
    const supported = videoProviderForCalendar(calendarProvider);
    const wanted = isVideoProvider(activity.conferenceProvider) ? activity.conferenceProvider : null;
    if (!wanted) {
        if (sent?.kind === 'remove' || !response || response.status !== 'ready' || !response.joinUrl || response.provider !== supported) return NOTHING;
        return {
            columns: { conferenceProvider: response.provider, conferenceState: 'ready', conferenceJoinUrl: response.joinUrl, conferenceId: response.conferenceId, conferenceError: null },
            poll: false,
            adopted: true,
        };
    }
    const failed = (code: ConferenceErrorCode): ConferenceOutcome =>
        activity.conferenceState === 'failed' && activity.conferenceJoinUrl === null
            ? NOTHING
            : { columns: { conferenceState: 'failed', conferenceJoinUrl: null, conferenceId: null, conferenceError: conferenceErrorOf(code) }, poll: false, adopted: false };
    if (wanted !== supported) return activity.conferenceState === 'requested' ? failed('provider_unavailable') : NOTHING;
    if (!response || response.provider !== wanted) {
        return sent && sent.kind !== 'remove' && activity.conferenceState === 'requested' ? { columns: null, poll: true, adopted: false } : NOTHING;
    }
    if (response.status === 'pending') return activity.conferenceState === 'requested' ? { columns: null, poll: true, adopted: false } : NOTHING;
    if (response.status === 'failed') return activity.conferenceState === 'requested' ? failed('conference_failed') : NOTHING;
    if (!response.joinUrl) return failed('join_url_rejected');
    if (activity.conferenceState === 'ready' && activity.conferenceJoinUrl === response.joinUrl && activity.conferenceId === response.conferenceId) return NOTHING;
    return {
        columns: { conferenceState: 'ready', conferenceJoinUrl: response.joinUrl, conferenceId: response.conferenceId, conferenceError: null },
        poll: false,
        adopted: false,
    };
}
