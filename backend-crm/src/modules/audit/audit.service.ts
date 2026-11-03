import { z } from 'zod';
import { prisma } from '../../config/prisma.js';
import type { AuditEntityType } from '../../services/audit.service.js';
import { displayTime, displayValue, fieldLabel, isDiff, parseChanges, type AuditEntryDto, type AuditRevisionItem } from './audit.format.js';
import { formConfigAuditService, isFormConfigsEntityType } from './formConfigAudit.service.js';

export type { AuditEntryDto, AuditRevisionItem } from './audit.format.js';

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
        .refine((value): value is AuditEntityType => Boolean(value), {
            message: `entityType must be one of: ${[...new Set(Object.values(ENTITY_TYPES))].join(', ')}, form-configs.`,
        }),
    entityId: z.string().trim().min(1).max(50),
});

export const auditQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(500).catch(100).default(100),
});

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
    /**
     * Newest first: raw entries plus timeline items ready for `AuditTrailTimeline`.
     * `form-configs` is the Form Customization trail: `entityId` is a module key, `shared`, or `all`.
     */
    async forEntity(params: unknown, query: unknown) {
        const { limit } = auditQuerySchema.parse(query ?? {});
        if (isFormConfigsEntityType(params)) return formConfigAuditService.forScope(params, limit);

        const { entityType, entityId } = auditParamsSchema.parse(params);
        const rows = await prisma.auditLog.findMany({
            where: { entityType, entityId },
            orderBy: { createdAt: 'desc' },
            take: limit,
        });

        const entries: AuditEntryDto[] = rows.map((row) => ({
            id: row.id,
            action: row.action,
            changedBy: row.changedBy,
            createdAt: row.createdAt.toISOString(),
            changes: parseChanges(row.changesJson),
        }));

        return {
            entityType,
            entityId,
            entries,
            revisions: entries.flatMap((entry, index) => toRevisions(entry, displayTime(rows[index].createdAt))),
        };
    },
};
