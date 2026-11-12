import { prisma, type TransactionClient } from '../../config/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { auditService, diffRecords } from '../../services/audit.service.js';
import { cacheService } from '../../services/cache.service.js';
import { recentViewsService } from '../../services/recentViews.service.js';
import type { AuthUser } from '../../types/user.types.js';
import type { PaginatedResult } from '../../utils/apiResponse.js';
import { generateEntityCode } from '../../utils/codeGenerator.js';
import { HttpError } from '../../utils/httpError.js';
import { daysAgo, nullable, serializeCustomFields, stringifyStringArray } from '../../utils/mappers.js';
import {
    canonicalizeOrgName,
    duplicateOrganizationMessage,
    extractCoreOrgName,
    findSimilarOrganizations,
    isDuplicateMatchKind,
    type OrgNameMatchKind,
    type SimilarOrganizationResult,
} from '../../utils/organizationName.js';
import { parsePagination } from '../../utils/pagination.js';
import { asPayload, checkModulePayload, loadModuleFieldConfig, validateModulePayload } from '../form-configs/customFieldValidator.js';
import { assertAssigneeValid, assertRecordAccess, buildAccessScopeWhere } from '../shared/accessControl.js';
import { emailsInclude, normalizeEmails, replaceEmails } from '../shared/entityEmails.js';
import { invalidateSyncedCaches, propagateOrganizationName, type NameSyncCounts } from '../shared/nameSync.js';
import { codeSearchPrefix, gstSearchPrefix } from '../shared/searchTerms.js';
import type { PrefetchedLookups } from '../shared/prefetch.js';
import { acquireLocks, lockRecords, runInTransaction, softDeleteData, type BulkDeleteResult } from '../shared/transactions.js';
import { toOrganizationDto, type OrganizationDto, type OrganizationRow } from './organization.mapper.js';
import {
    ORGANIZATION_SORT_FIELDS,
    bulkStatusSchema,
    checkOrganizationUniqueQuerySchema,
    organizationInputSchema,
    organizationListQuerySchema,
    type OrganizationWriteInput,
} from './organization.validator.js';

const RECENT_ENTITY = 'organizations';
const DEFAULT_COUNTRY = 'IN';
const MAX_HIERARCHY_DEPTH = 25;
const include = { corporateEmails: emailsInclude } as const;

const notFound = () => HttpError.notFound('Organization not found');
/** Columns `assertRecordAccess` reads. */
const OWNER_SELECT = { assignedUser: true, createdBy: true } as const;

export interface SimilarOrganizationMatch {
    id: string;
    accountCode: string;
    organizationName: string;
    tradeName: string | null;
    billingCity: string | null;
    billingState: string | null;
    accountStatus: string;
    gstNo: string | null;
    matchKind: OrgNameMatchKind;
}

export interface UniqueCheckResult {
    exists: boolean;
    matchKind?: 'exact' | 'canonical' | 'gstNo';
    field?: 'organizationName' | 'gstNo';
    id?: string;
    accountCode?: string;
    organizationName?: string;
    message?: string;
    /** Existing organizations whose names match or resemble the one checked, best first. */
    suggestions?: SimilarOrganizationMatch[];
}

// ── Name matching ────────────────────────────────────────────────────────────

const SUGGESTION_LIMIT = 6;
/** Upper bound on rows pulled for in-memory name comparison. */
const NAME_CANDIDATE_LIMIT = 300;
const NAME_CANDIDATE_SELECT = {
    id: true,
    accountCode: true,
    organizationName: true,
    tradeName: true,
    billingCity: true,
    billingState: true,
    accountStatus: true,
    gstNo: true,
} as const satisfies Prisma.OrganizationSelect;
type NameCandidate = Prisma.OrganizationGetPayload<{ select: typeof NAME_CANDIDATE_SELECT }>;

/** Words too common (or too often abbreviated) to narrow the candidate query on their own. */
const NON_DISTINCTIVE_TOKENS = new Set([
    'and', 'of', 'the', 'for', 'in', 'india', 'indian', 'group',
    'enterprises', 'industries', 'associates', 'international', 'technologies', 'solutions', 'services',
]);

