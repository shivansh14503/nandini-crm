import { prisma, type TransactionClient } from '../../config/prisma.js';
import type { DrawerLayout, DrawerPiece } from '../../generated/prisma/client.js';
import { auditService, diffRecords } from '../../services/audit.service.js';
import type { AuthUser } from '../../types/user.types.js';
import { HttpError } from '../../utils/httpError.js';
import { toIso } from '../../utils/mappers.js';
import { runInTransaction } from '../shared/transactions.js';
import {
    ADDRESS_PREFIXES,
    SYSTEM_FIELDS,
    documentSchema,
    layoutAddressPrefixes,
    layoutFieldRefs,
    sectionFieldRefs,
    sectionSchema,
    summarizeLayout,
    type DrawerLayoutDocument,
    type DrawerLayoutModule,
    type DrawerSection,
    type FieldRef,
} from './document/index.js';
import {
    createDrawerPieceSchema,
    drawerModuleParamSchema,
    drawerPieceIdParamSchema,
    drawerPieceListQuerySchema,
    saveDrawerLayoutSchema,
} from './drawerLayout.validator.js';

/**
 * Drawer layouts: an admin-designed record side drawer per module (header, badges, and the sections / blocks of each
 * form tab), plus the builder's library of saved sections ("pieces"). Any signed-in user reads layouts; admins save,
 * reset and manage pieces. A module without a row shows its built-in layout (defined in the frontend).
 */

export interface DrawerLayoutDto {
    module: DrawerLayoutModule;
    layout: DrawerLayoutDocument;
    version: number;
    updatedBy: string | null;
    updatedAt: string;
}

export interface DrawerPieceDto {
    id: string;
    module: DrawerLayoutModule;
    name: string;
    section: DrawerSection;
    createdBy: string;
    createdAt: string;
}

const MAX_PIECES_PER_MODULE = 100;

function parseLayout(json: string): DrawerLayoutDocument | null {
    try {
        const parsed = documentSchema.safeParse(JSON.parse(json));
        return parsed.success ? parsed.data : null;
    } catch {
        return null;
    }
}

function toDto(row: DrawerLayout): DrawerLayoutDto | null {
    const layout = parseLayout(row.layoutJson);
    if (!layout) return null;
    return { module: row.module as DrawerLayoutModule, layout, version: row.version, updatedBy: row.updatedBy, updatedAt: toIso(row.updatedAt) };
}

function toPieceDto(row: DrawerPiece): DrawerPieceDto | null {
    try {
        const parsed = sectionSchema.safeParse(JSON.parse(row.sectionJson));
        if (!parsed.success) return null;
        return { id: row.id, module: row.module as DrawerLayoutModule, name: row.name, section: parsed.data, createdBy: row.createdBy, createdAt: toIso(row.createdAt) };
    } catch {
        return null;
    }
}

/** Field keys a layout of the module may show: its active form fields plus the module's system values. */
async function allowedFields(tx: TransactionClient | typeof prisma, module: DrawerLayoutModule): Promise<Set<string>> {
    const rows = await tx.formFieldDefinition.findMany({ where: { module, isActive: true }, select: { fieldKey: true } });
    return new Set([...rows.map((r) => r.fieldKey), ...SYSTEM_FIELDS[module]]);
}

/** 400 naming the first field the form doesn't have (with every unknown one in `errors`). */
function assertKnownFields(refs: FieldRef[], allowed: Set<string>, pathRoot: string) {
    const unknown = refs.filter((r) => !allowed.has(r.field));
    if (unknown.length === 0) return;
    const first = unknown[0];
    throw HttpError.badRequest(
        `"${first.field}" (${first.where}) is not a field of this form any more. Remove it from the drawer and save again.`,
        unknown.map((r) => ({ message: `${r.field} is not on the form (${r.where}).`, path: [pathRoot, r.field] })),
    );
}

function assertKnownAddresses(prefixes: string[], module: DrawerLayoutModule) {
    const known = new Set(ADDRESS_PREFIXES[module]);
    const unknown = prefixes.find((p) => !known.has(p));
    if (unknown) throw HttpError.badRequest(`"${unknown}" is not an address of this form.`);
}

