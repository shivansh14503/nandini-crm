import { ENV } from '../../../config/env.js';
import type { TransactionClient } from '../../../config/prisma.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import type { AuthUser } from '../../../types/user.types.js';
import { HttpError } from '../../../utils/httpError.js';
import { decimalToNumber, wallClockNow } from '../../../utils/mappers.js';
import type { ModuleFieldConfig } from '../../form-configs/customFieldValidator.js';
import { isActiveProductStatus } from '../../products/product.validator.js';
import { createQuotationRecord } from '../../quotations/quotation.service.js';
import { quotationInputSchema } from '../../quotations/quotation.validator.js';
import { buildAccessScopeWhere } from '../../shared/accessControl.js';
import { lineItemsInclude, normalizeTaxRate, toLineItemDtos } from '../../shared/lineItems.js';
import { findOrganizationByName, type PrefetchedLookups } from '../../shared/prefetch.js';
import { buildImportPayload } from '../importValues.js';
import {
    discountCells,
    hasLineCells,
    numberCell,
    onlyMatch,
    quotationLineCells,
    taxRateCell,
    validUntilFor,
    quotationDropdownDefaults,
    type QuotationDropdownDefaults,
    type QuotationLineCells,
} from './quotations.values.js';

/**
 * Bulk import of quotations (POST /api/import/quotations). One spreadsheet row is one quotation, made the way
 * Opportunity › Create Quotation makes one (CreateQuoteForm + quotationService.buildQuotationDefaultsFromOpportunity):
 *
 * - **Opportunity** (required) names the opportunity by its number (`OPP-0042`, or the Document Series format) or its
 *   exact name; the quotation is linked to it and, like any new quotation, moves an open opportunity to
 *   "Proposal/Price Quote" (createQuotationRecord).
 * - Blank cells take what the form pre-fills: the title, contact, contact number / email, Assigned to and remarks from
 *   the opportunity; Mailing Name, GST Number and the billing address from its organization; Company, Quote Stage,
 *   Validation Period and the terms from the admin's dropdown defaults; Valid Until from the Validation Period.
 * - **One line item** from the Product / Quantity / Rate / Discount / Discount Type / GST / Description / Note
 *   columns. A catalog product (by product code or exact name) brings its MRP, Tax Rate and description, as picking it
 *   on the form does; any other name is a typed product, which needs a Rate and GST. With no line item columns the
 *   opportunity's own line items are copied, as the form does. Totals and the GST split are computed by
 *   createQuotationRecord, exactly as on a saved quotation.
 *
 * Imports carry historical data, so a Quotation Date before today is accepted (the form's "not in the past" check is
 * not applied). No notifications are sent for imported quotations (the create path sends none either).
 */

/** Values a blank cell becomes when neither the opportunity nor an admin default supplies one. */
export const QUOTATION_IMPORT_DEFAULTS = {
    /** The form's Prepared For default (QUOTE_PREPARED_FOR_OPTIONS[0]). */
    preparedFor: 'Customer',
    /** Valid Until = Quotation Date + this many days when the Validation Period isn't written as `<n> Days`. */
    validityDays: 30,
    /** A line item's Quantity. */
    quantity: '1',
    /** The billing / shipping country of an organization without one. */
    country: 'IN',
    /** Legacy status column, as the form sends it. */
    status: 'Draft',
} as const;

/** Per-import data of a quotations import, loaded once before the row loop. */
export interface QuotationImportContext {
    fieldConfig: ModuleFieldConfig;
    lookups: PrefetchedLookups;
    dropdownDefaults: QuotationDropdownDefaults;
}

/** What a quotation row's write returns: whether it moved its opportunity's Sales Stage (opportunity caches). */
export interface QuotationRowResult {
    opportunityAdvanced: boolean;
}

/**
 * The admin's dropdown defaults of the quotation form (Company, Quote Stage, Validation Period, Terms & Condition,
 * Payment Terms) and the descriptions the terms options pre-fill. Read from the cached form configuration, so call it
 * before the row loop, never inside a row's transaction.
 */
export async function loadQuotationDropdownDefaults(): Promise<QuotationDropdownDefaults> {
    const { formConfigService } = await import('../../form-configs/formConfig.service.js');
    return quotationDropdownDefaults(await formConfigService.getAllConfigs(true));
}

