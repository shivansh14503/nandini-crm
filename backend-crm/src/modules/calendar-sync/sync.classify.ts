import { MAX_INBOUND_SPAN_MS } from './sync.merge.js';
import type { CrmWhen, ProviderEvent } from './sync.shapes.js';

/**
 * `classifyInbound` (Calendar Phase 2 spec §8.8, D16, D18, D19, D20; P2-5). Pure: what the pull does with one event
 * from the change stream. Only the organizer's copy is authoritative for the event's fields (D18); an invitation copy
 * with an attendee link carries its person's reply (P2-8, sync.import.ts); unlinked events are never stored unless
 * P2-8's import takes them (behind its own switches).
 */

export type InboundAction =
    /** Not ours to apply (other event types, detached / cancelled / unsupported links, deleted activities, attendee copies). */
    | { kind: 'ignore'; reason: InboundIgnoreReason }
    /** Our own write coming back (same etag). */
    | { kind: 'skip' }
    /** Deleted / cancelled in the calendar (§8.9). */
    | { kind: 'remoteDelete' }
    /** Turned into a repeating event (D19): the CRM keeps its fields, the link becomes `unsupported`. */
    | { kind: 'unsupported' }
    /** A cancelled organizer copy confirmed again in the calendar (undeleted there): back to Planned, then merged. */
    | { kind: 'reconfirm' }
    /** Merge it (§8.7); `tooLong`: every group but `when` (D20). */
    | { kind: 'merge'; tooLong: boolean }
    /** No link, but a marker / syncKey match with one of this person's activities (§8.2): link it, then merge. */
    | { kind: 'relink'; activityId: string; tooLong: boolean }
    /** Not the CRM's: P2-8's import decides (sync.import.ts `classifyImport`); else counted as skippedUnlinked. */
    | { kind: 'unlinked' }
    /** An invitation copy with an attendee link (P2-8): its person's reply (and the mirror of an outside meeting). */
    | { kind: 'attendee' };

export type InboundIgnoreReason = 'event_type' | 'link_inactive' | 'activity_deleted' | 'attendee_copy' | 'not_organizer' | 'recurring_unlinked';

export interface InboundLink {
    role: string;
    state: string;
    etag: string | null;
    externalEventId: string | null;
}

export interface InboundActivity {
    isDeleted: boolean;
    status: string;
}

export interface ClassifyInput {
    event: ProviderEvent;
    link: InboundLink | null;
    /** The link's activity (null when there is no link). */
    activity: InboundActivity | null;
    /** No link: the activity a marker / syncKey points at (owned by this connection's person, live). */
    match: { activityId: string } | null;
}

/** Link states whose event the pull leaves alone (a stopped row, our own deletion, a repeating series). */
const INACTIVE_STATES: ReadonlySet<string> = new Set(['detached', 'unsupported', 'removed_remote']);

/** The event spans more than 31 days (D20; all-day spans count their days). */
export function isTooLong(when: CrmWhen): boolean {
    if (!when.start || !when.end) return false;
    if (when.allDay) {
        const start = Date.parse(`${when.start}T00:00:00Z`);
        const end = Date.parse(`${when.end}T00:00:00Z`);
        // Exclusive end: a 31-day event ends 31 days after it starts.
        return !Number.isNaN(start) && !Number.isNaN(end) && end - start > MAX_INBOUND_SPAN_MS;
    }
    const start = Date.parse(when.start);
    const end = Date.parse(when.end);
    return !Number.isNaN(start) && !Number.isNaN(end) && end - start > MAX_INBOUND_SPAN_MS;
}

export function classifyInbound({ event, link, activity, match }: ClassifyInput): InboundAction {
    if (!link) {
        if (event.eventType !== 'default') return { kind: 'ignore', reason: 'event_type' };
        if (!match) return { kind: 'unlinked' };
        if (event.status === 'cancelled') return { kind: 'unlinked' };
        if (!event.isOrganizerCopy) return { kind: 'ignore', reason: 'attendee_copy' };
        if (event.recurring) return { kind: 'ignore', reason: 'recurring_unlinked' };
        return { kind: 'relink', activityId: match.activityId, tooLong: isTooLong(event.shape.when) };
    }
    if (link.role !== 'organizer') return link.state === 'detached' ? { kind: 'ignore', reason: 'link_inactive' } : { kind: 'attendee' };
    if (!activity || activity.isDeleted) return { kind: 'ignore', reason: 'activity_deleted' };
    if (INACTIVE_STATES.has(link.state)) return { kind: 'ignore', reason: 'link_inactive' };
    if (link.state === 'cancelled') {
        // Our deletion (or a calendar deletion already applied). Only the organizer confirming it again brings it back.
        const confirmedAgain = event.status === 'active' && event.isOrganizerCopy && !event.recurring && activity.status === 'Cancelled' && link.etag !== event.etag;
        return confirmedAgain ? { kind: 'reconfirm' } : { kind: 'ignore', reason: 'link_inactive' };
    }
    if (link.etag && event.etag && link.etag === event.etag) return { kind: 'skip' };
    if (event.status === 'cancelled') return { kind: 'remoteDelete' };
    if (!event.isOrganizerCopy) return { kind: 'ignore', reason: 'not_organizer' };
    if (event.recurring) return { kind: 'unsupported' };
    return { kind: 'merge', tooLong: isTooLong(event.shape.when) };
}

/** Counters of one pull run (logged; returned by `pullConnection`). */
export interface PullCounts {
    pages: number;
    seen: number;
    applied: number;
    skipped: number;
    ignored: number;
    skippedUnlinked: number;
    deleted: number;
    relinked: number;
    unsupported: number;
    failed: number;
    unreadable: number;
    verified: number;
    /** P2-8: customer meetings brought in, and invitation copies linked to an activity the CRM holds. */
    imported: number;
    attended: number;
}

export const emptyPullCounts = (): PullCounts => ({
    pages: 0,
    seen: 0,
    applied: 0,
    skipped: 0,
    ignored: 0,
    skippedUnlinked: 0,
    deleted: 0,
    relinked: 0,
    unsupported: 0,
    failed: 0,
    unreadable: 0,
    verified: 0,
    imported: 0,
    attended: 0,
});
