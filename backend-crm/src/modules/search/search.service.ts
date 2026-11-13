import { createHash } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../../config/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { CACHE_KEYS, cacheService } from '../../services/cache.service.js';
import type { AuthUser } from '../../types/user.types.js';
import { buildAccessScopeWhere, hasGlobalAccess } from '../shared/accessControl.js';
import { detectEntityCode, gstSearchPrefix, phoneSearch, phoneWhere } from '../shared/searchTerms.js';

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

/**
 * Search clauses per category. An entity code (`OPP-0042`) can only match its own entity, so the other categories
 * get `null` and their queries are skipped; codes and GSTINs use prefix matches, complete phone numbers equality.
 */
function searchClauses(q: string) {
    // Phone numbers match with or without spaces, as in the frontend's normalize().
    const compact = q.replace(/\s+/g, '');
    const code = detectEntityCode(q);
    const phone = code ? null : phoneSearch(q);
    const gst = code || phone ? null : gstSearchPrefix(q);
    /** For a code search: the clause when the code is this category's, else null (skip the query). */
    const ownCode = <T>(prefix: string, clause: T): T[] | null => (code?.prefix === prefix ? [clause] : null);

    const organizations: Prisma.OrganizationWhereInput[] | null = code
        ? ownCode('ORG', { accountCode: { startsWith: code.code } })
        : gst
          ? [{ gstNo: { startsWith: gst } }]
          : [
                { organizationName: { contains: q } },
                { accountCode: { contains: q } },
                { tradeName: { contains: q } },
                { sapCodeTallyId: { contains: q } },
                { billingCity: { contains: q } },
            ];
    const contacts: Prisma.ContactWhereInput[] | null = code
        ? ownCode('CON', { contactCode: { startsWith: code.code } })
        : phone
          ? phoneWhere(phone, ['mobile', 'officePhone'] as const)
          : [
                { name: { contains: q } },
                { contactCode: { contains: q } },
                { mobile: { contains: compact } },
                { officePhone: { contains: compact } },
                { emailAddresses: { some: { email: { contains: q } } } },
            ];
    const leads: Prisma.LeadWhereInput[] | null = code
        ? ownCode('LD', { leadCode: { startsWith: code.code } })
        : phone
          ? phoneWhere(phone, ['mobile'] as const)
          : [{ name: { contains: q } }, { organizationName: { contains: q } }, { leadCode: { contains: q } }, { mobile: { contains: compact } }];
    const opportunities: Prisma.OpportunityWhereInput[] | null = code
        ? ownCode('OPP', { opportunityCode: { startsWith: code.code } })
        : [{ opportunityName: { contains: q } }, { opportunityCode: { contains: q } }, { organizationName: { contains: q } }];
    return { organizations, contacts, leads, opportunities };
}

const none = <T>(): Promise<T[]> => Promise.resolve([]);

async function runSearch(q: string, limit: number, user: AuthUser): Promise<GlobalSearchResults> {
    const recent = { updatedAt: 'desc' } as const;
    const clauses = searchClauses(q);

    const [organizations, contacts, leads, opportunities] = await Promise.all([
        clauses.organizations ? prisma.organization.findMany({
            where: {
                isDeleted: false,
                AND: [buildAccessScopeWhere(user, 'assignedUser')],
                OR: clauses.organizations,
            },
            select: { id: true, organizationName: true, tradeName: true, billingCity: true },
            orderBy: recent,
            take: limit,
        }) : none<{ id: string; organizationName: string; tradeName: string | null; billingCity: string | null }>(),
        clauses.contacts ? prisma.contact.findMany({
            where: {
                isDeleted: false,
                AND: [buildAccessScopeWhere(user, 'assignedTo')],
                OR: clauses.contacts,
            },
            select: {
                id: true,
                name: true,
                organizationName: true,
                emailAddresses: { select: { email: true, isPrimary: true }, orderBy: { sortOrder: 'asc' } },
            },
            orderBy: recent,
            take: limit,
        }) : none<{ id: string; name: string; organizationName: string; emailAddresses: { email: string; isPrimary: boolean }[] }>(),
        clauses.leads ? prisma.lead.findMany({
            where: {
                isDeleted: false,
                AND: [buildAccessScopeWhere(user, 'assignedTo')],
                OR: clauses.leads,
            },
            select: { id: true, name: true, organizationName: true, leadCode: true },
            orderBy: recent,
            take: limit,
        }) : none<{ id: string; name: string; organizationName: string | null; leadCode: string }>(),
        clauses.opportunities ? prisma.opportunity.findMany({
            where: {
                isDeleted: false,
                AND: [buildAccessScopeWhere(user, 'assignedTo')],
                OR: clauses.opportunities,
            },
            select: { id: true, opportunityCode: true, opportunityName: true, organizationName: true, salesStage: true },
            orderBy: recent,
            take: limit,
        }) : none<{ id: string; opportunityCode: string; opportunityName: string; organizationName: string; salesStage: string }>(),
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
    async search(query: unknown, user: AuthUser): Promise<GlobalSearchResults> {
        const { q, limit } = searchQuerySchema.parse(query ?? {});
        if (!q) return empty();
        // Results depend on row-level access, so scoped users get their own cache entries.
        const scope = hasGlobalAccess(user) ? '*' : `u:${user.username.toLowerCase()}`;
        // Hashed so arbitrary user text never becomes part of a Redis key (or a SCAN pattern).
        const digest = createHash('sha256').update(`${scope}\n${q.toLowerCase()}`).digest('hex').slice(0, 32);
        return cacheService.getOrSet(CACHE_KEYS.search(`${limit}:${digest}`), SEARCH_CACHE_TTL_SECONDS, () => runSearch(q, limit, user));
    },
};
