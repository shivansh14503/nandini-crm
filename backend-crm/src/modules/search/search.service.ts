import { createHash } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../../config/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { CACHE_KEYS, cacheService } from '../../services/cache.service.js';
import { assertPermission, canDo } from '../shared/accessControl.js';
import type { AuthUser } from '../../types/user.types.js';
import type { EntityCodePrefix } from '../../utils/codeGenerator.js';
import type { SeriesModule } from '../document-series/documentSeries.format.js';
import { shownNumberModules } from '../document-series/documentSeries.service.js';
import { detectEntityCode, gstSearchPrefix, panSearch, phoneSearch, phoneWhere, type PhoneSearch } from '../shared/searchTerms.js';
import { contactService } from '../contacts/contact.service.js';
import { leadService } from '../leads/lead.service.js';
import { opportunityService } from '../opportunities/opportunity.service.js';
import { organizationService } from '../organizations/organization.service.js';
import { partnerCompanyService } from '../partner-companies/partnerCompany.service.js';
import { productService } from '../products/product.service.js';
import { quotationService } from '../quotations/quotation.service.js';
import { ticketService } from '../tickets/ticket.service.js';
import { contractService } from '../contracts/contract.service.js';

/**
 * Global search: one query across every module, matched on record numbers (Document Series), names, emails,
 * phone numbers, GSTIN, PAN and bank account numbers. Shapes mirror frontend-crm/src/services/globalSearch.service.ts.
 *
 * Search is not limited by row-level access: every user finds every (non-deleted) record, whoever owns it.
 */

/** Result groups in Sales navbar order (leads → opportunities → quotations → organizations → contacts), then the rest. */
export const GLOBAL_SEARCH_CATEGORIES = [
    'leads',
    'opportunities',
    'quotations',
    'organizations',
    'contacts',
    'tickets',
    'contracts',
    'products',
    'partnerCompanies',
] as const;
export type GlobalSearchCategory = (typeof GLOBAL_SEARCH_CATEGORIES)[number];

/** The field that matched, when it is not already visible in the title / subtitle (e.g. `PAN · AAACR1234A`). */
export interface GlobalSearchMatch {
    label: string;
    value: string;
}

export interface GlobalSearchResult {
    id: string;
    category: GlobalSearchCategory;
    title: string;
    subtitle: string;
    /** Right-aligned tag (stage / status). */
    meta?: string;
    match?: GlobalSearchMatch;
    href: string;
}

export interface GlobalSearchResponse {
    results: Record<GlobalSearchCategory, GlobalSearchResult[]>;
    /** Total matches per category; only when requested (`totals=true`). */
    totals?: Record<GlobalSearchCategory, number>;
    /**
     * Ids of every match per category, most recently updated first (up to `MAX_IDS_PER_MODULE`); only when requested
     * (`ids=true`). The results page shows these rows in each module's own list table.
     */
    ids?: Record<GlobalSearchCategory, string[]>;
}

/** Cap on the ids returned per module with `ids=true`. */
export const MAX_IDS_PER_MODULE = 1000;

const flag = z.preprocess((v) => v === true || v === 'true' || v === '1', z.boolean()).default(false);

/**
 * Typed digits needed before numbers (phones, bank accounts, HSN, running numbers) are matched by any part of them.
 * The navbar suggestions wait for 3; the results page (Enter) passes `minDigits=1` to match even a single digit.
 */
export const DEFAULT_MIN_NUMBER_DIGITS = 3;

export const searchQuerySchema = z.object({
    q: z.string().trim().max(100, { message: 'Search text cannot exceed 100 characters.' }).default(''),
    limit: z.coerce.number().int().min(1).max(50).catch(5).default(5),
    page: z.coerce.number().int().min(1).max(1000).catch(1).default(1),
    /** Search one module only (the results page's module tabs). */
    category: z.enum(GLOBAL_SEARCH_CATEGORIES).optional().catch(undefined),
    totals: flag,
    /** Also return every matching id per module (see `GlobalSearchResponse.ids`). */
    ids: flag,
    /** Digits needed before numbers match by any part (see DEFAULT_MIN_NUMBER_DIGITS). */
    minDigits: z.coerce.number().int().min(1).max(DEFAULT_MIN_NUMBER_DIGITS).catch(DEFAULT_MIN_NUMBER_DIGITS).default(DEFAULT_MIN_NUMBER_DIGITS),
});

const SEARCH_CACHE_TTL_SECONDS = 30;
/**
 * Placeholder lifetime of a guarded search read (the default is 90 s). Search is the slowest cached read: a document
 * series query, then up to 27 queries (9 modules x rows / total / ids) queued on the driver's 10-connection pool,
 * each allowed 15 s, after a cold connect of up to 30 s, so it can outlast 90 s. A read that outlives its placeholder
 * is only left uncached, and a placeholder left behind by a crash only stops that one query being cached, so a
 * generous lifetime costs nothing.
 */
