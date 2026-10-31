import { prisma, type TransactionClient } from '../../config/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { auditService, diffRecords } from '../../services/audit.service.js';
import { cacheService } from '../../services/cache.service.js';
import { recentViewsService } from '../../services/recentViews.service.js';
import type { AuthUser } from '../../types/user.types.js';
import type { PaginatedResult } from '../../utils/apiResponse.js';
import { generateEntityCode } from '../../utils/codeGenerator.js';
import { HttpError } from '../../utils/httpError.js';
import { daysAgo, nullable, stringifyStringArray } from '../../utils/mappers.js';
import { parsePagination } from '../../utils/pagination.js';
import { emailsInclude, normalizeEmails, replaceEmails } from '../shared/entityEmails.js';
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

export interface UniqueCheckResult {
    exists: boolean;
    field?: 'organizationName' | 'gstNo';
    accountCode?: string;
    organizationName?: string;
    message?: string;
}

// ── Viewer flags ─────────────────────────────────────────────────────────────

async function viewerFlags(user: AuthUser) {
    const recentIds = new Set(await recentViewsService.list(user.id, RECENT_ENTITY));
    return (row: OrganizationRow) => ({
        isMyAccount: (row.assignedUser ?? row.createdBy) === user.username,
        isRecentlyViewed: recentIds.has(row.id),
    });
}

// ── Integrity checks (run inside the write transaction) ──────────────────────

