import type { TransactionClient } from '../config/prisma.js';
import { logger } from '../config/logger.js';
import { labelFromChanges, moduleTitle, type AuditEntityType } from './auditCatalog.js';

/**
 * The record's number and name at the time of an audit entry (`AuditLog.entityCode` / `entityLabel`), so the log
 * stays readable after a record is renamed or deleted. Read from the live row in the writing transaction (one query
 * per entity type per write), else from the snapshot / labels in the entry's own `changes` (hard-deleted admin rows).
 * The wording matches the backfill in migration 20261121200000_audit_ledger.
 */
export interface RecordLabel {
    /** Record number (shown only once the module has a document series). */
    code?: string | null;
    label?: string | null;
}

interface LabelTarget {
    entityType: AuditEntityType;
    entityId: string;
    changes?: unknown;
}

export const labelKey = (entityType: string, entityId: string) => `${entityType}:${entityId}`;

const str = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() ? value.trim() : undefined);
const join = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(' › ') || undefined;
const intIds = (ids: string[]) => ids.map(Number).filter((id) => Number.isInteger(id) && id > 0);

type Loader = (client: TransactionClient, ids: string[]) => Promise<Array<[string, RecordLabel]>>;
const inIds = (ids: string[]) => ({ where: { id: { in: ids } } });

const LOADERS: Partial<Record<AuditEntityType, Loader>> = {
    Organization: async (c, ids) =>
        (await c.organization.findMany({ ...inIds(ids), select: { id: true, accountCode: true, organizationName: true } })).map((r) => [
            r.id,
            { code: r.accountCode, label: r.organizationName },
        ]),
    Contact: async (c, ids) =>
        (await c.contact.findMany({ ...inIds(ids), select: { id: true, contactCode: true, name: true } })).map((r) => [r.id, { code: r.contactCode, label: r.name }]),
    Lead: async (c, ids) =>
        (await c.lead.findMany({ ...inIds(ids), select: { id: true, leadCode: true, name: true } })).map((r) => [r.id, { code: r.leadCode, label: r.name }]),
    Opportunity: async (c, ids) =>
        (await c.opportunity.findMany({ ...inIds(ids), select: { id: true, opportunityCode: true, opportunityName: true, organizationName: true } })).map((r) => [
            r.id,
            { code: r.opportunityCode, label: str(r.opportunityName) ?? r.organizationName },
        ]),
    Quotation: async (c, ids) =>
        (await c.quotation.findMany({ ...inIds(ids), select: { id: true, quotationCode: true, quotationTitle: true } })).map((r) => [
            r.id,
            { code: r.quotationCode, label: r.quotationTitle },
        ]),
    Ticket: async (c, ids) =>
        (await c.ticket.findMany({ ...inIds(ids), select: { id: true, ticketNumber: true, ticketSubject: true, organizationName: true } })).map((r) => [
            r.id,
            { code: r.ticketNumber, label: str(r.ticketSubject) ?? r.organizationName },
        ]),
    Contract: async (c, ids) =>
        (await c.contract.findMany({ ...inIds(ids), select: { id: true, contractNumber: true, contractTitle: true, organizationName: true } })).map((r) => [
            r.id,
            { code: r.contractNumber, label: str(r.contractTitle) ?? r.organizationName },
        ]),
    // Activities are unnumbered: the subject is the label.
    Activity: async (c, ids) =>
        (await c.activity.findMany({ ...inIds(ids), select: { id: true, subject: true } })).map((r) => [r.id, { label: r.subject }]),
    Product: async (c, ids) =>
        (await c.product.findMany({ ...inIds(ids), select: { id: true, productCode: true, productName: true } })).map((r) => [
            r.id,
            { code: r.productCode, label: r.productName },
        ]),
    PartnerCompany: async (c, ids) =>
        (await c.partnerCompany.findMany({ ...inIds(ids), select: { id: true, partnerName: true } })).map((r) => [r.id, { label: r.partnerName }]),
    User: async (c, ids) =>
        (await c.user.findMany({ where: { id: { in: intIds(ids) } }, select: { id: true, fullName: true, username: true } })).map((r) => [
            String(r.id),
            { label: str(r.fullName) ?? r.username },
        ]),
    City: async (c, ids) =>
        (await c.city.findMany({ where: { id: { in: intIds(ids) } }, select: { id: true, cityName: true } })).map((r) => [String(r.id), { label: r.cityName }]),
    DropdownCategory: async (c, ids) =>
        (await c.dropdownCategory.findMany({ ...inIds(ids), select: { id: true, label: true } })).map((r) => [r.id, { label: r.label }]),
    DropdownOption: async (c, ids) =>
        (await c.dropdownOption.findMany({ ...inIds(ids), select: { id: true, label: true, category: { select: { label: true } } } })).map((r) => [
            r.id,
            { label: join(str(r.category?.label), r.label) },
        ]),
    FormField: async (c, ids) =>
        (await c.formFieldDefinition.findMany({ ...inIds(ids), select: { id: true, module: true, label: true } })).map((r) => [
            r.id,
            { label: join(moduleTitle(r.module), r.label) },
        ]),
    PdfTemplate: async (c, ids) => (await c.pdfTemplate.findMany({ ...inIds(ids), select: { id: true, name: true } })).map((r) => [r.id, { label: r.name }]),
    PdfAsset: async (c, ids) => (await c.pdfAsset.findMany({ ...inIds(ids), select: { id: true, fileName: true } })).map((r) => [r.id, { label: r.fileName }]),
    PdfSavedItem: async (c, ids) => (await c.pdfSavedItem.findMany({ ...inIds(ids), select: { id: true, name: true } })).map((r) => [r.id, { label: r.name }]),
};

const clip = (value: string | null | undefined, max: number) => (value ? value.slice(0, max) : null);
const LOOKUP_BATCH = 1000;

/**
 * Labels for a batch of entries, keyed by `labelKey`. Never throws: a failed lookup falls back to the entry's own
 * snapshot, so labelling can't break the change being audited.
 */
export async function resolveLabels(client: TransactionClient, targets: LabelTarget[]): Promise<Map<string, { code: string | null; label: string | null }>> {
    const live = new Map<string, RecordLabel>();
    const idsByType = new Map<AuditEntityType, Set<string>>();
    for (const t of targets) {
        if (!LOADERS[t.entityType]) continue;
        const ids = idsByType.get(t.entityType) ?? new Set<string>();
        ids.add(t.entityId);
        idsByType.set(t.entityType, ids);
    }
    for (const [entityType, ids] of idsByType) {
        const all = [...ids];
        try {
            // 1,000 ids per query keeps `IN (…)` under SQL Server's 2,100-parameter limit.
            for (let i = 0; i < all.length; i += LOOKUP_BATCH) {
                for (const [id, label] of await LOADERS[entityType]!(client, all.slice(i, i + LOOKUP_BATCH))) live.set(labelKey(entityType, id), label);
            }
        } catch (err) {
            logger.warn({ err: (err as Error).message, entityType }, 'Audit label lookup failed; using the entry snapshot');
        }
    }

    const out = new Map<string, { code: string | null; label: string | null }>();
    for (const t of targets) {
        const key = labelKey(t.entityType, t.entityId);
        const found = live.get(key);
        out.set(key, {
            code: clip(str(found?.code), 50),
            label: clip(str(found?.label) ?? labelFromChanges(t.entityType, t.entityId, t.changes) ?? null, 200),
        });
    }
    return out;
}