const SEARCH_PLACEHOLDER_TTL_SECONDS = 180;

const joinParts = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(' • ');

const perCategory = <T>(value: () => T): Record<GlobalSearchCategory, T> =>
    Object.fromEntries(GLOBAL_SEARCH_CATEGORIES.map((c) => [c, value()])) as Record<GlobalSearchCategory, T>;

// ── What the search text is ─────────────────────────────────────────────────

const NUMERIC = /^\+?[\d\s().-]+$/;
/** Identifier columns (GSTIN, PAN, CIN) are only searched with a long enough single token, to keep noise down. */
const MIN_IDENTIFIER_TOKEN = 5;

interface Terms {
    q: string;
    lower: string;
    /** A legacy entity code (`OPP-0042`): only that entity's number column is searched. */
    code: { prefix: EntityCodePrefix; code: string } | null;
    /** A phone number (complete or 7+ digits). */
    phone: PhoneSearch | null;
    /** The start of a GSTIN (`27AAACR…`). */
    gst: string | null;
    /** A complete PAN (`AAACR1234A`). */
    pan: string | null;
    /** The bare digits (`minDigits`+) when the text is a number or part of one: phone, bank account, HSN, running number. */
    digits: string | null;
    /** Single alphanumeric token, uppercased, for identifier columns. */
    token: string | null;
    /** Free text: names, emails, record numbers and the rest. */
    text: boolean;
}

function analyze(q: string, minDigits: number): Terms {
    const code = detectEntityCode(q);
    const phone = code ? null : phoneSearch(q);
    const gst = code || phone ? null : gstSearchPrefix(q);
    const pan = code || phone || gst ? null : panSearch(q);
    const numeric = NUMERIC.test(q) ? q.replace(/\D/g, '') : '';
    const token = /^[a-z0-9]+$/i.test(q) && q.length >= MIN_IDENTIFIER_TOKEN ? q.toUpperCase() : null;
    return {
        q,
        lower: q.toLowerCase(),
        code,
        phone,
        gst,
        pan,
        digits: !code && numeric.length >= minDigits ? numeric : null,
        token,
        text: !code && !phone && !gst && !pan,
    };
}

/** Clauses on phone columns: exact / partial for phone-shaped text, `contains` for shorter numbers. */
function phoneClauses<F extends string>(t: Terms, fields: readonly F[]) {
    if (t.phone) return phoneWhere(t.phone, fields);
    if (t.digits) return fields.map((field) => ({ [field]: { contains: t.digits } }) as Partial<Record<F, { contains: string }>>);
    return [];
}

/** True when `value` contains the search text (for numbers: its digits, with or without the country code). */
function hits(t: Terms, value: string | null | undefined): boolean {
    if (!value) return false;
    if (t.code) return value.toUpperCase().startsWith(t.code.code);
    if (value.toLowerCase().includes(t.lower)) return true;
    if (t.digits) {
        const digits = value.replace(/\D/g, '');
        if (!digits) return false;
        return digits.includes(t.digits) || (t.digits.length > 10 && digits.endsWith(t.digits.slice(-10)));
    }
    return false;
}

type Candidate = [label: string, value: string | null | undefined, display?: (value: string) => string];

/** The first candidate field that matched, unless the match is already visible in the result's title or subtitle. */
function findMatch(t: Terms, visible: (string | null | undefined)[], candidates: Candidate[]): GlobalSearchMatch | undefined {
    if (visible.some((v) => hits(t, v))) return undefined;
    for (const [label, value, display] of candidates) {
        if (value && hits(t, value)) return { label, value: display ? display(value) : value };
    }
    return undefined;
}

/** Bank account numbers are shown by their last 4 digits only. */
const maskAccount = (value: string) => (value.length > 4 ? `•••• ${value.slice(-4)}` : value);

const emailCandidates = (emails: { email: string }[]): Candidate[] => emails.map((e) => ['Email', e.email] as Candidate);

function parseEmails(json: string | null): string[] {
    if (!json) return [];
    try {
        const parsed: unknown = JSON.parse(json);
        if (!Array.isArray(parsed)) return [];
        return parsed.map((e) => (e && typeof e === 'object' && 'email' in e ? String(e.email ?? '') : '')).filter(Boolean);
    } catch {
        return [];
    }
}

// ── Per-module queries ──────────────────────────────────────────────────────

interface Context {
    t: Terms;
    shown: Set<SeriesModule>;
    skip: number;
    take: number;
    withTotal: boolean;
    withIds: boolean;
}

interface Found {
    rows: GlobalSearchResult[];
    total: number;
    ids: string[];
}

const nonEmpty = <T>(clauses: T[]): T[] | null => (clauses.length > 0 ? clauses : null);

/**
 * Number-column clause: only for free text or numbers, and only when the module's numbers are shown (an
 * admin-added Document Series); hidden numbers are not searchable either.
 */
