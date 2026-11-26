import { StatusCodes } from 'http-status-codes';
import type { TransactionClient } from '../../config/prisma.js';
import type { Activity } from '../../generated/prisma/client.js';
import { HttpError } from '../../utils/httpError.js';
import {
    VIDEO_MEETING_LOCKED,
    VIDEO_MEETING_LOCKED_MESSAGE,
    VIDEO_PROVIDER_LABELS,
    VIDEO_PROVIDER_NOT_CONNECTED,
    VIDEO_PROVIDERS,
    isVideoProvider,
    videoMeetingFromMeta,
    videoProviderForCalendar,
    videoUnavailableMessage,
    type CalendarVideoProvider,
    type VideoProvider,
} from '../calendar-sync/conference.rules.js';
import { isTypeSyncable, ownerConnectionOf } from '../calendar-sync/sync.outbox.js';
import { isVideoMeetingLocked } from './activity.access.js';
import { NOTE_TYPE, PLANNED_STATUS, TASK_TYPE } from './activity.schedule.js';
import type { ActivityConfig } from './activity.service.js';

/** What the owner check reads (a transaction client or the shared one). */
type OwnerDb = Pick<TransactionClient, 'calendarConnection' | 'integrationProvider' | 'user'>;

/**
 * The activity's Video meeting on the CRM side (Calendar Phase 3, P3-1; spec §16.2): which columns a save writes, and
 * what a CRM save may choose. The link itself is created by the calendar push (calendar-sync/sync.conference.ts).
 *
 * - Offered on types whose Followup Type option meta has `videoMeeting: true` (seeded on Meeting and Demo /
 *   Presentation) and that go to calendars; never on Task / Note.
 * - The **owner's** company calendar decides the provider (admin-managed connections): a live Google calendar → Google
 *   Meet, Microsoft 365 → Microsoft Teams. Anything else → 409 VIDEO_PROVIDER_NOT_CONNECTED. Zoom is P3-2 (never
 *   available yet).
 * - A ready Teams link can't be removed or changed (409 VIDEO_MEETING_LOCKED).
 * - A new choice, an owner change (a new event in the new owner's calendar) and Retry ask for a new link: state
 *   `requested`, `conferenceRequest + 1` (Google's requestId '<requestedId>-c<n>').
 */

export const VIDEO_NOT_PLANNED_MESSAGE = 'A video meeting can only be added to a planned activity.';
export const videoTypeNotOfferedMessage = (type: string) => `Video meetings aren't offered for ${type || 'this type'}. An admin can switch them on in Admin › API Integrations › What goes to calendars.`;
export const NOTHING_TO_RETRY_MESSAGE = 'This activity has no video link to retry.';

/** The conference columns an activity write sets. */
export type ConferenceRowData = Partial<
    Pick<Activity, 'conferenceProvider' | 'conferenceState' | 'conferenceJoinUrl' | 'conferenceId' | 'conferenceError' | 'conferenceRequest'>
>;

type StoredConference = Pick<Activity, 'conferenceProvider' | 'conferenceState' | 'conferenceRequest' | 'assignedTo'>;

