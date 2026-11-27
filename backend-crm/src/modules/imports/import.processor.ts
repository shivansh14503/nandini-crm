import { ZodError } from 'zod';
import { ENV } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { Prisma } from '../../generated/prisma/client.js';
import { auditService } from '../../services/audit.service.js';
import { runWithAuditOrigin, type AuditOrigin } from '../../services/auditContext.js';
import { cacheService } from '../../services/cache.service.js';
import type { AuthUser } from '../../types/user.types.js';
import { HttpError } from '../../utils/httpError.js';
import { wallClockNow } from '../../utils/mappers.js';
import { createContactRecord } from '../contacts/contact.service.js';
import { checkModulePayload, loadModuleFieldConfig, type ModuleFieldConfig } from '../form-configs/customFieldValidator.js';
import { contactInputSchema } from '../contacts/contact.validator.js';
import { assertStatusTransition, createLeadRecord } from '../leads/lead.service.js';
import { loadRatingConfig, newLeadRatingColumns, type RatingConfig } from '../leads/lead.followUp.js';
import { leadImportSchema } from '../leads/lead.validator.js';
import { assertLeadSourceDetails } from '../shared/leadSource.js';
import { createOrganizationRecord } from '../organizations/organization.service.js';
import { organizationImportSchema } from '../organizations/organization.validator.js';
import { createOpportunityRecord } from '../opportunities/opportunity.service.js';
import { opportunityInputSchema } from '../opportunities/opportunity.validator.js';
import { createPartnerCompanyRecord, invalidatePartnerCaches } from '../partner-companies/partnerCompany.service.js';
import { partnerCompanyImportSchema } from '../partner-companies/partnerCompany.validator.js';
import { createProductRecord } from '../products/product.service.js';
import { productInputSchema } from '../products/product.validator.js';
import { prefetchActiveUsernames, prefetchOrganizationsByName, type PrefetchedLookups } from '../shared/prefetch.js';
import { runInTransaction } from '../shared/transactions.js';
import { createTicketRecord, resolveImportNatureOfCall } from '../tickets/ticket.service.js';
import { ticketInputSchema } from '../tickets/ticket.validator.js';
import { prisma, type TransactionClient } from '../../config/prisma.js';
import { loadFollowUpContext, type FollowUpContext } from '../activities/activity.system.js';
import type { ActivityCommitRow } from '../activities/activity.service.js';
import { afterFollowUpCommit, retryOnceOnUniqueViolation } from '../activities/activity.followUp.js';

/** Entities and field keys of the frontend's import wizard (frontend-crm/src/components/common/import). */
export const IMPORT_ENTITIES = [
    'organizations',
    'contacts',
    'products',
    'leads',
    'opportunities',
    'tickets',
    'partner-companies',
] as const;
export type ImportEntity = (typeof IMPORT_ENTITIES)[number];

export interface ImportRow {
    /** Spreadsheet row number (header = 1), echoed back in failures. */
    rowNumber: number;
    /** Values keyed by the template's field keys (e.g. `organizationName`, `gstNumber`). */
    values: Record<string, string>;
}

export interface ImportJobData {
    importId: string;
    entity: ImportEntity;
    rows: ImportRow[];
    user: AuthUser;
    fileName?: string;
    /** Audit context of the upload request (IP, browser, screen, session), carried into the worker. */
    origin?: AuditOrigin;
}

export interface ImportRowFailure {
    rowNumber: number;
    errors: string[];
}

export interface ImportResult {
    importId: string;
    entity: ImportEntity;
    total: number;
    /** Rows the import got through (equals `total` unless it was cancelled). */
    processed: number;
    created: number;
    failed: ImportRowFailure[];
    /** True when the owner cancelled it part-way; rows written before that stay. */
    cancelled: boolean;
}

/** Live progress of a running import (BullMQ job progress), read by GET /api/import/jobs/:importId. */
export interface ImportProgress {
    processed: number;
    total: number;
    created: number;
    failed: number;
    /** 0–100: processed / total. */
    percent: number;
}

export interface ImportHooks {
    /** Called after each row (throttled) and after the last one. */
    onProgress?: (progress: ImportProgress) => Promise<void> | void;
    /** Checked before each row; true stops the import there (rows already written stay). */
    shouldCancel?: () => Promise<boolean> | boolean;
}

