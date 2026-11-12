import { StatusCodes } from 'http-status-codes';
import { prisma, type TransactionClient } from '../../config/prisma.js';
import type { PdfTemplate, Prisma } from '../../generated/prisma/client.js';
import { auditService, diffRecords } from '../../services/audit.service.js';
import type { AuthUser } from '../../types/user.types.js';
import { HttpError } from '../../utils/httpError.js';
import { FORM_CONFIG_ADMIN_ROLES } from '../form-configs/formConfig.routes.js';
import { runInTransaction } from '../shared/transactions.js';
import { validateDocumentRefs, type PdfDocument } from './document/index.js';
import { getFieldRegistry } from './fieldRegistry.js';
import type { PdfFieldRegistry, PdfModule } from './pdf.types.js';
import {
    parseStoredDocument,
    toAuditSnapshot,
    toModule,
    toPdfTemplateDto,
    toPdfTemplateListItem,
    type PdfTemplateDto,
    type PdfTemplateListItemDto,
} from './pdfTemplate.mapper.js';
import {
    activeBodySchema,
    duplicateBodySchema,
    listQuerySchema,
    templateCreateSchema,
    templateUpdateSchema,
    type TemplateCreateInput,
    type TemplateUpdateInput,
} from './pdfTemplate.validator.js';

/**
 * Admin-managed PDF templates (block documents, see document/schema.ts). Every mutation is audited (entityType
 * PdfTemplate) and bumps `version`, the optimistic-concurrency token clients must send back on update
 * (409 VERSION_CONFLICT when stale). System templates are seeded from code: only isActive / isDefault may
 * change; admins duplicate them to edit.
 */

const ADMIN_ROLES = new Set<string>(FORM_CONFIG_ADMIN_ROLES.map((r) => r.toLowerCase()));
export const isPdfAdmin = (user: AuthUser): boolean => ADMIN_ROLES.has(user.role.toLowerCase());

const notFound = () => HttpError.notFound('PDF template not found');

const CONTENT_KEYS = ['name', 'description', 'document'] as const;

/** Max stored document size (UTF-8 bytes). */
export const DOCUMENT_MAX_BYTES = 2 * 1024 * 1024;

async function findTemplate(client: TransactionClient | typeof prisma, id: string): Promise<PdfTemplate> {
    const row = await client.pdfTemplate.findFirst({ where: { id, isDeleted: false } });
    if (!row) throw notFound();
    return row;
}