type CheckRow = (raw: Record<string, unknown>, customFields: Record<string, unknown>) => Record<string, unknown>;

const businessToday = () => wallClockNow(ENV.BUSINESS_TIMEZONE).toISOString().slice(0, 10);
const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const firstOf = (...values: unknown[]): string => values.map(text).find(Boolean) ?? '';

const OPPORTUNITY_SELECT = {
    id: true,
    opportunityName: true,
    organizationName: true,
    organizationId: true,
    contact: true,
    contactId: true,
    contactNumber: true,
    contactEmail: true,
    assignedTo: true,
    remarks: true,
    lumpSumDiscount: true,
    roundOff: true,
    lineItems: lineItemsInclude,
} as const;

const ORGANIZATION_SELECT = {
    id: true,
    organizationName: true,
    mailingName: true,
    gstNumber: true,
    billingAddress: true,
    billingStreet: true,
    billingCity: true,
    billingState: true,
    billingPostalCode: true,
    billingCountry: true,
} as const;

const CONTACT_SELECT = {
    id: true,
    name: true,
    mobile: true,
    // The primary email first, as the contact's form lists them.
    emailAddress: { orderBy: [{ isPrimary: 'desc' as const }, { sortOrder: 'asc' as const }], take: 1, select: { email: true } },
} satisfies Prisma.ContactSelect;

/**
 * The live opportunity a row names: by number first, else by its exact name (case-insensitive). Only opportunities
 * the importer may view count (as the quote form requires), so one they can't see fails as not found.
 */
async function findOpportunity(tx: TransactionClient, user: AuthUser, cell: string) {
    const scope = buildAccessScopeWhere(user, 'assignedTo', 'opportunities', 'view');
    const byCode = await tx.opportunity.findFirst({ where: { opportunityCode: cell, isDeleted: false, AND: [scope] }, select: OPPORTUNITY_SELECT });
    if (byCode) return byCode;
    const byName = await tx.opportunity.findMany({ where: { opportunityName: cell, isDeleted: false, AND: [scope] }, select: OPPORTUNITY_SELECT, take: 2 });
    return onlyMatch(byName, { label: 'Opportunity', plural: 'opportunities', hint: 'give its Opportunity number instead.', path: 'opportunity' }, cell);
}

type ImportedOpportunity = Awaited<ReturnType<typeof findOpportunity>>;

/** The row's organization: the one it names, else the opportunity's (by link, else by its name). */
async function findOrganization(tx: TransactionClient, cell: string, opportunity: ImportedOpportunity, lookups: PrefetchedLookups) {
    if (cell) {
        const ref = await findOrganizationByName(tx, cell, lookups);
        const found = ref ? await tx.organization.findFirst({ where: { id: ref.id, isDeleted: false }, select: ORGANIZATION_SELECT }) : null;
        return onlyMatch(found ? [found] : [], { label: 'Organization', plural: 'organizations', hint: '', path: 'organizationName' }, cell);
    }
    if (opportunity.organizationId) {
        const linked = await tx.organization.findFirst({ where: { id: opportunity.organizationId, isDeleted: false }, select: ORGANIZATION_SELECT });
        if (linked) return linked;
    }
    const ref = await findOrganizationByName(tx, opportunity.organizationName, lookups);
    return ref ? tx.organization.findFirst({ where: { id: ref.id, isDeleted: false }, select: ORGANIZATION_SELECT }) : null;
}

/** The row's contact: the one it names (at the organization when there is one), else the opportunity's. */
async function findContact(tx: TransactionClient, cell: string, opportunity: ImportedOpportunity, organizationId: string | undefined) {
    if (cell) {
        const matches = await tx.contact.findMany({
            where: { name: cell, isDeleted: false, ...(organizationId ? { organizationId } : {}) },
            select: CONTACT_SELECT,
            take: 2,
        });
        return onlyMatch(matches, { label: 'Contact', plural: 'contacts', hint: 'link the contact on the quotation after the import.', path: 'contact' }, cell);
    }
    return opportunity.contactId ? tx.contact.findFirst({ where: { id: opportunity.contactId, isDeleted: false }, select: CONTACT_SELECT }) : null;
}