/** Redis key the cancel endpoint sets for a running import; the worker checks it between rows. */
export const importCancelKey = (importId: string) => `import:cancel:${importId}`;

/** Progress is pushed at most this often (plus the first and last row), so a fast import doesn't flood Redis. */
const PROGRESS_MIN_INTERVAL_MS = 250;
/** Lead fields the template doesn't offer but the record requires; documented defaults, applied only when blank. */
const LEAD_IMPORT_DEFAULTS = { leadSource: 'Other', remarks: 'Imported via bulk import', followupType: 'Call' } as const;

/** Opportunity fields the template doesn't offer (or left blank) but the record requires. */
const OPPORTUNITY_IMPORT_DEFAULTS = {
    productCategory: 'TallyPrime',
    type: 'New Business',
    salesStage: 'Qualification',
    leadSource: 'Other',
    followupType: 'Call',
    remarks: 'Imported via bulk import',
    // Same "no commission" option lead conversion uses for new opportunities.
    commission: 'No',
} as const;
/** Ticket fields the template doesn't offer (or left blank) but the record requires. */
const TICKET_IMPORT_DEFAULTS = {
    ticketPriority: 'Normal',
    ticketStatus: 'New',
    source: 'Call',
    supportType: 'Free',
    supportMode: 'Phone Consultation',
} as const;
const TICKET_IMPORT_DUE_IN_MS = 24 * 60 * 60 * 1000;
/** Partner companies: Nature of Partner is required by the form; 'Other' is a standing option of that list. */
const PARTNER_IMPORT_DEFAULT_NATURE = 'Other';

/** 'A, B; C' → ['A', 'B', 'C'] (multi-value spreadsheet cells). */
const splitList = (value: string | undefined) => (value ?? '').split(/[,;]/).map((s) => s.trim()).filter(Boolean);

const emailList = (email: string | undefined) =>
    email ? [{ email, isPrimary: true, isOptedOut: false, isInvalidBounce: false }] : [];

const businessToday = () => wallClockNow(ENV.BUSINESS_TIMEZONE).toISOString().slice(0, 10);

/** '18' → '18%' (spreadsheets often drop the percent sign). */
const normalizeTaxRate = (value: string | undefined) => (value && /^\d+$/.test(value) ? `${value}%` : value);

type RowWriter = (tx: TransactionClient) => Promise<unknown>;

/** What a lead / opportunity row's write returns: the follow-up activity writes to run after its commit. */
interface FollowUpRows {
    followUpRows: ActivityCommitRow[];
}
const hasFollowUpRows = (value: unknown): value is FollowUpRows =>
    typeof value === 'object' && value !== null && Array.isArray((value as Partial<FollowUpRows>).followUpRows);

/** Per-import data loaded once before the row loop. */
interface ImportContext {
    /** The entity's admin form configuration (required fields, formats, validation rules). */
    fieldConfig: ModuleFieldConfig;
    /** Active users and the organizations the rows name, read once instead of once per row. */
    lookups: PrefetchedLookups;
    /** Lead imports: the Rating rules new leads are rated by. */
    ratingConfig?: RatingConfig;
    /**
     * Lead / opportunity imports: what their follow-up activities need (Calendar Phase 2 P2-4), loaded once here, never
     * inside a row's transaction.
     */
    followUp?: FollowUpContext;
}

/** Entities whose rows link to an organization by name. */
const LINKS_ORGANIZATION_BY_NAME: ReadonlySet<ImportEntity> = new Set(['contacts', 'opportunities', 'tickets']);

/**
 * Loads the per-import context in a few batch queries before the row loop. Organizations are only looked up by the
 * names the rows use; a name not found here (e.g. created meanwhile) still falls back to a live query per row.
 */
