import { ENV } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { prisma } from '../../config/prisma.js';
import { Prisma } from '../../generated/prisma/client.js';
import { HttpError } from '../../utils/httpError.js';
import { shownNumberModules } from '../document-series/documentSeries.service.js';
import type { SeriesModule } from '../document-series/documentSeries.format.js';
import { formConfigService } from '../form-configs/formConfig.service.js';
import { parseChanges } from './audit.format.js';
import {
    actionLabel,
    CATEGORY_LABELS,
    COMMON_LABELS,
    detailRows,
    fieldRows,
    humanize,
    moduleLabel,
    namedValue,
    SEVERITY_LABELS,
    SOURCE_LABELS,
    toEntryDetail,
    toListItem,
    type AuditRowLike,
    type FieldLabeler,
    type PresentContext,
    type RecordStatus,
} from './auditAdmin.present.js';
import {
    auditIdParamSchema,
    auditListQuerySchema,
    auditRangeQuerySchema,
    buildAuditWhere,
    daysBetween,
    offsetSegments,
    resolveAggregateRange,
    resolveRange,
    zonedDate,
    zonedDayStart,
    type IdBounds,
    type TimeRange,
} from './auditAdmin.query.js';
import { propLabel, propValue } from './formConfigAudit.service.js';

/**
 * Admin Audit Log queries (GET /api/admin/audit-logs …, admin-only): the filtered list with keyset paging, one
 * entry with its labelled Field / Before / After table, filter facets and the summary strip. Filters and ranges are
 * parsed in auditAdmin.query.ts, rows presented in auditAdmin.present.ts.
 *
 * Every date-ranged query first turns the range into an id range (`idBounds`): ids are written in time order, so
 * the list, facets and stats then seek the clustered key instead of scanning the table. No `COUNT(*)` over a
 * range runs for the list; facets and stats aggregate at most 366 days.
 */

const TZ = () => ENV.BUSINESS_TIMEZONE;
/** Other entries of the same request shown with one entry (an import writes one per row: `relatedCount` has them all). */
const RELATED_LIMIT = 100;
const TOP_USERS = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Module key → its document series (record numbers are shown only once the module has one). */
const SERIES_BY_MODULE: Readonly<Record<string, SeriesModule>> = {
    leads: 'lead',
    opportunities: 'opportunity',
    quotations: 'quotation',
    organizations: 'organization',
    contacts: 'contact',
    tickets: 'ticket',
    products: 'product',
};

type StatusLoader = (ids: string[]) => Promise<{ id: string; isDeleted: boolean }[]>;
const STATUS_SELECT = { id: true, isDeleted: true } as const;
const inIds = (ids: string[]) => ({ where: { id: { in: ids } }, select: STATUS_SELECT });

/** Soft-deleted CRM records: the list shows a record link, or "Deleted". */
const STATUS_LOADERS: Readonly<Record<string, StatusLoader>> = {
    Organization: (ids) => prisma.organization.findMany(inIds(ids)),
    Contact: (ids) => prisma.contact.findMany(inIds(ids)),
    Lead: (ids) => prisma.lead.findMany(inIds(ids)),
    Opportunity: (ids) => prisma.opportunity.findMany(inIds(ids)),
    Quotation: (ids) => prisma.quotation.findMany(inIds(ids)),
    Ticket: (ids) => prisma.ticket.findMany(inIds(ids)),
    Product: (ids) => prisma.product.findMany(inIds(ids)),
    PartnerCompany: (ids) => prisma.partnerCompany.findMany(inIds(ids)),
};

const statusKey = (entityType: string, entityId: string) => `${entityType}:${entityId}`;

async function loadRecordStatuses(rows: AuditRowLike[]): Promise<Map<string, Exclude<RecordStatus, null>>> {
    const idsByType = new Map<string, Set<string>>();
    for (const row of rows) {
        if (!STATUS_LOADERS[row.entityType]) continue;
        const ids = idsByType.get(row.entityType) ?? new Set<string>();
        ids.add(row.entityId);
        idsByType.set(row.entityType, ids);
    }
    const statuses = new Map<string, Exclude<RecordStatus, null>>();
    await Promise.all(
        [...idsByType].map(async ([entityType, ids]) => {
            for (const record of await STATUS_LOADERS[entityType]([...ids])) {
                statuses.set(statusKey(entityType, record.id), record.isDeleted ? 'deleted' : 'live');
            }
        }),
    );
    return statuses;
}

/**
 * Form labels per module (custom fields as `customFields.<key>`), from the cached form configuration including
 * archived and deleted fields, so old entries keep their names. Form Customization entries use the Form Builder's
 * property names. Labels are cosmetic: if the configuration can't be read, keys are shown humanized.
 */
