import type { prisma, TransactionClient } from '../../config/prisma.js';

/**
 * Static lookup data a bulk write (import) reads once up front instead of once per row. Every field is optional:
 * the record helpers fall back to a live query when a lookup isn't supplied (or, for organizations, misses).
 */
export interface PrefetchedLookups {
    /** Lowercased usernames of active users. */
    activeUsernames?: ReadonlySet<string>;
    /** Live organizations by lowercased, trimmed name (SQL Server compares names case-insensitively). */
    organizationsByName?: ReadonlyMap<string, OrganizationRef>;
}

export interface OrganizationRef {
    id: string;
    organizationName: string;
}

type Client = TransactionClient | typeof prisma;

/** SQL Server allows 2100 parameters per statement; stay well below it. */
const IN_CHUNK_SIZE = 1000;

export const organizationNameKey = (name: string) => name.trim().toLowerCase();

export async function prefetchActiveUsernames(client: Client): Promise<Set<string>> {
    const users = await client.user.findMany({ where: { isActive: true }, select: { username: true } });
    return new Set(users.map((u) => u.username.toLowerCase()));
}

/** Live organizations whose exact name is one of `names`, keyed by `organizationNameKey`. */
export async function prefetchOrganizationsByName(client: Client, names: readonly (string | null | undefined)[]): Promise<Map<string, OrganizationRef>> {
    const distinct = [...new Set(names.map((n) => n?.trim()).filter((n): n is string => Boolean(n)))];
    const result = new Map<string, OrganizationRef>();
    for (let i = 0; i < distinct.length; i += IN_CHUNK_SIZE) {
        const rows = await client.organization.findMany({
            where: { organizationName: { in: distinct.slice(i, i + IN_CHUNK_SIZE) }, isDeleted: false },
            select: { id: true, organizationName: true },
        });
        // Live names are unique (Organization_organizationName_live_key), so each key has at most one row.
        for (const row of rows) result.set(organizationNameKey(row.organizationName), row);
    }
    return result;
}

/**
 * The live organization with exactly this name (case-insensitive). Uses the prefetched map when given; a miss
 * there still queries, so organizations created after the prefetch (e.g. by an earlier import row) are found.
 */
export async function findOrganizationByName(tx: TransactionClient, name: string | null | undefined, lookups?: PrefetchedLookups): Promise<OrganizationRef | null> {
    const trimmed = name?.trim();
    if (!trimmed) return null;
    const hit = lookups?.organizationsByName?.get(organizationNameKey(trimmed));
    if (hit) return hit;
    return tx.organization.findFirst({ where: { organizationName: trimmed, isDeleted: false }, select: { id: true, organizationName: true } });
}
