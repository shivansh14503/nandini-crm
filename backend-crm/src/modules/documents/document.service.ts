import { prisma } from '../../config/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { AuthUser } from '../../types/user.types.js';
import type { PaginatedResult } from '../../utils/apiResponse.js';
import { HttpError } from '../../utils/httpError.js';
import { daysAgo } from '../../utils/mappers.js';
import { parsePagination } from '../../utils/pagination.js';
import { assertRecordAccess, buildAccessScopeWhere } from '../shared/accessControl.js';
import { codeSearchPrefix } from '../shared/searchTerms.js';
import { DOCUMENT_INCLUDE, toDocumentDto, type DocumentDto } from './document.mapper.js';
import { DOCUMENT_SORT_FIELDS, documentListQuerySchema } from './document.validator.js';

/**
 * Documents module (Activities › Documents): read-only. Documents are added, changed and removed only through the
 * opportunity form's Documentation section (document.sync.ts). A document is visible while its opportunity is live
 * and to whoever may see that opportunity.
 */

const notFound = () => HttpError.notFound('Document not found');

export const documentService = {
    async list(query: unknown, user: AuthUser): Promise<PaginatedResult<DocumentDto>> {
        const page = parsePagination(query, DOCUMENT_SORT_FIELDS);
        const filters = documentListQuerySchema.parse(query ?? {});

        const opportunity: Prisma.OpportunityWhereInput[] = [{ isDeleted: false }, buildAccessScopeWhere(user, 'assignedTo')];
        if (filters.opportunityId) opportunity.push({ id: filters.opportunityId });
        if (filters.organizationId) opportunity.push({ organizationId: filters.organizationId });
        if (filters.contactId) opportunity.push({ contactId: filters.contactId });
        if (filters.assignedTo) opportunity.push({ assignedTo: filters.assignedTo });
        if (filters.mine) opportunity.push({ assignedTo: user.username });

        const and: Prisma.DocumentWhereInput[] = [{ opportunity: { AND: opportunity } }];
        if (filters.createdWithinDays) and.push({ createdAt: { gte: daysAgo(filters.createdWithinDays) } });
        if (page.search) {
            const code = codeSearchPrefix(page.search, 'OPP');
            if (code) and.push({ opportunity: { opportunityCode: { startsWith: code } } });
            else {
                and.push({
                    OR: [
                        { documentNo: { contains: page.search } },
                        { documentFile: { fileName: { contains: page.search } } },
                        { opportunity: { opportunityCode: { contains: page.search } } },
                        { opportunity: { opportunityName: { contains: page.search } } },
                        { opportunity: { organizationName: { contains: page.search } } },
                        { opportunity: { contact: { contains: page.search } } },
                    ],
                });
            }
        }
        const where: Prisma.DocumentWhereInput = { AND: and };

        const [total, rows] = await prisma.$transaction([
            prisma.document.count({ where }),
            prisma.document.findMany({ where, include: DOCUMENT_INCLUDE, orderBy: [page.orderBy, { id: 'asc' }], skip: page.skip, take: page.take }),
        ]);
        return { data: rows.map(toDocumentDto), total, page: page.page, limit: page.limit };
    },

    async getById(id: string, user: AuthUser): Promise<DocumentDto> {
        const row = await prisma.document.findFirst({ where: { id, opportunity: { isDeleted: false } }, include: DOCUMENT_INCLUDE });
        if (!row) throw notFound();
        assertRecordAccess(user, row.opportunity);
        return toDocumentDto(row);
    },
};
