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

/** `pull-<connectionId>-<10 s bucket>`: polls, Sync now and page opens within 10 s share one pull (spec §10.1). */
export function pullJobId(connectionId: string, now: Date): string {
    return `pull-${connectionId}-${Math.floor(now.getTime() / 10_000)}`;
}

/**
 * `pull-<connectionId>-w<10 s bucket>`: a webhook-triggered pull (P2-7). Its own id, apart from the poll's: a burst of
 * pings within 10 s shares one pending job. Only a pending (waiting / delayed) job may absorb a ping; once that id is
 * active or finished (BullMQ keeps completed jobs an hour and silently ignores an add with an id it still holds), the
 * ping uses `freshWebhookPullJobId` instead.
 */
export function webhookPullJobId(connectionId: string, now: Date): string {
    return `pull-${connectionId}-w${Math.floor(now.getTime() / 10_000)}`;
}

/** `pull-<connectionId>-w<10 s bucket>-<ms>`: a webhook pull after this bucket's pull already ran (or failed). */
export function freshWebhookPullJobId(connectionId: string, now: Date): string {
    return `${webhookPullJobId(connectionId, now)}-${now.getTime()}`;
}

/**
 * `pull-<connectionId>-n<stamp ms>`: the one extra pull a finished pull queues when a webhook arrived while it ran
 * (D26), keyed on that ping's stamp. A pull queued for stamp S starts after S, so a later follow-up needs a newer stamp
 * and therefore another id: it never equals the running job's id, nor any job still kept in BullMQ's sets.
 */
export function followUpPullJobId(connectionId: string, stampMs: number): string {
    return `pull-${connectionId}-n${stampMs}`;
}

/** `watch-<connectionId>-<op>-<minute>`: one webhook channel job per connection, operation and minute (P2-7). */
export function watchJobId(connectionId: string, op: string, now: Date): string {
    return `watch-${connectionId}-${op}-${Math.floor(now.getTime() / 60_000)}`;
}