/**
 * Substrings that every canonical / core / close match of `name` is very likely to contain, used to narrow the
 * SQL query before the precise in-memory comparison: the distinctive core tokens, plus a 3-letter stem of the
 * first one so a typo later in the word still finds the record.
 */
function nameSearchTerms(name: string): string[] {
    const tokens = extractCoreOrgName(name).split(' ').filter((t) => t.length >= 2);
    const distinctive = tokens.filter((t) => !NON_DISTINCTIVE_TOKENS.has(t));
    const picked = (distinctive.length > 0 ? distinctive : tokens).sort((a, b) => b.length - a.length).slice(0, 3);
    const first = tokens[0];
    if (first && first.length > 3) picked.push(first.slice(0, 3));
    return [...new Set(picked)];
}

/** Live organizations that could match `name` (SQL Server `contains` is case-insensitive), capped. */
async function findNameCandidates(client: TransactionClient, name: string, excludeId?: string): Promise<NameCandidate[]> {
    const terms = nameSearchTerms(name);
    if (terms.length === 0) return [];
    return client.organization.findMany({
        where: {
            isDeleted: false,
            ...(excludeId ? { NOT: { id: excludeId } } : {}),
            OR: terms.map((term) => ({ organizationName: { contains: term } })),
        },
        select: NAME_CANDIDATE_SELECT,
        orderBy: { organizationName: 'asc' },
        take: NAME_CANDIDATE_LIMIT,
    });
}

/**
 * Live organizations whose names match `name`, best first. An exact (case-insensitive, per the SQL collation)
 * match always leads, then canonical / core / prefix / fuzzy matches.
 */
async function rankNameMatches(client: TransactionClient, name: string, excludeId?: string): Promise<SimilarOrganizationResult<NameCandidate>[]> {
    const notSelf = excludeId ? { NOT: { id: excludeId } } : {};
    // Sequential on purpose: a transaction client runs one query at a time.
    const exact = await client.organization.findFirst({
        where: { organizationName: name, isDeleted: false, ...notSelf },
        select: NAME_CANDIDATE_SELECT,
    });
    const candidates = await findNameCandidates(client, name, excludeId);
    const ranked = findSimilarOrganizations(candidates, name, { limit: SUGGESTION_LIMIT + 1 }).filter((m) => m.record.id !== exact?.id);
    return (exact ? [{ record: exact, matchKind: 'exact' as const, score: 1 }, ...ranked] : ranked).slice(0, SUGGESTION_LIMIT);
}

/** The live organization with the same legal name as `name` (exact or canonical), if any. */
async function findSameNamedOrganization(
    client: TransactionClient,
    name: string,
    excludeId?: string,
): Promise<{ record: NameCandidate; matchKind: 'exact' | 'canonical' } | null> {
    const top = (await rankNameMatches(client, name, excludeId))[0];
    return top && isDuplicateMatchKind(top.matchKind) ? { record: top.record, matchKind: top.matchKind } : null;
}

const toSimilarMatch = ({ record, matchKind }: SimilarOrganizationResult<NameCandidate>): SimilarOrganizationMatch => ({
    id: record.id,
    accountCode: record.accountCode,
    organizationName: record.organizationName,
    tradeName: record.tradeName,
    billingCity: record.billingCity,
    billingState: record.billingState,
    accountStatus: record.accountStatus,
    gstNo: record.gstNo,
    matchKind,
});

// ── Viewer flags ─────────────────────────────────────────────────────────────

async function viewerFlags(user: AuthUser) {
    const recentIds = new Set(await recentViewsService.list(user.id, RECENT_ENTITY));
    return (row: OrganizationRow) => ({
        isMyAccount: (row.assignedUser ?? row.createdBy) === user.username,
        isRecentlyViewed: recentIds.has(row.id),
    });
}

// ── Integrity checks (run inside the write transaction) ──────────────────────

/**
 * Name / GSTIN locks make "check, then write" race-free. The name lock is keyed on the canonical name, so
 * concurrent "ABC Pvt Ltd" and "ABC Private Limited" creates queue behind each other and the second is rejected.
 */
