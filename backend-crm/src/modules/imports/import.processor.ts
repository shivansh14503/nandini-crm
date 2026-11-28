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
import { checkModulePayload, loadModuleFieldConfig, throwFieldIssues, type ModuleFieldConfig } from '../form-configs/customFieldValidator.js';
import { contactInputSchema } from '../contacts/contact.validator.js';
import { assertStatusTransition, createLeadRecord } from '../leads/lead.service.js';
import { loadRatingConfig, newLeadRatingColumns, type RatingConfig } from '../leads/lead.followUp.js';
import { leadInputSchema } from '../leads/lead.validator.js';
import { assertLeadSourceDetails } from '../shared/leadSource.js';
import { createOrganizationRecord } from '../organizations/organization.service.js';
import { organizationInputSchema } from '../organizations/organization.validator.js';
import { assertNatureOfPartner } from '../shared/customerType.js';
import { activityOnlyTypeIssues } from '../shared/followupTypes.js';
import { applyFollowUpPlan, assertDocumentation, assertPayeeBank, clearedKeys, createOpportunityRecord } from '../opportunities/opportunity.service.js';
import { loadResponseRules, planOpportunityFollowUp, type ResponseRules } from '../opportunities/opportunity.followUp.js';
import { buildImportPayload, splitDateTime } from './importValues.js';
import { buildQuotationImportRow, loadQuotationDropdownDefaults } from './builders/quotations.js';
import type { QuotationDropdownDefaults } from './builders/quotations.values.js';
import { buildContractImportRow, loadContractDropdownDefaults } from './builders/contracts.js';
import type { ContractDropdownDefaults } from './builders/contracts.values.js';
import { buildReferralImportRow } from './builders/referrals.js';
import { buildActivityImportRow } from './builders/activities.js';
import { opportunityInputSchema, opportunityNotApplicableKeys } from '../opportunities/opportunity.validator.js';
import { createPartnerCompanyRecord, invalidatePartnerCaches } from '../partner-companies/partnerCompany.service.js';
import { partnerCompanyImportSchema } from '../partner-companies/partnerCompany.validator.js';
import { afterManufacturersAdded } from '../products/product.manufacturer.js';
import { createProductRecord } from '../products/product.service.js';
import { productInputSchema } from '../products/product.validator.js';
import { prefetchActiveUsernames, prefetchOrganizationsByName, type PrefetchedLookups } from '../shared/prefetch.js';
import { runInTransaction } from '../shared/transactions.js';
import { createTicketRecord, resolveImportNatureOfCall } from '../tickets/ticket.service.js';
import { ticketInputSchema } from '../tickets/ticket.validator.js';
import { prisma, type TransactionClient } from '../../config/prisma.js';
import { loadFollowUpContext, type FollowUpContext } from '../activities/activity.system.js';
import { loadActivityConfig, type ActivityCommitRow, type ActivityConfig } from '../activities/activity.service.js';
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
    'quotations',
    'contracts',
    'referrals',
    'activities',
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
/**
 * Values the import fills in when a row leaves the field blank (the form would make the user pick them). Mirrored by
 * IMPORT_DEFAULTS in frontend-crm/src/components/common/import/importFields.ts, which shows them on the mapping step.
 */
const LEAD_IMPORT_DEFAULTS = { leadSource: 'Other', remarks: 'Imported via bulk import', followupType: 'Call', status: 'New' } as const;

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
const TICKET_IMPORT_DEFAULTS = {
    ticketPriority: 'Normal',
    ticketStatus: 'New',
    source: 'Call',
    supportType: 'Free',
    supportMode: 'Phone Consultation',
} as const;
const TICKET_IMPORT_DUE_IN_MS = 24 * 60 * 60 * 1000;
/** A Due Date given without a time is due at the end of that working day. */
const TICKET_IMPORT_DUE_TIME = '18:00';
/** Partner companies: Nature of Partner is required by the form; 'Other' is a standing option of that list. */
const PARTNER_IMPORT_DEFAULT_NATURE = 'Other';
/** Imported Remarks shorter than this are replaced by the default (the form asks for at least 3 characters). */
const MIN_REMARKS_LENGTH = 3;

const businessToday = () => wallClockNow(ENV.BUSINESS_TIMEZONE).toISOString().slice(0, 10);

/** '18' → '18%' (spreadsheets often drop the percent sign). */
const normalizeTaxRate = (value: string | undefined) => (value && /^\d+$/.test(value.trim()) ? `${value.trim()}%` : value);