async function loadImportContext(data: ImportJobData): Promise<ImportContext> {
    const fieldConfig = await loadModuleFieldConfig(data.entity);
    const activeUsernames = await prefetchActiveUsernames(prisma);
    const organizationsByName = LINKS_ORGANIZATION_BY_NAME.has(data.entity)
        ? await prefetchOrganizationsByName(prisma, data.rows.map((row) => row.values.organizationName))
        : undefined;
    const ratingConfig = data.entity === 'leads' ? await loadRatingConfig(prisma) : undefined;
    const followUp = data.entity === 'leads' || data.entity === 'opportunities' ? await loadFollowUpContext() : undefined;
    return { fieldConfig, lookups: { activeUsernames, organizationsByName }, ratingConfig, followUp };
}

/**
 * Applies the admin form rules to a row. Required fields are enforced only for the columns the template maps
 * (the keys of `raw`): a field the template can't carry, such as a custom field, can't be required of a spreadsheet.
 */
function checkRow(ctx: ImportContext, raw: Record<string, unknown>): void {
    // Imports carry historical data, so custom dates before today are accepted.
    checkModulePayload(ctx.fieldConfig, raw, undefined, { submittedKeys: new Set(Object.keys(raw)), allowPastDates: true });
}

/**
 * Maps a row's template values onto the entity's input, validates it, and returns the write to run.
 * Mirrors `importRows` in the frontend, but with values the server would otherwise reject defaulted explicitly.
 */
