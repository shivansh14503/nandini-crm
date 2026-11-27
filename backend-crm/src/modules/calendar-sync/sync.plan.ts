import type { LinkState } from './sync.constants.js';
import { crmChangedGroups, sameWhen, type CrmShape, type FieldGroup, type SyncBase } from './sync.shapes.js';

/**
 * `planPush` (Calendar Phase 2 spec §8.5): what one push of one link does. Pure: the caller resolved the attendees,
 * the description, the owner's connection and the activity's eligibility before calling.
 */

export type PushPlan =
    /** `restore`: the event was deleted by us (link `cancelled`): Google tries an undelete first, else a new generation.
     *  `newGeneration`: the old event is gone for good (deleted in the calendar): always a new requested id. */
    | { action: 'create'; restore: boolean; newGeneration: boolean }
    | { action: 'patch'; groups: FieldGroup[] }
    | { action: 'cancel' }
    | { action: 'detach' }
    /** Nothing to send; the link ends in `state`. */
    | { action: 'noop'; state: LinkState };

export interface PlanInput {
    activity: {
        isDeleted: boolean;
        status: string;
        hasSchedule: boolean;
        externalOrganizer: boolean;
        /** P2-8: `calendar` = brought in from the calendar; deleting it in the CRM never deletes the calendar event. */
        origin?: string;
    };
    link: {
        state: string;
        externalEventId: string | null;
        base: SyncBase | null;
    };
    /** The link's connection belongs to the activity's owner (false after an owner change or an account switch). */
    ownersConnection: boolean;
    /** The link's connection row is live (`pending`, `ok` or `error`); a `stopped` row detaches the link. */
    connectionLive: boolean;
    /** §8.3 step 3 (`isCreateEligible`). */
    createEligible: boolean;
    /** The type goes to calendars (§9.1). */
    typeSyncable: boolean;
    /** What the CRM says now (attendees minus held ones, description resolved). */
    crmNow: CrmShape;
    /** Retry / Add again (P2-3c): a `removed_remote` link is created again even without a new slot. */
    force?: boolean;
}

/** Groups a Completed activity may still change on its event (completion never moves the event, §11.2). */
const COMPLETED_GROUPS: ReadonlySet<FieldGroup> = new Set<FieldGroup>(['subject', 'location', 'attendees', 'description']);
/** Every group a patch can write (status changes go through cancel / create, never a patch). */
const PATCHABLE_GROUPS: readonly FieldGroup[] = ['subject', 'when', 'location', 'attendees', 'reminder', 'description'];

export function planPush(input: PlanInput): PushPlan {
    const { activity, link, crmNow } = input;
    // An event of ours is in the calendar: `cancelled` / `removed_remote` keep the id of an event that is gone.
    const hasEvent = Boolean(link.externalEventId) && link.state !== 'cancelled' && link.state !== 'removed_remote';
    const cancelOrNothing: PushPlan = hasEvent ? { action: 'cancel' } : { action: 'noop', state: 'cancelled' };

    if (!input.connectionLive) return { action: 'detach' };
    if (!input.ownersConnection) return cancelOrNothing;
    // §13.2: an imported meeting removed from the CRM stays in the calendar; the link stops (syncKey kept: never re-imported).
    if (activity.isDeleted && activity.origin === 'calendar') return { action: 'detach' };
    if (activity.isDeleted) return cancelOrNothing;
    if (activity.status === 'Cancelled') return cancelOrNothing;
    // An imported meeting whose type stopped going to calendars (or lost its time) is still the employee's real meeting:
    // the link stops, the event stays (only Cancel / an owner change removes it, §13.2).
    if ((!input.typeSyncable || !activity.hasSchedule) && activity.origin === 'calendar') return { action: 'detach' };
    if (!input.typeSyncable || !activity.hasSchedule) return cancelOrNothing;
    if (activity.externalOrganizer) return { action: 'noop', state: 'detached' };

    if (link.state === 'removed_remote') {
        const newSlot = !link.base || !sameWhen(crmNow.when, link.base.crm.when);
        if ((newSlot || input.force) && input.createEligible) return { action: 'create', restore: false, newGeneration: true };
        return { action: 'noop', state: 'removed_remote' };
    }
    if (link.state === 'cancelled') {
        if (!input.createEligible) return { action: 'noop', state: 'cancelled' };
        return { action: 'create', restore: Boolean(link.externalEventId), newGeneration: false };
    }
    if (!link.externalEventId) {
        return input.createEligible ? { action: 'create', restore: false, newGeneration: false } : { action: 'noop', state: 'cancelled' };
    }

    const changed = link.base ? crmChangedGroups(crmNow, link.base.crm).filter((g) => g !== 'status') : [...PATCHABLE_GROUPS];
    const groups = activity.status === 'Completed' ? changed.filter((g) => COMPLETED_GROUPS.has(g)) : changed;
    return groups.length > 0 ? { action: 'patch', groups } : { action: 'noop', state: 'synced' };
}

/** Google `sendUpdates`: guests hear about a change only when invitations are ours to send and it touches what they see. */
export function shouldSendUpdates(groups: readonly FieldGroup[], invites: string, hasGuests: boolean): boolean {
    if (invites !== 'send' || !hasGuests) return false;
    return groups.some((g) => g !== 'reminder' && g !== 'description');
}
