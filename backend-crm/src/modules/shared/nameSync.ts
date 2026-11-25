import type { TransactionClient } from '../../config/prisma.js';
import { cacheService, type CachedEntity } from '../../services/cache.service.js';
import type { AuthUser } from '../../types/user.types.js';

/**
 * Keeps denormalized display names in step with the record they point to. Contacts, opportunities, quotations,
 * tickets, contracts, activities and referrals store the organization / contact name next to the id, and leads and
 * opportunities their Referred By referral's name (lists sort and search on it), so a rename is written through to
 * every live linked row inside the renaming transaction. Activities also keep the label of the record they are
 * related to (`relatedTo`) and their contact attendees' names.
 */

/** Live rows renamed per entity; entities with no linked rows are omitted. */
export type NameSyncCounts = Partial<Record<CachedEntity, number>>;

const compact = (counts: Record<string, number>): NameSyncCounts =>
    Object.fromEntries(Object.entries(counts).filter(([, n]) => n > 0)) as NameSyncCounts;

export async function propagateOrganizationName(
    tx: TransactionClient,
    organizationId: string,
    organizationName: string,
    actor: AuthUser,
): Promise<NameSyncCounts> {
    const where = { organizationId, isDeleted: false };
    const data = { organizationName, updatedBy: actor.username };
    // Sequential on purpose: a transaction client runs one query at a time.
    const contacts = await tx.contact.updateMany({ where, data });
    const opportunities = await tx.opportunity.updateMany({ where, data });
    const quotations = await tx.quotation.updateMany({ where, data });
    const tickets = await tx.ticket.updateMany({ where, data });
    const contracts = await tx.contract.updateMany({ where, data });
    const activities = await tx.activity.updateMany({ where, data });
    const relatedActivities = await tx.activity.updateMany({
        where: { relatedModule: 'organizations', relatedId: organizationId, isDeleted: false },
        data: { relatedTo: organizationName, updatedBy: actor.username },
    });
    const referrals = await tx.referral.updateMany({ where, data });
    return compact({
        contacts: contacts.count,
        opportunities: opportunities.count,
        quotations: quotations.count,
        tickets: tickets.count,
        contracts: contracts.count,
        activities: activities.count + relatedActivities.count,
        referrals: referrals.count,
    });
}

export async function propagateContactName(tx: TransactionClient, contactId: string, name: string, actor: AuthUser): Promise<NameSyncCounts> {
    const where = { contactId, isDeleted: false };
    const opportunities = await tx.opportunity.updateMany({ where, data: { contact: name, updatedBy: actor.username } });
    const quotations = await tx.quotation.updateMany({ where, data: { contact: name, updatedBy: actor.username } });
    const tickets = await tx.ticket.updateMany({ where, data: { contact: name, updatedBy: actor.username } });
    const contracts = await tx.contract.updateMany({ where, data: { contact: name, updatedBy: actor.username } });
    const activities = await tx.activity.updateMany({ where, data: { contact: name, updatedBy: actor.username } });
    const relatedActivities = await tx.activity.updateMany({
        where: { relatedModule: 'contacts', relatedId: contactId, isDeleted: false },
        data: { relatedTo: name, updatedBy: actor.username },
    });
    // The attendee row has no updatedBy: its name is a snapshot of the contact's.
    const attendees = await tx.activityAttendee.updateMany({ where: { contactId, activity: { isDeleted: false } }, data: { name } });
    return compact({
        opportunities: opportunities.count,
        quotations: quotations.count,
        tickets: tickets.count,
        contracts: contracts.count,
        activities: activities.count + relatedActivities.count + attendees.count,
    });
}

/** A referral's new name, on the leads and opportunities that picked it as their Referred By. */
export async function propagateReferralName(tx: TransactionClient, referralId: string, name: string, actor: AuthUser): Promise<NameSyncCounts> {
    const where = { referredById: referralId, isDeleted: false };
    const data = { referredBy: name, updatedBy: actor.username };
    const leads = await tx.lead.updateMany({ where, data });
    const opportunities = await tx.opportunity.updateMany({ where, data });
    return compact({ leads: leads.count, opportunities: opportunities.count });
}

/** Clears the list / search / dashboard caches of the entities a rename touched (after commit). */
export async function invalidateSyncedCaches(counts: NameSyncCounts | undefined): Promise<void> {
    if (!counts) return;
    await Promise.all((Object.keys(counts) as CachedEntity[]).map((entity) => cacheService.invalidateEntityCaches(entity)));
}