const numbered = <T>(ctx: Context, module: SeriesModule, clause: T): T[] =>
    (ctx.t.text || ctx.t.digits) && ctx.shown.has(module) ? [clause] : [];

/** For a legacy-code search: the clause when the code is this module's (and its numbers are shown), else null. */
const ownCode = <T>(ctx: Context, prefix: EntityCodePrefix, module: SeriesModule, clause: T): T[] | null =>
    ctx.t.code?.prefix === prefix && ctx.shown.has(module) ? [clause] : null;

async function collect<W, R>(
    ctx: Context,
    where: W | null,
    find: (where: W) => Promise<R[]>,
    count: (where: W) => Promise<number>,
    findIds: (where: W) => Promise<{ id: string }[]>,
    map: (row: R) => GlobalSearchResult,
): Promise<Found> {
    if (!where) return { rows: [], total: 0, ids: [] };
    const [rows, total, ids] = await Promise.all([
        ctx.take > 0 ? find(where) : Promise.resolve([]),
        ctx.withTotal ? count(where) : Promise.resolve(0),
        ctx.withIds ? findIds(where) : Promise.resolve([]),
    ]);
    return { rows: rows.map(map), total, ids: ids.map((r) => r.id) };
}

const recent = { updatedAt: 'desc' } as const;

