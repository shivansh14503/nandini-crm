import { z } from 'zod';
import type { Prisma } from '../../generated/prisma/client.js';
import { HttpError } from '../../utils/httpError.js';

/**
 * Query side of the admin Audit Log (GET /api/admin/audit-logs): filter parsing, business-timezone date ranges and
 * the Prisma `where` they become. Pure functions (unit tested in auditAdmin.query.test.ts); the service runs them.
 */

export const AUDIT_CATEGORIES = ['DATA', 'CONFIG', 'SECURITY'] as const;
export const AUDIT_SEVERITIES = ['INFO', 'NOTICE', 'WARNING', 'CRITICAL'] as const;
export const AUDIT_SOURCES = ['UI', 'API', 'IMPORT', 'JOB'] as const;

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;
/** Facets and stats: the window when none is given, and the longest one allowed (they aggregate every row in it). */
export const DEFAULT_RANGE_DAYS = 30;
export const MAX_RANGE_DAYS = 366;
/** Values one multi-value filter may carry. */
const MAX_VALUES = 50;
const MAX_BIGINT = 9223372036854775807n;
const DAY_MS = 24 * 60 * 60 * 1000;

// ── Business-timezone calendar ───────────────────────────────────────────────

const formatters = new Map<string, Intl.DateTimeFormat>();
function partsIn(instant: Date, timeZone: string): Record<string, number> {
    let format = formatters.get(timeZone);
    if (!format) {
        format = new Intl.DateTimeFormat('en-US', {
            timeZone,
            hourCycle: 'h23',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        });
        formatters.set(timeZone, format);
    }
    return Object.fromEntries(format.formatToParts(instant).filter((p) => p.type !== 'literal').map((p) => [p.type, Number(p.value)]));
}

/** Minutes `timeZone` is ahead of UTC at `instant` (330 for Asia/Kolkata). */
export function zoneOffsetMinutes(instant: Date, timeZone: string): number {
    const p = partsIn(instant, timeZone);
    const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    return Math.round((wall - Math.floor(instant.getTime() / 1000) * 1000) / 60_000);
}

