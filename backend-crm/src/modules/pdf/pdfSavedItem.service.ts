import { prisma } from '../../config/prisma.js';
import type { PdfSavedItem } from '../../generated/prisma/client.js';
import { auditService } from '../../services/audit.service.js';
import type { AuthUser } from '../../types/user.types.js';
import { HttpError } from '../../utils/httpError.js';
import { toIso } from '../../utils/mappers.js';
import { runInTransaction } from '../shared/transactions.js';
import { savedItemContentSchema, validateBlockRefs, validateSectionRefs, type SavedItemContent } from './document/index.js';
import { getFieldRegistry } from './fieldRegistry.js';
import type { PdfModule } from './pdf.types.js';
import { toModule } from './pdfTemplate.mapper.js';
import { registryRefs } from './pdfTemplate.service.js';
import { savedItemCreateSchema, savedItemListQuerySchema } from './pdfTemplate.validator.js';

/**
 * The builder's "Saved" library: sections / blocks an admin saved, shared by every template of the module.
 * Inserting one places a copy (with fresh ids) in the template, so later edits or deletes never change templates.
 */

export interface PdfSavedItemDto {
    id: string;
    module: PdfModule;
    name: string;
    kind: 'section' | 'block';
    content: SavedItemContent;
    createdBy: string;
    createdAt: string;
}

const MAX_ITEMS_PER_MODULE = 200;

function toDto(row: PdfSavedItem): PdfSavedItemDto | null {
    try {
        const parsed = savedItemContentSchema.safeParse(JSON.parse(row.contentJson));
        if (!parsed.success) return null;
        return { id: row.id, module: toModule(row.module), name: row.name, kind: parsed.data.kind, content: parsed.data, createdBy: row.createdBy, createdAt: toIso(row.createdAt) };
    } catch {
        return null;
    }
}

export const pdfSavedItemService = {
    async list(query: unknown): Promise<PdfSavedItemDto[]> {
        const { module } = savedItemListQuerySchema.parse(query ?? {});
        const rows = await prisma.pdfSavedItem.findMany({ where: { module, isDeleted: false }, orderBy: [{ createdAt: 'desc' }] });
        return rows.map(toDto).filter((d): d is PdfSavedItemDto => d !== null);
    },

    async create(body: unknown, user: AuthUser): Promise<PdfSavedItemDto> {
        const input = savedItemCreateSchema.parse(body);
        const refs = registryRefs(await getFieldRegistry(input.module));
        const issues = input.content.kind === 'section' ? validateSectionRefs(input.content.section, null, refs) : validateBlockRefs(input.content.block, null, refs);
        if (issues.length) throw HttpError.badRequest(issues[0].message, issues.map((i) => ({ message: i.message, path: ['content', ...i.path.map(String)] })));
        const row = await runInTransaction(async (tx) => {
            const count = await tx.pdfSavedItem.count({ where: { module: input.module, isDeleted: false } });
            if (count >= MAX_ITEMS_PER_MODULE) throw HttpError.badRequest(`The library is full (${MAX_ITEMS_PER_MODULE} items). Delete some saved items first.`);
            const created = await tx.pdfSavedItem.create({
                data: { module: input.module, name: input.name, kind: input.content.kind, contentJson: JSON.stringify(input.content), createdBy: user.username },
            });
            await auditService.record(tx, { entityType: 'PdfSavedItem', entityId: created.id, action: 'CREATE', changedBy: user.username, changes: { name: input.name, kind: input.content.kind } });
            return created;
        });
        const dto = toDto(row);
        if (!dto) throw HttpError.badRequest('The saved item could not be read back.');
        return dto;
    },

    async remove(id: string, user: AuthUser): Promise<{ id: string }> {
        await runInTransaction(async (tx) => {
            const row = await tx.pdfSavedItem.findFirst({ where: { id, isDeleted: false } });
            if (!row) throw HttpError.notFound('Saved item not found');
            await tx.pdfSavedItem.update({ where: { id }, data: { isDeleted: true, deletedAt: new Date() } });
            await auditService.record(tx, { entityType: 'PdfSavedItem', entityId: id, action: 'DELETE', changedBy: user.username, changes: { name: row.name, kind: row.kind } });
        });
        return { id };
    },
};
