import { z } from 'zod';
import { prisma } from '../../config/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { CACHE_KEYS, cacheService } from '../../services/cache.service.js';
import { booleanQuery } from '../../validators/common.js';

/**
 * Data for the frontend's lookup modals and pickers (`LookupRecordMap`): compact projections of the big
 * entities (search + limit) and full lists of the small masters. Cached in Redis; entity writes invalidate
 * `cache:lookups:<entity>*`, masters expire by TTL.
 */

const ENTITY_TTL_SECONDS = 5 * 60;
const MASTER_TTL_SECONDS = 60 * 60;
const ADDRESS_MASTER_TTL_SECONDS = 24 * 60 * 60;

export const lookupQuerySchema = z.object({
    search: z.string().trim().max(100).optional().catch(undefined),
    limit: z.coerce.number().int().min(1).max(200).catch(50).default(50),
});

const withSearch = <T>(search: string | undefined, or: T[]) => (search ? { OR: or } : {});

// ── Users (CrmUser) ──────────────────────────────────────────────────────────

export interface CrmUserDto {
    id: string;
    name: string;
    username: string;
    department: string;
    role: string;
    email: string;
    status: 'Active' | 'Inactive';
    isGroupUser: boolean;
    onLeave: boolean;
}

export const usersQuerySchema = z.object({ includeInactive: booleanQuery });

// ── Compact entity projections ───────────────────────────────────────────────

export interface OrganizationLookupDto {
    id: string;
    accountCode: string;
    organizationName: string;
    mailingName: string;
    tradeName: string;
    billingCity: string;
    billingState: string;
    customerType: string;
    accountStatus: string;
    gstNo: string;
    assignedUser: string;
}

export interface ContactLookupDto {
    id: string;
    contactCode: string;
    name: string;
    organizationName: string;
    organizationId?: string;
    mobile: string;
    email: string;
    designation: string;
    assignedTo: string;
}

export interface ProductLookupDto {
    id: string;
    productCode: string;
    productName: string;
    category: string;
    type: string;
    hsnCode: string;
    mrp: string;
    taxRate: string;
}

export const contactsLookupQuerySchema = lookupQuerySchema.extend({ organizationId: z.string().trim().max(50).optional() });
export const productsLookupQuerySchema = lookupQuerySchema.extend({ category: z.string().trim().max(100).optional() });
export const partnerContactsQuerySchema = z.object({ partnerCompany: z.string().trim().max(200).optional() });
export const addressMasterQuerySchema = z.object({
    country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, { message: 'country must be an ISO 3166-1 alpha-2 code.' }).optional(),
});

