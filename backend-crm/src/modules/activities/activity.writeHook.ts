import type { TransactionClient } from '../../config/prisma.js';
import type { ActivityRow } from './activity.mapper.js';
import type { ActivityConfig } from './activity.service.js';

/**
 * The point Activity writes pass through inside their transaction (Calendar Phase 2, P2-3a): inserts and updates
 * (`insertActivityRow` / `updateActivityRow`, CRM saves and the system write path in activity.system.ts) and
 * `remove`, `bulkRemove` and `restore` in activity.service.ts. Not called by an invitee's RSVP (`respond`, attendee
 * row only), the organization / contact rename write-through (`shared/nameSync.ts`) or the reminder claim
 * (notification.reminders.ts). A no-op for now; P2-3b plugs the calendar outbox in here (`markActivityForSync`,
 * skipped when `markSync` is false), so the push engine never has to edit the write paths themselves.
 *
 * A leaf module (its imports are type-only): activity.system.ts imports activity.service.ts, so the service can't
 * import the hook from there without an import cycle. Tests replace `activityWriteHook.onWrite` with `mock.method`.
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
    /** Called once per written activity, after its row and audit entry, inside the caller's transaction. */
    async onWrite(_tx: TransactionClient, _event: ActivityWriteEvent): Promise<void> {
        // P2-3b: markActivityForSync(tx, event.before, event.after, event.now, event.actor) unless !event.markSync.
    },
};
