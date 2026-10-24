import { ROUTES } from '../config/constants';
import { contactService } from './contact.service';
import { leadService } from './lead.service';
import { opportunityService } from './opportunity.service';
import { organizationService } from './organization.service';

export type GlobalSearchCategory = 'organizations' | 'contacts' | 'leads' | 'opportunities';

export interface GlobalSearchResult {
    id: string;
    category: GlobalSearchCategory;
    title: string;
    subtitle: string;
    /** Extra right-aligned tag (e.g. opportunity stage). */
    meta?: string;
    href: string;
}

export type GlobalSearchResults = Record<GlobalSearchCategory, GlobalSearchResult[]>;

export const GLOBAL_SEARCH_CATEGORIES: readonly GlobalSearchCategory[] = [
    'organizations',
    'contacts',
    'leads',
    'opportunities',
];

/** Case/diacritic-insensitive key; also strips spaces so phone numbers match with or without them. */
const normalize = (text: string) =>
    text
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/\s+/g, '');

const matches = (query: string, ...fields: (string | undefined | null)[]) =>
    fields.some((f) => Boolean(f) && normalize(f as string).includes(query));

const joinParts = (...parts: (string | undefined | null)[]) => parts.filter(Boolean).join(' • ');

/**
 * Searches the cached CRM records (organizations, contacts, leads, opportunities).
 * Returns up to `limitPerCategory` matches per category; an empty/whitespace query returns nothing.
 */
export function searchCrm(rawQuery: string, limitPerCategory = 5): GlobalSearchResults {
    const empty: GlobalSearchResults = { organizations: [], contacts: [], leads: [], opportunities: [] };
    const query = normalize(rawQuery.trim());
    if (!query) return empty;

    const organizations = organizationService
        .getAllSync()
        .filter((o) => matches(query, o.organizationName, o.tradeName, o.sapCodeTallyId, o.billingCity))
        .slice(0, limitPerCategory)
        .map<GlobalSearchResult>((o) => ({
            id: o.id,
            category: 'organizations',
            title: o.organizationName,
            subtitle: joinParts(o.tradeName && o.tradeName !== o.organizationName ? o.tradeName : '', o.billingCity),
            href: ROUTES.ORGANIZATION_DETAIL(o.id),
        }));

    const contacts = contactService
        .getAllSync()
        .filter((c) =>
            matches(query, c.name, c.mobile, c.officePhone, ...(c.emailAddresses ?? []).map((e) => e.email))
        )
        .slice(0, limitPerCategory)
        .map<GlobalSearchResult>((c) => {
            const email = (c.emailAddresses ?? []).find((e) => e.isPrimary)?.email ?? c.emailAddresses?.[0]?.email;
            return {
                id: c.id,
                category: 'contacts',
                title: c.name,
                subtitle: joinParts(email, c.organizationName),
                href: ROUTES.CONTACT_DETAIL(c.id),
            };
        });

    const leads = leadService
        .getAllSync()
        .filter((l) => matches(query, l.name, l.organizationName, l.leadCode, l.mobile))
        .slice(0, limitPerCategory)
        .map<GlobalSearchResult>((l) => ({
            id: l.id,
            category: 'leads',
            title: l.name,
            subtitle: joinParts(l.organizationName, l.leadCode),
            href: ROUTES.LEAD_DETAIL(l.id),
        }));

    const opportunities = opportunityService
        .getAllOpportunities()
        .filter((o) => matches(query, o.opportunityName, o.opportunityCode, o.organizationName))
        .slice(0, limitPerCategory)
        .map<GlobalSearchResult>((o) => ({
            id: o.id,
            category: 'opportunities',
            title: o.opportunityCode,
            subtitle: joinParts(o.opportunityName, o.organizationName),
            meta: o.salesStage,
            href: ROUTES.OPPORTUNITY_DETAIL(o.id),
        }));

    return { organizations, contacts, leads, opportunities };
}
