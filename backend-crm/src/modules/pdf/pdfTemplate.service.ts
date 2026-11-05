import { StatusCodes } from 'http-status-codes';
import { prisma, type TransactionClient } from '../../config/prisma.js';
import type { PdfTemplate, Prisma } from '../../generated/prisma/client.js';
import { auditService, diffRecords } from '../../services/audit.service.js';
import type { AuthUser } from '../../types/user.types.js';
import { HttpError } from '../../utils/httpError.js';
import { FORM_CONFIG_ADMIN_ROLES } from '../form-configs/formConfig.routes.js';
import { runInTransaction } from '../shared/transactions.js';
import { getFieldRegistry } from './fieldRegistry.js';
import type { PdfMargins, PdfModule } from './pdf.types.js';
import {
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
import { sanitizeTemplateCss, sanitizeTemplateHtml } from './sanitize.js';
import { invalidateTemplate, validateTemplateParts } from './templateEngine.js';

/**
 * Admin-managed PDF templates. Every mutation is audited (entityType PdfTemplate) and bumps `version`, the
 * optimistic-concurrency token clients must send back on update (409 VERSION_CONFLICT when stale).
 * System templates are seeded from code: only isActive / isDefault may change; admins duplicate them to edit.
 */

const ADMIN_ROLES = new Set<string>(FORM_CONFIG_ADMIN_ROLES.map((r) => r.toLowerCase()));
export const isPdfAdmin = (user: AuthUser): boolean => ADMIN_ROLES.has(user.role.toLowerCase());

const notFound = () => HttpError.notFound('PDF template not found');

const CONTENT_KEYS = ['name', 'description', 'pageSize', 'orientation', 'margins', 'headerHtml', 'bodyHtml', 'footerHtml', 'css', 'fieldVisibility', 'branding'] as const;

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

const marginData = (m: PdfMargins) => ({
    marginTop: m.top,
    marginRight: m.right,
    marginBottom: m.bottom,
    marginLeft: m.left,
    marginHeader: m.header,
    marginFooter: m.footer,
});

interface SanitizedParts {
    headerHtml: string;
    bodyHtml: string;
    footerHtml: string;
    css: string;
}

/** Sanitizes the parts and checks they compile (422 with line / column otherwise). */
export function prepareParts(parts: { headerHtml?: string; bodyHtml: string; footerHtml?: string; css?: string }): SanitizedParts {
    const sanitized = {
        headerHtml: sanitizeTemplateHtml(parts.headerHtml),
        bodyHtml: sanitizeTemplateHtml(parts.bodyHtml),
        footerHtml: sanitizeTemplateHtml(parts.footerHtml),
        css: sanitizeTemplateCss(parts.css),
    };
    if (!sanitized.bodyHtml.trim()) throw HttpError.badRequest('Body is empty after removing unsupported markup.', [{ message: 'Body is required.', path: ['bodyHtml'] }]);
    validateTemplateParts({ header: sanitized.headerHtml, body: sanitized.bodyHtml, footer: sanitized.footerHtml });
    return sanitized;
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

async function withRegistry(row: PdfTemplate): Promise<PdfTemplateDto> {
    return toPdfTemplateDto(row, await getFieldRegistry(toModule(row.module)));
}

function createData(input: TemplateCreateInput, parts: SanitizedParts, user: AuthUser, isSystem = false): Prisma.PdfTemplateUncheckedCreateInput {
    return {
        name: input.name,
        module: input.module,
        description: input.description || null,
        isSystem,
        isDefault: input.isDefault,
        isActive: input.isActive,
        pageSize: input.pageSize,
        orientation: input.orientation,
        ...marginData(input.margins),
        headerHtml: parts.headerHtml || null,
        bodyHtml: parts.bodyHtml,
        footerHtml: parts.footerHtml || null,
        css: parts.css || null,
        fieldVisibilityJson: input.fieldVisibility ? JSON.stringify(input.fieldVisibility) : null,
        brandingJson: input.branding ? JSON.stringify(input.branding) : null,
        createdBy: user.username,
        updatedBy: user.username,
    };
}

export const pdfTemplateService = {
    /** Lightweight list (no HTML). Inactive templates are listed for admins only. */
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
        return withRegistry(await findTemplate(prisma, id));
    },

    async create(body: unknown, user: AuthUser): Promise<PdfTemplateDto> {
        const input = templateCreateSchema.parse(body);
        if (input.isDefault && !input.isActive) throw HttpError.badRequest('The default template must be active.', [{ message: 'Activate the template to make it the default.', path: ['isDefault'] }]);
        const parts = prepareParts(input);
        const row = await runInTransaction(async (tx) => {
            await assertUniqueName(tx, input.module, input.name);
            const created = await tx.pdfTemplate.create({ data: createData(input, parts, user) });
            if (created.isDefault) await clearOtherDefaults(tx, created.module, created.id, user);
            await audit(tx, created, 'CREATE', user, toAuditSnapshot(created));
            return created;
        });
        return withRegistry(row);
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

        const parts =
            input.bodyHtml !== undefined || input.headerHtml !== undefined || input.footerHtml !== undefined || input.css !== undefined
                ? prepareParts({
                      headerHtml: input.headerHtml ?? current.headerHtml ?? '',
                      bodyHtml: input.bodyHtml ?? current.bodyHtml,
                      footerHtml: input.footerHtml ?? current.footerHtml ?? '',
                      css: input.css ?? current.css ?? '',
                  })
                : null;

        const data: Prisma.PdfTemplateUpdateManyMutationInput = {
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.description !== undefined ? { description: input.description || null } : {}),
            ...(input.pageSize ? { pageSize: input.pageSize } : {}),
            ...(input.orientation ? { orientation: input.orientation } : {}),
            ...(input.margins ? marginData(input.margins) : {}),
            ...(parts
                ? { headerHtml: parts.headerHtml || null, bodyHtml: parts.bodyHtml, footerHtml: parts.footerHtml || null, css: parts.css || null }
                : {}),
            ...(input.fieldVisibility ? { fieldVisibilityJson: JSON.stringify(input.fieldVisibility) } : {}),
            ...(input.branding ? { brandingJson: JSON.stringify(input.branding) } : {}),
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
        invalidateTemplate(id);
        return withRegistry(row);
    },

    async duplicate(id: string, body: unknown, user: AuthUser): Promise<PdfTemplateDto> {
        const { name: requestedName } = duplicateBodySchema.parse(body ?? {});
        const source = await findTemplate(prisma, id);
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
                    marginTop: source.marginTop,
                    marginRight: source.marginRight,
                    marginBottom: source.marginBottom,
                    marginLeft: source.marginLeft,
                    marginHeader: source.marginHeader,
                    marginFooter: source.marginFooter,
                    headerHtml: source.headerHtml,
                    bodyHtml: source.bodyHtml,
                    footerHtml: source.footerHtml,
                    css: source.css,
                    fieldVisibilityJson: source.fieldVisibilityJson,
                    brandingJson: source.brandingJson,
                    createdBy: user.username,
                    updatedBy: user.username,
                },
            });
            await audit(tx, created, 'DUPLICATE', user, { sourceId: source.id, sourceName: source.name, ...toAuditSnapshot(created) });
            return created;
        });
        return withRegistry(row);
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
        invalidateTemplate(id);
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
