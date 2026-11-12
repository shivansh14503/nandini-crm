import type { TransactionClient } from '../../config/prisma.js';
import { cacheService, type CachedEntity } from '../../services/cache.service.js';
import type { AuthUser } from '../../types/user.types.js';

/**
 * Keeps denormalized display names in step with the record they point to. Contacts, opportunities, quotations
 * and tickets store the organization / contact name next to the id (lists sort and search on it), so a rename is
 * written through to every live linked row inside the renaming transaction.
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
    return compact({ contacts: contacts.count, opportunities: opportunities.count, quotations: quotations.count, tickets: tickets.count });
}

export async function propagateContactName(tx: TransactionClient, contactId: string, name: string, actor: AuthUser): Promise<NameSyncCounts> {
    const where = { contactId, isDeleted: false };
    const opportunities = await tx.opportunity.updateMany({ where, data: { contactName: name, updatedBy: actor.username } });
    const quotations = await tx.quotation.updateMany({ where, data: { contactName: name, updatedBy: actor.username } });
    const tickets = await tx.ticket.updateMany({ where, data: { contactPersonName: name, updatedBy: actor.username } });
    return compact({ opportunities: opportunities.count, quotations: quotations.count, tickets: tickets.count });
}

/** Clears the list / search / dashboard caches of the entities a rename touched (after commit). */
export async function invalidateSyncedCaches(counts: NameSyncCounts | undefined): Promise<void> {
    if (!counts) return;
    await Promise.all((Object.keys(counts) as CachedEntity[]).map((entity) => cacheService.invalidateEntityCaches(entity)));
}
