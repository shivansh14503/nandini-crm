import { ENV } from '../../config/env.js';
import { prisma, type TransactionClient } from '../../config/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { auditService, diffRecords } from '../../services/audit.service.js';
import { cacheService } from '../../services/cache.service.js';
import type { AuthUser } from '../../types/user.types.js';
import type { PaginatedResult } from '../../utils/apiResponse.js';
import { generateEntityCode } from '../../utils/codeGenerator.js';
import { HttpError } from '../../utils/httpError.js';
import { daysAgo, wallClockNow } from '../../utils/mappers.js';
import { parsePagination } from '../../utils/pagination.js';
import { lockRecords, runInTransaction, softDeleteData, type BulkDeleteResult } from '../shared/transactions.js';
import { toTicketData, toTicketDto, type TicketDto } from './ticket.mapper.js';
import { TICKET_CLOSED_STATUSES, TICKET_SORT_FIELDS, ticketInputSchema, ticketListQuerySchema, type TicketInput } from './ticket.validator.js';

const notFound = () => HttpError.notFound('Ticket not found');

/**
 * Nature of Call must be an entry of the master (matched case-insensitively; the master's spelling is stored).
 * A since-deactivated entry is kept only when the ticket already used it.
 */
async function resolveNatureOfCall(tx: TransactionClient, name: string, previous?: string): Promise<string> {
    const entry = await tx.natureOfCall.findFirst({ where: { name }, select: { name: true, isActive: true } });
    if (!entry || (!entry.isActive && entry.name !== previous)) {
        throw HttpError.badRequest('Select a Nature Of Call from the list.', [
            { message: 'Select a Nature Of Call from the list.', path: ['natureOfCall'] },
        ]);
    }
    return entry.name;
}

/** The ticket form has no ids, so the organization and contact are linked by name when a live match exists. */
async function resolveLinks(tx: TransactionClient, input: TicketInput): Promise<{ organizationId: string | null; contactId: string | null }> {
    const organization = await tx.organization.findFirst({
        where: { organizationName: input.organizationName, isDeleted: false },
        select: { id: true },
    });
    const contact = organization
        ? await tx.contact.findFirst({
              where: { name: input.contactPersonName, organizationId: organization.id, isDeleted: false },
              select: { id: true },
          })
        : null;
    return { organizationId: organization?.id ?? null, contactId: contact?.id ?? null };
}

/** Inserts a ticket inside the caller's transaction (used by `create` and the seed). */
export async function createTicketRecord(tx: TransactionClient, input: TicketInput, user: AuthUser): Promise<TicketDto> {
    // Code first: its counter row lock queues concurrent creates before they take any other lock.
    const ticketNumber = await generateEntityCode(tx, 'TKT');
    const natureOfCall = await resolveNatureOfCall(tx, input.natureOfCall);
    const links = await resolveLinks(tx, input);
    const row = await tx.ticket.create({
        data: { ...toTicketData(input, { natureOfCall, ...links }), ticketNumber, createdBy: user.username },
    });
    const dto = toTicketDto(row);
    await auditService.record(tx, { entityType: 'Ticket', entityId: row.id, action: 'CREATE', changedBy: user.username, changes: dto });
    return dto;
}