const sameUser = (a: string | null | undefined, b: string | null | undefined) => (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();

const CLEARED: ConferenceRowData = { conferenceProvider: null, conferenceState: null, conferenceJoinUrl: null, conferenceId: null, conferenceError: null };

/** What a parsed input asks for: the provider, or null for none (Task / Note never have one). Undefined = keep. */
function desiredOf(input: { videoMeeting?: VideoProvider | null; followupType: string }): VideoProvider | null | undefined {
    if (input.followupType === TASK_TYPE || input.followupType === NOTE_TYPE) return null;
    return input.videoMeeting;
}

/** A new link is wanted: requested, the next request number, the old outcome cleared. */
const requestedRow = (provider: VideoProvider, request: number): ConferenceRowData => ({
    conferenceProvider: provider,
    conferenceState: 'requested',
    conferenceJoinUrl: null,
    conferenceId: null,
    conferenceError: null,
    conferenceRequest: request,
});

/**
 * Conference columns of an insert (`existing` null) or update (pure). `{}` = unchanged. An insert that isn't Planned
 * gets none (a logged activity has no event to carry a link).
 */
export function conferenceColumnsFor(
    input: { videoMeeting?: VideoProvider | null; followupType: string; status: string; assignedTo: string },
    existing: StoredConference | null,
): ConferenceRowData {
    const desired = desiredOf(input);
    if (!existing) return desired && input.status === PLANNED_STATUS ? requestedRow(desired, 1) : {};
    const stored = (existing.conferenceProvider ?? null) as VideoProvider | null;
    const next = desired === undefined ? stored : desired;
    const ownerChanged = !sameUser(existing.assignedTo, input.assignedTo);
    if (next === stored && !(next && ownerChanged)) return {};
    if (!next) return CLEARED;
    return requestedRow(next, (existing.conferenceRequest ?? 0) + 1);
}

/** The provider the owner's live company calendar creates links for (null when the owner isn't synced). */
export async function ownerVideoProvider(db: OwnerDb, owner: string): Promise<{ calendarProvider: string | null; video: CalendarVideoProvider | null }> {
    const conn = owner ? await ownerConnectionOf(db, owner) : null;
    return { calendarProvider: conn?.provider ?? null, video: videoProviderForCalendar(conn?.provider) };
}

/** Whether a Followup Type offers Video meeting: option meta `videoMeeting` and a type that goes to calendars. */
export function typeOffersVideo(followupType: string, config: Pick<ActivityConfig, 'followupTypes'> | null): boolean {
    if (!isTypeSyncable(followupType, config)) return false;
    const option = config?.followupTypes?.options.find((o) => o.value.toLowerCase() === followupType.toLowerCase());
    return videoMeetingFromMeta(option?.meta);
}

const fieldError = (message: string) => new HttpError(message, StatusCodes.BAD_REQUEST, { code: 'VALIDATION_ERROR', errors: [{ message, path: ['videoMeeting'] }] });

export const videoNotConnectedError = (message: string) =>
    new HttpError(message, StatusCodes.CONFLICT, { code: VIDEO_PROVIDER_NOT_CONNECTED, errors: [{ message, path: ['videoMeeting'] }] });

/**
 * A CRM save's Video meeting rules (inside the save's transaction, before the write): 409 VIDEO_MEETING_LOCKED when
 * a ready Teams link would be removed or changed; for a new choice 400 when not Planned or the type doesn't offer it;
 * for a new choice or an owner change 409 VIDEO_PROVIDER_NOT_CONNECTED unless the owner's calendar creates that kind
 * of link. Re-saving what is stored passes (an admin switching a type off keeps existing meetings).
 */
export async function assertVideoMeetingAllowed(
    tx: OwnerDb,
    input: { videoMeeting?: VideoProvider | null; followupType: string; status: string; assignedTo: string },
    existing: StoredConference | null,
    config: Pick<ActivityConfig, 'followupTypes'> | null,
): Promise<void> {
    const desired = desiredOf(input);
    const stored = (existing?.conferenceProvider ?? null) as VideoProvider | null;
    const next = desired === undefined ? stored : desired;
    if (existing && isVideoMeetingLocked(existing) && next !== 'teams') {
        throw new HttpError(VIDEO_MEETING_LOCKED_MESSAGE, StatusCodes.CONFLICT, { code: VIDEO_MEETING_LOCKED, errors: [{ message: VIDEO_MEETING_LOCKED_MESSAGE, path: ['videoMeeting'] }] });
    }
    if (!next) return;
    const changedChoice = next !== stored;
    const ownerChanged = existing !== null && !sameUser(existing.assignedTo, input.assignedTo);
    if (!changedChoice && !ownerChanged) return;
    if (changedChoice && input.status !== PLANNED_STATUS) throw fieldError(VIDEO_NOT_PLANNED_MESSAGE);
    if (changedChoice && !typeOffersVideo(input.followupType, config)) throw fieldError(videoTypeNotOfferedMessage(input.followupType));
    await assertOwnerCanHaveVideo(tx, input.assignedTo, next);
}

/** 409 VIDEO_PROVIDER_NOT_CONNECTED unless the owner's live company calendar creates `provider` links. */
export async function assertOwnerCanHaveVideo(tx: OwnerDb, owner: string, provider: string | null): Promise<void> {
    if (!isVideoProvider(provider)) return;
    const { video } = await ownerVideoProvider(tx, owner);
    if (provider !== video) throw videoNotConnectedError(videoUnavailableMessage(provider, video));
}

/** One Video meeting choice for the form (GET /api/activities/video-options). */
export interface VideoOption {
    value: VideoProvider;
    label: string;
    available: boolean;
    /** Why not (shown on the disabled option). */
    reason?: string;
}

export interface VideoOptions {
    owner: string;
    /** google | microsoft | fake | null (the owner isn't synced). */
    calendarProvider: string | null;
    options: VideoOption[];
}

/** The Video meeting choices for `owner` (Meet with a Google calendar, Teams with Microsoft 365, Zoom later). */
export async function videoOptionsFor(db: OwnerDb, owner: string): Promise<VideoOptions> {
    const { calendarProvider, video } = await ownerVideoProvider(db, owner);
    return {
        owner,
        calendarProvider,
        options: VIDEO_PROVIDERS.map((value) => {
            const available = value === video;
            return { value, label: VIDEO_PROVIDER_LABELS[value], available, ...(available ? {} : { reason: videoUnavailableMessage(value, video) }) };
        }),
    };
}

/** Columns of a Retry (the link failed): a new request of the same provider. Throws 409 when there is nothing to retry. */
export function retryColumnsFor(existing: StoredConference & Pick<Activity, 'status' | 'isDeleted'>): ConferenceRowData {
    const provider = existing.conferenceProvider as VideoProvider | null;
    if (!provider || existing.conferenceState !== 'failed' || existing.status !== PLANNED_STATUS || existing.isDeleted) {
        throw new HttpError(NOTHING_TO_RETRY_MESSAGE, StatusCodes.CONFLICT, { code: 'NOTHING_TO_RETRY' });
    }
    return requestedRow(provider, (existing.conferenceRequest ?? 0) + 1);
}