/** Fields that hold a username: shown as the user's name. */
const USER_FIELDS = new Set(['assignedTo', 'createdBy', 'updatedBy', 'leadGivenBy']);

async function buildLabeler(): Promise<FieldLabeler> {
    const byModule = new Map<string, Map<string, string>>();
    // Every user (a few dozen rows) so stored usernames read as names.
    const users = await prisma.user.findMany({ select: { username: true, fullName: true } });
    const userNames = new Map(users.map((user) => [user.username.toLowerCase(), user.fullName.trim() || user.username]));
    try {
        const config = await formConfigService.getAllConfigs(true);
        for (const [module, fields] of Object.entries(config.fieldsByModule)) {
            byModule.set(module, new Map(fields.map((field) => [field.isSystem ? field.fieldKey : `customFields.${field.fieldKey}`, field.label])));
        }
    } catch (err) {
        logger.warn({ err: (err as Error).message }, 'Audit log: form labels unavailable; showing field keys');
    }
    return {
        label(module, key) {
            if (module === 'form-customization') return propLabel(key);
            const custom = key.startsWith('customFields.');
            return byModule.get(module)?.get(key) ?? (custom ? undefined : COMMON_LABELS[key]) ?? humanize(custom ? key.slice(13) : key);
        },
        value(module, key, value) {
            if (module === 'form-customization') return propValue(key, value);
            if (USER_FIELDS.has(key) && typeof value === 'string') return userNames.get(value.toLowerCase()) ?? namedValue(key, value);
            return namedValue(key, value);
        },
    };
}

async function presentContext(rows: AuditRowLike[]): Promise<PresentContext> {
    const [labeler, shown, statuses] = await Promise.all([buildLabeler(), shownNumberModules(), loadRecordStatuses(rows)]);
    return {
        labeler,
        showsRecordNumber: (module) => {
            const series = SERIES_BY_MODULE[module];
            return Boolean(series && shown.has(series));
        },
        recordStatus: (entityType, entityId) => (STATUS_LOADERS[entityType] ? (statuses.get(statusKey(entityType, entityId)) ?? 'missing') : null),
    };
}

/**
 * First and last id written in `range` (null when it holds no entries); the range queries then seek `id` on the
 * clustered key. Exact even when ids and times are slightly out of step (concurrent writers), because the
 * `createdAt` condition stays on every query. The index hint matters: left alone, SQL Server answers MIN(id) by
 * walking the clustered key from the oldest entry until one falls in the range, which reads nearly the whole
 * table for a recent range (25 ms with the hint vs 620 ms without, 1 M entries).
 */
async function idBounds(range: Required<TimeRange> | (TimeRange & { gte: Date })): Promise<IdBounds | null> {
    const end = range.lt ? Prisma.sql`AND [createdAt] < ${range.lt}` : Prisma.empty;
    const [row] = await prisma.$queryRaw<{ minId: bigint | number | string | null; maxId: bigint | number | string | null }[]>(Prisma.sql`
        SELECT MIN([id]) AS [minId], MAX([id]) AS [maxId]
        FROM [dbo].[AuditLog] WITH (INDEX([AuditLog_createdAt_idx]))
        WHERE [createdAt] >= ${range.gte} ${end}`);
    if (!row || row.minId === null || row.maxId === null) return null;
    return { min: BigInt(row.minId), max: BigInt(row.maxId) };
}

/** Full names for usernames (`system` → System). */
async function userLabels(usernames: string[]): Promise<Map<string, string>> {
    const names = usernames.filter((name) => name !== 'system');
    const users = names.length ? await prisma.user.findMany({ where: { username: { in: names } }, select: { username: true, fullName: true } }) : [];
    const labels = new Map(users.map((user) => [user.username.toLowerCase(), user.fullName.trim() || user.username]));
    return new Map(usernames.map((name) => [name, name === 'system' ? 'System' : (labels.get(name.toLowerCase()) ?? name)]));
}

/** The resolved window, `to` inclusive (what the screen shows as the range). */
const rangeDto = (range: Required<TimeRange>) => ({ from: range.gte.toISOString(), to: new Date(range.lt.getTime() - 1).toISOString() });

export interface AuditFacetOption {
    value: string;
    label: string;
    count: number;
}

