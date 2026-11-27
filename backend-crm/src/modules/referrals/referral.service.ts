import { prisma, type TransactionClient } from '../../config/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { auditService, diffRecords } from '../../services/audit.service.js';
import { cacheService } from '../../services/cache.service.js';
import type { AuthUser } from '../../types/user.types.js';
import type { PaginatedResult } from '../../utils/apiResponse.js';
import { HttpError } from '../../utils/httpError.js';
import { daysAgo } from '../../utils/mappers.js';
import { parsePagination } from '../../utils/pagination.js';
import { asPayload, checkModulePayload, loadModuleFieldConfig, validateModulePayload } from '../form-configs/customFieldValidator.js';
import { assertAssigneeValid, assertRecordAccess, buildAccessScopeWhere } from '../shared/accessControl.js';
import { emailsInclude, normalizeEmails, replaceEmails } from '../shared/entityEmails.js';
import { assertEmailsDeliverable, queueEmailVerification } from '../email-verification/emailVerification.service.js';
import { invalidateSyncedCaches, propagateReferralName, type NameSyncCounts } from '../shared/nameSync.js';
import { phoneSearch, phoneWhere } from '../shared/searchTerms.js';
import { acquireLocks, assertDeletedRow, lockRecords, restoreData, runInTransaction, softDeleteData, type BulkDeleteResult } from '../shared/transactions.js';
import { toReferralData, toReferralDto, type ReferralDto } from './referral.mapper.js';
import { REFERRAL_SORT_FIELDS, referralInputSchema, referralListQuerySchema, type ReferralInput } from './referral.validator.js';

const include = { emailAddress: emailsInclude } as const;

const notFound = () => HttpError.notFound('Referral not found');
/** Columns `assertRecordAccess` reads. */
const OWNER_SELECT = { assignedTo: true, createdBy: true } as const;

// ── Integrity rules (run inside the write transaction) ───────────────────────