/** `YYYY-MM-DD` of `instant` on the `timeZone` calendar. */
export function zonedDate(instant: Date, timeZone: string): string {
    const p = partsIn(instant, timeZone);
    return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** The UTC instant calendar day `ymd` (`YYYY-MM-DD`) starts at in `timeZone`. */
export function zonedDayStart(ymd: string, timeZone: string): Date {
    const [y, m, d] = ymd.split('-').map(Number);
    const midnightUtc = Date.UTC(y, m - 1, d);
    // Twice: the offset at the guessed instant may differ from the one at the real midnight (DST change that day).
    let start = midnightUtc - zoneOffsetMinutes(new Date(midnightUtc), timeZone) * 60_000;
    start = midnightUtc - zoneOffsetMinutes(new Date(start), timeZone) * 60_000;
    return new Date(start);
}

export function addDays(ymd: string, days: number): string {
    const [y, m, d] = ymd.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Every `YYYY-MM-DD` from `first` to `last`, both included. */
export function daysBetween(first: string, last: string): string[] {
    const days: string[] = [];
    for (let day = first; day <= last && days.length <= MAX_RANGE_DAYS + 1; day = addDays(day, 1)) days.push(day);
    return days;
}

/**
 * `[start, end)` split where the zone's UTC offset changes (DST), so a per-day GROUP BY can shift each piece by one
 * fixed offset and still put every row on its exact business day. One piece for zones without DST.
 */
export function offsetSegments(start: Date, end: Date, timeZone: string): { start: Date; end: Date; offsetMinutes: number }[] {
    const segments: { start: Date; end: Date; offsetMinutes: number }[] = [];
    let from = start.getTime();
    const until = end.getTime();
    while (from < until) {
        const offset = zoneOffsetMinutes(new Date(from), timeZone);
        // Offsets change at most a few times a year: probe a day at a time, then narrow the change to the minute.
        let probe = from;
        while (probe < until && zoneOffsetMinutes(new Date(Math.min(probe + DAY_MS, until)), timeZone) === offset) probe += DAY_MS;
        let next = until;
        if (probe < until) {
            let lo = probe;
            let hi = Math.min(probe + DAY_MS, until);
            while (hi - lo > 60_000) {
                const mid = lo + Math.floor((hi - lo) / 120_000) * 60_000;
                if (zoneOffsetMinutes(new Date(mid), timeZone) === offset) lo = mid;
                else hi = mid;
            }
            next = hi;
        }
        segments.push({ start: new Date(from), end: new Date(next), offsetMinutes: offset });
        from = next;
    }
    return segments;
}

// ── Parameters ───────────────────────────────────────────────────────────────

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

const isRealDate = (ymd: string) => {
    const [y, m, d] = ymd.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
};

const blankToUndefined = (value: unknown) => {
    if (Array.isArray(value)) value = value[value.length - 1];
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
};

const text = (max: number) => z.preprocess(blankToUndefined, z.string().max(max).optional());

const dateParam = z.preprocess(
    blankToUndefined,
    z
        .string()
        .refine((v) => (DATE_ONLY.test(v) ? isRealDate(v) : DATE_TIME.test(v) && !Number.isNaN(Date.parse(v))), {
            message: 'Use a date (YYYY-MM-DD, business timezone) or an ISO date-time with a timezone (2026-11-21T10:00:00Z).',
        })
        .optional(),
);

/** Repeated params (`?module=leads&module=contacts`) and comma lists (`?module=leads,contacts`), trimmed and de-duplicated. */
function listParam<T extends z.ZodType>(item: T, normalize: (value: string) => string = (value) => value) {
    return z.preprocess((value) => {
        if (value === undefined || value === null) return undefined;
        const raw = (Array.isArray(value) ? value : [value]).flatMap((v) => (typeof v === 'string' ? v.split(',') : [v]));
        const items = [...new Set(raw.map((v) => (typeof v === 'string' ? normalize(v.trim()) : v)).filter((v) => v !== ''))];
        return items.length > 0 ? items : undefined;
    }, z.array(item).max(MAX_VALUES, `At most ${MAX_VALUES} values per filter.`).optional());
}

const upper = (value: string) => value.toUpperCase();

/** A positive BIGINT in decimal (an AuditLog id). One check: Zod runs every refinement even after one fails. */
const isBigIntId = (value: string) => /^\d{1,19}$/.test(value) && BigInt(value) > 0n && BigInt(value) <= MAX_BIGINT;

/**
 * Route names of record types (`leads` → `Lead`), as in /api/audit-logs/:entityType. Stored names (`Lead`,
 * `DropdownOption`) pass through as they are; SQL Server compares them case-insensitively.
 */
const ENTITY_TYPE_ROUTES: Readonly<Record<string, string>> = {
    organizations: 'Organization',
    contacts: 'Contact',
    leads: 'Lead',
    opportunities: 'Opportunity',
    quotations: 'Quotation',
    products: 'Product',
    tickets: 'Ticket',
    contracts: 'Contract',
    activities: 'Activity',
    'partner-companies': 'PartnerCompany',
    users: 'User',
    'pdf-templates': 'PdfTemplate',
};
const normalizeEntityType = (value: string) => ENTITY_TYPE_ROUTES[value.toLowerCase()] ?? value;

/** Field filter: a top-level key (`assignedTo`) or a custom field (`customFields.po_number`). */
const FIELD_KEY = /^(customFields\.)?[A-Za-z0-9_]{1,80}$/;

const rangeShape = { from: dateParam, to: dateParam };

/** GET /facets and GET /stats. */
export const auditRangeQuerySchema = z.object(rangeShape);

/** GET / — every filter is optional; values within one filter are OR-ed, filters are AND-ed. */
export const auditListQuerySchema = z.object({
    ...rangeShape,
    /** Usernames (`changedBy`); `system` for background jobs. */
    user: listParam(z.string().min(1).max(50)),
    module: listParam(z.string().regex(/^[a-z][a-z-]{0,39}$/, 'module must be a module key such as leads or form-customization.'), (v) => v.toLowerCase()),
    action: listParam(z.string().regex(/^[A-Z_]{1,30}$/, 'action must be an action name such as UPDATE or LOGIN_FAILED.'), upper),
    category: listParam(z.enum(AUDIT_CATEGORIES), upper),
    severity: listParam(z.enum(AUDIT_SEVERITIES), upper),
    source: listParam(z.enum(AUDIT_SOURCES), upper),
    entityType: listParam(z.string().regex(/^[A-Za-z-]{1,30}$/, 'entityType must be a record type such as Lead or leads.'), normalizeEntityType),
    /** The record's id. */
    entityId: text(50),
    /** Record number at the time, matched anywhere in it. */
    entityCode: text(50),
    /** Record name at the time, matched anywhere in it. */
    entityLabel: text(200),
    /** Entries whose update changed any of these fields. */
    field: listParam(z.string().regex(FIELD_KEY, 'field must be a field key such as assignedTo or customFields.po_number.')),
    /** Exact IP address, or a prefix ending in `*` (`192.168.1.*`). */
    ip: z.preprocess(blankToUndefined, z.string().regex(/^[0-9A-Fa-f:.]{1,45}\*?$/, 'ip must be an IP address, or a prefix ending in *.').optional()),
    requestId: text(50),
    /** Free text: record name / number / id, user, IP, request id, and the stored values. */
    q: text(100),
    /** Keyset paging: the `nextCursor` of the previous page (entries older than this id). */
    cursor: z.preprocess(
        blankToUndefined,
        z
            .string()
            .refine(isBigIntId, 'cursor must be the nextCursor of the previous page.')
            .optional(),
    ),
    limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).catch(DEFAULT_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export type AuditListFilters = z.infer<typeof auditListQuerySchema>;

export const auditIdParamSchema = z.object({
    id: z
        .string()
        .refine(isBigIntId, 'id must be an audit entry id.'),
});

/** POST /:id/undo — `fields`: undo only these of the entry's fields (default: every one that can be). */
export const auditUndoBodySchema = z.object({
    fields: z.array(z.string().regex(FIELD_KEY, 'fields must be field keys such as assignedTo or customFields.po_number.')).min(1).max(200).optional(),
});

// ── Ranges ───────────────────────────────────────────────────────────────────

/** `createdAt >= gte AND createdAt < lt`; either end may be open. */
export interface TimeRange {
    gte?: Date;
    lt?: Date;
}

/** A date is a whole business-timezone day (`to` included); a date-time is that instant (`to` included). */
export function resolveRange(from: string | undefined, to: string | undefined, timeZone: string): TimeRange {
    const range: TimeRange = {};
    if (from) range.gte = DATE_ONLY.test(from) ? zonedDayStart(from, timeZone) : new Date(from);
    if (to) range.lt = DATE_ONLY.test(to) ? zonedDayStart(addDays(to, 1), timeZone) : new Date(new Date(to).getTime() + 1);
    if (range.gte && range.lt && range.gte >= range.lt) {
        throw HttpError.badRequest('`from` must be before `to`.', [{ message: '`from` must be before `to`.', path: ['from'] }]);
    }
    return range;
}

/**
 * Facets / stats window: closed at both ends. No dates → the last 30 business days up to now; only `from` → up to
 * now; only `to` → the 30 days before it. Longer than 366 days → 400.
 */
export function resolveAggregateRange(from: string | undefined, to: string | undefined, timeZone: string, now = new Date()): Required<TimeRange> {
    const range = resolveRange(from, to, timeZone);
    const lt = range.lt ?? new Date(now.getTime() + 1);
    const gte = range.gte ?? (range.lt ? new Date(lt.getTime() - DEFAULT_RANGE_DAYS * DAY_MS) : zonedDayStart(addDays(zonedDate(now, timeZone), 1 - DEFAULT_RANGE_DAYS), timeZone));
    if (gte >= lt) throw HttpError.badRequest('`from` must be before `to`.', [{ message: '`from` must be before `to`.', path: ['from'] }]);
    // One extra day absorbs a DST hour and the `to` day being included.
    if (lt.getTime() - gte.getTime() > (MAX_RANGE_DAYS + 1) * DAY_MS) {
        throw HttpError.badRequest(`The date range can be at most ${MAX_RANGE_DAYS} days.`, [
            { message: `The date range can be at most ${MAX_RANGE_DAYS} days.`, path: ['from'] },
        ]);
    }
    return { gte, lt };
}

// ── Where ────────────────────────────────────────────────────────────────────

/** Ids of the first and last entry in a date range (see `idBounds` in auditAdmin.service.ts). */
export interface IdBounds {
    min: bigint;
    max: bigint;
}

/** SQL Server LIKE treats `%`, `_` and `[` as patterns and Prisma's `contains` doesn't escape them: match them literally. */
export const likeLiteral = (value: string) => value.replace(/[[%_]/g, (c) => `[${c}]`);

/** An update changed this field. Custom field changes are one `customFields` diff: narrow by the list, then by the key inside the JSON. */
function fieldConditions(field: string): Prisma.AuditLogWhereInput[] {
    if (!field.startsWith('customFields.')) return [{ changedFields: { contains: `|${field}|` } }];
    return [{ changedFields: { contains: '|customFields|' } }, { changesJson: { contains: likeLiteral(`"${field.slice(13)}":`) } }];
}

/**
 * Filters → Prisma where. With `bounds` the date range is also an `id` range, so SQL Server seeks the clustered key
 * (id order is write order) instead of scanning; the `createdAt` condition stays for exactness.
 */
export function buildAuditWhere(filters: Partial<AuditListFilters>, range: TimeRange, bounds?: IdBounds): Prisma.AuditLogWhereInput {
    const where: Prisma.AuditLogWhereInput = {};
    const and: Prisma.AuditLogWhereInput[] = [];

    // One `id` range (the cursor folded into the upper bound): SQL Server then seeks it in a single step.
    const before = filters.cursor ? BigInt(filters.cursor) - 1n : undefined;
    if (bounds) where.id = { gte: bounds.min, lte: before !== undefined && before < bounds.max ? before : bounds.max };
    else if (before !== undefined) where.id = { lte: before };

    if (range.gte || range.lt) where.createdAt = { ...(range.gte && { gte: range.gte }), ...(range.lt && { lt: range.lt }) };

    if (filters.user) where.changedBy = { in: filters.user };
    if (filters.module) where.module = { in: filters.module };
    if (filters.action) where.action = { in: filters.action };
    if (filters.category) where.category = { in: [...filters.category] };
    if (filters.severity) where.severity = { in: [...filters.severity] };
    if (filters.source) where.source = { in: [...filters.source] };
    if (filters.entityType) where.entityType = { in: filters.entityType };
    if (filters.entityId) where.entityId = filters.entityId;
    if (filters.entityCode) where.entityCode = { contains: likeLiteral(filters.entityCode) };
    if (filters.entityLabel) where.entityLabel = { contains: likeLiteral(filters.entityLabel) };
    if (filters.requestId) where.requestId = filters.requestId;
    if (filters.ip) where.ipAddress = filters.ip.endsWith('*') ? { startsWith: likeLiteral(filters.ip.slice(0, -1)) } : filters.ip;

    if (filters.field?.length === 1) and.push(...fieldConditions(filters.field[0]));
    else if (filters.field) and.push({ OR: filters.field.map((field) => ({ AND: fieldConditions(field) })) });

    if (filters.q) {
        const q = likeLiteral(filters.q);
        and.push({
            OR: [
                { entityLabel: { contains: q } },
                { entityCode: { contains: q } },
                { changedBy: { contains: q } },
                { entityId: filters.q },
                { requestId: filters.q },
                { ipAddress: filters.q },
                { changesJson: { contains: q } },
            ],
        });
    }

    if (and.length > 0) where.AND = and;
    return where;
}
