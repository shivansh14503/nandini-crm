import { ZodError } from 'zod';
import { ENV } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { Prisma } from '../../generated/prisma/client.js';
import { auditService } from '../../services/audit.service.js';
import { cacheService } from '../../services/cache.service.js';
import type { AuthUser } from '../../types/user.types.js';
import { HttpError } from '../../utils/httpError.js';
import { wallClockNow } from '../../utils/mappers.js';
import { createContactRecord } from '../contacts/contact.service.js';
import { checkModulePayload, loadModuleFieldConfig, type ModuleFieldConfig } from '../form-configs/customFieldValidator.js';
import { contactInputSchema } from '../contacts/contact.validator.js';
import { assertStatusTransition, createLeadRecord } from '../leads/lead.service.js';
import { leadImportSchema } from '../leads/lead.validator.js';
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
}

export interface ImportRowFailure {
    rowNumber: number;
    errors: string[];
}

export interface ImportResult {
    importId: string;
    entity: ImportEntity;
    total: number;
    created: number;
    failed: ImportRowFailure[];
}

const PROGRESS_EVERY_ROWS = 20;
/** Lead fields the template doesn't offer but the record requires; documented defaults, applied only when blank. */
const LEAD_IMPORT_DEFAULTS = { leadSource: 'Other', leadType: 'Cold', addDescription: 'Imported via bulk import', followupType: 'Call' } as const;

/** Opportunity fields the template doesn't offer (or left blank) but the record requires. */
const OPPORTUNITY_IMPORT_DEFAULTS = {
    productCategory: 'TallyPrime',
    type: 'New Business',
    salesStage: 'Qualification',
    leadSource: 'Other',
    followupType: 'Call',
    addDescription: 'Imported via bulk import',
    // Same "no commission" option lead conversion uses for new opportunities.
    commission: 'Nil / Direct (0%)',
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

/** Per-import data loaded once before the row loop. */
interface ImportContext {
    /** The entity's admin form configuration (required fields, formats, validation rules). */
    fieldConfig: ModuleFieldConfig;
    /** Active users and the organizations the rows name, read once instead of once per row. */
    lookups: PrefetchedLookups;
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
    return { fieldConfig, lookups: { activeUsernames, organizationsByName } };
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
            accountStatus: v.accountStatus || 'Active',
            billingAddress: v.billingStreet,
            billingCity: v.billingCity,
            billingState: v.billingState,
            gstNumber: v.gstNumber,
            registrationType: v.gstNumber ? 'Registered' : 'Unregistered',
            assignedUser: user.username,
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
            emailAddresses: emailList(v.email),
            assignedTo: user.username,
            designation: v.designation,
            department: v.department,
            description: v.description,
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
            emailAddresses: emailList(v.email),
            organizationName: v.organizationName,
            leadSource: v.leadSource || LEAD_IMPORT_DEFAULTS.leadSource,
            leadType: v.leadType || LEAD_IMPORT_DEFAULTS.leadType,
            status,
            primaryCity: v.primaryCity,
            primaryState: v.primaryState,
            addDescription: v.addDescription && v.addDescription.length >= 3 ? v.addDescription : LEAD_IMPORT_DEFAULTS.addDescription,
            followupType: LEAD_IMPORT_DEFAULTS.followupType,
            nextFollowupDate: businessToday(),
            assignedTo: user.username,
        };
        const input = leadImportSchema.parse(raw);
        checkRow(ctx, raw);
        return (tx) => createLeadRecord(tx, input, user, ctx.lookups);
    },
    opportunities: (v, user, ctx) => {
        const productCategory = splitList(v.productCategory);
        const raw = {
            organizationName: v.organizationName,
            contactName: v.contactName,
            contactNumber: v.contactNumber,
            emailAddress: v.emailAddress,
            productCategory: productCategory.length ? productCategory : [OPPORTUNITY_IMPORT_DEFAULTS.productCategory],
            type: v.type || OPPORTUNITY_IMPORT_DEFAULTS.type,
            salesStage: v.salesStage || OPPORTUNITY_IMPORT_DEFAULTS.salesStage,
            leadSource: v.leadSource || OPPORTUNITY_IMPORT_DEFAULTS.leadSource,
            leadGivenBy: v.leadGivenBy || user.username,
            nextFollowupDate: businessToday(),
            followupType: OPPORTUNITY_IMPORT_DEFAULTS.followupType,
            addDescription: v.addDescription && v.addDescription.length >= 3 ? v.addDescription : OPPORTUNITY_IMPORT_DEFAULTS.addDescription,
            commission: OPPORTUNITY_IMPORT_DEFAULTS.commission,
            assignedTo: user.username,
        };
        const input = opportunityInputSchema.parse(raw);
        checkRow(ctx, raw);
        return (tx) => createOpportunityRecord(tx, input, user, ctx.lookups);
    },
    tickets: (v, user, ctx) => {
        // Nature Of Call is resolved against the master inside the write (blank / unknown → first active entry).
        const dueDate = new Date(wallClockNow(ENV.BUSINESS_TIMEZONE).getTime() + TICKET_IMPORT_DUE_IN_MS).toISOString().slice(0, 16);
        const raw = {
            organizationName: v.organizationName,
            contactPersonName: v.contactPersonName,
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
            companyName: v.companyName,
            natureOfPartner: v.natureOfPartner || PARTNER_IMPORT_DEFAULT_NATURE,
            phone: v.phone,
            emailAddresses: emailList(v.email),
            billingAddress: v.billingStreet,
            billingCity: v.billingCity,
            billingState: v.billingState,
            billingPostalCode: v.billingPostalCode,
            gstNo: v.gstNo,
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
 */
export async function processImport(data: ImportJobData, onProgress?: (percent: number) => Promise<void> | void): Promise<ImportResult> {
    const build = rowBuilders[data.entity];
    const failed: ImportRowFailure[] = [];
    let created = 0;
    const ctx = await loadImportContext(data);

    for (const [index, row] of data.rows.entries()) {
        try {
            const write = build(row.values, data.user, ctx);
            await runInTransaction(write);
            created++;
        } catch (err) {
            failed.push({ rowNumber: row.rowNumber, errors: describeError(err) });
        }
        if (onProgress && ((index + 1) % PROGRESS_EVERY_ROWS === 0 || index === data.rows.length - 1)) {
            await onProgress(Math.round(((index + 1) / data.rows.length) * 100));
        }
    }

    if (created > 0) await (cacheInvalidators[data.entity]?.() ?? cacheService.invalidateEntityCaches(data.entity));
    const result: ImportResult = { importId: data.importId, entity: data.entity, total: data.rows.length, created, failed };
    await auditService.enqueue({
        entityType: 'Import',
        entityId: data.importId,
        action: 'IMPORT',
        changedBy: data.user.username,
        changes: { entity: data.entity, fileName: data.fileName, total: result.total, created, failed: failed.length },
    });
    logger.info({ importId: data.importId, entity: data.entity, total: result.total, created, failed: failed.length }, 'Import finished');
    return result;
}