/** The catalog product a Product cell names: by product code, else by exact name (Active ones first). Null = typed. */
async function findProduct(tx: TransactionClient, cell: string) {
    const select = { id: true, productName: true, status: true, mrp: true, taxRate: true, description: true } as const;
    const byCode = await tx.product.findFirst({ where: { productCode: cell, isDeleted: false }, select });
    if (byCode) return byCode;
    const byName = await tx.product.findMany({ where: { productName: cell, isDeleted: false }, select, take: 10 });
    if (byName.length === 0) return null;
    const active = byName.filter((p) => isActiveProductStatus(p.status));
    return onlyMatch(active.length ? active : byName, { label: 'Product', plural: 'products', hint: 'give its product code instead.', path: 'lineItems' }, cell);
}

/** The row's one line item, as picking (or typing) the product on the form fills it. */
async function rowLineItem(tx: TransactionClient, cells: QuotationLineCells): Promise<Record<string, unknown>> {
    const product = await findProduct(tx, cells.product);
    const { discount, discountType } = discountCells(cells.discount, cells.discountType);
    const mrp = product?.mrp ? decimalToNumber(product.mrp) : 0;
    const rate = mrp > 0 ? mrp : numberCell(cells.rate);
    const taxRate = normalizeTaxRate(product?.taxRate) || taxRateCell(cells.taxRate);
    if (!product && (!rate || !taxRate)) {
        const message = `Product '${cells.product}' was not found in the Product Catalog. Give its Rate and GST to quote it as a typed product.`;
        throw HttpError.badRequest(message, [{ path: ['lineItems', '0', 'productName'], message }]);
    }
    return {
        productId: product?.id,
        productName: product?.productName ?? cells.product,
        quantity: numberCell(cells.quantity) ?? QUOTATION_IMPORT_DEFAULTS.quantity,
        rate,
        discount,
        discountType,
        taxRate,
        description: cells.description || product?.description || undefined,
        note: cells.note || undefined,
    };
}

/** The opportunity's line items, as the form copies them onto a new quotation. */
function opportunityLines(opportunity: ImportedOpportunity, cell: string): Record<string, unknown>[] {
    const lines = toLineItemDtos(opportunity.lineItems).map(({ id: _id, grossAmount: _g, discountAmount: _d, taxableAmount: _t, productId, ...line }) => ({
        ...line,
        productId: productId || undefined,
    }));
    if (lines.length === 0) {
        const message = `Product is required: opportunity '${cell}' has no line items to copy.`;
        throw HttpError.badRequest(message, [{ path: ['lineItems'], message }]);
    }
    return lines;
}

/**
 * Reads a quotations import row and returns its write. Cells that can't be read fail here; the linked records are
 * looked up inside the write, where the row is checked against the creation form's rules and saved with
 * createQuotationRecord (code from the Document Series, Product Catalog pricing, totals, GST split, links, the
 * opportunity's stage and the CREATE audit entry).
 */
