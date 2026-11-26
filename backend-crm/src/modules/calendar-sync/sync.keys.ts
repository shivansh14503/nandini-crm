import { createHash } from 'node:crypto';

/**
 * Identifiers of the push engine (Calendar Phase 2 spec D10, §8.2, §10.1). Pure.
 *
 * - `requestedIdFor`: the Google event `id` we ask for and the Graph `transactionId`:
 *   'crm' + the first 40 hex of sha256(activityId:connectionId:generation). Lower-case hex is a subset of Google's
 *   base32hex alphabet (a–v, 0–9), 43 characters is inside its 5–1024 range. The connection id is part of it because
 *   in Google Workspace a new owner's calendar may already hold the invitation copy of the old owner's event under the
 *   same id; `generation` re-creates after a hard cancel.
 * - `syncKeyOf`: sha256(iCalUID + '|' + recurrenceId), the indexed identity of the event on Activity (UX_Activity_syncKey).
 * - `eventKeyOf`: sha256 of the provider's event id (UX_ActivityExternalLink_event); raw ids are up to 1,024 characters.
 * - Job ids: BullMQ ids use hyphens only (never `:`).
 */

const sha256Hex = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');

export const REQUESTED_ID_PATTERN = /^crm[0-9a-f]{40}$/;

export function requestedIdFor(activityId: string, connectionId: string, generation: number): string {
    return `crm${sha256Hex(`${activityId}:${connectionId}:${generation}`).slice(0, 40)}`;
}

/** Recurrence id is '' in Phase 2 (no occurrences); Phase 4 passes the occurrence's original start. */
export function syncKeyOf(iCalUid: string, recurrenceId = ''): string {
    return sha256Hex(`${iCalUid}|${recurrenceId}`);
}

export function eventKeyOf(externalEventId: string): string {
    return sha256Hex(externalEventId);
}

/** `push-<linkId>-<dirtyAt ms>`: one job per dirty version; an older job finds the link clean and exits. */
export function pushJobId(linkId: string, dirtyAt: Date): string {
    return `push-${linkId}-${dirtyAt.getTime()}`;
}

/**
 * `push-<linkId>-<dirtyAt ms>-s<minute>`: a push queued by the outbox sweep. Its own id, because the after-commit job
 * of the same dirty version may still sit in BullMQ's completed / failed sets (an equal id would be silently ignored).
 */
export function sweepPushJobId(linkId: string, dirtyAt: Date, now: Date): string {
    return `${pushJobId(linkId, dirtyAt)}-s${Math.floor(now.getTime() / 60_000)}`;
}

/**
 * `enrolled-<connectionId>-<enrolledAt ms>-r<readyAt ms>`: one per time the row reaches `ok` (first ok, and every
 * recovery from `error`). An id per enrolment only would be silently ignored by BullMQ on a second recovery while the
 * first job still sits in its completed (1 h) / failed (7 days) sets.
 */
export function enrolledJobId(connectionId: string, enrolledAt: Date, readyAt: Date): string {
    return `enrolled-${connectionId}-${enrolledAt.getTime()}-r${readyAt.getTime()}`;
}

/** `check-<connectionId>-<minute>`: at most one queued health check per row and minute. */
export function checkJobId(connectionId: string, now: Date): string {
    return `check-${connectionId}-${Math.floor(now.getTime() / 60_000)}`;
}