export const ticketService = {
    async list(query: unknown, user: AuthUser): Promise<PaginatedResult<TicketDto>> {
        const page = parsePagination(query, TICKET_SORT_FIELDS);
        const filters = ticketListQuerySchema.parse(query ?? {});

        const and: Prisma.TicketWhereInput[] = [{ isDeleted: false }];
        if (filters.ticketStatus?.length) and.push({ ticketStatus: { in: filters.ticketStatus } });
        if (filters.excludeStatus?.length) and.push({ ticketStatus: { notIn: filters.excludeStatus } });
        if (filters.ticketPriority?.length) and.push({ ticketPriority: { in: filters.ticketPriority } });
        if (filters.supportType?.length) and.push({ supportType: { in: filters.supportType } });
        if (filters.supportMode?.length) and.push({ supportMode: { in: filters.supportMode } });
        if (filters.organizationId) and.push({ organizationId: filters.organizationId });
        if (filters.contactId) and.push({ contactId: filters.contactId });
        if (filters.assignedTo) and.push({ assignedTo: filters.assignedTo });
        if (filters.mine) and.push({ assignedTo: user.username });
        if (filters.overdue) {
            and.push({ dueDate: { lt: wallClockNow(ENV.BUSINESS_TIMEZONE) }, ticketStatus: { notIn: [...TICKET_CLOSED_STATUSES] } });
        }
        if (filters.createdWithinDays) and.push({ createdAt: { gte: daysAgo(filters.createdWithinDays) } });
        if (page.search) {
            and.push({
                OR: [
                    { ticketNumber: { contains: page.search } },
                    { ticketSubject: { contains: page.search } },
                    { organizationName: { contains: page.search } },
                    { contactPersonName: { contains: page.search } },
                    { contactNumber: { contains: page.search } },
                    { natureOfCall: { contains: page.search } },
                ],
            });
        }
        const where: Prisma.TicketWhereInput = { AND: and };

        const [total, rows] = await prisma.$transaction([
            prisma.ticket.count({ where }),
            prisma.ticket.findMany({ where, orderBy: [page.orderBy, { id: 'asc' }], skip: page.skip, take: page.take }),
        ]);
        return { data: rows.map(toTicketDto), total, page: page.page, limit: page.limit };
    },

    async getById(id: string): Promise<TicketDto> {
        const row = await prisma.ticket.findFirst({ where: { id, isDeleted: false } });
        if (!row) throw notFound();
        return toTicketDto(row);
    },

    async create(body: unknown, user: AuthUser): Promise<TicketDto> {
        const input = ticketInputSchema.parse(body);
        const created = await runInTransaction((tx) => createTicketRecord(tx, input, user));
        await cacheService.invalidateEntityCaches('tickets');
        return created;
    },

    async update(id: string, patch: Record<string, unknown>, user: AuthUser): Promise<TicketDto> {
        const updated = await runInTransaction(async (tx) => {
            await lockRecords(tx, 'ticket', [id]);
            const existing = await tx.ticket.findFirst({ where: { id, isDeleted: false } });
            if (!existing) throw notFound();

            const before = toTicketDto(existing);
            const input = ticketInputSchema.parse({ ...before, ...patch });
            const natureOfCall = await resolveNatureOfCall(tx, input.natureOfCall, existing.natureOfCall);
            const links = await resolveLinks(tx, input);

            const row = await tx.ticket.update({
                where: { id },
                data: { ...toTicketData(input, { natureOfCall, ...links }), updatedBy: user.username },
            });
            const after = toTicketDto(row);
            const changes = diffRecords(before, after);
            if (Object.keys(changes).length > 0) {
                await auditService.record(tx, { entityType: 'Ticket', entityId: id, action: 'UPDATE', changedBy: user.username, changes });
            }
            return after;
        });

        await cacheService.invalidateEntityCaches('tickets');
        return updated;
    },

    async remove(id: string, user: AuthUser): Promise<void> {
        await runInTransaction(async (tx) => {
            await lockRecords(tx, 'ticket', [id]);
            const result = await tx.ticket.updateMany({ where: { id, isDeleted: false }, data: softDeleteData(user) });
            if (result.count === 0) throw notFound();
            await auditService.record(tx, { entityType: 'Ticket', entityId: id, action: 'DELETE', changedBy: user.username });
        });
        await cacheService.invalidateEntityCaches('tickets');
    },

    async bulkRemove(ids: string[], user: AuthUser): Promise<BulkDeleteResult> {
        const result = await runInTransaction(async (tx) => {
            await lockRecords(tx, 'ticket', ids);
            const live = await tx.ticket.findMany({ where: { id: { in: ids }, isDeleted: false }, select: { id: true } });
            const liveIds = live.map((row) => row.id);
            if (liveIds.length > 0) {
                await tx.ticket.updateMany({ where: { id: { in: liveIds } }, data: softDeleteData(user) });
                await auditService.recordMany(
                    tx,
                    liveIds.map((entityId) => ({ entityType: 'Ticket' as const, entityId, action: 'DELETE' as const, changedBy: user.username })),
                );
            }
            return { deleted: liveIds.length, ids: liveIds, notFound: ids.filter((id) => !liveIds.includes(id)) };
        });

        if (result.deleted > 0) await cacheService.invalidateEntityCaches('tickets');
        return result;
    },
};