async function assertUniqueName(client: TransactionClient | typeof prisma, module: string, name: string, exceptId?: string): Promise<void> {
    const clash = await client.pdfTemplate.findFirst({
        where: { module, name, isDeleted: false, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
        select: { id: true },
    });
    if (clash) throw HttpError.conflict(`A ${module.toLowerCase()} template named "${name}" already exists.`, [{ message: 'Name is already in use.', path: ['name'] }]);
}

/** Registry lookups used to check a document's field paths and line-item columns. */
export function registryRefs(registry: PdfFieldRegistry) {
    return {
        fieldTypes: new Map(registry.fields.map((f) => [f.path, f.type])),
        lineItemColumnKeys: new Set(registry.lineItemColumns.map((c) => c.key)),
    };
}

/** 400 listing every problem when the document references unknown fields / columns or breaks band rules. */
export function assertDocumentValid(document: PdfDocument, registry: PdfFieldRegistry): string {
    const issues = validateDocumentRefs(document, registryRefs(registry));
    if (issues.length) {
        throw HttpError.badRequest(
            issues.length === 1 ? issues[0].message : `The template has ${issues.length} problems: ${issues[0].message}`,
            issues.map((i) => ({ message: i.message, path: ['document', ...i.path.map(String)] })),
        );
    }
    const json = JSON.stringify(document);
    if (Buffer.byteLength(json, 'utf8') > DOCUMENT_MAX_BYTES) throw HttpError.badRequest('The template is too large.');
    return json;
}

/** The row's document, or a 422 when it is unreadable (should only happen to a row the seed hasn't refreshed). */
export function documentOf(row: PdfTemplate): PdfDocument {
    const doc = parseStoredDocument(row.documentJson);
    if (!doc) {
        throw new HttpError(`Template "${row.name}" is damaged and can't be rendered. Restart the API to re-seed system templates, or recreate it.`, StatusCodes.UNPROCESSABLE_ENTITY, {
            code: 'PDF_TEMPLATE_INVALID',
        });
    }
    return doc;
}

const versionConflict = () =>
    new HttpError('This template was changed by someone else. Reload it to see their changes, or overwrite them.', StatusCodes.CONFLICT, {
        code: 'VERSION_CONFLICT',
    });

/** Clears isDefault on every other template of the module (bumping their versions). */
async function clearOtherDefaults(tx: TransactionClient, module: string, exceptId: string, user: AuthUser): Promise<void> {
    await tx.pdfTemplate.updateMany({
        where: { module, isDefault: true, isDeleted: false, NOT: { id: exceptId } },
        data: { isDefault: false, version: { increment: 1 }, updatedBy: user.username },
    });
}

async function audit(tx: TransactionClient, row: PdfTemplate, action: 'CREATE' | 'UPDATE' | 'DELETE' | 'STATUS_CHANGE' | 'SET_DEFAULT' | 'DUPLICATE', user: AuthUser, changes: unknown) {
    await auditService.record(tx, { entityType: 'PdfTemplate', entityId: row.id, action, changedBy: user.username, changes });
}

function createData(input: TemplateCreateInput, documentJson: string, user: AuthUser, isSystem = false): Prisma.PdfTemplateUncheckedCreateInput {
    return {
        name: input.name,
        module: input.module,
        description: input.description || null,
        isSystem,
        isDefault: input.isDefault,
        isActive: input.isActive,
        pageSize: input.document.page.size,
        orientation: input.document.page.orientation,
        documentJson,
        createdBy: user.username,
        updatedBy: user.username,
    };
}

export const pdfTemplateService = {
    /** Lightweight list (no document). Inactive templates are listed for admins only. */
    async list(query: unknown, user: AuthUser): Promise<PdfTemplateListItemDto[]> {
        const { module, includeInactive } = listQuerySchema.parse(query ?? {});
        const showInactive = Boolean(includeInactive) && isPdfAdmin(user);
        const rows = await prisma.pdfTemplate.findMany({
            where: { isDeleted: false, ...(module ? { module } : {}), ...(showInactive ? {} : { isActive: true }) },
            orderBy: [{ isDefault: 'desc' }, { isSystem: 'desc' }, { name: 'asc' }],
        });
        return rows.map(toPdfTemplateListItem);
    },

    async get(id: string): Promise<PdfTemplateDto> {
        const row = await findTemplate(prisma, id);
        return toPdfTemplateDto(row, documentOf(row));
    },

    async create(body: unknown, user: AuthUser): Promise<PdfTemplateDto> {
        const input = templateCreateSchema.parse(body);
        if (input.isDefault && !input.isActive) throw HttpError.badRequest('The default template must be active.', [{ message: 'Activate the template to make it the default.', path: ['isDefault'] }]);
        const documentJson = assertDocumentValid(input.document, await getFieldRegistry(input.module));
        const row = await runInTransaction(async (tx) => {
            await assertUniqueName(tx, input.module, input.name);
            const created = await tx.pdfTemplate.create({ data: createData(input, documentJson, user) });
            if (created.isDefault) await clearOtherDefaults(tx, created.module, created.id, user);
            await audit(tx, created, 'CREATE', user, toAuditSnapshot(created));
            return created;
        });
        return toPdfTemplateDto(row, input.document);
    },

    async update(id: string, body: unknown, user: AuthUser): Promise<PdfTemplateDto> {
        const input: TemplateUpdateInput = templateUpdateSchema.parse(body);
        const current = await findTemplate(prisma, id);
        if (input.version !== current.version) throw versionConflict();

        if (current.isSystem && CONTENT_KEYS.some((key) => input[key] !== undefined)) {
            throw HttpError.forbidden('System templates are read-only. Duplicate the template to customize it.');
        }
        const isActive = input.isActive ?? current.isActive;
        const isDefault = input.isDefault ?? current.isDefault;
        if (current.isDefault && input.isDefault === false) {
            throw HttpError.badRequest('A module always needs a default template. Set another template as the default instead.');
        }
        if (isDefault && !isActive) throw HttpError.badRequest('The default template cannot be deactivated.');

        const documentJson = input.document ? assertDocumentValid(input.document, await getFieldRegistry(toModule(current.module))) : null;

        const data: Prisma.PdfTemplateUpdateManyMutationInput = {
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.description !== undefined ? { description: input.description || null } : {}),
            ...(input.document && documentJson ? { documentJson, pageSize: input.document.page.size, orientation: input.document.page.orientation } : {}),
            isActive,
            isDefault,
            version: { increment: 1 },
            updatedBy: user.username,
        };

        const row = await runInTransaction(async (tx) => {
            if (input.name !== undefined && input.name !== current.name) await assertUniqueName(tx, current.module, input.name, id);
            const { count } = await tx.pdfTemplate.updateMany({ where: { id, version: input.version, isDeleted: false }, data });
            if (count === 0) throw versionConflict();
            if (isDefault && !current.isDefault) await clearOtherDefaults(tx, current.module, id, user);
            const updated = await tx.pdfTemplate.findUniqueOrThrow({ where: { id } });
            const changes = diffRecords(toAuditSnapshot(current), toAuditSnapshot(updated));
            delete changes.version;
            if (Object.keys(changes).length) await audit(tx, updated, 'UPDATE', user, changes);
            return updated;
        });
        return toPdfTemplateDto(row, documentOf(row));
    },

    async duplicate(id: string, body: unknown, user: AuthUser): Promise<PdfTemplateDto> {
        const { name: requestedName } = duplicateBodySchema.parse(body ?? {});
        const source = await findTemplate(prisma, id);
        documentOf(source);
        const row = await runInTransaction(async (tx) => {
            let name = requestedName ?? `${source.name} (Copy)`;
            if (requestedName) {
                await assertUniqueName(tx, source.module, name);
            } else {
                for (let n = 2; await tx.pdfTemplate.findFirst({ where: { module: source.module, name, isDeleted: false }, select: { id: true } }); n++) {
                    name = `${source.name} (Copy ${n})`.slice(0, 120);
                }
            }
            const created = await tx.pdfTemplate.create({
                data: {
                    name,
                    module: source.module,
                    description: source.description,
                    isSystem: false,
                    isDefault: false,
                    isActive: true,
                    pageSize: source.pageSize,
                    orientation: source.orientation,
                    documentJson: source.documentJson,
                    createdBy: user.username,
                    updatedBy: user.username,
                },
            });
            await audit(tx, created, 'DUPLICATE', user, { sourceId: source.id, sourceName: source.name, ...toAuditSnapshot(created) });
            return created;
        });
        return toPdfTemplateDto(row, documentOf(row));
    },

    async setDefault(id: string, user: AuthUser): Promise<PdfTemplateListItemDto> {
        const row = await runInTransaction(async (tx) => {
            const current = await findTemplate(tx, id);
            if (!current.isActive) throw HttpError.badRequest('Activate the template before making it the default.');
            if (current.isDefault) return current;
            const previous = await tx.pdfTemplate.findFirst({ where: { module: current.module, isDefault: true, isDeleted: false }, select: { id: true, name: true } });
            await clearOtherDefaults(tx, current.module, id, user);
            const updated = await tx.pdfTemplate.update({ where: { id }, data: { isDefault: true, version: { increment: 1 }, updatedBy: user.username } });
            await audit(tx, updated, 'SET_DEFAULT', user, { isDefault: { from: false, to: true }, previousDefault: previous?.name ?? null });
            return updated;
        });
        return toPdfTemplateListItem(row);
    },

    async setActive(id: string, body: unknown, user: AuthUser): Promise<PdfTemplateListItemDto> {
        const { isActive } = activeBodySchema.parse(body);
        const row = await runInTransaction(async (tx) => {
            const current = await findTemplate(tx, id);
            if (current.isActive === isActive) return current;
            if (!isActive && current.isDefault) throw HttpError.badRequest('The default template cannot be deactivated. Set another template as the default first.');
            const updated = await tx.pdfTemplate.update({ where: { id }, data: { isActive, version: { increment: 1 }, updatedBy: user.username } });
            await audit(tx, updated, 'STATUS_CHANGE', user, { isActive: { from: current.isActive, to: isActive } });
            return updated;
        });
        return toPdfTemplateListItem(row);
    },

    async remove(id: string, user: AuthUser): Promise<{ id: string }> {
        await runInTransaction(async (tx) => {
            const current = await findTemplate(tx, id);
            if (current.isSystem) throw HttpError.forbidden('System templates cannot be deleted. Deactivate it instead.');
            if (current.isDefault) throw HttpError.badRequest('The default template cannot be deleted. Set another template as the default first.');
            const deleted = await tx.pdfTemplate.update({
                where: { id },
                data: { isDeleted: true, deletedAt: new Date(), isActive: false, version: { increment: 1 }, updatedBy: user.username },
            });
            await audit(tx, deleted, 'DELETE', user, toAuditSnapshot(current));
        });
        return { id };
    },

    /**
     * The template to render: the explicit (active) one, else the module default, else the first active
     * system template, else any active template. 404 when the module has none.
     */
    async resolveTemplate(module: PdfModule, templateId?: string): Promise<PdfTemplate> {
        const base = { module, isDeleted: false, isActive: true } as const;
        if (templateId) {
            const row = await prisma.pdfTemplate.findFirst({ where: { ...base, id: templateId } });
            if (!row) throw HttpError.notFound('PDF template not found or inactive');
            return row;
        }
        const row =
            (await prisma.pdfTemplate.findFirst({ where: { ...base, isDefault: true } })) ??
            (await prisma.pdfTemplate.findFirst({ where: { ...base, isSystem: true }, orderBy: { name: 'asc' } })) ??
            (await prisma.pdfTemplate.findFirst({ where: base, orderBy: { name: 'asc' } }));
        if (!row) throw HttpError.notFound('No active PDF template is available. Ask an administrator to activate one.');
        return row;
    },
};