const MODULES: Record<GlobalSearchCategory, (ctx: Context) => Promise<Found>> = {
    leads: (ctx) => {
        const { t } = ctx;
        const shown = ctx.shown.has('lead');
        const clauses: Prisma.LeadWhereInput[] | null = t.code
            ? ownCode(ctx, 'LD', 'lead', { leadCode: { startsWith: t.code.code } })
            : t.gst
              ? [{ gstNumber: { startsWith: t.gst } }]
              : t.pan
                ? [{ gstNumber: { contains: t.pan } }]
                : nonEmpty<Prisma.LeadWhereInput>([
                      ...(t.text
                          ? [
                                { name: { contains: t.q } },
                                { organizationName: { contains: t.q } },
                                { tradeName: { contains: t.q } },
                                { mailingName: { contains: t.q } },
                                { emailAddress: { some: { email: { contains: t.q } } } },
                            ]
                          : []),
                      ...(t.text && t.token ? [{ gstNumber: { contains: t.token } }] : []),
                      ...numbered(ctx, 'lead', { leadCode: { contains: t.q } }),
                      ...phoneClauses(t, ['mobile', 'otherPhone'] as const),
                  ]);
        const where = clauses && { isDeleted: false, OR: clauses };
        return collect(
            ctx,
            where,
            (w) =>
                prisma.lead.findMany({
                    where: w,
                    select: {
                        id: true,
                        name: true,
                        organizationName: true,
                        tradeName: true,
                        mailingName: true,
                        leadCode: true,
                        status: true,
                        mobile: true,
                        otherPhone: true,
                        gstNumber: true,
                        emailAddress: { select: { email: true }, orderBy: { sortOrder: 'asc' } },
                    },
                    orderBy: recent,
                    skip: ctx.skip,
                    take: ctx.take,
                }),
            (w) => prisma.lead.count({ where: w }),
            (w) => prisma.lead.findMany({ where: w, select: { id: true }, orderBy: recent, take: MAX_IDS_PER_MODULE }),
            (l) => {
                const subtitle = joinParts(l.organizationName, shown ? l.leadCode : '');
                return {
                    id: l.id,
                    category: 'leads',
                    title: l.name,
                    subtitle,
                    meta: l.status,
                    match: findMatch(t, [l.name, subtitle], [
                        ['Trade name', l.tradeName],
                        ['Mailing name', l.mailingName],
                        ...emailCandidates(l.emailAddress),
                        ['Mobile', l.mobile],
                        ['Other phone', l.otherPhone],
                        ['GSTIN', l.gstNumber],
                    ]),
                    href: `/leads/${l.id}`,
                };
            },
        );
    },

    opportunities: (ctx) => {
        const { t } = ctx;
        const shown = ctx.shown.has('opportunity');
        const clauses: Prisma.OpportunityWhereInput[] | null = t.code
            ? ownCode(ctx, 'OPP', 'opportunity', { opportunityCode: { startsWith: t.code.code } })
            : t.gst || t.pan
              ? null
              : nonEmpty<Prisma.OpportunityWhereInput>([
                    ...(t.text
                        ? [
                              { opportunityName: { contains: t.q } },
                              { organizationName: { contains: t.q } },
                              { contact: { contains: t.q } },
                              { contactEmail: { contains: t.q } },
                          ]
                        : []),
                    ...numbered(ctx, 'opportunity', { opportunityCode: { contains: t.q } }),
                    ...phoneClauses(t, ['contactNumber'] as const),
                ]);
        const where = clauses && { isDeleted: false, OR: clauses };
        return collect(
            ctx,
            where,
            (w) =>
                prisma.opportunity.findMany({
                    where: w,
                    select: {
                        id: true,
                        opportunityCode: true,
                        opportunityName: true,
                        organizationName: true,
                        contact: true,
                        contactNumber: true,
                        contactEmail: true,
                        salesStage: true,
                    },
                    orderBy: recent,
                    skip: ctx.skip,
                    take: ctx.take,
                }),
            (w) => prisma.opportunity.count({ where: w }),
            (w) => prisma.opportunity.findMany({ where: w, select: { id: true }, orderBy: recent, take: MAX_IDS_PER_MODULE }),
            (o) => {
                const { title, subtitle } = shown
                    ? { title: o.opportunityCode, subtitle: joinParts(o.opportunityName, o.organizationName) }
                    : { title: o.opportunityName || o.organizationName, subtitle: o.opportunityName ? o.organizationName : '' };
                return {
                    id: o.id,
                    category: 'opportunities',
                    title,
                    subtitle,
                    meta: o.salesStage,
                    match: findMatch(t, [title, subtitle], [
                        ['Contact', o.contact],
                        ['Phone', o.contactNumber],
                        ['Email', o.contactEmail],
                    ]),
                    href: `/opportunities/${o.id}`,
                };
            },
        );
    },

    quotations: (ctx) => {
        const { t } = ctx;
        const shown = ctx.shown.has('quotation');
        const clauses: Prisma.QuotationWhereInput[] | null = t.code
            ? ownCode(ctx, 'QT', 'quotation', { quotationCode: { startsWith: t.code.code } })
            : t.gst
              ? [{ gstNumber: { startsWith: t.gst } }]
              : t.pan
                ? [{ gstNumber: { contains: t.pan } }]
                : nonEmpty<Prisma.QuotationWhereInput>([
                      ...(t.text
                          ? [
                                { quotationTitle: { contains: t.q } },
                                { organizationName: { contains: t.q } },
                                { contact: { contains: t.q } },
                                { preparedFor: { contains: t.q } },
                                { contactEmail: { contains: t.q } },
                            ]
                          : []),
                      ...(t.text && t.token ? [{ gstNumber: { contains: t.token } }] : []),
                      ...numbered(ctx, 'quotation', { quotationCode: { contains: t.q } }),
                      ...phoneClauses(t, ['contactNumber'] as const),
                  ]);
        const where = clauses && { isDeleted: false, OR: clauses };
        return collect(
            ctx,
            where,
            (w) =>
                prisma.quotation.findMany({
                    where: w,
                    select: {
                        id: true,
                        quotationCode: true,
                        quotationTitle: true,
                        organizationName: true,
                        contact: true,
                        preparedFor: true,
                        contactEmail: true,
                        contactNumber: true,
                        gstNumber: true,
                        quoteStage: true,
                    },
                    orderBy: recent,
                    skip: ctx.skip,
                    take: ctx.take,
                }),
            (w) => prisma.quotation.count({ where: w }),
            (w) => prisma.quotation.findMany({ where: w, select: { id: true }, orderBy: recent, take: MAX_IDS_PER_MODULE }),
            (q) => {
                const { title, subtitle } = shown
                    ? { title: q.quotationCode, subtitle: joinParts(q.quotationTitle, q.organizationName) }
                    : { title: q.quotationTitle, subtitle: q.organizationName ?? '' };
                return {
                    id: q.id,
                    category: 'quotations',
                    title,
                    subtitle,
                    meta: q.quoteStage,
                    match: findMatch(t, [title, subtitle], [
                        ['Contact', q.contact],
                        ['Prepared for', q.preparedFor],
                        ['Email', q.contactEmail],
                        ['Mobile', q.contactNumber],
                        ['GSTIN', q.gstNumber],
                    ]),
                    href: `/quotations/${q.id}`,
                };
            },
        );
    },

    organizations: (ctx) => {
        const { t } = ctx;
        const shown = ctx.shown.has('organization');
        const clauses: Prisma.OrganizationWhereInput[] | null = t.code
            ? ownCode(ctx, 'ORG', 'organization', { accountCode: { startsWith: t.code.code } })
            : t.gst
              ? [{ gstNumber: { startsWith: t.gst } }]
              : t.pan
                ? [{ panNumber: t.pan }, { gstNumber: { contains: t.pan } }]
                : nonEmpty<Prisma.OrganizationWhereInput>([
                      ...(t.text
                          ? [
                                { organizationName: { contains: t.q } },
                                { tradeName: { contains: t.q } },
                                { mailingName: { contains: t.q } },
                                { sapCodeTallyId: { contains: t.q } },
                                { billingCity: { contains: t.q } },
                                { corporateEmails: { some: { email: { contains: t.q } } } },
                            ]
                          : []),
                      ...(t.text && t.token
                          ? [{ gstNumber: { contains: t.token } }, { panNumber: { contains: t.token } }, { cinNo: { contains: t.token } }]
                          : []),
                      ...numbered(ctx, 'organization', { accountCode: { contains: t.q } }),
                      ...(t.digits ? [{ accountNo: { contains: t.digits } }] : []),
                  ]);
        const where = clauses && { isDeleted: false, OR: clauses };
        return collect(
            ctx,
            where,
            (w) =>
                prisma.organization.findMany({
                    where: w,
                    select: {
                        id: true,
                        accountCode: true,
                        organizationName: true,
                        tradeName: true,
                        mailingName: true,
                        billingCity: true,
                        accountStatus: true,
                        sapCodeTallyId: true,
                        gstNumber: true,
                        panNumber: true,
                        cinNo: true,
                        accountNo: true,
                        corporateEmails: { select: { email: true }, orderBy: { sortOrder: 'asc' } },
                    },
                    orderBy: recent,
                    skip: ctx.skip,
                    take: ctx.take,
                }),
            (w) => prisma.organization.count({ where: w }),
            (w) => prisma.organization.findMany({ where: w, select: { id: true }, orderBy: recent, take: MAX_IDS_PER_MODULE }),
            (o) => {
                const subtitle = joinParts(
                    o.tradeName && o.tradeName !== o.organizationName ? o.tradeName : '',
                    o.billingCity,
                    shown ? o.accountCode : '',
                );
                return {
                    id: o.id,
                    category: 'organizations',
                    title: o.organizationName,
                    subtitle,
                    meta: o.accountStatus,
                    match: findMatch(t, [o.organizationName, subtitle], [
                        ['PAN', o.panNumber],
                        ['GSTIN', o.gstNumber],
                        ['Bank A/c', o.accountNo, maskAccount],
                        ['CIN', o.cinNo],
                        ...emailCandidates(o.corporateEmails),
                        ['Mailing name', o.mailingName],
                        ['SAP / Tally ID', o.sapCodeTallyId],
                    ]),
                    href: `/organizations/${o.id}`,
                };
            },
        );
    },

    contacts: (ctx) => {
        const { t } = ctx;
        const shown = ctx.shown.has('contact');
        const phones = ['mobile', 'officePhone', 'phone3', 'phone4', 'phone5'] as const;
        const clauses: Prisma.ContactWhereInput[] | null = t.code
            ? ownCode(ctx, 'CON', 'contact', { contactCode: { startsWith: t.code.code } })
            : t.gst || t.pan
              ? null
              : nonEmpty<Prisma.ContactWhereInput>([
                    ...(t.text
                        ? [
                              { name: { contains: t.q } },
                              { organizationName: { contains: t.q } },
                              { emailAddress: { some: { email: { contains: t.q } } } },
                          ]
                        : []),
                    ...numbered(ctx, 'contact', { contactCode: { contains: t.q } }),
                    ...phoneClauses(t, phones),
                ]);
        const where = clauses && { isDeleted: false, OR: clauses };
        return collect(
            ctx,
            where,
            (w) =>
                prisma.contact.findMany({
                    where: w,
                    select: {
                        id: true,
                        contactCode: true,
                        name: true,
                        organizationName: true,
                        designation: true,
                        mobile: true,
                        officePhone: true,
                        phone3: true,
                        phone4: true,
                        phone5: true,
                        emailAddress: { select: { email: true, isPrimary: true }, orderBy: { sortOrder: 'asc' } },
                    },
                    orderBy: recent,
                    skip: ctx.skip,
                    take: ctx.take,
                }),
            (w) => prisma.contact.count({ where: w }),
            (w) => prisma.contact.findMany({ where: w, select: { id: true }, orderBy: recent, take: MAX_IDS_PER_MODULE }),
            (c) => {
                const email = c.emailAddress.find((e) => e.isPrimary)?.email ?? c.emailAddress[0]?.email;
                const subtitle = joinParts(email, c.organizationName, shown ? c.contactCode : '');
                return {
                    id: c.id,
                    category: 'contacts',
                    title: c.name,
                    subtitle,
                    meta: c.designation ?? undefined,
                    match: findMatch(t, [c.name, subtitle], [
                        ['Mobile', c.mobile],
                        ['Office phone', c.officePhone],
                        ['Phone', c.phone3],
                        ['Phone', c.phone4],
                        ['Phone', c.phone5],
                        ...emailCandidates(c.emailAddress),
                    ]),
                    href: `/contacts/${c.id}`,
                };
            },
        );
    },

    tickets: (ctx) => {
        const { t } = ctx;
        const shown = ctx.shown.has('ticket');
        const clauses: Prisma.TicketWhereInput[] | null = t.code
            ? ownCode(ctx, 'TKT', 'ticket', { ticketNumber: { startsWith: t.code.code } })
            : t.gst || t.pan
              ? null
              : nonEmpty<Prisma.TicketWhereInput>([
                    ...(t.text
                        ? [
                              { ticketSubject: { contains: t.q } },
                              { organizationName: { contains: t.q } },
                              { contact: { contains: t.q } },
                              { contactEmail: { contains: t.q } },
                          ]
                        : []),
                    ...numbered(ctx, 'ticket', { ticketNumber: { contains: t.q } }),
                    ...phoneClauses(t, ['contactNumber'] as const),
                ]);
        const where = clauses && { isDeleted: false, OR: clauses };
        return collect(
            ctx,
            where,
            (w) =>
                prisma.ticket.findMany({
                    where: w,
                    select: {
                        id: true,
                        ticketNumber: true,
                        ticketSubject: true,
                        organizationName: true,
                        contact: true,
                        contactNumber: true,
                        contactEmail: true,
                        ticketStatus: true,
                    },
                    orderBy: recent,
                    skip: ctx.skip,
                    take: ctx.take,
                }),
            (w) => prisma.ticket.count({ where: w }),
            (w) => prisma.ticket.findMany({ where: w, select: { id: true }, orderBy: recent, take: MAX_IDS_PER_MODULE }),
            (k) => {
                const { title, subtitle } = shown
                    ? { title: k.ticketNumber, subtitle: joinParts(k.ticketSubject, k.organizationName) }
                    : { title: k.ticketSubject || k.organizationName, subtitle: k.ticketSubject ? k.organizationName : '' };
                return {
                    id: k.id,
                    category: 'tickets',
                    title,
                    subtitle,
                    meta: k.ticketStatus,
                    match: findMatch(t, [title, subtitle], [
                        ['Contact', k.contact],
                        ['Phone', k.contactNumber],
                        ['Email', k.contactEmail],
                    ]),
                    href: `/tickets/${k.id}`,
                };
            },
        );
    },

    contracts: (ctx) => {
        const { t } = ctx;
        const shown = ctx.shown.has('contract');
        const clauses: Prisma.ContractWhereInput[] | null = t.code
            ? ownCode(ctx, 'CTR', 'contract', { contractNumber: { startsWith: t.code.code } })
            : t.gst || t.pan
              ? null
              : nonEmpty<Prisma.ContractWhereInput>([
                    ...(t.text
                        ? [
                              { contractTitle: { contains: t.q } },
                              { organizationName: { contains: t.q } },
                              { contact: { contains: t.q } },
                              { opportunity: { contains: t.q } },
                              { tallySerialNo: { contains: t.q } },
                              { billNumber: { contains: t.q } },
                          ]
                        : []),
                    ...numbered(ctx, 'contract', { contractNumber: { contains: t.q } }),
                    // Tally serial and bill numbers are often all digits, which read as a phone number rather than text.
                    ...(!t.text && t.digits ? [{ tallySerialNo: { contains: t.digits } }, { billNumber: { contains: t.digits } }] : []),
                ]);
        const where = clauses && { isDeleted: false, OR: clauses };
        return collect(
            ctx,
            where,
            (w) =>
                prisma.contract.findMany({
                    where: w,
                    select: {
                        id: true,
                        contractNumber: true,
                        contractTitle: true,
                        organizationName: true,
                        contact: true,
                        opportunity: true,
                        tallySerialNo: true,
                        billNumber: true,
                        status: true,
                    },
                    orderBy: recent,
                    skip: ctx.skip,
                    take: ctx.take,
                }),
            (w) => prisma.contract.count({ where: w }),
            (w) => prisma.contract.findMany({ where: w, select: { id: true }, orderBy: recent, take: MAX_IDS_PER_MODULE }),
            (c) => {
                const { title, subtitle } = shown
                    ? { title: c.contractNumber, subtitle: joinParts(c.contractTitle, c.organizationName) }
                    : { title: c.contractTitle, subtitle: c.organizationName };
                return {
                    id: c.id,
                    category: 'contracts',
                    title,
                    subtitle,
                    meta: c.status,
                    match: findMatch(t, [title, subtitle], [
                        ['Contact', c.contact],
                        ['Opportunity', c.opportunity],
                        ['Tally Serial No', c.tallySerialNo],
                        ['Bill No', c.billNumber],
                    ]),
                    href: `/contracts/${c.id}`,
                };
            },
        );
    },

    products: (ctx) => {
        const { t } = ctx;
        const shown = ctx.shown.has('product');
        const clauses: Prisma.ProductWhereInput[] | null = t.code
            ? ownCode(ctx, 'PRD', 'product', { productCode: { startsWith: t.code.code } })
            : t.gst || t.pan
              ? null
              : nonEmpty<Prisma.ProductWhereInput>([
                    ...(t.text
                        ? [{ productName: { contains: t.q } }, { manufacturer: { contains: t.q } }, { productCategory: { contains: t.q } }]
                        : []),
                    ...numbered(ctx, 'product', { productCode: { contains: t.q } }),
                    ...(t.digits ? [{ hsnCode: { contains: t.digits } }] : []),
                ]);
        const where = clauses && { isDeleted: false, OR: clauses };
        return collect(
            ctx,
            where,
            (w) =>
                prisma.product.findMany({
                    where: w,
                    select: { id: true, productCode: true, productName: true, productCategory: true, manufacturer: true, hsnCode: true, isActive: true },
                    orderBy: recent,
                    skip: ctx.skip,
                    take: ctx.take,
                }),
            (w) => prisma.product.count({ where: w }),
            (w) => prisma.product.findMany({ where: w, select: { id: true }, orderBy: recent, take: MAX_IDS_PER_MODULE }),
            (p) => {
                const subtitle = joinParts(shown ? p.productCode : '', p.productCategory);
                return {
                    id: p.id,
                    category: 'products',
                    title: p.productName,
                    subtitle,
                    meta: p.isActive ? undefined : 'Inactive',
                    match: findMatch(t, [p.productName, subtitle], [
                        ['Manufacturer', p.manufacturer],
                        ['HSN', p.hsnCode],
                    ]),
                    href: `/products/${p.id}`,
                };
            },
        );
    },

    partnerCompanies: (ctx) => {
        const { t } = ctx;
        const contactPhones = phoneClauses(t, ['mobile', 'officePhone'] as const);
        const clauses: Prisma.PartnerCompanyWhereInput[] | null = t.code
            ? null
            : t.gst
              ? [{ gstNumber: { startsWith: t.gst } }]
              : t.pan
                ? [{ panNumber: t.pan }, { gstNumber: { contains: t.pan } }]
                : nonEmpty<Prisma.PartnerCompanyWhereInput>([
                      ...(t.text
                          ? [
                                { partnerName: { contains: t.q } },
                                { principalCompany: { contains: t.q } },
                                { email: { contains: t.q } },
                                { emailAddressJson: { contains: t.q } },
                                { contacts: { some: { OR: [{ name: { contains: t.q } }, { email: { contains: t.q } }] } } },
                            ]
                          : []),
                      ...(t.text && t.token
                          ? [{ gstNumber: { contains: t.token } }, { panNumber: { contains: t.token } }, { cinNo: { contains: t.token } }]
                          : []),
                      ...phoneClauses(t, ['officePhone'] as const),
                      ...(contactPhones.length > 0 ? [{ contacts: { some: { OR: contactPhones } } }] : []),
                      ...(t.digits ? [{ accountNo: { contains: t.digits } }] : []),
                  ]);
        const where = clauses && { isDeleted: false, OR: clauses };
        return collect(
            ctx,
            where,
            (w) =>
                prisma.partnerCompany.findMany({
                    where: w,
                    select: {
                        id: true,
                        partnerName: true,
                        natureOfPartner: true,
                        city: true,
                        isActive: true,
                        principalCompany: true,
                        officePhone: true,
                        email: true,
                        emailAddressJson: true,
                        gstNumber: true,
                        panNumber: true,
                        cinNo: true,
                        accountNo: true,
                        contacts: { select: { name: true, mobile: true, officePhone: true, email: true }, take: 20 },
                    },
                    orderBy: recent,
                    skip: ctx.skip,
                    take: ctx.take,
                }),
            (w) => prisma.partnerCompany.count({ where: w }),
            (w) => prisma.partnerCompany.findMany({ where: w, select: { id: true }, orderBy: recent, take: MAX_IDS_PER_MODULE }),
            (p) => {
                const subtitle = joinParts(p.natureOfPartner, p.city);
                const emails = [...new Set([p.email, ...parseEmails(p.emailAddressJson)].filter((e): e is string => Boolean(e)))];
                return {
                    id: p.id,
                    category: 'partnerCompanies',
                    title: p.partnerName,
                    subtitle,
                    meta: p.isActive ? undefined : 'Inactive',
                    match: findMatch(t, [p.partnerName, subtitle], [
                        ['PAN', p.panNumber],
                        ['GSTIN', p.gstNumber],
                        ['Bank A/c', p.accountNo, maskAccount],
                        ['CIN', p.cinNo],
                        ['Phone', p.officePhone],
                        ...emails.map((e) => ['Email', e] as Candidate),
                        ['Principal company', p.principalCompany],
                        ...p.contacts.flatMap((c): Candidate[] => [
                            ['Contact', c.name],
                            ['Contact mobile', c.mobile, (v) => joinParts(c.name, v)],
                            ['Contact phone', c.officePhone, (v) => joinParts(c.name, v)],
                            ['Contact email', c.email, (v) => joinParts(c.name, v)],
                        ]),
                    ]),
                    href: `/partner-companies/${p.id}`,
                };
            },
        );
    },
};

