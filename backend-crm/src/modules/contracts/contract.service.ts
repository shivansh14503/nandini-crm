import { prisma, type TransactionClient } from '../../config/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { auditService, diffRecords } from '../../services/audit.service.js';
import { cacheService } from '../../services/cache.service.js';
import type { AuthUser } from '../../types/user.types.js';
import type { PaginatedResult } from '../../utils/apiResponse.js';
import { generateEntityCode } from '../../utils/codeGenerator.js';
import { HttpError } from '../../utils/httpError.js';
import { daysAgo, parseStringArray } from '../../utils/mappers.js';
import { parsePagination } from '../../utils/pagination.js';
import { asPayload, checkModulePayload, loadModuleFieldConfig, validateModulePayload } from '../form-configs/customFieldValidator.js';
import { assertAssigneeValid, assertRecordAccess, buildAccessScopeWhere } from '../shared/accessControl.js';
import { findOrganizationByName, type PrefetchedLookups } from '../shared/prefetch.js';
import { assertReference } from '../shared/references.js';
import { assertNotInPast } from '../../validators/notInPast.js';
import { codeSearchPrefix } from '../shared/searchTerms.js';
import { assertDeletedRow, lockRecords, restoreData, runInTransaction, softDeleteData, type BulkDeleteResult } from '../shared/transactions.js';
import { toContractData, toContractDto, type ContractDto, type ContractLink, type ContractLinks } from './contract.mapper.js';
import { CONTRACT_SORT_FIELDS, contractInputSchema, contractListQuerySchema, contractPastChecks, type ContractInput } from './contract.validator.js';

/** Columns `assertRecordAccess` reads. */
const OWNER_SELECT = { assignedTo: true, createdBy: true } as const;

const notFound = () => HttpError.notFound('Contract not found');

/** What the form shows for an opportunity (frontend `opportunityLabel`): its name, else its products, else its organization. */
function opportunityLabel(opportunity: { opportunityName: string | null; productCategoryJson: string | null; organizationName: string }): string {
    return opportunity.opportunityName || parseStringArray(opportunity.productCategoryJson).join(', ') || opportunity.organizationName;
}

/**
 * Resolves the organization, contact and opportunity links. An explicit organization / contact id must reference an
 * existing record (whose name then wins); otherwise the typed organization name links to the live organization with
 * that name, and the contact name to a live contact of that organization. An opportunity is linked only by id
 * (opportunities have no unique name): without one, the typed label is kept as plain text.
 */
async function resolveLinks(
    tx: TransactionClient,
    input: ContractInput,
    previous?: { organizationId: string | null; contactId: string | null; opportunityId: string | null },
    lookups?: PrefetchedLookups,
): Promise<ContractLinks> {
    const orgSelect = { id: true, organizationName: true, isDeleted: true } as const;
    let organization: ContractLink;
    if (input.organizationId) {
        const org = await tx.organization.findUnique({ where: { id: input.organizationId }, select: orgSelect });
        assertReference(org, input.organizationId, previous?.organizationId, 'organization', 'organizationName');
        organization = { id: org.id, name: org.organizationName };
    } else {
        const org = await findOrganizationByName(tx, input.organizationName, lookups);
        organization = org ? { id: org.id, name: org.organizationName } : { id: null, name: input.organizationName };
    }

    const contactSelect = { id: true, name: true, isDeleted: true } as const;
    let contact: ContractLink;
    if (input.contactId) {
        const found = await tx.contact.findUnique({ where: { id: input.contactId }, select: contactSelect });
        assertReference(found, input.contactId, previous?.contactId, 'contact', 'contact');
        contact = { id: found.id, name: found.name };
    } else if (organization.id) {
        const found = await tx.contact.findFirst({
            where: { name: input.contact, organizationId: organization.id, isDeleted: false },
            select: contactSelect,
        });
        contact = found ? { id: found.id, name: found.name } : { id: null, name: input.contact };
    } else {
        // Without an organization a contact name is too ambiguous to link.
        contact = { id: null, name: input.contact };
    }

    let opportunity: ContractLink = { id: null, name: input.opportunity ?? '' };
    if (input.opportunityId) {
        const found = await tx.opportunity.findUnique({
            where: { id: input.opportunityId },
            select: { id: true, isDeleted: true, opportunityName: true, productCategoryJson: true, organizationName: true },
        });
        assertReference(found, input.opportunityId, previous?.opportunityId, 'opportunity', 'opportunity');
        opportunity = { id: found.id, name: input.opportunity ?? opportunityLabel(found) };
    }

    return { organization, contact, opportunity };
}

