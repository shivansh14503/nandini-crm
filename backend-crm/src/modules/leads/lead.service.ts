import { prisma, type TransactionClient } from '../../config/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { auditService, diffRecords } from '../../services/audit.service.js';
import { cacheService } from '../../services/cache.service.js';
import type { AuthUser } from '../../types/user.types.js';
import type { PaginatedResult } from '../../utils/apiResponse.js';
import { generateEntityCode } from '../../utils/codeGenerator.js';
import { HttpError } from '../../utils/httpError.js';
import { daysAgo, fromDateOnly } from '../../utils/mappers.js';
import { parsePagination } from '../../utils/pagination.js';
import { asPayload, checkModulePayload, loadModuleFieldConfig, throwFieldIssues, validateModulePayload } from '../form-configs/customFieldValidator.js';
import { assertAssigneeValid, assertRecordAccess, buildAccessScopeWhere } from '../shared/accessControl.js';
import { emailsInclude, normalizeEmails, replaceEmails } from '../shared/entityEmails.js';
import { assertEmailsDeliverable, queueEmailVerification } from '../email-verification/emailVerification.service.js';
import type { PrefetchedLookups } from '../shared/prefetch.js';
import { businessNow } from '../../validators/notInPast.js';
import { assertFutureSlot, loadRatingConfig, newLeadRatingColumns, planLeadEdit, type RatingColumns } from './lead.followUp.js';
import { codeSearchPrefix, phoneSearch, phoneVariants, phoneWhere } from '../shared/searchTerms.js';
import { assertDeletedRow, lockRecords, restoreData, runInTransaction, softDeleteData, type BulkDeleteResult } from '../shared/transactions.js';
import { assertTaxIdsUnique } from '../shared/taxIdentifiers.js';
import { assertLeadSourceDetails, LEAD_SOURCE_DETAIL_KEYS } from '../shared/leadSource.js';
import { activityOnlyTypeIssues } from '../shared/followupTypes.js';
import { resolveReferredBy } from '../shared/referredBy.js';
import { toLeadData, toLeadDto, type LeadDto } from './lead.mapper.js';
import { resolveAddressPlaces } from '../cities/cityAddresses.js';
import {
    checkLeadDuplicatesQuerySchema,
    CONVERTED_STATUS,
    LEAD_SORT_FIELDS,
    leadInputSchema,
    leadListQuerySchema,
    type LeadInput,
} from './lead.validator.js';

export const leadInclude = { emailAddress: emailsInclude } as const;

const omitKeys = (source: Record<string, unknown>, keys: string[]): Record<string, unknown> =>
    Object.fromEntries(Object.entries(source).filter(([key]) => !keys.includes(key)));

export const leadNotFound = () => HttpError.notFound('Lead not found');
/** Columns `assertRecordAccess` reads. */
const OWNER_SELECT = { assignedTo: true, createdBy: true } as const;

/** A live lead / contact / organization that already has the mobile number or email, so the form can link to it. */
export interface ExistingRecordMatch {
    entityType: 'Lead' | 'Contact' | 'Organization';
    id: string;
    /** Lead / contact / account code. */
    code: string;
    name: string;
    organizationName?: string;
}

export interface LeadDuplicateCheck {
    /** Newest first; leads before contacts. */
    mobileMatches: ExistingRecordMatch[];
    /** Keyed by lowercased email. */
    emailMatches: Record<string, ExistingRecordMatch[]>;
}

const MIN_MOBILE_DIGITS = 7;
/** Matches reported per mobile number / email (the form lists each one). */
const MAX_MATCHES = 5;
const ENTITY_ORDER: Record<ExistingRecordMatch['entityType'], number> = { Lead: 0, Contact: 1, Organization: 2 };

/** `Converted` is only ever set by POST /api/leads/:id/convert, and a converted lead stays converted. */
export function assertStatusTransition(fromStatus: string | null, toStatus: string): void {
    if (fromStatus === CONVERTED_STATUS && toStatus !== CONVERTED_STATUS) {
        throw HttpError.badRequest('A converted lead cannot change status.', [
            { message: 'This lead has already been converted.', path: ['status'] },
        ]);
    }
    if (fromStatus !== CONVERTED_STATUS && toStatus === CONVERTED_STATUS) {
        throw HttpError.badRequest('Use the Convert action to convert a lead.', [
            { message: 'Leads are converted with the Convert action.', path: ['status'] },
        ]);
    }
}