const rowBuilders: Record<ImportEntity, (v: Record<string, string>, user: AuthUser, ctx: ImportContext) => RowWriter> = {
    organizations: (v, user, ctx) => {
        const raw = {
            organizationName: v.organizationName,
            natureOfBusiness: v.natureOfBusiness,
            customerType: v.customerType,
            natureOfPartner: v.natureOfPartner,
            accountStatus: v.accountStatus || 'Active',
            billingAddress: v.billingStreet,
            billingCity: v.billingCity,
            billingState: v.billingState,
            gstNumber: v.gstNumber,
            registrationType: v.gstNumber ? 'Registered' : 'Unregistered',
            assignedTo: user.username,
        };
        const input = organizationImportSchema.parse(raw);
        checkRow(ctx, raw);
        return (tx) => createOrganizationRecord(tx, input, user, ctx.lookups);
    },
    contacts: (v, user, ctx) => {
        const raw = {
            name: v.name,
            organizationName: v.organizationName,
            mobile: v.mobile,
            officePhone: v.officePhone,
            emailAddress: emailList(v.email),
            assignedTo: user.username,
            designation: v.designation,
            department: v.department,
            addDescription: v.addDescription,
            communicationType: [],
        };
        const input = contactInputSchema.parse(raw);
        checkRow(ctx, raw);
        return (tx) => createContactRecord(tx, input, user, ctx.lookups);
    },
    products: (v, user, ctx) => {
        const taxRate = normalizeTaxRate(v.taxRate);
        const raw = {
            productName: v.productName,
            hsnCode: v.hsnCode,
            category: v.category,
            type: v.type,
            manufacturer: v.manufacturer,
            taxType: taxRate ? 'GST' : undefined,
            taxRate,
            cost: v.cost,
            mrp: v.mrp,
            description: v.description,
        };
        const input = productInputSchema.parse(raw);
        checkRow(ctx, raw);
        return (tx) => createProductRecord(tx, input, user);
    },
    leads: (v, user, ctx) => {
        const status = v.status || 'New';
        assertStatusTransition(null, status);
        const raw = {
            name: v.name,
            mobile: v.mobile,
            emailAddress: emailList(v.email),
            organizationName: v.organizationName,
            leadSource: v.leadSource || LEAD_IMPORT_DEFAULTS.leadSource,
            referredBy: v.referredBy,
            partnerCompany: v.partnerCompany,
            leadType: v.leadType,
            status,
            primaryCity: v.primaryCity,
            primaryState: v.primaryState,
            remarks: v.remarks && v.remarks.length >= 3 ? v.remarks : LEAD_IMPORT_DEFAULTS.remarks,
            followupType: LEAD_IMPORT_DEFAULTS.followupType,
            nextFollowupDate: businessToday(),
            assignedTo: user.username,
        };
        const input = leadImportSchema.parse(raw);
        assertLeadSourceDetails(input);
        checkRow(ctx, raw);
        // Rated like any new lead: by the new-lead rule, from today to its follow-up.
        if (!ctx.ratingConfig) throw new Error('Lead import context has no Rating rules.');
        const rating = newLeadRatingColumns(ctx.ratingConfig, businessToday(), input.nextFollowupDate);
        const { closingStatuses } = ctx.ratingConfig;
        const context = ctx.followUp;
        if (!context) throw new Error('Lead import context has no follow-up context.');
        // The lead's follow-up activity is created with it (no notifications for imports).
        return async (tx): Promise<FollowUpRows> => {
            const followUpRows: ActivityCommitRow[] = [];
            await createLeadRecord(tx, input, user, rating, ctx.lookups, { context, notify: false, rows: followUpRows, closingStatuses });
            return { followUpRows };
        };
    },
    opportunities: (v, user, ctx) => {
        const productCategory = splitList(v.productCategory);
        const raw = {
            organizationName: v.organizationName,
            contact: v.contact,
            contactNumber: v.contactNumber,
            contactEmail: v.contactEmail,
            productCategory: productCategory.length ? productCategory : [OPPORTUNITY_IMPORT_DEFAULTS.productCategory],
            type: v.type || OPPORTUNITY_IMPORT_DEFAULTS.type,
            salesStage: v.salesStage || OPPORTUNITY_IMPORT_DEFAULTS.salesStage,
            leadSource: v.leadSource || OPPORTUNITY_IMPORT_DEFAULTS.leadSource,
            referredBy: v.referredBy,
            partnerCompany: v.partnerCompany,
            leadGivenBy: v.leadGivenBy || user.username,
            nextFollowupDate: businessToday(),
            followupType: OPPORTUNITY_IMPORT_DEFAULTS.followupType,
            remarks: v.remarks && v.remarks.length >= 3 ? v.remarks : OPPORTUNITY_IMPORT_DEFAULTS.remarks,
            commission: OPPORTUNITY_IMPORT_DEFAULTS.commission,
            assignedTo: user.username,
        };
        const input = opportunityInputSchema.parse(raw);
        assertLeadSourceDetails(input);
        checkRow(ctx, raw);
        const context = ctx.followUp;
        if (!context) throw new Error('Opportunity import context has no follow-up context.');
        return async (tx): Promise<FollowUpRows> => {
            const followUpRows: ActivityCommitRow[] = [];
            await createOpportunityRecord(tx, input, user, ctx.lookups, undefined, { context, notify: false, rows: followUpRows });
            return { followUpRows };
        };
    },
    tickets: (v, user, ctx) => {
        // Nature Of Call is resolved against the master inside the write (blank / unknown → first active entry).
        const dueDate = new Date(wallClockNow(ENV.BUSINESS_TIMEZONE).getTime() + TICKET_IMPORT_DUE_IN_MS).toISOString().slice(0, 16);
        const raw = {
            organizationName: v.organizationName,
            contact: v.contact,
            contactNumber: v.contactNumber,
            contactEmail: v.contactEmail,
            ticketSubject: v.ticketSubject,
            problemReported: v.problemReported,
            ticketPriority: v.ticketPriority || TICKET_IMPORT_DEFAULTS.ticketPriority,
            ticketStatus: v.ticketStatus || TICKET_IMPORT_DEFAULTS.ticketStatus,
            source: TICKET_IMPORT_DEFAULTS.source,
            supportType: v.supportType || TICKET_IMPORT_DEFAULTS.supportType,
            supportMode: v.supportMode || TICKET_IMPORT_DEFAULTS.supportMode,
            dueDate,
            assignedTo: user.username,
        };
        const fields = ticketInputSchema.omit({ natureOfCall: true }).parse(raw);
        checkRow(ctx, raw);
        return async (tx) => {
            const natureOfCall = await resolveImportNatureOfCall(tx, v.natureOfCall);
            return createTicketRecord(tx, { ...fields, natureOfCall }, user, ctx.lookups);
        };
    },
    'partner-companies': (v, user, ctx) => {
        const raw = {
            partnerName: v.partnerName,
            natureOfPartner: v.natureOfPartner || PARTNER_IMPORT_DEFAULT_NATURE,
            officePhone: v.officePhone,
            emailAddress: emailList(v.email),
            billingAddress: v.billingStreet,
            billingCity: v.billingCity,
            billingState: v.billingState,
            billingPostalCode: v.billingPostalCode,
            gstNumber: v.gstNumber,
            principalCompany: v.principalCompany,
            assignedTo: user.username,
        };
        const input = partnerCompanyImportSchema.parse(raw);
        checkRow(ctx, raw);
        return (tx) => createPartnerCompanyRecord(tx, input, user);
    },
};