const nameKey = (value: unknown) => (typeof value === 'string' ? value.trim().toLowerCase() : '');

/** True when the patch sends `key` with another name than the stored one (case and outer spaces ignored). */
const renamesLink = (patch: Record<string, unknown>, before: ContractDto, key: 'organizationName' | 'contact' | 'opportunity') =>
    key in patch && nameKey(patch[key]) !== nameKey(before[key]);

/**
 * Inserts a contract inside the caller's transaction (used by `create`); cache invalidation is the caller's job.
 */
export async function createContractRecord(tx: TransactionClient, input: ContractInput, user: AuthUser, lookups: PrefetchedLookups = {}): Promise<ContractDto> {
    // Code first: its counter row lock queues concurrent creates before they take any other lock.
    const contractNumber = await generateEntityCode(tx, 'CTR');
    const assignedTo = (await assertAssigneeValid(tx, input.assignedTo, { activeUsernames: lookups.activeUsernames })) ?? user.username;
    const links = await resolveLinks(tx, input, undefined, lookups);
    const row = await tx.contract.create({
        data: { ...toContractData({ ...input, assignedTo }, links), contractNumber, createdBy: user.username },
    });
    const dto = toContractDto(row);
    await auditService.record(tx, { entityType: 'Contract', entityId: row.id, action: 'CREATE', changedBy: user.username, changes: dto });
    return dto;
}