async function assertUnique(
    tx: TransactionClient,
    input: OrganizationWriteInput,
    gstNo: string | null,
    { excludeId, checkName = true }: { excludeId?: string; checkName?: boolean } = {},
): Promise<void> {
    const normalizedName = input.organizationName.trim();
    const nameKey = canonicalizeOrgName(normalizedName) || normalizedName.toLowerCase();
    await acquireLocks(tx, [checkName ? `organization:name:${nameKey}` : null, gstNo && `organization:gst:${gstNo}`]);
    const notSelf = excludeId ? { NOT: { id: excludeId } } : {};
    const sameName = checkName ? await findSameNamedOrganization(tx, normalizedName, excludeId) : null;
    if (sameName) {
        const message = duplicateOrganizationMessage(sameName.matchKind, sameName.record.organizationName);
        throw HttpError.conflict(message, [{ message, path: ['organizationName'] }]);
    }
    if (gstNo) {
        const sameGst = await tx.organization.findFirst({
            where: { gstNo, isDeleted: false, ...notSelf },
            select: { accountCode: true, organizationName: true },
        });
        if (sameGst) {
            const message = `GSTIN ${gstNo} is already registered to ${sameGst.organizationName}.`;
            throw HttpError.conflict(message, [{ message, path: ['gstNo'] }]);
        }
    }
}

/**
 * Links `memberOfParentCorp` (free text in the form) to the live organization with that exact name, if any.
 * Rejects links that would make an organization its own ancestor.
 */
async function resolveParentId(tx: TransactionClient, parentName: string | undefined, selfId?: string): Promise<string | null> {
    if (!parentName) return null;
    const parent = await tx.organization.findFirst({
        where: { organizationName: parentName, isDeleted: false, ...(selfId ? { NOT: { id: selfId } } : {}) },
        select: { id: true },
    });
    if (!parent || !selfId) return parent?.id ?? null;

    let cursor: string | null = parent.id;
    for (let depth = 0; cursor && depth < MAX_HIERARCHY_DEPTH; depth++) {
        if (cursor === selfId) {
            throw HttpError.badRequest('An organization cannot be a member of one of its own subsidiaries.', [
                { message: 'This parent would create a circular hierarchy.', path: ['memberOfParentCorp'] },
            ]);
        }
        const node: { parentOrganizationId: string | null } | null = await tx.organization.findUnique({
            where: { id: cursor },
            select: { parentOrganizationId: true },
        });
        cursor = node?.parentOrganizationId ?? null;
    }
    return parent.id;
}

// ── Input → columns ──────────────────────────────────────────────────────────

interface Verification {
    verifiedAt: Date | null;
    verifiedBy: string | null;
}

/** Server-owned verification audit: stamped when switched on, cleared when switched off, kept otherwise. */
function resolveVerification(input: OrganizationWriteInput, actor: AuthUser, existing?: { accountVerified: boolean } & Verification): Verification {
    if (!input.accountVerified) return { verifiedAt: null, verifiedBy: null };
    if (existing?.accountVerified) return { verifiedAt: existing.verifiedAt, verifiedBy: existing.verifiedBy };
    return { verifiedAt: new Date(), verifiedBy: actor.username };
}