/** A mobile number identifies one live referral, as it does one live contact. */
async function assertUniqueMobile(tx: TransactionClient, mobile: string, excludeId?: string): Promise<void> {
    await acquireLocks(tx, [`referral:mobile:${mobile}`]);
    const duplicate = await tx.referral.findFirst({
        where: { mobile, isDeleted: false, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
        select: { name: true },
    });
    if (duplicate) {
        const message = `A referral with mobile ${mobile} already exists (${duplicate.name}).`;
        throw HttpError.conflict(message, [{ message, path: ['mobile'] }]);
    }
}

/** Referral lists feed the Referred By picker; leads and opportunities show the referral's name. */
async function invalidateReferralCaches(synced?: NameSyncCounts): Promise<void> {
    await Promise.all([cacheService.invalidateEntityCaches('referrals'), invalidateSyncedCaches(synced)]);
}

// ── Service ──────────────────────────────────────────────────────────────────

/**
 * Referrals are shared reference data: by default every role lists and opens all of them (any user may pick any active
 * referral as Referred By; the pickers read the lookups, not this list). Admin › Roles decides View / Edit / Delete:
 * at "Own", the user's own (assignee or creator) referrals only.
 */
export const referralService = {
    async list(query: unknown, user: AuthUser): Promise<PaginatedResult<ReferralDto>> {
        const page = parsePagination(query, REFERRAL_SORT_FIELDS);
        const filters = referralListQuerySchema.parse(query ?? {});

        const where: Prisma.ReferralWhereInput = { isDeleted: false, AND: [buildAccessScopeWhere(user, 'assignedTo', 'referrals', 'view')] };
        if (filters.status?.length) where.status = { in: filters.status };
        if (filters.assignedTo) where.assignedTo = filters.assignedTo;
        if (filters.mine) where.assignedTo = user.username;
        if (filters.createdWithinDays) where.createdAt = { gte: daysAgo(filters.createdWithinDays) };
        if (page.search) {
            const phone = phoneSearch(page.search);
            if (phone) where.OR = phoneWhere(phone, ['mobile', 'officePhone'] as const);
            else where.OR = [
                { name: { contains: page.search } },
                { companyName: { contains: page.search } },
                { mobile: { contains: page.search } },
                { officePhone: { contains: page.search } },
                { designation: { contains: page.search } },
                { emailAddress: { some: { email: { contains: page.search } } } },
            ];
        }

        const [total, rows] = await prisma.$transaction([
            prisma.referral.count({ where }),
            prisma.referral.findMany({ where, include, orderBy: [page.orderBy, { id: 'asc' }], skip: page.skip, take: page.take }),
        ]);
        return { data: rows.map(toReferralDto), total, page: page.page, limit: page.limit };
    },

    async getById(id: string, user: AuthUser): Promise<ReferralDto> {
        const row = await prisma.referral.findFirst({ where: { id, isDeleted: false }, include });
        if (!row) throw notFound();
        assertRecordAccess(user, row, 'referrals', 'view');
        return toReferralDto(row);
    },

    async create(body: unknown, user: AuthUser): Promise<ReferralDto> {
        const input = referralInputSchema.parse(body);
        input.customFields = await validateModulePayload('referrals', asPayload(body), input.customFields);
        await assertEmailsDeliverable(input.emailAddress, 'emailAddress');

        const created = await runInTransaction(async (tx) => {
            await assertUniqueMobile(tx, input.mobile);
            const assignedTo = (await assertAssigneeValid(tx, input.assignedTo)) ?? user.username;
            const row = await tx.referral.create({
                data: { ...toReferralData({ ...input, assignedTo }), createdBy: user.username },
            });
            await replaceEmails(tx, { referralId: row.id }, normalizeEmails(input.emailAddress));

            const dto = toReferralDto(await tx.referral.findUniqueOrThrow({ where: { id: row.id }, include }));
            await auditService.record(tx, { entityType: 'Referral', entityId: row.id, action: 'CREATE', changedBy: user.username, changes: dto });
            return dto;
        });
        await invalidateReferralCaches();
        queueEmailVerification({ referralId: created.id });
        return created;
    },

    async update(id: string, patch: Record<string, unknown>, user: AuthUser): Promise<ReferralDto> {
        const fieldConfig = await loadModuleFieldConfig('referrals');
        if ('emailAddress' in patch) await assertEmailsDeliverable(patch.emailAddress, 'emailAddress', { referralId: id });
        let synced: NameSyncCounts | undefined;
        const updated = await runInTransaction(async (tx) => {
            synced = undefined;
            await lockRecords(tx, 'referral', [id]);
            const existing = await tx.referral.findFirst({ where: { id, isDeleted: false }, include });
            if (!existing) throw notFound();
            assertRecordAccess(user, existing, 'referrals', 'edit');

            const before = toReferralDto(existing);
            const merged: Record<string, unknown> = { ...before, ...patch };
            const input = referralInputSchema.parse(merged);
            input.customFields = checkModulePayload(fieldConfig, merged, input.customFields, {
                submittedKeys: new Set(Object.keys(patch)),
                previousCustomFields: before.customFields,
            });

            if (input.mobile !== existing.mobile) await assertUniqueMobile(tx, input.mobile, id);
            const assignedTo = (await assertAssigneeValid(tx, input.assignedTo, { previous: existing.assignedTo })) ?? existing.assignedTo;

            await tx.referral.update({ where: { id }, data: { ...toReferralData({ ...input, assignedTo }), updatedBy: user.username } });
            if ('emailAddress' in patch) {
                await replaceEmails(tx, { referralId: id }, normalizeEmails(input.emailAddress));
            }
            // Leads and opportunities show the referral's name as their Referred By; keep them in step.
            if (input.name !== existing.name) synced = await propagateReferralName(tx, id, input.name, user);

            const after = toReferralDto(await tx.referral.findUniqueOrThrow({ where: { id }, include }));
            const changes: Record<string, unknown> = diffRecords(before, after);
            if (synced && Object.keys(synced).length > 0) changes.nameSyncedTo = synced;
            if (Object.keys(changes).length > 0) {
                await auditService.record(tx, { entityType: 'Referral', entityId: id, action: 'UPDATE', changedBy: user.username, changes });
            }
            return after;
        });

        await invalidateReferralCaches(synced);
        if ('emailAddress' in patch) queueEmailVerification({ referralId: id });
        return updated;
    },

    /** Soft delete. Leads and opportunities that picked the referral keep its name as their Referred By. */
    async remove(id: string, user: AuthUser): Promise<void> {
        await runInTransaction(async (tx) => {
            await lockRecords(tx, 'referral', [id]);
            const existing = await tx.referral.findFirst({ where: { id, isDeleted: false }, select: OWNER_SELECT });
            if (!existing) throw notFound();
            assertRecordAccess(user, existing, 'referrals', 'delete');
            await tx.referral.update({ where: { id }, data: softDeleteData(user) });
            await auditService.record(tx, { entityType: 'Referral', entityId: id, action: 'DELETE', changedBy: user.username });
        });
        await invalidateReferralCaches();
    },

    /**
     * Restore from Admin › Audit Log: brings back a deleted referral (its mobile must still be free).
     * Writes a RESTORE entry pointing at the DELETE it reverses (`revertsId`).
     */
    async restore(id: string, user: AuthUser, revertsId?: string): Promise<void> {
        await runInTransaction(async (tx) => {
            await lockRecords(tx, 'referral', [id]);
            const row = assertDeletedRow(await tx.referral.findUnique({ where: { id }, select: { isDeleted: true, mobile: true } }), 'Referral');
            if (row.mobile) await assertUniqueMobile(tx, row.mobile, id);
            await tx.referral.update({ where: { id }, data: restoreData(user) });
            await auditService.record(tx, { entityType: 'Referral', entityId: id, action: 'RESTORE', changedBy: user.username, revertsId });
        });
        await invalidateReferralCaches();
    },

    async bulkRemove(ids: string[], user: AuthUser): Promise<BulkDeleteResult> {
        const result = await runInTransaction(async (tx) => {
            await lockRecords(tx, 'referral', ids);
            const live = await tx.referral.findMany({ where: { id: { in: ids }, isDeleted: false }, select: { id: true, ...OWNER_SELECT } });
            for (const row of live) assertRecordAccess(user, row, 'referrals', 'delete');
            const liveIds = live.map((row) => row.id);
            if (liveIds.length > 0) {
                await tx.referral.updateMany({ where: { id: { in: liveIds } }, data: softDeleteData(user) });
                await auditService.recordMany(
                    tx,
                    liveIds.map((entityId) => ({ entityType: 'Referral' as const, entityId, action: 'DELETE' as const, changedBy: user.username })),
                );
            }
            return { deleted: liveIds.length, ids: liveIds, notFound: ids.filter((id) => !liveIds.includes(id)) };
        });

        if (result.deleted > 0) await invalidateReferralCaches();
        return result;
    },
};