/**
 * Empties the categories of modules the user's role can't view (Admin › Roles: View None), after the shared cache. A
 * module at View Own still lists every match, as search always has: opening a record checks access.
 */
export function hideUnviewable(response: GlobalSearchResponse, user: AuthUser): GlobalSearchResponse {
    const hidden = GLOBAL_SEARCH_CATEGORIES.filter((c) => !canDo(user, c, 'view'));
    if (!hidden.length) return response;
    const out: GlobalSearchResponse = {
        results: { ...response.results },
        ...(response.totals ? { totals: { ...response.totals } } : {}),
        ...(response.ids ? { ids: { ...response.ids } } : {}),
    };
    for (const c of hidden) {
        out.results[c] = [];
        if (out.totals) out.totals[c] = 0;
        if (out.ids) out.ids[c] = [];
    }
    return out;
}

async function runSearch(
    q: string,
    options: { limit: number; page: number; category?: GlobalSearchCategory; totals: boolean; ids: boolean; minDigits: number },
): Promise<GlobalSearchResponse> {
    const ctx: Context = {
        t: analyze(q, options.minDigits),
        shown: await shownNumberModules(),
        skip: (options.page - 1) * options.limit,
        // Id requests (the results page) need no display rows.
        take: options.ids ? 0 : options.limit,
        withTotal: options.totals,
        withIds: options.ids,
    };
    const categories = options.category ? [options.category] : GLOBAL_SEARCH_CATEGORIES;
    const found = await Promise.all(categories.map((c) => MODULES[c](ctx)));

    const response: GlobalSearchResponse = { results: perCategory(() => []) };
    if (options.totals) response.totals = perCategory(() => 0);
    if (options.ids) response.ids = perCategory(() => []);
    categories.forEach((c, i) => {
        response.results[c] = found[i].rows;
        if (response.totals) response.totals[c] = found[i].total;
        if (response.ids) response.ids[c] = found[i].ids;
    });
    return response;
}