function toOrganizationData(
    input: OrganizationWriteInput,
    extras: { parentOrganizationId: string | null; verification: Verification; assignedUser: string | null },
): Omit<Prisma.OrganizationUncheckedCreateInput, 'accountCode' | 'createdBy'> {
    const billing = {
        address: nullable(input.billingAddress),
        city: nullable(input.billingCity),
        state: nullable(input.billingState),
        postalCode: nullable(input.billingPostalCode),
        country: input.billingCountry ?? DEFAULT_COUNTRY,
    };
    // "Copy address from billing" is enforced here rather than trusted from the client.
    const shipping = input.copyAddressFromBilling
        ? billing
        : {
              address: nullable(input.shippingAddress),
              city: nullable(input.shippingCity),
              state: nullable(input.shippingState),
              postalCode: nullable(input.shippingPostalCode),
              country: input.shippingCountry ?? DEFAULT_COUNTRY,
          };

    return {
        customDataJson: serializeCustomFields(input.customFields),
        organizationName: input.organizationName,
        // Mailing / trade names follow the organization name until set explicitly (as in the form).
        mailingName: input.mailingName ?? input.organizationName,
        tradeName: input.tradeName ?? input.organizationName,
        natureOfBusiness: nullable(input.natureOfBusiness),
        accountStatus: input.accountStatus,
        inactivityReason: input.accountStatus === 'Active' ? null : nullable(input.inactivityReason),
        typeOfEntity: nullable(input.typeOfEntity),
        customerType: nullable(input.customerType),
        sapCodeTallyId: nullable(input.sapCodeTallyId),
        showroomBranchCode: nullable(input.showroomBranchCode),
        sourceOfLead: nullable(input.sourceOfLead),
        memberOfParentCorp: nullable(input.memberOfParentCorp),
        parentOrganizationId: extras.parentOrganizationId,
        numberOfEmployees: nullable(input.numberOfEmployees),
        annualTurnover: nullable(input.annualTurnover),
        description: nullable(input.description),
        accountVerified: input.accountVerified,
        verifiedAt: extras.verification.verifiedAt,
        verifiedBy: extras.verification.verifiedBy,
        activeAmc: input.activeAmc,
        activeCloud: input.activeCloud,
        provideSupport: input.provideSupport,
        assignedUser: extras.assignedUser,

        billingAddress: billing.address,
        billingStreet: billing.address,
        billingCity: billing.city,
        billingState: billing.state,
        billingPostalCode: billing.postalCode,
        billingCountry: billing.country,
        billingLatitude: nullable(input.billingLatitude),

        shippingAddress: shipping.address,
        shippingStreet: shipping.address,
        shippingCity: shipping.city,
        shippingState: shipping.state,
        shippingPostalCode: shipping.postalCode,
        shippingCountry: shipping.country,
        shippingLongitude: nullable(input.shippingLongitude),
        copyAddressFromBilling: input.copyAddressFromBilling,

        registrationType: input.registrationType,
        panNumber: input.panNumber ?? null,
        msmeRegnNumber: input.msmeRegnNumber ?? null,
        accountName: nullable(input.accountName),
        bankName: nullable(input.bankName),
        bankIfscCode: input.bankIfscCode ?? null,
        gstNo: gstFor(input),
        cinNo: input.cinNo ?? null,
        tanNumber: input.tanNumber ?? null,
        accountNumber: nullable(input.accountNumber),
        typeOfAccount: nullable(input.typeOfAccount),
        bankAddress: nullable(input.bankAddress),

        partnerCompaniesJson: stringifyStringArray(input.partnerCompanies),
    };
}

/** Unregistered organizations carry no GSTIN (the form clears it too). */
const gstFor = (input: OrganizationWriteInput): string | null => (input.registrationType === 'Registered' ? (input.gstNo ?? null) : null);

/**
 * Inserts an organization (code, uniqueness, parent link, emails, audit) inside the caller's transaction.
 * Used by `create` and by lead conversion; cache invalidation is the caller's job.
 */
export async function createOrganizationRecord(
    tx: TransactionClient,
    input: OrganizationWriteInput,
    user: AuthUser,
    lookups: PrefetchedLookups = {},
): Promise<OrganizationDto> {
    // Code first: its counter row lock queues concurrent creates before they take any other lock.
    const accountCode = await generateEntityCode(tx, 'ORG');
    await assertUnique(tx, input, gstFor(input));
    const assignedUser =
        (await assertAssigneeValid(tx, input.assignedUser, { path: 'assignedUser', activeUsernames: lookups.activeUsernames })) ?? user.username;
    const row = await tx.organization.create({
        data: {
            ...toOrganizationData(input, {
                parentOrganizationId: await resolveParentId(tx, input.memberOfParentCorp),
                verification: resolveVerification(input, user),
                assignedUser,
            }),
            accountCode,
            createdBy: user.username,
        },
    });
    await replaceEmails(tx, { organizationId: row.id }, normalizeEmails(input.corporateEmails));

    const saved = await tx.organization.findUniqueOrThrow({ where: { id: row.id }, include });
    const dto = toOrganizationDto(saved, { isMyAccount: saved.assignedUser === user.username, isRecentlyViewed: false });
    await auditService.record(tx, { entityType: 'Organization', entityId: row.id, action: 'CREATE', changedBy: user.username, changes: dto });
    return dto;
}

/**
 * Live organization by id, or else by name for "find or create" flows: exact (case-insensitive) first, then the
 * same legal name written differently, so "ABC Private Limited" links to an existing "ABC Pvt Ltd".
 */