export const contractService = {
    /**
     * List rows (the shape `list` returns) for the given ids, in no particular order and regardless of row-level
     * access: global search shows every matching record to every user.
     */
    async listByIds(ids: string[]): Promise<ContractDto[]> {
        if (ids.length === 0) return [];
        const rows = await prisma.contract.findMany({ where: { id: { in: ids }, isDeleted: false } });
        return rows.map(toContractDto);
    },

    async list(query: unknown, user: AuthUser): Promise<PaginatedResult<ContractDto>> {
        const page = parsePagination(query, CONTRACT_SORT_FIELDS);
        const filters = contractListQuerySchema.parse(query ?? {});

        const and: Prisma.ContractWhereInput[] = [{ isDeleted: false }, buildAccessScopeWhere(user, 'assignedTo')];
        if (filters.status?.length) and.push({ status: { in: filters.status } });
        if (filters.excludeStatus?.length) and.push({ status: { notIn: filters.excludeStatus } });
        if (filters.organizationId) and.push({ organizationId: filters.organizationId });
        if (filters.contactId) and.push({ contactId: filters.contactId });
        if (filters.opportunityId) and.push({ opportunityId: filters.opportunityId });
        if (filters.assignedTo) and.push({ assignedTo: filters.assignedTo });
        if (filters.mine) and.push({ assignedTo: user.username });
        if (filters.createdWithinDays) and.push({ createdAt: { gte: daysAgo(filters.createdWithinDays) } });
        if (page.search) {
            const code = codeSearchPrefix(page.search, 'CTR');
            if (code) and.push({ contractNumber: { startsWith: code } });
            else {
                and.push({
                    OR: [
                        { contractNumber: { contains: page.search } },
                        { contractTitle: { contains: page.search } },
                        { organizationName: { contains: page.search } },
                        { contact: { contains: page.search } },
                        { opportunity: { contains: page.search } },
                        { tallySerialNo: { contains: page.search } },
                        { billNumber: { contains: page.search } },
                    ],
                });
            }
        }
        const where: Prisma.ContractWhereInput = { AND: and };

        const [total, rows] = await prisma.$transaction([
            prisma.contract.count({ where }),
            prisma.contract.findMany({ where, orderBy: [page.orderBy, { id: 'asc' }], skip: page.skip, take: page.take }),
        ]);
        return { data: rows.map(toContractDto), total, page: page.page, limit: page.limit };
    },

    async getById(id: string, user: AuthUser): Promise<ContractDto> {
        const row = await prisma.contract.findFirst({ where: { id, isDeleted: false } });
        if (!row) throw notFound();
        assertRecordAccess(user, row);
        return toContractDto(row);
    },

    async create(body: unknown, user: AuthUser): Promise<ContractDto> {
        const input = contractInputSchema.parse(body);
        // Status defaults to "Not Started" when omitted, so the configuration's required check sees the default.
        input.customFields = await validateModulePayload('contracts', { ...asPayload(body), status: input.status }, input.customFields);
        assertNotInPast(contractPastChecks(input));
        const created = await runInTransaction((tx) => createContractRecord(tx, input, user));
        await cacheService.invalidateEntityCaches('contracts');
        return created;
    },

    async update(id: string, patch: Record<string, unknown>, user: AuthUser): Promise<ContractDto> {
        const fieldConfig = await loadModuleFieldConfig('contracts');
        const updated = await runInTransaction(async (tx) => {
            await lockRecords(tx, 'contract', [id]);
            const existing = await tx.contract.findFirst({ where: { id, isDeleted: false } });
            if (!existing) throw notFound();
            assertRecordAccess(user, existing);

            const before = toContractDto(existing);
            const merged: Record<string, unknown> = { ...before, ...patch };
            // Retyping a name without picking a record means "re-link by name" (or, for an opportunity, "no link"),
            // not "keep the old id".
            if (renamesLink(patch, before, 'organizationName') && !('organizationId' in patch)) delete merged.organizationId;
            if (renamesLink(patch, before, 'contact') && !('contactId' in patch)) delete merged.contactId;
            if (renamesLink(patch, before, 'opportunity') && !('opportunityId' in patch)) delete merged.opportunityId;
            const input = contractInputSchema.parse(merged);
            input.customFields = checkModulePayload(fieldConfig, merged, input.customFields, {
                submittedKeys: new Set(Object.keys(patch)),
                previousCustomFields: before.customFields,
            });
            assertNotInPast(contractPastChecks(input, before));

            const links = await resolveLinks(tx, input, existing);
            const assignedTo = (await assertAssigneeValid(tx, input.assignedTo, { previous: existing.assignedTo })) ?? existing.assignedTo;
            const row = await tx.contract.update({
                where: { id },
                data: { ...toContractData({ ...input, assignedTo }, links), updatedBy: user.username },
            });
            const after = toContractDto(row);
            const changes = diffRecords(before, after);
            if (Object.keys(changes).length > 0) {
                await auditService.record(tx, { entityType: 'Contract', entityId: id, action: 'UPDATE', changedBy: user.username, changes });
            }
            return after;
        });

        await cacheService.invalidateEntityCaches('contracts');
        return updated;
    },

    async remove(id: string, user: AuthUser): Promise<void> {
        await runInTransaction(async (tx) => {
            await lockRecords(tx, 'contract', [id]);
            const existing = await tx.contract.findFirst({ where: { id, isDeleted: false }, select: OWNER_SELECT });
            if (!existing) throw notFound();
            assertRecordAccess(user, existing);
            await tx.contract.update({ where: { id }, data: softDeleteData(user) });
            await auditService.record(tx, { entityType: 'Contract', entityId: id, action: 'DELETE', changedBy: user.username });
        });
        await cacheService.invalidateEntityCaches('contracts');
    },

    /**
     * Restore from Admin › Audit Log: brings back a deleted contract.
     * Writes a RESTORE entry pointing at the DELETE it reverses (`revertsId`).
     */
    async restore(id: string, user: AuthUser, revertsId?: string): Promise<void> {
        await runInTransaction(async (tx) => {
            await lockRecords(tx, 'contract', [id]);
            assertDeletedRow(await tx.contract.findUnique({ where: { id }, select: { isDeleted: true } }), 'Contract');
            await tx.contract.update({ where: { id }, data: restoreData(user) });
            await auditService.record(tx, { entityType: 'Contract', entityId: id, action: 'RESTORE', changedBy: user.username, revertsId });
        });
        await cacheService.invalidateEntityCaches('contracts');
    },

    async bulkRemove(ids: string[], user: AuthUser): Promise<BulkDeleteResult> {
        const result = await runInTransaction(async (tx) => {
            await lockRecords(tx, 'contract', ids);
            const live = await tx.contract.findMany({ where: { id: { in: ids }, isDeleted: false }, select: { id: true, ...OWNER_SELECT } });
            for (const row of live) assertRecordAccess(user, row);
            const liveIds = live.map((row) => row.id);
            if (liveIds.length > 0) {
                await tx.contract.updateMany({ where: { id: { in: liveIds } }, data: softDeleteData(user) });
                await auditService.recordMany(
                    tx,
                    liveIds.map((entityId) => ({ entityType: 'Contract' as const, entityId, action: 'DELETE' as const, changedBy: user.username })),
                );
            }
            return { deleted: liveIds.length, ids: liveIds, notFound: ids.filter((id) => !liveIds.includes(id)) };
        });

        if (result.deleted > 0) await cacheService.invalidateEntityCaches('contracts');
        return result;
    },
};
