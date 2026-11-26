import type { TransactionClient } from '../../config/prisma.js';
import { markActivityForSync } from '../calendar-sync/sync.outbox.js';
import type { ActivityRow } from './activity.mapper.js';
import type { ActivityConfig } from './activity.service.js';

/**
 * The point Activity writes pass through inside their transaction (Calendar Phase 2, P2-3a): inserts and updates
 * (`insertActivityRow` / `updateActivityRow`, CRM saves and the system write path in activity.system.ts) and
 * `remove`, `bulkRemove` and `restore` in activity.service.ts. Not called by an invitee's RSVP (`respond`, attendee
 * row only), the organization / contact rename write-through (`shared/nameSync.ts`) or the reminder claim
 * (notification.reminders.ts). P2-3b plugs the calendar outbox in here (`markActivityForSync`, skipped when `markSync`
 * is false), so the push engine never has to edit the write paths themselves.
 *
 * Nearly a leaf module: besides types it imports only calendar-sync/sync.outbox.ts, which imports no activity service
 * code (activity.system.ts imports activity.service.ts, so the service can't import the hook from there without an
 * import cycle). Tests replace `activityWriteHook.onWrite` with `mock.method`.
 *
 * Rules for whatever runs here: read and write only through `tx` (never the shared client, never config loads:
 * `config` is what the caller loaded before the transaction), and never catch a unique-index error (D45).
 */

/** One activity written inside a transaction. */
export interface ActivityWriteEvent {
    /** The row before the write (attendees included); null on insert. */
    before: ActivityRow | null;
    /** The row as written (attendees included). */
    after: ActivityRow;
    /** Username doing the write (D41: invitations go out only when the owner acts). */
    actor: string;
    now: Date;
    /** False when the caller asked the system write path not to mark the activity for calendar sync. */
    markSync: boolean;
    /** The activity configuration the caller loaded before the transaction; null where the write doesn't load it (deletes). */
    config: ActivityConfig | null;
}

export const activityWriteHook = {
    /**
     * Called once per written activity, after its row and audit entry, inside the caller's transaction. P2-3b: the
     * calendar outbox (calendar-sync/sync.outbox.ts `markActivityForSync`) unless `markSync` is false; it leaves its
     * dirty links for `runActivityPostCommit`. With nobody enrolled it makes one indexed read (the owner's live
     * connection row) and writes nothing.
     */
    async onWrite(tx: TransactionClient, event: ActivityWriteEvent): Promise<void> {
        if (!event.markSync) return;
        await markActivityForSync(tx, event);
    },
};