/** Name / GSTIN locks make "check, then write" race-free (names compare case-insensitively in SQL Server). */
async function assertUnique(tx: TransactionClient, input: OrganizationWriteInput, gstNo: string | null, excludeId?: string): Promise<void> {
    const normalizedName = input.organizationName.trim();
    await acquireLocks(tx, [`organization:name:${normalizedName.toLowerCase()}`, gstNo && `organization:gst:${gstNo}`]);
    const notSelf = excludeId ? { NOT: { id: excludeId } } : {};
    const sameName = await tx.organization.findFirst({
        where: { organizationName: normalizedName, isDeleted: false, ...notSelf },
        select: { accountCode: true },
    });
    if (sameName) {
        const message = `An organization named "${normalizedName}" already exists (${sameName.accountCode}).`;
        throw HttpError.conflict(message, [{ message, path: ['organizationName'] }]);
    }
    if (gstNo) {
        const sameGst = await tx.organization.findFirst({
            where: { gstNo, isDeleted: false, ...notSelf },
            select: { accountCode: true, organizationName: true },
        });
        if (sameGst) {
            const message = `GSTIN ${gstNo} is already registered to ${sameGst.organizationName} (${sameGst.accountCode}).`;
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
export async function createOrganizationRecord(tx: TransactionClient, input: OrganizationWriteInput, user: AuthUser): Promise<OrganizationDto> {
    // Code first: its counter row lock queues concurrent creates before they take any other lock.
    const accountCode = await generateEntityCode(tx, 'ORG');
    await assertUnique(tx, input, gstFor(input));
    const row = await tx.organization.create({
        data: {
            ...toOrganizationData(input, {
                parentOrganizationId: await resolveParentId(tx, input.memberOfParentCorp),
                verification: resolveVerification(input, user),
                assignedUser: nullable(input.assignedUser) ?? user.username,
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

/** Live organization by id, or else by exact (case-insensitive) name, for "find or create" flows. */
export async function findLiveOrganization(tx: TransactionClient, name: string, id?: string): Promise<OrganizationRow | null> {
    if (id) {
        const byId = await tx.organization.findFirst({ where: { id, isDeleted: false }, include });
        if (byId) return byId;
    }
    return name ? tx.organization.findFirst({ where: { organizationName: name, isDeleted: false }, include }) : null;
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

        const where: Prisma.OrganizationWhereInput = { isDeleted: false };
        if (filters.accountStatus) where.accountStatus = filters.accountStatus;
        if (filters.customerType?.length) where.customerType = { in: filters.customerType };
        if (filters.natureOfBusiness) where.natureOfBusiness = { contains: filters.natureOfBusiness };
        if (filters.assignedUser) where.assignedUser = filters.assignedUser;
        if (filters.parentOrganizationId) where.parentOrganizationId = filters.parentOrganizationId;
        if (filters.mine) where.assignedUser = user.username;
        if (filters.createdWithinDays) where.createdAt = { gte: daysAgo(filters.createdWithinDays) };
        if (filters.recent) where.id = { in: await recentViewsService.list(user.id, RECENT_ENTITY) };
        if (page.search) {
            where.OR = [
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

        await recentViewsService.record(user.id, RECENT_ENTITY, id);
        const flagsFor = await viewerFlags(user);
        return toOrganizationDto(row, flagsFor(row));
    },

    /** GET /api/organizations/check-unique — read-only pre-check for the form; the write path still enforces uniqueness. */
    async checkUnique(query: unknown): Promise<UniqueCheckResult> {
        const { organizationName, gstNo, excludeId } = checkOrganizationUniqueQuerySchema.parse(query);
        const notSelf = excludeId ? { NOT: { id: excludeId } } : {};

        if (organizationName) {
            const sameName = await prisma.organization.findFirst({
                where: { organizationName, isDeleted: false, ...notSelf },
                select: { accountCode: true, organizationName: true },
            });
            if (sameName) {
                return {
                    exists: true,
                    field: 'organizationName',
                    accountCode: sameName.accountCode,
                    organizationName: sameName.organizationName,
                    message: `An organization named "${organizationName}" already exists (${sameName.accountCode}).`,
                };
            }
        }
        if (gstNo) {
            const sameGst = await prisma.organization.findFirst({
                where: { gstNo, isDeleted: false, ...notSelf },
                select: { accountCode: true, organizationName: true },
            });
            if (sameGst) {
                return {
                    exists: true,
                    field: 'gstNo',
                    accountCode: sameGst.accountCode,
                    organizationName: sameGst.organizationName,
                    message: `GSTIN ${gstNo} is already registered to ${sameGst.organizationName} (${sameGst.accountCode}).`,
                };
            }
        }
        return { exists: false };
    },

    async create(body: unknown, user: AuthUser): Promise<OrganizationDto> {
        const input = organizationInputSchema.parse(body);

        const created = await runInTransaction((tx) => createOrganizationRecord(tx, input, user));
        await cacheService.invalidateEntityCaches('organizations');
        return created;
    },

    async update(id: string, patch: Record<string, unknown>, user: AuthUser): Promise<OrganizationDto> {
        const flagsFor = await viewerFlags(user);

        const updated = await runInTransaction(async (tx) => {
            await lockRecords(tx, 'organization', [id]);
            const existing = await tx.organization.findFirst({ where: { id, isDeleted: false }, include });
            if (!existing) throw notFound();

            const before = toOrganizationDto(existing, flagsFor(existing));
            const input = organizationInputSchema.parse(mergePatch(before, patch));
            const gstNo = gstFor(input);
            // Strict comparison on purpose: a case-only rename counts as a change and is re-checked (excluding this record).
            if (input.organizationName !== existing.organizationName || gstNo !== existing.gstNo) {
                await assertUnique(tx, input, gstNo, id);
            }

            await tx.organization.update({
                where: { id },
                data: {
                    ...toOrganizationData(input, {
                        parentOrganizationId: await resolveParentId(tx, input.memberOfParentCorp, id),
                        verification: resolveVerification(input, user, existing),
                        assignedUser: nullable(input.assignedUser),
                    }),
                    updatedBy: user.username,
                },
            });
            // Emails are only replaced when the patch sends them.
            if ('corporateEmails' in patch) {
                await replaceEmails(tx, { organizationId: id }, normalizeEmails(input.corporateEmails));
            }

            const saved = await tx.organization.findUniqueOrThrow({ where: { id }, include });
            const after = toOrganizationDto(saved, flagsFor(saved));
            const changes = diffRecords(before, after);
            if (Object.keys(changes).length > 0) {
                await auditService.record(tx, { entityType: 'Organization', entityId: id, action: 'UPDATE', changedBy: user.username, changes });
            }
            return after;
        });

        await cacheService.invalidateEntityCaches('organizations');
        return updated;
    },

    async remove(id: string, user: AuthUser): Promise<void> {
        await runInTransaction(async (tx) => {
            await lockRecords(tx, 'organization', [id]);
            const result = await tx.organization.updateMany({ where: { id, isDeleted: false }, data: softDeleteData(user) });
            if (result.count === 0) throw notFound();
            await auditService.record(tx, { entityType: 'Organization', entityId: id, action: 'DELETE', changedBy: user.username });
        });
        await Promise.all([cacheService.invalidateEntityCaches('organizations'), recentViewsService.forget(RECENT_ENTITY, user.id, [id])]);
    },

    async bulkRemove(ids: string[], user: AuthUser): Promise<BulkDeleteResult> {
        const result = await runInTransaction(async (tx) => {
            await lockRecords(tx, 'organization', ids);
            const live = await tx.organization.findMany({ where: { id: { in: ids }, isDeleted: false }, select: { id: true } });
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
                select: { id: true, accountStatus: true },
            });
            if (targets.length === 0) throw notFound();

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