export function buildQuotationImportRow(
    values: Record<string, string>,
    user: AuthUser,
    ctx: QuotationImportContext,
    checkRow: CheckRow,
): (tx: TransactionClient) => Promise<QuotationRowResult> {
    const { payload, customFields } = buildImportPayload(ctx.fieldConfig, values);
    const cells = quotationLineCells(values);
    const opportunityCell = text(payload.opportunity);
    if (!opportunityCell) {
        throw HttpError.badRequest('Opportunity is required.', [{ path: ['opportunity'], message: 'Opportunity is required.' }]);
    }
    if (!cells.product && hasLineCells(cells)) {
        throw HttpError.badRequest('Product is required when the row has line item values.', [{ path: ['lineItems'], message: 'Product is required.' }]);
    }
    const defaults = ctx.dropdownDefaults;

    return async (tx) => {
        const opportunity = await findOpportunity(tx, user, opportunityCell);
        const organization = await findOrganization(tx, text(payload.organizationName), opportunity, ctx.lookups);
        const contactCell = text(payload.contact);
        const contact = await findContact(tx, contactCell, opportunity, organization?.id ?? undefined);
        // A contact named on the row brings its own number / email; otherwise the opportunity's come first.
        const contactNumber = contactCell ? firstOf(payload.contactNumber, contact?.mobile) : firstOf(payload.contactNumber, opportunity.contactNumber, contact?.mobile);
        const contactEmail = contactCell
            ? firstOf(payload.contactEmail, contact?.emailAddress[0]?.email)
            : firstOf(payload.contactEmail, opportunity.contactEmail, contact?.emailAddress[0]?.email);

        const lineItems = cells.product ? [await rowLineItem(tx, cells)] : opportunityLines(opportunity, opportunityCell);
        const title = firstOf(opportunity.opportunityName, opportunity.organizationName);
        const quotationDate = firstOf(payload.quotationDate) || businessToday();
        const validationPeriod = firstOf(payload.validationPeriod, defaults.validationPeriod);
        const termsAndCondition = firstOf(payload.termsAndCondition, defaults.termsAndCondition);
        const paymentTerms = firstOf(payload.paymentTerms, defaults.paymentTerms);
        const termsDescription = firstOf(payload.termsAndConditionDescription, defaults.termsDescriptions.get(termsAndCondition));
        const remarks = firstOf(payload.remarks, opportunity.remarks);
        const country = firstOf(organization?.billingCountry) || QUOTATION_IMPORT_DEFAULTS.country;
        const hasShipping = ['shippingAddress', 'shippingCity', 'shippingState', 'shippingPostalCode', 'shippingCountry'].some((key) => text(payload[key]));

        const raw: Record<string, unknown> = {
            ...payload,
            quotationTitle: firstOf(payload.quotationTitle, title),
            opportunity: title,
            opportunityId: opportunity.id,
            company: firstOf(payload.company, defaults.company),
            quoteStage: firstOf(payload.quoteStage, defaults.quoteStage),
            quotationDate,
            validationPeriod: validationPeriod || undefined,
            validUntil: firstOf(payload.validUntil) || validUntilFor(quotationDate, validationPeriod, QUOTATION_IMPORT_DEFAULTS.validityDays),
            preparedFor: firstOf(payload.preparedFor, QUOTATION_IMPORT_DEFAULTS.preparedFor),
            assignedTo: firstOf(payload.assignedTo, opportunity.assignedTo, user.username),
            termsAndCondition: termsAndCondition || undefined,
            termsAndConditionDescription: termsDescription || undefined,
            paymentTerms: paymentTerms || undefined,
            paymentTermsDescription: firstOf(payload.paymentTermsDescription, defaults.paymentDescriptions.get(paymentTerms)) || undefined,
            remarks: remarks || undefined,
            organizationName: firstOf(payload.organizationName, organization?.organizationName, opportunity.organizationName) || undefined,
            organizationId: organization?.id,
            mailingName: firstOf(payload.mailingName, organization?.mailingName, organization?.organizationName, opportunity.organizationName) || undefined,
            gstNumber: firstOf(payload.gstNumber, organization?.gstNumber) || undefined,
            contact: firstOf(contactCell, contact?.name, opportunity.contact),
            contactId: contact?.id,
            contactNumber: contactNumber || undefined,
            contactEmail: contactEmail || undefined,
            billingAddress: firstOf(payload.billingAddress, organization?.billingAddress, organization?.billingStreet),
            billingCity: firstOf(payload.billingCity, organization?.billingCity),
            billingState: firstOf(payload.billingState, organization?.billingState),
            billingPostalCode: firstOf(payload.billingPostalCode, organization?.billingPostalCode) || undefined,
            billingCountry: firstOf(payload.billingCountry) || country,
            // The form copies the billing address unless shipping is filled in.
            copyAddressFromBilling: !hasShipping,
            lineItems,
            // Copied lines keep the opportunity's Lump Sum Discount, as the form does; a new line starts without one.
            lumpSumDiscount: cells.product ? 0 : decimalToNumber(opportunity.lumpSumDiscount),
            roundOff: opportunity.roundOff,
            status: QUOTATION_IMPORT_DEFAULTS.status,
            quotationSubject: firstOf(payload.quotationTitle, title),
            notes: text(opportunity.remarks) || undefined,
            termsAndConditions: termsDescription || undefined,
            customFields,
        };
        const input = quotationInputSchema.parse(raw);
        input.customFields = checkRow(raw, customFields);
        const { opportunityAdvanced } = await createQuotationRecord(tx, input, user);
        return { opportunityAdvanced };
    };
}
