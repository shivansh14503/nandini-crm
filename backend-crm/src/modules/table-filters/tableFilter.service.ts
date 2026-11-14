import { createHash } from 'node:crypto';
import { prisma } from '../../config/prisma.js';
import type { TableFilter } from '../../generated/prisma/client.js';
import type { AuthUser } from '../../types/user.types.js';
import { HttpError } from '../../utils/httpError.js';
import { toIso } from '../../utils/mappers.js';
import { runInTransaction } from '../shared/transactions.js';
import { criteriaSchema, listQuerySchema, recordRecentSchema, saveFilterSchema, type TableFilterCriteria } from './tableFilter.validator.js';

/**
 * Per-user filters of the list screens' Filter dialog: the last 10 applied ("Recent") and named ones ("My Filters").
 * Filtering itself runs in the browser over the loaded list; this only remembers the criteria.
 */

export const MAX_RECENT_FILTERS = 10;
const MAX_SAVED_FILTERS = 50;

export interface TableFilterDto {
    id: string;
    module: string;
    kind: 'recent' | 'saved';
    name: string | null;
    criteria: TableFilterCriteria;
    createdAt: string;
    lastUsedAt: string;
}

export interface TableFilterListDto {
    recent: TableFilterDto[];
    saved: TableFilterDto[];
}

/** Stable JSON (sorted keys, sorted multi-select values) so the same filter always hashes the same. */
function normalize(criteria: TableFilterCriteria): string {
    const conditions = Object.keys(criteria.conditions)
        .sort()
        .map((key) => {
            const c = criteria.conditions[key];
            return [key, c.op, c.values ? [...c.values].sort() : null, c.value ?? null, c.value2 ?? null];
        });
    return JSON.stringify({ conditions, sort: criteria.sort ?? null });
}

const fingerprintOf = (criteria: TableFilterCriteria) => createHash('sha256').update(normalize(criteria)).digest('hex');

function toDto(row: TableFilter): TableFilterDto | null {
    try {
        const parsed = criteriaSchema.safeParse(JSON.parse(row.criteriaJson));
        if (!parsed.success) return null;
        return {
            id: row.id,
            module: row.module,
            kind: row.kind === 'saved' ? 'saved' : 'recent',
            name: row.name,
            criteria: parsed.data,
            createdAt: toIso(row.createdAt),
            lastUsedAt: toIso(row.lastUsedAt),
        };
    } catch {
        return null;
    }
}

const dtos = (rows: TableFilter[]) => rows.map(toDto).filter((d): d is TableFilterDto => d !== null);

async function listFor(username: string, module: string): Promise<TableFilterListDto> {
    const rows = await prisma.tableFilter.findMany({ where: { username, module }, orderBy: [{ lastUsedAt: 'desc' }] });
    return {
        recent: dtos(rows.filter((r) => r.kind === 'recent')).slice(0, MAX_RECENT_FILTERS),
        saved: dtos(rows.filter((r) => r.kind === 'saved')).sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')),
    };
}

export const tableFilterService = {
    async list(query: unknown, user: AuthUser): Promise<TableFilterListDto> {
        const { module } = listQuerySchema.parse(query ?? {});
        return listFor(user.username, module);
    },

    /** Called each time a filter is applied: bumps a matching entry to the top, else adds one; keeps the newest 10. */
    async recordRecent(body: unknown, user: AuthUser): Promise<TableFilterListDto> {
        const { module, criteria } = recordRecentSchema.parse(body);
        const fingerprint = fingerprintOf(criteria);
        await runInTransaction(async (tx) => {
            const where = { username: user.username, module, kind: 'recent' };
            const existing = await tx.tableFilter.findFirst({ where: { ...where, fingerprint } });
            if (existing) {
                await tx.tableFilter.update({ where: { id: existing.id }, data: { lastUsedAt: new Date() } });
            } else {
                await tx.tableFilter.create({ data: { ...where, criteriaJson: JSON.stringify(criteria), fingerprint } });
            }
            const stale = await tx.tableFilter.findMany({
                where,
                orderBy: [{ lastUsedAt: 'desc' }],
                skip: MAX_RECENT_FILTERS,
                select: { id: true },
            });
            if (stale.length) await tx.tableFilter.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
        });
        return listFor(user.username, module);
    },

    /** "Save filter as": a name already used in this module is overwritten with the new criteria. */
    async save(body: unknown, user: AuthUser): Promise<TableFilterListDto> {
        const { module, name, criteria } = saveFilterSchema.parse(body);
        const fingerprint = fingerprintOf(criteria);
        await runInTransaction(async (tx) => {
            const where = { username: user.username, module, kind: 'saved' };
            const sameName = await tx.tableFilter.findFirst({ where: { ...where, name } });
            if (sameName) {
                await tx.tableFilter.update({
                    where: { id: sameName.id },
                    data: { criteriaJson: JSON.stringify(criteria), fingerprint, lastUsedAt: new Date() },
                });
                return;
            }
            const count = await tx.tableFilter.count({ where });
            if (count >= MAX_SAVED_FILTERS) {
                throw HttpError.badRequest(`You can keep up to ${MAX_SAVED_FILTERS} saved filters here. Delete one first.`);
            }
            await tx.tableFilter.create({ data: { ...where, name, criteriaJson: JSON.stringify(criteria), fingerprint } });
        });
        return listFor(user.username, module);
    },

    async remove(id: string, user: AuthUser): Promise<TableFilterListDto> {
        const row = await prisma.tableFilter.findFirst({ where: { id, username: user.username } });
        if (!row) throw HttpError.notFound('Filter not found');
        await prisma.tableFilter.delete({ where: { id } });
        return listFor(user.username, row.module);
    },
};