export async function findLiveOrganization(tx: TransactionClient, name: string, id?: string): Promise<OrganizationRow | null> {
    if (id) {
        const byId = await tx.organization.findFirst({ where: { id, isDeleted: false }, include });
        if (byId) return byId;
    }
    const trimmed = name?.trim();
    if (!trimmed) return null;
    const sameName = await findSameNamedOrganization(tx, trimmed);
    return sameName ? tx.organization.findFirst({ where: { id: sameName.record.id, isDeleted: false }, include }) : null;
}

/**
 * Merges a partial update onto the stored record. Paired legacy aliases follow whichever side the patch
 * changed, so a stale twin from the stored record can't override the new value.
 */
function mergePatch(before: OrganizationDto, patch: Record<string, unknown>): Record<string, unknown> {
    const merged: Record<string, unknown> = { ...before, ...patch };
    const aliasPairs: [canonical: string, alias: string][] = [
        ['gstNo', 'gstNumber'],
        ['billingAddress', 'billingStreet'],
        ['shippingAddress', 'shippingStreet'],
    ];
    for (const [canonical, alias] of aliasPairs) {
        if (alias in patch && !(canonical in patch)) merged[canonical] = patch[alias];
        if (canonical in patch && !(alias in patch)) merged[alias] = patch[canonical];
    }
    return merged;
}

// ── Service ──────────────────────────────────────────────────────────────────

