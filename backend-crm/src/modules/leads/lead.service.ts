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
import { asPayload, checkModulePayload, loadModuleFieldConfig, validateModulePayload } from '../form-configs/customFieldValidator.js';
import { assertAssigneeValid, assertRecordAccess, buildAccessScopeWhere } from '../shared/accessControl.js';
import { emailsInclude, normalizeEmails, replaceEmails } from '../shared/entityEmails.js';
import { assertEmailsDeliverable, queueEmailVerification } from '../email-verification/emailVerification.service.js';
import type { PrefetchedLookups } from '../shared/prefetch.js';
import { assertNotInPast, nextFollowupCheck } from '../../validators/notInPast.js';
import { codeSearchPrefix, phoneSearch, phoneVariants, phoneWhere } from '../shared/searchTerms.js';
import { lockRecords, runInTransaction, softDeleteData, type BulkDeleteResult } from '../shared/transactions.js';
import { assertTaxIdsUnique } from '../shared/taxIdentifiers.js';
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

export const leadInclude = { emailAddresses: emailsInclude } as const;

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

/** Inserts a lead inside the caller's transaction (used by `create`, import and the seed). */
export async function createLeadRecord(tx: TransactionClient, input: LeadInput, user: AuthUser, lookups: PrefetchedLookups = {}): Promise<LeadDto> {
    await assertTaxIdsUnique(tx, 'lead', { gstNo: input.gstNo });
    const leadCode = await generateEntityCode(tx, 'LD');
    const assignedTo = (await assertAssigneeValid(tx, input.assignedTo, { activeUsernames: lookups.activeUsernames })) ?? user.username;
    const row = await tx.lead.create({ data: { ...(await resolveAddressPlaces(tx, 'lead', toLeadData({ ...input, assignedTo }))), leadCode, createdBy: user.username } });
    await replaceEmails(tx, { leadId: row.id }, normalizeEmails(input.emailAddresses));

    const dto = toLeadDto(await loadLead(tx, row.id));
    await auditService.record(tx, { entityType: 'Lead', entityId: row.id, action: 'CREATE', changedBy: user.username, changes: dto });
    return dto;
}

export const leadService = {
    async list(query: unknown, user: AuthUser): Promise<PaginatedResult<LeadDto>> {
        const page = parsePagination(query, LEAD_SORT_FIELDS);
        const filters = leadListQuerySchema.parse(query ?? {});

        const where: Prisma.LeadWhereInput = { isDeleted: false, AND: [buildAccessScopeWhere(user, 'assignedTo')] };
        const statusFilter: Prisma.StringFilter = {};
        if (filters.status?.length) statusFilter.in = filters.status;
        if (filters.excludeStatus?.length) statusFilter.notIn = filters.excludeStatus;
        if (Object.keys(statusFilter).length > 0) where.status = statusFilter;
        if (filters.leadType?.length) where.leadType = { in: filters.leadType };
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
                { emailAddresses: { some: { email: { contains: page.search } } } },
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
        assertStatusTransition(null, input.status);
        assertNotInPast([nextFollowupCheck(input)]);
        await assertEmailsDeliverable(input.emailAddresses, 'emailAddresses');

        const created = await runInTransaction((tx) => createLeadRecord(tx, input, user));
        await cacheService.invalidateEntityCaches('leads');
        queueEmailVerification({ leadId: created.id });
        return created;
    },

    async update(id: string, patch: Record<string, unknown>, user: AuthUser): Promise<LeadDto> {
        const fieldConfig = await loadModuleFieldConfig('leads');
        if ('emailAddresses' in patch) await assertEmailsDeliverable(patch.emailAddresses, 'emailAddresses', { leadId: id });
        const updated = await runInTransaction(async (tx) => {
            await lockRecords(tx, 'lead', [id]);
            const existing = await loadLead(tx, id);
            assertRecordAccess(user, existing);
            const before = toLeadDto(existing);
            const merged: Record<string, unknown> = { ...before, ...patch };
            const input = leadInputSchema.parse(merged);
            input.customFields = checkModulePayload(fieldConfig, merged, input.customFields, {
                submittedKeys: new Set(Object.keys(patch)),
                previousCustomFields: before.customFields,
            });
            assertStatusTransition(existing.status, input.status);
            assertNotInPast([nextFollowupCheck(input, before)]);
            await assertTaxIdsUnique(tx, 'lead', { gstNo: input.gstNo }, { excludeId: id, previous: { gstNo: existing.gstNo } });
            const assignedTo = (await assertAssigneeValid(tx, input.assignedTo, { previous: existing.assignedTo })) ?? existing.assignedTo;

            await tx.lead.update({ where: { id }, data: { ...(await resolveAddressPlaces(tx, 'lead', toLeadData({ ...input, assignedTo }))), updatedBy: user.username } });
            if ('emailAddresses' in patch) {
                await replaceEmails(tx, { leadId: id }, normalizeEmails(input.emailAddresses));
            }

            const after = toLeadDto(await loadLead(tx, id));
            const changes = diffRecords(before, after);
            if (Object.keys(changes).length > 0) {
                await auditService.record(tx, { entityType: 'Lead', entityId: id, action: 'UPDATE', changedBy: user.username, changes });
            }
            return after;
        });

        await cacheService.invalidateEntityCaches('leads');
        if ('emailAddresses' in patch) queueEmailVerification({ leadId: id });
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