export const lookupService = {
    async users(query: unknown): Promise<CrmUserDto[]> {
        const { includeInactive } = usersQuerySchema.parse(query ?? {});
        return cacheService.getOrSet(CACHE_KEYS.lookups(`users:${includeInactive ? 'all' : 'active'}`), ENTITY_TTL_SECONDS, async () => {
            const rows = await prisma.user.findMany({
                where: includeInactive ? {} : { isActive: true },
                orderBy: [{ fullName: 'asc' }, { username: 'asc' }],
            });
            return rows.map((user) => ({
                id: String(user.id),
                name: user.fullName || user.username,
                username: user.username,
                department: user.department ?? '',
                role: user.role,
                email: user.email ?? '',
                status: user.isActive ? 'Active' : 'Inactive',
                isGroupUser: user.isGroupUser,
                onLeave: user.onLeave,
            }));
        });
    },

    async organizations(query: unknown): Promise<OrganizationLookupDto[]> {
        const { search, limit } = lookupQuerySchema.parse(query ?? {});
        const load = async () => {
            const where: Prisma.OrganizationWhereInput = {
                isDeleted: false,
                ...withSearch(search, [
                    { organizationName: { contains: search } },
                    { accountCode: { contains: search } },
                    { tradeName: { contains: search } },
                    { gstNo: { contains: search } },
                    { billingCity: { contains: search } },
                ]),
            };
            const rows = await prisma.organization.findMany({ where, orderBy: { organizationName: 'asc' }, take: limit });
            return rows.map((o) => ({
                id: o.id,
                accountCode: o.accountCode,
                organizationName: o.organizationName,
                mailingName: o.mailingName ?? '',
                tradeName: o.tradeName ?? '',
                billingCity: o.billingCity ?? '',
                billingState: o.billingState ?? '',
                customerType: o.customerType ?? '',
                accountStatus: o.accountStatus,
                gstNo: o.gstNo ?? '',
                assignedUser: o.assignedUser ?? '',
            }));
        };
        // Only the unfiltered list is cached; searches are cheap and too varied to be worth caching.
        return search ? load() : cacheService.getOrSet(CACHE_KEYS.lookups(`organizations:${limit}`), ENTITY_TTL_SECONDS, load);
    },

    async contacts(query: unknown): Promise<ContactLookupDto[]> {
        const { search, limit, organizationId } = contactsLookupQuerySchema.parse(query ?? {});
        const load = async () => {
            const where: Prisma.ContactWhereInput = {
                isDeleted: false,
                ...(organizationId ? { organizationId } : {}),
                ...withSearch(search, [
                    { name: { contains: search } },
                    { contactCode: { contains: search } },
                    { mobile: { contains: search } },
                    { organizationName: { contains: search } },
                    { emailAddresses: { some: { email: { contains: search } } } },
                ]),
            };
            const rows = await prisma.contact.findMany({
                where,
                include: { emailAddresses: { orderBy: { sortOrder: 'asc' } } },
                orderBy: { name: 'asc' },
                take: limit,
            });
            return rows.map((c) => ({
                id: c.id,
                contactCode: c.contactCode,
                name: c.name,
                organizationName: c.organizationName,
                organizationId: c.organizationId ?? undefined,
                mobile: c.mobile,
                email: (c.emailAddresses.find((e) => e.isPrimary) ?? c.emailAddresses[0])?.email ?? '',
                designation: c.designation ?? '',
                assignedTo: c.assignedTo,
            }));
        };
        return search || organizationId ? load() : cacheService.getOrSet(CACHE_KEYS.lookups(`contacts:${limit}`), ENTITY_TTL_SECONDS, load);
    },

    async products(query: unknown): Promise<ProductLookupDto[]> {
        const { search, limit, category } = productsLookupQuerySchema.parse(query ?? {});
        const load = async () => {
            const where: Prisma.ProductWhereInput = {
                isDeleted: false,
                isActive: true,
                ...(category ? { category } : {}),
                ...withSearch(search, [
                    { productName: { contains: search } },
                    { productCode: { contains: search } },
                    { category: { contains: search } },
                    { hsnCode: { contains: search } },
                ]),
            };
            const rows = await prisma.product.findMany({ where, orderBy: { productName: 'asc' }, take: limit });
            return rows.map((p) => ({
                id: p.id,
                productCode: p.productCode,
                productName: p.productName,
                category: p.category ?? '',
                type: p.type ?? '',
                hsnCode: p.hsnCode ?? '',
                mrp: p.mrp?.toString() ?? '',
                taxRate: p.taxRate ?? '',
            }));
        };
        return search || category ? load() : cacheService.getOrSet(CACHE_KEYS.lookups(`products:${limit}`), ENTITY_TTL_SECONDS, load);
    },

    /** `NatureOfCallItem[]` (active entries). */
    async natureOfCalls() {
        return cacheService.getOrSet(CACHE_KEYS.lookups('nature-of-calls'), MASTER_TTL_SECONDS, () =>
            prisma.natureOfCall.findMany({
                where: { isActive: true },
                select: { id: true, name: true, priority: true },
                orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
            }),
        );
    },

    /** `PartnerCompany[]` (active). */
    async partnerCompanies() {
        return cacheService.getOrSet(CACHE_KEYS.lookups('partner-companies'), MASTER_TTL_SECONDS, async () => {
            const rows = await prisma.partnerCompany.findMany({ where: { isActive: true }, orderBy: { companyName: 'asc' } });
            return rows.map((p) => ({
                id: p.id,
                companyName: p.companyName,
                natureOfPartner: p.natureOfPartner ?? '',
                phone: p.phone ?? '',
                email: p.email ?? '',
                city: p.city ?? '',
                billingCountry: p.billingCountry ?? '',
                assignedTo: p.assignedTo ?? '',
            }));
        });
    },

    /** `PartnerCompanyContact[]` (active), optionally for one partner company (by name). */
    async partnerContacts(query: unknown) {
        const { partnerCompany } = partnerContactsQuerySchema.parse(query ?? {});
        const all = await cacheService.getOrSet(CACHE_KEYS.lookups('partner-contacts'), MASTER_TTL_SECONDS, async () => {
            const rows = await prisma.partnerCompanyContact.findMany({
                where: { isActive: true, partnerCompany: { isActive: true } },
                include: { partnerCompany: { select: { companyName: true } } },
                orderBy: { name: 'asc' },
            });
            return rows.map((c) => ({
                id: c.id,
                name: c.name,
                designation: c.designation ?? '',
                partnerCompany: c.partnerCompany.companyName,
                mobile: c.mobile ?? '',
                officePhone: c.officePhone ?? undefined,
                email: c.email ?? '',
                location: c.location ?? '',
            }));
        });
        if (!partnerCompany) return all;
        const target = partnerCompany.toLowerCase();
        return all.filter((c) => c.partnerCompany.toLowerCase() === target);
    },

    /** ISO 3166 countries and subdivisions (`CountryMasterItem` / `StateRegionMasterItem`); `?country=IN` narrows subdivisions. */
    async addressMaster(query: unknown) {
        const { country } = addressMasterQuerySchema.parse(query ?? {});
        const key = country ? `${CACHE_KEYS.addressMaster}:${country}` : CACHE_KEYS.addressMaster;
        return cacheService.getOrSet(key, ADDRESS_MASTER_TTL_SECONDS, async () => {
            const [countries, subdivisions] = await Promise.all([
                prisma.country.findMany({ orderBy: { countryName: 'asc' } }),
                prisma.subdivision.findMany({
                    where: country ? { countryIso2: country } : {},
                    include: { country: { select: { countryName: true } } },
                    orderBy: [{ countryIso2: 'asc' }, { subdivisionName: 'asc' }],
                }),
            ]);
            return {
                countries: countries.map((c) => ({ countryName: c.countryName, iso2Code: c.iso2Code, iso3Code: c.iso3Code, numericCode: c.numericCode })),
                subdivisions: subdivisions.map((s) => ({
                    countryName: s.country.countryName,
                    countryIso2: s.countryIso2,
                    subdivisionCode: s.subdivisionCode,
                    subdivisionName: s.subdivisionName,
                    subdivisionType: s.subdivisionType,
                })),
            };
        });
    },
};
