import { createHash } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../../config/prisma.js';
import { CACHE_KEYS, cacheService } from '../../services/cache.service.js';

/** Shapes from frontend-crm/src/services/globalSearch.service.ts. */
export type GlobalSearchCategory = 'organizations' | 'contacts' | 'leads' | 'opportunities';

export interface GlobalSearchResult {
    id: string;
    category: GlobalSearchCategory;
    title: string;
    subtitle: string;
    meta?: string;
    href: string;
}

export type GlobalSearchResults = Record<GlobalSearchCategory, GlobalSearchResult[]>;

export const searchQuerySchema = z.object({
    q: z.string().trim().max(100, { message: 'Search text cannot exceed 100 characters.' }).default(''),
    limit: z.coerce.number().int().min(1).max(20).catch(5).default(5),
});

const SEARCH_CACHE_TTL_SECONDS = 30;

const joinParts = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(' • ');

const empty = (): GlobalSearchResults => ({ organizations: [], contacts: [], leads: [], opportunities: [] });

async function runSearch(q: string, limit: number): Promise<GlobalSearchResults> {
    // Phone numbers match with or without spaces, as in the frontend's normalize().
    const compact = q.replace(/\s+/g, '');
    const recent = { updatedAt: 'desc' } as const;

    const [organizations, contacts, leads, opportunities] = await Promise.all([
        prisma.organization.findMany({
            where: {
                isDeleted: false,
                OR: [
                    { organizationName: { contains: q } },
                    { tradeName: { contains: q } },
                    { sapCodeTallyId: { contains: q } },
                    { billingCity: { contains: q } },
                    { accountCode: { contains: q } },
                ],
            },
            select: { id: true, organizationName: true, tradeName: true, billingCity: true },
            orderBy: recent,
            take: limit,
        }),
        prisma.contact.findMany({
            where: {
                isDeleted: false,
                OR: [
                    { name: { contains: q } },
                    { mobile: { contains: compact } },
                    { officePhone: { contains: compact } },
                    { emailAddresses: { some: { email: { contains: q } } } },
                ],
            },
            select: {
                id: true,
                name: true,
                organizationName: true,
                emailAddresses: { select: { email: true, isPrimary: true }, orderBy: { sortOrder: 'asc' } },
            },
            orderBy: recent,
            take: limit,
        }),
        prisma.lead.findMany({
            where: {
                isDeleted: false,
                OR: [
                    { name: { contains: q } },
                    { organizationName: { contains: q } },
                    { leadCode: { contains: q } },
                    { mobile: { contains: compact } },
                ],
            },
            select: { id: true, name: true, organizationName: true, leadCode: true },
            orderBy: recent,
            take: limit,
        }),
        prisma.opportunity.findMany({
            where: {
                isDeleted: false,
                OR: [{ opportunityName: { contains: q } }, { opportunityCode: { contains: q } }, { organizationName: { contains: q } }],
            },
            select: { id: true, opportunityCode: true, opportunityName: true, organizationName: true, salesStage: true },
            orderBy: recent,
            take: limit,
        }),
    ]);

    return {
        organizations: organizations.map((o) => ({
            id: o.id,
            category: 'organizations',
            title: o.organizationName,
            subtitle: joinParts(o.tradeName && o.tradeName !== o.organizationName ? o.tradeName : '', o.billingCity),
            href: `/organizations/${o.id}`,
        })),
        contacts: contacts.map((c) => {
            const email = c.emailAddresses.find((e) => e.isPrimary)?.email ?? c.emailAddresses[0]?.email;
            return { id: c.id, category: 'contacts', title: c.name, subtitle: joinParts(email, c.organizationName), href: `/contacts/${c.id}` };
        }),
        leads: leads.map((l) => ({
            id: l.id,
            category: 'leads',
            title: l.name,
            subtitle: joinParts(l.organizationName, l.leadCode),
            href: `/leads/${l.id}`,
        })),
        opportunities: opportunities.map((o) => ({
            id: o.id,
            category: 'opportunities',
            title: o.opportunityCode,
            subtitle: joinParts(o.opportunityName, o.organizationName),
            meta: o.salesStage,
            href: `/opportunities/${o.id}`,
        })),
    };
}

export const searchService = {
    /** Up to `limit` matches per category, cached briefly; a blank query returns nothing. */
    async search(query: unknown): Promise<GlobalSearchResults> {
        const { q, limit } = searchQuerySchema.parse(query ?? {});
        if (!q) return empty();
        // Hashed so arbitrary user text never becomes part of a Redis key (or a SCAN pattern).
        const digest = createHash('sha256').update(q.toLowerCase()).digest('hex').slice(0, 32);
        return cacheService.getOrSet(CACHE_KEYS.search(`${limit}:${digest}`), SEARCH_CACHE_TTL_SECONDS, () => runSearch(q, limit));
    },
};