export const drawerLayoutService = {
    /** Every saved layout, keyed by module (modules on their built-in layout are left out). */
    async listAll(): Promise<Partial<Record<DrawerLayoutModule, DrawerLayoutDto>>> {
        const rows = await prisma.drawerLayout.findMany();
        const dtos = rows.map(toDto).filter((d): d is DrawerLayoutDto => d !== null);
        return Object.fromEntries(dtos.map((d) => [d.module, d]));
    },

    async save(params: unknown, body: unknown, user: AuthUser): Promise<DrawerLayoutDto> {
        const { module } = drawerModuleParamSchema.parse(params);
        const { layout, version } = saveDrawerLayoutSchema.parse(body);
        assertKnownAddresses(layoutAddressPrefixes(layout), module);

        return runInTransaction(async (tx) => {
            assertKnownFields(layoutFieldRefs(layout), await allowedFields(tx, module), 'layout');
            const existing = await tx.drawerLayout.findUnique({ where: { module } });
            if (existing && existing.version !== version) {
                throw HttpError.conflict(
                    `${existing.updatedBy ?? 'Another admin'} saved this drawer layout after you opened it. Reload to see their version, then make your changes again.`,
                );
            }
            if (!existing && version !== null) {
                throw HttpError.conflict('This drawer layout was reset to the built-in one after you opened it. Reload, then make your changes again.');
            }
            const layoutJson = JSON.stringify(layout);
            const row = existing
                ? await tx.drawerLayout.update({ where: { module }, data: { layoutJson, version: existing.version + 1, updatedBy: user.username } })
                : await tx.drawerLayout.create({ data: { module, layoutJson, version: 1, updatedBy: user.username } });
            const before = existing ? parseLayout(existing.layoutJson) : null;
            await auditService.record(tx, {
                entityType: 'DrawerLayout',
                entityId: module,
                action: existing ? 'UPDATE' : 'CREATE',
                changedBy: user.username,
                changes: before ? diffRecords(summarizeLayout(before), summarizeLayout(layout)) : summarizeLayout(layout),
            });
            const dto = toDto(row);
            if (!dto) throw HttpError.badRequest('The saved layout could not be read back.');
            return dto;
        });
    },

    /** Back to the built-in drawer. */
    async reset(params: unknown, user: AuthUser): Promise<{ module: DrawerLayoutModule }> {
        const { module } = drawerModuleParamSchema.parse(params);
        await runInTransaction(async (tx) => {
            const existing = await tx.drawerLayout.findUnique({ where: { module } });
            if (!existing) return;
            await tx.drawerLayout.delete({ where: { module } });
            const before = parseLayout(existing.layoutJson);
            await auditService.record(tx, {
                entityType: 'DrawerLayout',
                entityId: module,
                action: 'DELETE',
                changedBy: user.username,
                changes: before ? summarizeLayout(before) : { version: existing.version },
            });
        });
        return { module };
    },
};

export const drawerPieceService = {
    async list(query: unknown): Promise<DrawerPieceDto[]> {
        const { module } = drawerPieceListQuerySchema.parse(query ?? {});
        const rows = await prisma.drawerPiece.findMany({ where: { module }, orderBy: [{ createdAt: 'desc' }] });
        return rows.map(toPieceDto).filter((d): d is DrawerPieceDto => d !== null);
    },

    async create(body: unknown, user: AuthUser): Promise<DrawerPieceDto> {
        const input = createDrawerPieceSchema.parse(body);
        assertKnownAddresses(
            input.section.blocks.flatMap((b) => (b.type === 'address' ? [b.prefix] : [])),
            input.module,
        );
        const row = await runInTransaction(async (tx) => {
            assertKnownFields(sectionFieldRefs(input.section, input.name), await allowedFields(tx, input.module), 'section');
            const count = await tx.drawerPiece.count({ where: { module: input.module } });
            if (count >= MAX_PIECES_PER_MODULE) throw HttpError.badRequest(`The library is full (${MAX_PIECES_PER_MODULE} pieces). Delete some first.`);
            const created = await tx.drawerPiece.create({
                data: { module: input.module, name: input.name, sectionJson: JSON.stringify(input.section), createdBy: user.username },
            });
            await auditService.record(tx, {
                entityType: 'DrawerPiece',
                entityId: created.id,
                action: 'CREATE',
                changedBy: user.username,
                changes: { name: input.name, module: input.module, blocks: input.section.blocks.length },
            });
            return created;
        });
        const dto = toPieceDto(row);
        if (!dto) throw HttpError.badRequest('The saved piece could not be read back.');
        return dto;
    },

    async remove(params: unknown, user: AuthUser): Promise<{ id: string }> {
        const { id } = drawerPieceIdParamSchema.parse(params);
        await runInTransaction(async (tx) => {
            const row = await tx.drawerPiece.findUnique({ where: { id } });
            if (!row) throw HttpError.notFound('Piece not found');
            await tx.drawerPiece.delete({ where: { id } });
            await auditService.record(tx, { entityType: 'DrawerPiece', entityId: id, action: 'DELETE', changedBy: user.username, changes: { name: row.name, module: row.module } });
        });
        return { id };
    },
};
