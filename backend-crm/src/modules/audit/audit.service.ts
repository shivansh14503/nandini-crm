import { z } from 'zod';
import { ENV } from '../../config/env.js';
import { prisma } from '../../config/prisma.js';
import type { AuditEntityType } from '../../services/audit.service.js';

/** Route segment (plural or singular, any case) → stored entity type. */
const ENTITY_TYPES: Record<string, AuditEntityType> = {
    organization: 'Organization',
    organizations: 'Organization',
    contact: 'Contact',
    contacts: 'Contact',
    lead: 'Lead',
    leads: 'Lead',
    opportunity: 'Opportunity',
    opportunities: 'Opportunity',
    quotation: 'Quotation',
    quotations: 'Quotation',
    product: 'Product',
    products: 'Product',
    ticket: 'Ticket',
    tickets: 'Ticket',
    'partner-company': 'PartnerCompany',
    'partner-companies': 'PartnerCompany',
    partnercompany: 'PartnerCompany',
    partnercompanies: 'PartnerCompany',
    user: 'User',
    users: 'User',
};

export const auditParamsSchema = z.object({
    entityType: z
        .string()
        .trim()
        .transform((value) => ENTITY_TYPES[value.toLowerCase()])
        .refine((value): value is AuditEntityType => Boolean(value), { message: `entityType must be one of: ${[...new Set(Object.values(ENTITY_TYPES))].join(', ')}.` }),
    entityId: z.string().trim().min(1).max(50),
});

export const auditQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(500).catch(100).default(100),
});

export interface AuditEntryDto {
    id: string;
    action: string;
    changedBy: string;
    createdAt: string;
    changes: unknown;
}

/** `AuditRevisionItem` from frontend-crm/src/components/common/Drawer/types.ts. */
export interface AuditRevisionItem {
    title: string;
    author: string;
    time: string;
    from?: string;
    to?: string;
    note?: string;
    tag?: string;
}

const timeFormat = new Intl.DateTimeFormat('en-GB', {
    timeZone: ENV.BUSINESS_TIMEZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
});

/** e.g. `12-Oct-2026, 11:15 AM` in the business timezone (the timeline's existing format). */
function displayTime(date: Date): string {
    const parts = Object.fromEntries(timeFormat.formatToParts(date).map((part) => [part.type, part.value]));
    return `${parts.day}-${parts.month}-${parts.year}, ${parts.hour}:${parts.minute} ${String(parts.dayPeriod).toUpperCase()}`;
}

/** `salesStage` → `Sales Stage`. */
const fieldLabel = (field: string) => field.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());

function displayValue(value: unknown): string {
    if (value === null || value === undefined || value === '') return '—';
    if (Array.isArray(value)) {
        if (value.every((item) => typeof item !== 'object')) return value.join(', ') || '—';
        return `${value.length} item${value.length === 1 ? '' : 's'}`;
    }
    if (typeof value === 'object') return JSON.stringify(value).slice(0, 200);
    return String(value);
}

const isDiff = (value: unknown): value is { from: unknown; to: unknown } =>
    typeof value === 'object' && value !== null && 'from' in value && 'to' in value;

const ACTION_TITLES: Record<string, { title: string; tag: string }> = {
    CREATE: { title: 'Record created', tag: 'Created' },
    DELETE: { title: 'Record deleted', tag: 'Deleted' },
    CONVERT: { title: 'Lead converted', tag: 'Converted' },
    IMPORT: { title: 'Imported', tag: 'Imported' },
    LOGIN: { title: 'Signed in', tag: 'Login' },
    LOGIN_FAILED: { title: 'Failed sign-in attempt', tag: 'Security' },
    LOGOUT: { title: 'Signed out', tag: 'Logout' },
};

/** One timeline item per changed field for updates; one item for every other action. */
function toRevisions(entry: AuditEntryDto, time: string): AuditRevisionItem[] {
    const base = { author: entry.changedBy, time };
    const changes = (entry.changes ?? {}) as Record<string, unknown>;

    if (entry.action === 'UPDATE' || entry.action === 'STATUS_CHANGE') {
        const note = typeof changes.reason === 'string' ? changes.reason : undefined;
        const items = Object.entries(changes)
            .filter(([, value]) => isDiff(value))
            .map(([field, value]) => {
                const diff = value as { from: unknown; to: unknown };
                return { ...base, title: `${fieldLabel(field)} updated`, from: displayValue(diff.from), to: displayValue(diff.to), tag: 'Updated', note };
            });
        return items.length > 0 ? items : [{ ...base, title: 'Record updated', tag: 'Updated', note }];
    }

    const known = ACTION_TITLES[entry.action] ?? { title: entry.action, tag: entry.action };
    if (entry.action === 'CONVERT' && isDiff(changes.status)) {
        return [{ ...base, ...known, from: displayValue(changes.status.from), to: displayValue(changes.status.to) }];
    }
    return [{ ...base, ...known }];
}

export const auditLogService = {
    /** Newest first: raw entries plus timeline items ready for `AuditTrailTimeline`. */
    async forEntity(params: unknown, query: unknown) {
        const { entityType, entityId } = auditParamsSchema.parse(params);
        const { limit } = auditQuerySchema.parse(query ?? {});

        const rows = await prisma.auditLog.findMany({
            where: { entityType, entityId },
            orderBy: { createdAt: 'desc' },
            take: limit,
        });

        const entries: AuditEntryDto[] = rows.map((row) => {
            let changes: unknown = null;
            try {
                changes = row.changesJson ? JSON.parse(row.changesJson) : null;
            } catch {
                changes = row.changesJson;
            }
            return { id: row.id, action: row.action, changedBy: row.changedBy, createdAt: row.createdAt.toISOString(), changes };
        });

        return {
            entityType,
            entityId,
            entries,
            revisions: entries.flatMap((entry, index) => toRevisions(entry, displayTime(rows[index].createdAt))),
        };
    },
};