/** Entities whose caches reach beyond the shared lookup / search / dashboard keys. */
const cacheInvalidators: Partial<Record<ImportEntity, () => Promise<void>>> = {
    'partner-companies': invalidatePartnerCaches,
};

/** Human-readable reasons for a failed row. */
function describeError(err: unknown): string[] {
    if (err instanceof ZodError) return [...new Set(err.issues.map((issue) => issue.message))];
    if (err instanceof HttpError) return err.errors?.length ? [...new Set([err.message, ...err.errors.map((e) => e.message)])] : [err.message];
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return ['A record with these details already exists.'];
    logger.error({ err }, 'Unexpected error importing row');
    return ['Unexpected error while importing this row.'];
}

/**
 * Imports rows one by one, each in its own transaction, so a bad row never undoes the good ones.
 * Shared by the BullMQ import worker and the synchronous fallback used when Redis is unavailable.
 * Every audit entry it writes (one CREATE per row, then the IMPORT summary) is tagged source IMPORT with the import
 * id as its request id, plus the upload request's IP / browser / screen.
 */
export function processImport(data: ImportJobData, hooks: ImportHooks = {}): Promise<ImportResult> {
    return runWithAuditOrigin(
        { ...data.origin, source: 'IMPORT', requestId: data.importId, actorId: data.user.id, actorRole: data.user.role },
        () => importRows(data, hooks),
    );
}

async function importRows(data: ImportJobData, { onProgress, shouldCancel }: ImportHooks): Promise<ImportResult> {
    const build = rowBuilders[data.entity];
    const failed: ImportRowFailure[] = [];
    const total = data.rows.length;
    let created = 0;
    let processed = 0;
    let cancelled = false;
    let lastReport = 0;
    const report = async (force: boolean) => {
        if (!onProgress) return;
        const now = Date.now();
        if (!force && now - lastReport < PROGRESS_MIN_INTERVAL_MS) return;
        lastReport = now;
        await onProgress({ processed, total, created, failed: failed.length, percent: total ? Math.floor((processed / total) * 100) : 100 });
    };
    const ctx = await loadImportContext(data);
    const followUpRows: ActivityCommitRow[] = [];
    // The context is loaded: tell the client the rows are starting (0 of N), not still queued.
    await report(true);

    for (const row of data.rows) {
        if (shouldCancel && (await shouldCancel())) {
            cancelled = true;
            break;
        }
        try {
            const write = build(row.values, data.user, ctx);
            // D45: a unique-index refusal (a follow-up activity race) runs the row's transaction once more.
            const written = await retryOnceOnUniqueViolation(() => runInTransaction(write));
            if (hasFollowUpRows(written)) followUpRows.push(...written.followUpRows);
            created++;
        } catch (err) {
            failed.push({ rowNumber: row.rowNumber, errors: describeError(err) });
        }
        processed++;
        await report(processed === total);
    }
    if (cancelled) await report(true);

    if (created > 0) await (cacheInvalidators[data.entity]?.() ?? cacheService.invalidateEntityCaches(data.entity));
    // Reminders of the imported records' follow-up activities (notify: false, so nobody is told about each row).
    await afterFollowUpCommit(followUpRows, data.user);
    const result: ImportResult = { importId: data.importId, entity: data.entity, total, processed, created, failed, cancelled };
    await auditService.enqueue({
        entityType: 'Import',
        entityId: data.importId,
        action: 'IMPORT',
        changedBy: data.user.username,
        changes: { entity: data.entity, fileName: data.fileName, total, processed, created, failed: failed.length, ...(cancelled ? { cancelled } : {}) },
    });
    logger.info({ importId: data.importId, entity: data.entity, total, processed, created, failed: failed.length, cancelled }, 'Import finished');
    return result;
}