async function loadLead(tx: TransactionClient | typeof prisma, id: string) {
    const row = await tx.lead.findFirst({ where: { id, isDeleted: false }, include: leadInclude });
    if (!row) throw leadNotFound();
    return row;
}

/**
 * Inserts a lead inside the caller's transaction (used by `create`, import and the seed). `rating` is its first
 * Rating (`newLeadRatingColumns`); the Rating is never taken from the lead input.
 */
export async function createLeadRecord(
    tx: TransactionClient,
    input: LeadInput,
    user: AuthUser,
    rating: RatingColumns,
    lookups: PrefetchedLookups = {},
): Promise<LeadDto> {
    await assertTaxIdsUnique(tx, 'lead', { gstNumber: input.gstNumber });
    const leadCode = await generateEntityCode(tx, 'LD');
    // Referred By must be an active referral (imports name one; the form picks one).
    Object.assign(input, await resolveReferredBy(tx, input));
    const assignedTo = (await assertAssigneeValid(tx, input.assignedTo, { activeUsernames: lookups.activeUsernames })) ?? user.username;
    const row = await tx.lead.create({
        data: { ...(await resolveAddressPlaces(tx, 'lead', toLeadData({ ...input, assignedTo }))), ...rating, leadCode, createdBy: user.username },
    });
    await replaceEmails(tx, { leadId: row.id }, normalizeEmails(input.emailAddress));

    const dto = toLeadDto(await loadLead(tx, row.id));
    await auditService.record(tx, { entityType: 'Lead', entityId: row.id, action: 'CREATE', changedBy: user.username, changes: dto });
    return dto;
}