const FACET_DIMENSIONS = ['users', 'modules', 'actions', 'categories', 'severities', 'sources'] as const;
type FacetDimension = (typeof FACET_DIMENSIONS)[number];
const FACET_COLUMNS = {
    users: 'changedBy',
    modules: 'module',
    actions: 'action',
    categories: 'category',
    severities: 'severity',
    sources: 'source',
} as const satisfies Record<FacetDimension, string>;
type FacetColumn = (typeof FACET_COLUMNS)[FacetDimension];

const FACET_LABELS: Record<Exclude<FacetDimension, 'users'>, (value: string) => string> = {
    modules: moduleLabel,
    actions: actionLabel,
    categories: (value) => CATEGORY_LABELS[value] ?? value,
    severities: (value) => SEVERITY_LABELS[value] ?? value,
    sources: (value) => SOURCE_LABELS[value] ?? value,
};

/** Calendar days of the range up to now, each with its entry count per category. */
async function eventsPerDay(range: Required<TimeRange>, bounds: IdBounds | null) {
    const tz = TZ();
    const lastInstant = new Date(Math.min(range.lt.getTime(), Date.now() + 1) - 1);
    const days = new Map(daysBetween(zonedDate(range.gte, tz), zonedDate(lastInstant, tz)).map((date) => [date, { date, total: 0, data: 0, config: 0, security: 0 }]));
    if (bounds) {
        // One GROUP BY per stretch of constant UTC offset (one for zones without DST) puts each row on its business day.
        const segments = offsetSegments(range.gte, range.lt, tz);
        const results = await Promise.all(
            segments.map((segment) =>
                prisma.$queryRaw<{ day: string; category: string; count: number }[]>(Prisma.sql`
                    SELECT d.[day], a.[category], COUNT(*) AS [count]
                    FROM [dbo].[AuditLog] a
                    CROSS APPLY (SELECT CONVERT(char(10), DATEADD(minute, ${segment.offsetMinutes}, a.[createdAt]), 23) AS [day]) d
                    WHERE a.[id] >= ${bounds.min} AND a.[id] <= ${bounds.max}
                      AND a.[createdAt] >= ${segment.start} AND a.[createdAt] < ${segment.end}
                    GROUP BY d.[day], a.[category]`),
            ),
        );
        for (const row of results.flat()) {
            const day = days.get(row.day);
            if (!day) continue;
            const count = Number(row.count);
            day.total += count;
            if (row.category === 'DATA') day.data += count;
            else if (row.category === 'CONFIG') day.config += count;
            else if (row.category === 'SECURITY') day.security += count;
        }
    }
    return [...days.values()];
}