const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const orDefault = (value: unknown, fallback: string): string => text(value).trim() || fallback;
const remarksOr = (value: unknown, fallback: string): string => (text(value).trim().length >= MIN_REMARKS_LENGTH ? text(value) : fallback);

type RowWriter = (tx: TransactionClient) => Promise<unknown>;

/** What a lead / opportunity row's write returns: the follow-up activity writes to run after its commit (activity rows: the activity itself). */
interface FollowUpRows {
    followUpRows: ActivityCommitRow[];
}
const hasFollowUpRows = (value: unknown): value is FollowUpRows =>
    typeof value === 'object' && value !== null && Array.isArray((value as Partial<FollowUpRows>).followUpRows);

/** Per-import data loaded once before the row loop. */
interface ImportContext {
    /** The entity's admin form configuration: which fields the rows carry, required fields, formats, options. */
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
    /** Opportunity imports: the Customer Response rules (Sales Stages a response is allowed at, no follow-up). */
    responseRules?: ResponseRules;
    /** Quotation imports: the admin's dropdown defaults of the quotation form (builders/quotations.ts). */
    quotationDefaults?: QuotationDropdownDefaults;
    /** Contract imports: the admin's dropdown defaults of the contract form (builders/contracts.ts). */
    contractDefaults?: ContractDropdownDefaults;
    /** Activity imports: the activity configuration (field rules, Followup Type durations) the create path reads. */
    activityConfig?: ActivityConfig;
}

/** Entities whose rows link to an organization by name. */
const LINKS_ORGANIZATION_BY_NAME: ReadonlySet<ImportEntity> = new Set(['contacts', 'opportunities', 'tickets', 'quotations', 'contracts', 'activities']);

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
    const responseRules = data.entity === 'opportunities' ? await loadResponseRules(prisma) : undefined;
    const quotationDefaults = data.entity === 'quotations' ? await loadQuotationDropdownDefaults() : undefined;
    const contractDefaults = data.entity === 'contracts' ? await loadContractDropdownDefaults() : undefined;
    const activityConfig = data.entity === 'activities' ? await loadActivityConfig() : undefined;
    return { fieldConfig, lookups: { activeUsernames, organizationsByName }, ratingConfig, followUp, responseRules, quotationDefaults, contractDefaults, activityConfig };
}

/**
 * Applies the admin form rules to a row exactly as the creation form does: every required field (custom fields
 * included) must be filled, unless the import defaults it or `notRequired` names it; formats, rules and options are
 * checked. Imports carry historical data, so custom dates before today are accepted. Returns the custom fields to store.
 */
function checkRow(
    ctx: ImportContext,
    raw: Record<string, unknown>,
    customFields: Record<string, unknown>,
    notRequired?: ReadonlySet<string>,
    notApplicableKeys?: ReadonlySet<string>,
): Record<string, unknown> {
    return checkModulePayload(ctx.fieldConfig, raw, customFields, { allowPastDates: true, notRequired, notApplicableKeys });
}

/**
 * Maps a row's cells (keyed by the form's field keys, see importValues.ts) onto the entity's input, validates it
 * with the creation form's rules, and returns the write to run. Fields the record needs but the row leaves blank
 * get the documented import defaults above.
 */