export const leadService = {
    /**
     * List rows (the shape `list` returns) for the given ids, in no particular order and regardless of row-level
     * access: global search shows every matching record to every user.
     */
    async listByIds(ids: string[]): Promise<LeadDto[]> {
        if (ids.length === 0) return [];
        const rows = await prisma.lead.findMany({ where: { id: { in: ids }, isDeleted: false }, include: leadInclude });
        return rows.map(toLeadDto);
    },

    async list(query: unknown, user: AuthUser): Promise<PaginatedResult<LeadDto>> {
        const page = parsePagination(query, LEAD_SORT_FIELDS);
        const filters = leadListQuerySchema.parse(query ?? {});

        const where: Prisma.LeadWhereInput = { isDeleted: false, AND: [buildAccessScopeWhere(user, 'assignedTo')] };
        const statusFilter: Prisma.StringFilter = {};
        if (filters.status?.length) statusFilter.in = filters.status;
        if (filters.excludeStatus?.length) statusFilter.notIn = filters.excludeStatus;
        if (Object.keys(statusFilter).length > 0) where.status = statusFilter;
        if (filters.leadType?.length) where.leadType = { in: filters.leadType };
        if (filters.rating?.length) where.rating = { in: filters.rating };
        if (filters.leadSource?.length) where.leadSource = { in: filters.leadSource };
        if (filters.assignedTo) where.assignedTo = filters.assignedTo;
        if (filters.organizationName) where.organizationName = filters.organizationName;
        if (filters.mine) where.assignedTo = user.username;
        if (filters.nextFollowupDate) where.nextFollowupDate = fromDateOnly(filters.nextFollowupDate);
        if (filters.createdWithinDays) where.createdAt = { gte: daysAgo(filters.createdWithinDays) };
        if (page.search) {
            const code = codeSearchPrefix(page.search, 'LD');
            const phone = code ? null : phoneSearch(page.search);
            if (code) where.OR = [{ leadCode: { startsWith: code } }];
            else if (phone) where.OR = phoneWhere(phone, ['mobile', 'otherPhone'] as const);
            else where.OR = [
                { leadCode: { contains: page.search } },
                { name: { contains: page.search } },
                { mobile: { contains: page.search } },
                { otherPhone: { contains: page.search } },
                { organizationName: { contains: page.search } },
                { emailAddress: { some: { email: { contains: page.search } } } },
            ];
        }

        const [total, rows] = await prisma.$transaction([
            prisma.lead.count({ where }),
            prisma.lead.findMany({ where, include: leadInclude, orderBy: [page.orderBy, { id: 'asc' }], skip: page.skip, take: page.take }),
        ]);
        return { data: rows.map(toLeadDto), total, page: page.page, limit: page.limit };
    },

    async getById(id: string, user: AuthUser): Promise<LeadDto> {
        const row = await loadLead(prisma, id);
        assertRecordAccess(user, row);
        return toLeadDto(row);
    },

    async create(body: unknown, user: AuthUser): Promise<LeadDto> {
        const input = leadInputSchema.parse(body);
        input.customFields = await validateModulePayload('leads', asPayload(body), input.customFields);
        assertLeadSourceDetails(input);
        // Task and Note are Followup Types of Activities only.
        throwFieldIssues(activityOnlyTypeIssues(input.followupType));
        assertStatusTransition(null, input.status);
        // Every new lead needs its first follow-up, date and time, later than now (checked at save time).
        const now = businessNow();
        assertFutureSlot({ date: input.nextFollowupDate ?? '', time: input.nextFollowupTime ?? '' }, now);
        await assertEmailsDeliverable(input.emailAddress, 'emailAddress');

        const created = await runInTransaction(async (tx) => {
            const rating = newLeadRatingColumns(await loadRatingConfig(tx), now.slice(0, 10), input.nextFollowupDate);
            return createLeadRecord(tx, input, user, rating);
        });
        await cacheService.invalidateEntityCaches('leads');
        queueEmailVerification({ leadId: created.id });
        return created;
    },

    /**
     * An edit either records a follow-up (a Customer Response is sent: the Rating is worked out again and a
     * FOLLOW_UP history row written) or changes details only (no response: the follow-up, Rating and unanswered
     * calls stay as they are). See `planLeadEdit` and docs/lead-rating-rules.md §3.
     */
    async update(id: string, body: Record<string, unknown>, user: AuthUser): Promise<LeadDto> {
        const fieldConfig = await loadModuleFieldConfig('leads');
        const { followUpDecision, ...rest } = body;
        const response = typeof rest.customerResponse === 'string' ? rest.customerResponse.trim() : '';
        // Customer Response and Remarks belong to a recorded follow-up: a details-only save keeps the stored ones.
        const patch: Record<string, unknown> = response ? rest : omitKeys(rest, ['customerResponse', 'remarks']);
        if ('emailAddress' in patch) await assertEmailsDeliverable(patch.emailAddress, 'emailAddress', { leadId: id });
        const updated = await runInTransaction(async (tx) => {
            await lockRecords(tx, 'lead', [id]);
            const existing = await loadLead(tx, id);
            assertRecordAccess(user, existing);
            const before = toLeadDto(existing);
            const merged: Record<string, unknown> = { ...before, ...patch };
            // Retyping Referred By without picking a referral means "find it by name", not "keep the old link".
            if ('referredBy' in patch && !('referredById' in patch)) delete merged.referredById;
            const input = leadInputSchema.parse(merged);
            // The follow-up's date and time are checked by `planLeadEdit` (required only when one is scheduled).
            input.customFields = checkModulePayload(fieldConfig, merged, input.customFields, {
                submittedKeys: new Set(Object.keys(patch).filter((key) => key !== 'nextFollowupDate' && key !== 'nextFollowupTime')),
                previousCustomFields: before.customFields,
            });
            assertStatusTransition(existing.status, input.status);
            // Re-checked when the edit touches them, so other edits of an older record aren't refused.
            if (LEAD_SOURCE_DETAIL_KEYS.some((key) => key in patch)) assertLeadSourceDetails(input);
            // Task / Note are Activities-only: refused when the value changes to one (a stored one stays editable).
            throwFieldIssues(activityOnlyTypeIssues(input.followupType, before.followupType));
            const plan = planLeadEdit({
                state: existing,
                response,
                remarks: input.remarks ?? '',
                decision: followUpDecision,
                nextStatus: input.status,
                next: { date: input.nextFollowupDate ?? '', time: input.nextFollowupTime ?? '' },
                config: await loadRatingConfig(tx),
                now: businessNow(),
            });
            await assertTaxIdsUnique(tx, 'lead', { gstNumber: input.gstNumber }, { excludeId: id, previous: { gstNumber: existing.gstNumber } });
            // A Referred By the lead already has (a legacy typed name, or a referral since made Inactive) stays.
            Object.assign(input, await resolveReferredBy(tx, input, existing));
            const assignedTo = (await assertAssigneeValid(tx, input.assignedTo, { previous: existing.assignedTo })) ?? existing.assignedTo;

            await tx.lead.update({
                where: { id },
                data: { ...(await resolveAddressPlaces(tx, 'lead', toLeadData({ ...input, assignedTo }))), ...plan.data, updatedBy: user.username },
            });
            if ('emailAddress' in patch) {
                await replaceEmails(tx, { leadId: id }, normalizeEmails(input.emailAddress));
            }

            const after = toLeadDto(await loadLead(tx, id));
            const changes = diffRecords(before, after);
            if (plan.followUp) {
                // Written even when nothing else changed: every recorded follow-up is part of the history.
                await auditService.record(tx, { entityType: 'Lead', entityId: id, action: 'FOLLOW_UP', changedBy: user.username, changes: { ...changes, followUp: plan.followUp } });
            } else if (Object.keys(changes).length > 0) {
                await auditService.record(tx, { entityType: 'Lead', entityId: id, action: 'UPDATE', changedBy: user.username, changes });
            }
            return after;
        });

        await cacheService.invalidateEntityCaches('leads');
        if ('emailAddress' in patch) queueEmailVerification({ leadId: id });
        return updated;
    },

    async remove(id: string, user: AuthUser): Promise<void> {
        await runInTransaction(async (tx) => {
            await lockRecords(tx, 'lead', [id]);
            const existing = await tx.lead.findFirst({ where: { id, isDeleted: false }, select: OWNER_SELECT });
            if (!existing) throw leadNotFound();
            assertRecordAccess(user, existing);
            await tx.lead.update({ where: { id }, data: softDeleteData(user) });
            await auditService.record(tx, { entityType: 'Lead', entityId: id, action: 'DELETE', changedBy: user.username });
        });
        await cacheService.invalidateEntityCaches('leads');
    },

    /**
     * Restore from Admin › Audit Log: brings back a deleted lead (its GSTIN must still be free).
     * Writes a RESTORE entry pointing at the DELETE it reverses (`revertsId`).
     */
    async restore(id: string, user: AuthUser, revertsId?: string): Promise<void> {
        await runInTransaction(async (tx) => {
            await lockRecords(tx, 'lead', [id]);
            const row = assertDeletedRow(await tx.lead.findUnique({ where: { id }, select: { isDeleted: true, gstNumber: true } }), 'Lead');
            await assertTaxIdsUnique(tx, 'lead', { gstNumber: row.gstNumber }, { excludeId: id });
            await tx.lead.update({ where: { id }, data: restoreData(user) });
            await auditService.record(tx, { entityType: 'Lead', entityId: id, action: 'RESTORE', changedBy: user.username, revertsId });
        });
        await cacheService.invalidateEntityCaches('leads');
    },

    async bulkRemove(ids: string[], user: AuthUser): Promise<BulkDeleteResult> {
        const result = await runInTransaction(async (tx) => {
            await lockRecords(tx, 'lead', ids);
            const live = await tx.lead.findMany({ where: { id: { in: ids }, isDeleted: false }, select: { id: true, ...OWNER_SELECT } });
            for (const row of live) assertRecordAccess(user, row);
            const liveIds = live.map((row) => row.id);
            if (liveIds.length > 0) {
                await tx.lead.updateMany({ where: { id: { in: liveIds } }, data: softDeleteData(user) });
                await auditService.recordMany(
                    tx,
                    liveIds.map((entityId) => ({ entityType: 'Lead' as const, entityId, action: 'DELETE' as const, changedBy: user.username })),
                );
            }
            return { deleted: liveIds.length, ids: liveIds, notFound: ids.filter((id) => !liveIds.includes(id)) };
        });

        if (result.deleted > 0) await cacheService.invalidateEntityCaches('leads');
        return result;
    },

    /**
     * Read-only, informational lookup for the lead / contact forms: is this mobile number / are these emails already
     * on a live lead, contact or organization? Returns each record's id so the form can link to it. Never blocks a save.
     */
    async checkDuplicates(query: unknown): Promise<LeadDuplicateCheck> {
        const { mobile, emails, excludeId, excludeType = 'lead' } = checkLeadDuplicatesQuerySchema.parse(query ?? {});
        const result: LeadDuplicateCheck = { mobileMatches: [], emailMatches: {} };
        const notSelf = (type: typeof excludeType) => (excludeId && excludeType === type ? { id: { not: excludeId } } : {});

        if (mobile && mobile.replace(/\D/g, '').length >= MIN_MOBILE_DIGITS) {
            const variants = phoneVariants(mobile);
            const [leads, contacts] = await Promise.all([
                prisma.lead.findMany({
                    where: { isDeleted: false, ...notSelf('lead'), OR: [{ mobile: { in: variants } }, { otherPhone: { in: variants } }] },
                    select: { id: true, leadCode: true, name: true, organizationName: true },
                    orderBy: { createdAt: 'desc' },
                    take: MAX_MATCHES,
                }),
                prisma.contact.findMany({
                    where: { isDeleted: false, ...notSelf('contact'), OR: [{ mobile: { in: variants } }, { officePhone: { in: variants } }] },
                    select: { id: true, contactCode: true, name: true, organizationName: true },
                    orderBy: { createdAt: 'desc' },
                    take: MAX_MATCHES,
                }),
            ]);
            result.mobileMatches = [
                ...leads.map((l): ExistingRecordMatch => ({
                    entityType: 'Lead',
                    id: l.id,
                    code: l.leadCode,
                    name: l.name,
                    organizationName: l.organizationName || undefined,
                })),
                ...contacts.map((c): ExistingRecordMatch => ({
                    entityType: 'Contact',
                    id: c.id,
                    code: c.contactCode,
                    name: c.name,
                    organizationName: c.organizationName || undefined,
                })),
            ].slice(0, MAX_MATCHES);
        }

        const normalizedEmails = [...new Set((emails ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean))];
        if (normalizedEmails.length > 0) {
            const rows = await prisma.entityEmail.findMany({
                where: {
                    email: { in: normalizedEmails },
                    OR: [
                        { lead: { isDeleted: false, ...notSelf('lead') } },
                        { contact: { isDeleted: false, ...notSelf('contact') } },
                        { organization: { isDeleted: false, ...notSelf('organization') } },
                    ],
                },
                select: {
                    email: true,
                    lead: { select: { id: true, leadCode: true, name: true, organizationName: true } },
                    contact: { select: { id: true, contactCode: true, name: true, organizationName: true } },
                    organization: { select: { id: true, accountCode: true, organizationName: true } },
                },
            });
            for (const row of rows) {
                const key = row.email.trim().toLowerCase();
                const list = (result.emailMatches[key] ??= []);
                let match: ExistingRecordMatch | undefined;
                if (row.lead) {
                    match = { entityType: 'Lead', id: row.lead.id, code: row.lead.leadCode, name: row.lead.name, organizationName: row.lead.organizationName || undefined };
                } else if (row.contact) {
                    match = {
                        entityType: 'Contact',
                        id: row.contact.id,
                        code: row.contact.contactCode,
                        name: row.contact.name,
                        organizationName: row.contact.organizationName || undefined,
                    };
                } else if (row.organization) {
                    match = { entityType: 'Organization', id: row.organization.id, code: row.organization.accountCode, name: row.organization.organizationName };
                }
                // The same record can hold an address twice (different rows); list it once.
                if (match && !list.some((m) => m.entityType === match.entityType && m.id === match.id)) list.push(match);
            }
            // Leads first, then contacts, then organizations.
            for (const [key, list] of Object.entries(result.emailMatches)) {
                result.emailMatches[key] = list.sort((a, b) => ENTITY_ORDER[a.entityType] - ENTITY_ORDER[b.entityType]).slice(0, MAX_MATCHES);
            }
        }

        return result;
    },
};