export const searchService = {
    /**
     * Up to `limit` matches per category (one category and a page of it with `category` / `page`), plus total
     * counts with `totals=true` and every matching id with `ids=true`. Cached briefly; a blank query returns nothing.
     */
    async search(query: unknown, user: AuthUser): Promise<GlobalSearchResponse> {
        return hideUnviewable(await this.searchAll(query), user);
    },

    /** The search as every role with View on every module sees it (the cached part). */
    async searchAll(query: unknown): Promise<GlobalSearchResponse> {
        const { q, limit, page, category, totals, ids, minDigits } = searchQuerySchema.parse(query ?? {});
        if (!q) {
            return {
                results: perCategory(() => []),
                ...(totals ? { totals: perCategory(() => 0) } : {}),
                ...(ids ? { ids: perCategory((): string[] => []) } : {}),
            };
        }
        // Everyone sees the same results, so one cache entry per query. Hashed so arbitrary user text never becomes
        // part of a Redis key (or a SCAN pattern).
        const digest = createHash('sha256').update(q.toLowerCase()).digest('hex').slice(0, 32);
        const key = CACHE_KEYS.search(`${category ?? 'all'}:${page}:${limit}:${totals ? 't' : '-'}:${ids ? 'i' : '-'}:d${minDigits}:${digest}`);
        // Guarded: every entity write drops `cache:search:*`, so results read while a write commits are not cached.
        return cacheService.getOrSetGuarded(key, SEARCH_CACHE_TTL_SECONDS, () => runSearch(q, { limit, page, category, totals, ids, minDigits }), {
            placeholderTtlSeconds: SEARCH_PLACEHOLDER_TTL_SECONDS,
        });
    },

    /**
     * The list rows (each module's list API shape) of matched records, in the order of `ids`, so the results page
     * can show them in the module's own table. Not limited by row-level access, like the search itself.
     */
    async records(body: unknown, user: AuthUser): Promise<{ id: string }[]> {
        const { module, ids } = searchRecordsSchema.parse(body ?? {});
        assertPermission(user, module, 'view');
        const rows: { id: string }[] = await RECORD_LOADERS[module](ids, user);
        const byId = new Map(rows.map((row) => [row.id, row]));
        return ids.map((id) => byId.get(id)).filter((row): row is { id: string } => Boolean(row));
    },
};

export const searchRecordsSchema = z.object({
    module: z.enum(GLOBAL_SEARCH_CATEGORIES),
    ids: z.array(z.string().trim().min(1).max(50)).max(MAX_IDS_PER_MODULE),
});

const RECORD_LOADERS: Record<GlobalSearchCategory, (ids: string[], user: AuthUser) => Promise<{ id: string }[]>> = {
    leads: (ids) => leadService.listByIds(ids),
    opportunities: (ids) => opportunityService.listByIds(ids),
    quotations: (ids) => quotationService.listByIds(ids),
    organizations: (ids, user) => organizationService.listByIds(ids, user),
    contacts: (ids) => contactService.listByIds(ids),
    tickets: (ids) => ticketService.listByIds(ids),
    contracts: (ids) => contractService.listByIds(ids),
    products: (ids) => productService.listByIds(ids),
    partnerCompanies: (ids) => partnerCompanyService.listByIds(ids),
};