const rowBuilders: Record<ImportEntity, (v: Record<string, string>, user: AuthUser, ctx: ImportContext) => RowWriter> = {
    organizations: (v, user, ctx) => {
        const { payload, customFields } = buildImportPayload(ctx.fieldConfig, v);
        const raw = {
            ...payload,
            accountStatus: orDefault(payload.accountStatus, 'Active'),
            registrationType: orDefault(payload.registrationType, payload.gstNumber ? 'Registered' : 'Unregistered'),
            assignedTo: orDefault(payload.assignedTo, user.username),
            customFields,
        };
        const input = organizationInputSchema.parse(raw);
        assertNatureOfPartner(input);
        input.customFields = checkRow(ctx, raw, customFields);
        return (tx) => createOrganizationRecord(tx, input, user, ctx.lookups);
    },
    contacts: (v, user, ctx) => {
        const { payload, customFields } = buildImportPayload(ctx.fieldConfig, v);
        const raw = { ...payload, assignedTo: orDefault(payload.assignedTo, user.username), customFields };
        const input = contactInputSchema.parse(raw);
        input.customFields = checkRow(ctx, raw, customFields);
        return (tx) => createContactRecord(tx, input, user, ctx.lookups);
    },
    products: (v, user, ctx) => {
        const { payload, customFields } = buildImportPayload(ctx.fieldConfig, { ...v, taxRate: normalizeTaxRate(v.taxRate) ?? '' });
        const raw = { ...payload, customFields };
        const input = productInputSchema.parse(raw);
        input.customFields = checkRow(ctx, raw, customFields);
        return (tx) => createProductRecord(tx, input, user);
    },
    leads: (v, user, ctx) => {
        const { payload, customFields } = buildImportPayload(ctx.fieldConfig, v);
        const followUp = splitDateTime(payload.nextFollowupDate);
        const status = orDefault(payload.status, LEAD_IMPORT_DEFAULTS.status);
        assertStatusTransition(null, status);
        const raw = {
            ...payload,
            leadSource: orDefault(payload.leadSource, LEAD_IMPORT_DEFAULTS.leadSource),
            status,
            remarks: remarksOr(payload.remarks, LEAD_IMPORT_DEFAULTS.remarks),
            followupType: orDefault(payload.followupType, LEAD_IMPORT_DEFAULTS.followupType),
            nextFollowupDate: followUp.date ?? businessToday(),
            nextFollowupTime: followUp.time,
            assignedTo: orDefault(payload.assignedTo, user.username),
            customFields,
        };
        const input = leadInputSchema.parse(raw);
        assertLeadSourceDetails(input);
        throwFieldIssues(activityOnlyTypeIssues(input.followupType));
        input.customFields = checkRow(ctx, raw, customFields);
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
        const { payload, customFields } = buildImportPayload(ctx.fieldConfig, v);
        const followUp = splitDateTime(payload.nextFollowupDate);
        const productCategory = Array.isArray(payload.productCategory) ? payload.productCategory : [];
        const raw = {
            ...payload,
            productCategory: productCategory.length ? productCategory : [OPPORTUNITY_IMPORT_DEFAULTS.productCategory],
            type: orDefault(payload.type, OPPORTUNITY_IMPORT_DEFAULTS.type),
            salesStage: orDefault(payload.salesStage, OPPORTUNITY_IMPORT_DEFAULTS.salesStage),
            leadSource: orDefault(payload.leadSource, OPPORTUNITY_IMPORT_DEFAULTS.leadSource),
            leadGivenBy: orDefault(payload.leadGivenBy, user.username),
            nextFollowupDate: followUp.date ?? businessToday(),
            nextFollowupTime: followUp.time,
            followupType: orDefault(payload.followupType, OPPORTUNITY_IMPORT_DEFAULTS.followupType),
            remarks: remarksOr(payload.remarks, OPPORTUNITY_IMPORT_DEFAULTS.remarks),
            commission: orDefault(payload.commission, OPPORTUNITY_IMPORT_DEFAULTS.commission),
            assignedTo: orDefault(payload.assignedTo, user.username),
            customFields,
        };
        const input = opportunityInputSchema.parse(raw);
        assertDocumentation(input);
        assertPayeeBank(input);
        assertLeadSourceDetails(input);
        throwFieldIssues(activityOnlyTypeIssues(input.followupType));
        // Sales Stage → Customer Response → follow-up, as on the form; imports may carry a follow-up already past.
        if (!ctx.responseRules) throw new Error('Opportunity import context has no Response rules.');
        const plan = planOpportunityFollowUp(input, Boolean(input.customerResponse?.trim()), ctx.responseRules, '');
        applyFollowUpPlan(input, plan);
        input.customFields = checkRow(ctx, { ...raw, ...plan }, customFields, clearedKeys(plan, input.salesStage), opportunityNotApplicableKeys(input));
        const context = ctx.followUp;
        if (!context) throw new Error('Opportunity import context has no follow-up context.');
        return async (tx): Promise<FollowUpRows> => {
            const followUpRows: ActivityCommitRow[] = [];
            await createOpportunityRecord(tx, input, user, ctx.lookups, undefined, { context, notify: false, rows: followUpRows });
            return { followUpRows };
        };
    },
    tickets: (v, user, ctx) => {
        const { payload, customFields } = buildImportPayload(ctx.fieldConfig, v);
        const due = splitDateTime(payload.dueDate);
        const dueDate = due.date
            ? `${due.date}T${due.time ?? TICKET_IMPORT_DUE_TIME}`
            : new Date(wallClockNow(ENV.BUSINESS_TIMEZONE).getTime() + TICKET_IMPORT_DUE_IN_MS).toISOString().slice(0, 16);
        const raw = {
            ...payload,
            ticketPriority: orDefault(payload.ticketPriority, TICKET_IMPORT_DEFAULTS.ticketPriority),
            ticketStatus: orDefault(payload.ticketStatus, TICKET_IMPORT_DEFAULTS.ticketStatus),
            source: orDefault(payload.source, TICKET_IMPORT_DEFAULTS.source),
            supportType: orDefault(payload.supportType, TICKET_IMPORT_DEFAULTS.supportType),
            supportMode: orDefault(payload.supportMode, TICKET_IMPORT_DEFAULTS.supportMode),
            dueDate,
            assignedTo: orDefault(payload.assignedTo, user.username),
            customFields,
        };
        const fields = ticketInputSchema.omit({ natureOfCall: true }).parse(raw);
        // Nature Of Call is resolved against the master inside the write (blank / unknown → first active entry).
        fields.customFields = checkRow(ctx, raw, customFields, new Set(['natureOfCall']));
        const natureOfCallCell = text(payload.natureOfCall);
        return async (tx) => {
            const natureOfCall = await resolveImportNatureOfCall(tx, natureOfCallCell);
            return createTicketRecord(tx, { ...fields, natureOfCall }, user, ctx.lookups);
        };
    },
    'partner-companies': (v, user, ctx) => {
        const { payload, customFields } = buildImportPayload(ctx.fieldConfig, v);
        const raw = {
            ...payload,
            natureOfPartner: orDefault(payload.natureOfPartner, PARTNER_IMPORT_DEFAULT_NATURE),
            assignedTo: orDefault(payload.assignedTo, user.username),
            customFields,
        };
        const input = partnerCompanyImportSchema.parse(raw);
        input.customFields = checkRow(ctx, raw, customFields);
        return (tx) => createPartnerCompanyRecord(tx, input, user);
    },
    // One row = one quotation for an opportunity, with one line item (or the opportunity's lines): builders/quotations.ts.
    quotations: (v, user, ctx) => {
        if (!ctx.quotationDefaults) throw new Error('Quotation import context has no dropdown defaults.');
        return buildQuotationImportRow(v, user, { fieldConfig: ctx.fieldConfig, lookups: ctx.lookups, dropdownDefaults: ctx.quotationDefaults }, (raw, customFields) =>
            checkRow(ctx, raw, customFields),
        );
    },
    // One row = one contract, linked to its organization / contact / opportunity by name or number: builders/contracts.ts.
    contracts: (v, user, ctx) => {
        if (!ctx.contractDefaults) throw new Error('Contract import context has no dropdown defaults.');
        return buildContractImportRow(v, user, { fieldConfig: ctx.fieldConfig, lookups: ctx.lookups, dropdownDefaults: ctx.contractDefaults }, (raw, customFields) =>
            checkRow(ctx, raw, customFields),
        );
    },
    // One row = one referral (no linked records; Status / Assigned to default as on the form): builders/referrals.ts.
    referrals: (v, user, ctx) =>
        buildReferralImportRow(v, user, { fieldConfig: ctx.fieldConfig, lookups: ctx.lookups }, (raw, customFields) => checkRow(ctx, raw, customFields)),
    // One row = one activity, linked to its related record / organization / contact by number or name: builders/activities.ts.
    // Its write returns the activity as `followUpRows` (notify: false): reminders and calendar push run after the rows.
    activities: (v, user, ctx) => {
        if (!ctx.activityConfig) throw new Error('Activity import context has no activity configuration.');
        return buildActivityImportRow(v, user, { fieldConfig: ctx.fieldConfig, lookups: ctx.lookups, activityConfig: ctx.activityConfig });
    },
};

/** Entities whose caches reach beyond the shared lookup / search / dashboard keys. */
const cacheInvalidators: Partial<Record<ImportEntity, () => Promise<void>>> = {
    // A new quotation moves an open opportunity to "Proposal/Price Quote" (createQuotationRecord).
    quotations: async () => {
        await Promise.all([cacheService.invalidateEntityCaches('quotations'), cacheService.invalidateEntityCaches('opportunities')]);
    },
    'partner-companies': invalidatePartnerCaches,
    // Imported products add their new manufacturers to the Manufacturer dropdown (createProductRecord).
    products: async () => {
        await cacheService.invalidateEntityCaches('products');
        await afterManufacturersAdded(true);
    },
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
    // Reminders and calendar push of the imported activities / records' follow-up activities (notify: false, so nobody
    // is told about each row); also invalidates the activity caches.
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