export const organizationService = {
    async list(query: unknown, user: AuthUser): Promise<PaginatedResult<OrganizationDto>> {
        const normalizedQuery = { ...(query as Record<string, unknown>) };
        if (normalizedQuery.sortBy === 'gstNumber') normalizedQuery.sortBy = 'gstNo';
        const page = parsePagination(normalizedQuery, ORGANIZATION_SORT_FIELDS);
        const filters = organizationListQuerySchema.parse(normalizedQuery);

        const where: Prisma.OrganizationWhereInput = { isDeleted: false, AND: [buildAccessScopeWhere(user, 'assignedUser')] };
        if (filters.accountStatus) where.accountStatus = filters.accountStatus;
        if (filters.customerType?.length) where.customerType = { in: filters.customerType };
        if (filters.natureOfBusiness) where.natureOfBusiness = { contains: filters.natureOfBusiness };
        if (filters.assignedUser) where.assignedUser = filters.assignedUser;
        if (filters.parentOrganizationId) where.parentOrganizationId = filters.parentOrganizationId;
        if (filters.mine) where.assignedUser = user.username;
        if (filters.createdWithinDays) where.createdAt = { gte: daysAgo(filters.createdWithinDays) };
        if (filters.recent) where.id = { in: await recentViewsService.list(user.id, RECENT_ENTITY) };
        if (page.search) {
            // Codes and GSTINs are typed from the start: a prefix match seeks their index instead of scanning.
            const code = codeSearchPrefix(page.search, 'ORG');
            const gst = code ? null : gstSearchPrefix(page.search);
            if (code) where.OR = [{ accountCode: { startsWith: code } }];
            else if (gst) where.OR = [{ gstNo: { startsWith: gst } }];
            else where.OR = [
                { organizationName: { contains: page.search } },
                { accountCode: { contains: page.search } },
                { natureOfBusiness: { contains: page.search } },
                { customerType: { contains: page.search } },
                { billingCity: { contains: page.search } },
                { billingState: { contains: page.search } },
                { billingAddress: { contains: page.search } },
                { gstNo: { contains: page.search } },
            ];
        }

        const [total, rows, flagsFor] = await Promise.all([
            prisma.organization.count({ where }),
            prisma.organization.findMany({ where, include, orderBy: [page.orderBy, { id: 'asc' }], skip: page.skip, take: page.take }),
            viewerFlags(user),
        ]);
        return { data: rows.map((row) => toOrganizationDto(row, flagsFor(row))), total, page: page.page, limit: page.limit };
    },

    async getById(id: string, user: AuthUser): Promise<OrganizationDto> {
        const row = await prisma.organization.findFirst({ where: { id, isDeleted: false }, include });
        if (!row) throw notFound();
        assertRecordAccess(user, row);

        await recentViewsService.record(user.id, RECENT_ENTITY, id);
        const flagsFor = await viewerFlags(user);
        return toOrganizationDto(row, flagsFor(row));
    },

    /** GET /api/organizations/check-unique — read-only pre-check for the form; the write path still enforces uniqueness. */
    async checkUnique(query: unknown): Promise<UniqueCheckResult> {
        const { organizationName, gstNo, excludeId } = checkOrganizationUniqueQuerySchema.parse(query);
        const notSelf = excludeId ? { NOT: { id: excludeId } } : {};

        let suggestions: SimilarOrganizationMatch[] | undefined;
        if (organizationName) {
            const ranked = await rankNameMatches(prisma, organizationName, excludeId);
            suggestions = ranked.map(toSimilarMatch);
            const top = ranked[0];
            if (top && isDuplicateMatchKind(top.matchKind)) {
                return {
                    exists: true,
                    matchKind: top.matchKind,
                    field: 'organizationName',
                    id: top.record.id,
                    accountCode: top.record.accountCode,
                    organizationName: top.record.organizationName,
                    message: duplicateOrganizationMessage(top.matchKind, top.record.organizationName),
                    suggestions,
                };
            }
        }
        if (gstNo) {
            const sameGst = await prisma.organization.findFirst({
                where: { gstNo, isDeleted: false, ...notSelf },
                select: { id: true, accountCode: true, organizationName: true },
            });
            if (sameGst) {
                return {
                    exists: true,
                    matchKind: 'gstNo',
                    field: 'gstNo',
                    id: sameGst.id,
                    accountCode: sameGst.accountCode,
                    organizationName: sameGst.organizationName,
                    message: `GSTIN ${gstNo} is already registered to ${sameGst.organizationName}.`,
                    suggestions,
                };
            }
        }
        return { exists: false, suggestions };
    },

    async create(body: unknown, user: AuthUser): Promise<OrganizationDto> {
        const input = organizationInputSchema.parse(body);
        input.customFields = await validateModulePayload('organizations', asPayload(body), input.customFields);

        const created = await runInTransaction((tx) => createOrganizationRecord(tx, input, user));
        await cacheService.invalidateEntityCaches('organizations');
        return created;
    },

    async update(id: string, patch: Record<string, unknown>, user: AuthUser): Promise<OrganizationDto> {
        const fieldConfig = await loadModuleFieldConfig('organizations');
        const flagsFor = await viewerFlags(user);
        let synced: NameSyncCounts | undefined;

        const updated = await runInTransaction(async (tx) => {
            synced = undefined;
            await lockRecords(tx, 'organization', [id]);
            const existing = await tx.organization.findFirst({ where: { id, isDeleted: false }, include });
            if (!existing) throw notFound();
            assertRecordAccess(user, existing);

            const before = toOrganizationDto(existing, flagsFor(existing));
            const merged: Record<string, unknown> = mergePatch(before, patch);
            const input = organizationInputSchema.parse(merged);
            input.customFields = checkModulePayload(fieldConfig, merged, input.customFields, {
                submittedKeys: new Set(Object.keys(patch)),
                previousCustomFields: before.customFields,
            });
            const gstNo = gstFor(input);
            // Strict comparison on purpose: a case-only rename counts as a change and is re-checked (excluding this record).
            const nameChanged = input.organizationName !== existing.organizationName;
            if (nameChanged || gstNo !== existing.gstNo) {
                // Only re-check the name when it changed: legacy rows may already have canonical twins, and a
                // GSTIN-only edit shouldn't be blocked by them.
                await assertUnique(tx, input, gstNo, { excludeId: id, checkName: nameChanged });
            }

            await tx.organization.update({
                where: { id },
                data: {
                    ...toOrganizationData(input, {
                        parentOrganizationId: await resolveParentId(tx, input.memberOfParentCorp, id),
                        verification: resolveVerification(input, user, existing),
                        assignedUser: await assertAssigneeValid(tx, input.assignedUser, { previous: existing.assignedUser, path: 'assignedUser' }),
                    }),
                    updatedBy: user.username,
                },
            });
            // Emails are only replaced when the patch sends them.
            if ('corporateEmails' in patch) {
                await replaceEmails(tx, { organizationId: id }, normalizeEmails(input.corporateEmails));
            }
            // Linked records show the organization's name; rename them in the same transaction so lists never drift.
            if (nameChanged) synced = await propagateOrganizationName(tx, id, input.organizationName, user);

            const saved = await tx.organization.findUniqueOrThrow({ where: { id }, include });
            const after = toOrganizationDto(saved, flagsFor(saved));
            const changes: Record<string, unknown> = diffRecords(before, after);
            if (synced && Object.keys(synced).length > 0) changes.nameSyncedTo = synced;
            if (Object.keys(changes).length > 0) {
                await auditService.record(tx, { entityType: 'Organization', entityId: id, action: 'UPDATE', changedBy: user.username, changes });
            }
            return after;
        });

        await Promise.all([cacheService.invalidateEntityCaches('organizations'), invalidateSyncedCaches(synced)]);
        return updated;
    },

    async remove(id: string, user: AuthUser): Promise<void> {
        await runInTransaction(async (tx) => {
            await lockRecords(tx, 'organization', [id]);
            const existing = await tx.organization.findFirst({ where: { id, isDeleted: false }, select: OWNER_SELECT });
            if (!existing) throw notFound();
            assertRecordAccess(user, existing);
            await tx.organization.update({ where: { id }, data: softDeleteData(user) });
            await auditService.record(tx, { entityType: 'Organization', entityId: id, action: 'DELETE', changedBy: user.username });
        });
        await Promise.all([cacheService.invalidateEntityCaches('organizations'), recentViewsService.forget(RECENT_ENTITY, user.id, [id])]);
    },

    async bulkRemove(ids: string[], user: AuthUser): Promise<BulkDeleteResult> {
        const result = await runInTransaction(async (tx) => {
            await lockRecords(tx, 'organization', ids);
            const live = await tx.organization.findMany({ where: { id: { in: ids }, isDeleted: false }, select: { id: true, ...OWNER_SELECT } });
            for (const row of live) assertRecordAccess(user, row);
            const liveIds = live.map((row) => row.id);
            if (liveIds.length > 0) {
                await tx.organization.updateMany({ where: { id: { in: liveIds } }, data: softDeleteData(user) });
                await auditService.recordMany(
                    tx,
                    liveIds.map((entityId) => ({ entityType: 'Organization' as const, entityId, action: 'DELETE' as const, changedBy: user.username })),
                );
            }
            return { deleted: liveIds.length, ids: liveIds, notFound: ids.filter((id) => !liveIds.includes(id)) };
        });

        if (result.deleted > 0) {
            await Promise.all([cacheService.invalidateEntityCaches('organizations'), recentViewsService.forget(RECENT_ENTITY, user.id, result.ids)]);
        }
        return result;
    },

    /** PATCH /api/organizations/bulk-status — backs `organizationService.updateStatusBulk` in the frontend. */
    async updateStatusBulk(body: unknown, user: AuthUser): Promise<OrganizationDto[]> {
        const { ids, status, inactivityReason } = bulkStatusSchema.parse(body);
        const flagsFor = await viewerFlags(user);

        const updated = await runInTransaction(async (tx) => {
            await lockRecords(tx, 'organization', ids);
            const targets = await tx.organization.findMany({
                where: { id: { in: ids }, isDeleted: false },
                select: { id: true, accountStatus: true, ...OWNER_SELECT },
            });
            if (targets.length === 0) throw notFound();
            for (const row of targets) assertRecordAccess(user, row);

            await tx.organization.updateMany({
                where: { id: { in: targets.map((row) => row.id) } },
                data: {
                    accountStatus: status,
                    inactivityReason: status === 'Active' ? null : nullable(inactivityReason),
                    updatedBy: user.username,
                },
            });
            await auditService.recordMany(
                tx,
                targets
                    .filter((row) => row.accountStatus !== status)
                    .map((row) => ({
                        entityType: 'Organization' as const,
                        entityId: row.id,
                        action: 'STATUS_CHANGE' as const,
                        changedBy: user.username,
                        changes: { accountStatus: { from: row.accountStatus, to: status }, ...(inactivityReason ? { inactivityReason } : {}) },
                    })),
            );

            return tx.organization.findMany({ where: { id: { in: targets.map((row) => row.id) } }, include, orderBy: { organizationName: 'asc' } });
        });

        await cacheService.invalidateEntityCaches('organizations');
        return updated.map((row) => toOrganizationDto(row, flagsFor(row)));
    },
};