export const auditAdminService = {
    /** Newest first, `limit` per page; `nextCursor` (an id) fetches the next page, null on the last one. */
    async list(query: unknown) {
        const filters = auditListQuerySchema.parse(query ?? {});
        const range = resolveRange(filters.from, filters.to, TZ());
        const empty = { items: [], nextCursor: null, limit: filters.limit };

        let bounds: IdBounds | undefined;
        // An open start would make the bounds lookup read the index from the beginning; `createdAt` alone does then.
        if (range.gte) {
            const found = await idBounds({ ...range, gte: range.gte });
            if (!found) return empty;
            bounds = found;
        }

        const rows = await prisma.auditLog.findMany({
            where: buildAuditWhere(filters, range, bounds),
            orderBy: { id: 'desc' },
            take: filters.limit + 1,
        });
        const page = rows.slice(0, filters.limit);
        if (page.length === 0) return empty;
        const ctx = await presentContext(page);
        return {
            items: page.map((row) => toListItem(row, ctx)),
            nextCursor: rows.length > filters.limit ? String(page[page.length - 1].id) : null,
            limit: filters.limit,
        };
    },

    /** One entry: its columns, the parsed changes, the labelled field table, other details, and its request's other entries. */
    async get(params: unknown) {
        const { id } = auditIdParamSchema.parse(params);
        const row = await prisma.auditLog.findUnique({ where: { id: BigInt(id) } });
        if (!row) throw HttpError.notFound('Audit entry not found');

        const sameRequest = row.requestId ? { requestId: row.requestId, id: { not: row.id } } : undefined;
        const [related, relatedCount] = sameRequest
            ? await Promise.all([
                  prisma.auditLog.findMany({ where: sameRequest, orderBy: { id: 'asc' }, take: RELATED_LIMIT }),
                  prisma.auditLog.count({ where: sameRequest }),
              ])
            : [[], 0];

        const ctx = await presentContext([row, ...related]);
        const changes = parseChanges(row.changesJson);
        return {
            entry: toEntryDetail(row, ctx, changes),
            changes,
            fields: fieldRows(row.action, row.module, changes, ctx.labeler),
            details: detailRows(row.action, row.module, changes, ctx.labeler),
            related: related.map((other) => toListItem(other, ctx)),
            relatedCount,
        };
    },

    /** Filter options with their counts in the range (default: the last 30 days), most used first. */
    async facets(query: unknown) {
        const { from, to } = auditRangeQuerySchema.parse(query ?? {});
        const range = resolveAggregateRange(from, to, TZ());
        const result: { from: string; to: string; total: number } & Record<FacetDimension, AuditFacetOption[]> = {
            ...rangeDto(range),
            total: 0,
            users: [],
            modules: [],
            actions: [],
            categories: [],
            severities: [],
            sources: [],
        };
        const bounds = await idBounds(range);
        if (!bounds) return result;

        // One pass over the range, grouped by every facet column at once (a few hundred combinations), rolled up
        // here: about 3x faster than GROUPING SETS, whose spools re-read the rows once per facet.
        const rows = await prisma.$queryRaw<(Record<FacetColumn, string | null> & { count: number })[]>(Prisma.sql`
            SELECT [changedBy], [module], [action], [category], [severity], [source], COUNT(*) AS [count]
            FROM [dbo].[AuditLog]
            WHERE [id] >= ${bounds.min} AND [id] <= ${bounds.max}
              AND [createdAt] >= ${range.gte} AND [createdAt] < ${range.lt}
            GROUP BY [changedBy], [module], [action], [category], [severity], [source]`);

        const counts = new Map<FacetDimension, Map<string, number>>(FACET_DIMENSIONS.map((dimension) => [dimension, new Map()]));
        for (const row of rows) {
            const count = Number(row.count);
            result.total += count;
            for (const dimension of FACET_DIMENSIONS) {
                const value = row[FACET_COLUMNS[dimension]];
                // Entries written before a column existed (no source) can't be filtered on, so they aren't offered.
                if (!value) continue;
                const byValue = counts.get(dimension)!;
                byValue.set(value, (byValue.get(value) ?? 0) + count);
            }
        }
        const users = await userLabels([...counts.get('users')!.keys()]);
        for (const dimension of FACET_DIMENSIONS) {
            for (const [value, count] of counts.get(dimension)!) {
                const label = dimension === 'users' ? (users.get(value) ?? value) : FACET_LABELS[dimension](value);
                result[dimension].push({ value, label, count });
            }
        }
        for (const dimension of FACET_DIMENSIONS) result[dimension].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
        return result;
    },

    /**
     * Summary strip: entries today (business day), failed sign-ins in the last 24 h, refused access in the last 24 h,
     * deletes in the last 7 days; and for the range (default: the last 30 days) the most active users (background
     * jobs left out) and entries per day by category.
     */
    async stats(query: unknown) {
        const { from, to } = auditRangeQuerySchema.parse(query ?? {});
        const tz = TZ();
        const range = resolveAggregateRange(from, to, tz);
        const now = new Date();
        const todayStart = zonedDayStart(zonedDate(now, tz), tz);
        const dayAgo = new Date(now.getTime() - DAY_MS);

        const [today, failedSignIns24h, accessDenied24h, deletes7d, bounds] = await Promise.all([
            prisma.auditLog.count({ where: { createdAt: { gte: todayStart } } }),
            prisma.auditLog.count({ where: { action: 'LOGIN_FAILED', createdAt: { gte: dayAgo } } }),
            prisma.auditLog.count({ where: { action: 'ACCESS_DENIED', createdAt: { gte: dayAgo } } }),
            prisma.auditLog.count({ where: { action: 'DELETE', createdAt: { gte: new Date(now.getTime() - 7 * DAY_MS) } } }),
            idBounds(range),
        ]);

        const [top, perDay] = await Promise.all([
            bounds
                ? prisma.auditLog.groupBy({
                      by: ['changedBy'],
                      where: { id: { gte: bounds.min, lte: bounds.max }, createdAt: { gte: range.gte, lt: range.lt }, changedBy: { not: 'system' } },
                      _count: { _all: true },
                      orderBy: { _count: { changedBy: 'desc' } },
                      take: TOP_USERS,
                  })
                : [],
            eventsPerDay(range, bounds),
        ]);
        const names = await userLabels(top.map((row) => row.changedBy));

        return {
            ...rangeDto(range),
            today,
            failedSignIns24h,
            accessDenied24h,
            deletes7d,
            total: perDay.reduce((sum, day) => sum + day.total, 0),
            mostActiveUsers: top.map((row) => ({ username: row.changedBy, label: names.get(row.changedBy) ?? row.changedBy, count: row._count._all })),
            eventsPerDay: perDay,
        };
    },
};
