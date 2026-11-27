import { prisma } from '../../../config/prisma.js';
import { HttpError } from '../../../utils/httpError.js';
import { decimalToNumber, parseCustomFields, text } from '../../../utils/mappers.js';
import type { AuthUser } from '../../../types/user.types.js';
import { assertRecordAccess } from '../../shared/accessControl.js';
import { lineItemsInclude } from '../../shared/lineItems.js';
import { GST_TYPE_LABELS, lineItemSummary, sumTax, taxRowLines, toDiscountType, toGstType, type GstType } from '../../shared/lineItemMath.js';
import { shownNumberModules } from '../../document-series/documentSeries.service.js';
import type { DisplayFormats } from '../../company-formats/core/displayFormats.js';
import type { CustomFieldMeta } from '../fieldRegistry.js';
import { amountInWords, formatCurrency, formatDate, formatDateTime, formatNumber, slugify } from '../format.js';
import type { PdfAddress, PdfContext, PdfLineItem } from '../pdf.types.js';
import type { ContextBuildInput, PdfModuleAdapter, RecordMeta } from './contextTypes.js';

/**
 * QUOTATION context. `assembleQuotationContext` is pure (plain source DTO in, plain context out) and is
 * shared by the database loader below and the sample context used for previews without a record.
 */

export interface QuotationSourceLineItem {
    productName: string;
    description: string;
    note: string;
    quantity: number;
    rate: number;
    grossAmount: number;
    discount: number;
    /** `percentage` (the default) or `amount`. */
    discountType?: string;
    discountAmount: number;
    taxRate: string;
    taxableAmount: number;
}

export interface QuotationSource {
    id: string;
    code: string;
    title: string;
    subject: string;
    date: Date | string | null;
    validUntil: Date | string | null;
    stage: string;
    opportunityName: string;
    opportunityCode: string;
    preparedFor: string;
    otherRef: string;
    validationPeriod: string;
    issuingCompany: string;
    currency: string;
    remarks: string;
    organizationName: string;
    mailingName: string;
    gstNo: string;
    contactName: string;
    contactMobile: string;
    contactEmail: string;
    billing: Omit<PdfAddress, 'full'>;
    shipping: Omit<PdfAddress, 'full'>;
    salesPerson: { fullName: string; phone: string; email: string; username: string };
    totals: {
        totalAmount: number;
        totalDiscount: number;
        lumpSumDiscount: number;
        /** Total Taxable Amount. */
        subtotal: number;
        actualBeforeTax: number;
        /** IGST / CGST_SGST as saved; null = plain GST. */
        gstType: GstType | null;
        totalTax: number;
        roundOff: boolean;
        roundOffAmount: number;
        grandTotal: number;
    };
    terms: { paymentTerms: string; paymentTermsDescription: string; termsAndCondition: string; termsAndConditionDescription: string };
    lineItems: QuotationSourceLineItem[];
    customValues: Record<string, unknown>;
}

function buildAddress(parts: Omit<PdfAddress, 'full'>): PdfAddress {
    const cityLine = [parts.city, parts.state].filter(Boolean).join(', ');
    const cityWithPin = [cityLine, parts.postalCode].filter(Boolean).join(' - ');
    const full = [parts.street, cityWithPin, parts.country].filter((p) => p && p.trim()).join('\n');
    return { ...parts, full };
}

function formatCustomValue(value: unknown, fieldType: string, currency: string, formats: DisplayFormats): string {
    if (value === null || value === undefined) return '';
    if (Array.isArray(value)) return value.map((v) => String(v)).join(', ');
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (fieldType === 'date') return formatDate(value, formats);
    if (fieldType === 'amount') return formatCurrency(value, currency, formats);
    if (fieldType === 'number') return formatNumber(value, 2, formats);
    if (fieldType === 'percentage') return `${formatNumber(value, 2, formats)}%`;
    if (fieldType === 'checkbox') return value === 'true' || value === 1 ? 'Yes' : 'No';
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

export function assembleQuotationContext(source: QuotationSource, input: ContextBuildInput): PdfContext {
    const currency = source.currency;
    const { formats } = input;
    const money = (value: number) => formatCurrency(value, currency, formats);
    const number = (value: number) => formatNumber(value, 2, formats);

    const lineItems: PdfLineItem[] = source.lineItems.map((item, index) => ({
        srNo: index + 1,
        productName: item.productName,
        description: item.description,
        note: item.note,
        quantity: item.quantity,
        quantityFormatted: number(item.quantity),
        rate: item.rate,
        rateFormatted: money(item.rate),
        grossAmount: item.grossAmount,
        grossAmountFormatted: money(item.grossAmount),
        discount: item.discount,
        discountType: toDiscountType(item.discountType),
        discountAmount: item.discountAmount,
        // A percentage shows as `10%`, an amount as the money it takes off the line.
        discountFormatted: !item.discount ? '-' : toDiscountType(item.discountType) === 'amount' ? money(item.discountAmount) : `${number(item.discount)}%`,
        discountAmountFormatted: item.discountAmount ? money(item.discountAmount) : '-',
        taxRate: item.taxRate,
        taxableAmount: item.taxableAmount,
        taxableAmountFormatted: money(item.taxableAmount),
    }));

    const t = source.totals;
    // The per-rate GST lines ("Add: IGST @ 18%"), recomputed from the saved lines with the saved options.
    const summary = lineItemSummary(source.lineItems, { lumpSumDiscount: t.lumpSumDiscount, roundOff: t.roundOff, gstType: t.gstType });
    const taxRows = summary.taxes.flatMap((row) => taxRowLines(row, t.gstType)).map((line) => ({ ...line, amountFormatted: money(line.amount) }));
    const signed = (value: number) => (value > 0 ? `+ ${money(value)}` : value < 0 ? `- ${money(-value)}` : money(0));
    const igst = sumTax(summary.taxes, 'igst');
    const cgst = sumTax(summary.taxes, 'cgst');
    const sgst = sumTax(summary.taxes, 'sgst');
    const totals = {
        ...t,
        totalAmountFormatted: money(t.totalAmount),
        totalDiscountFormatted: money(t.totalDiscount),
        lumpSumDiscountFormatted: money(t.lumpSumDiscount),
        subtotalFormatted: money(t.subtotal),
        actualBeforeTaxFormatted: money(t.actualBeforeTax),
        gstTypeLabel: t.gstType ? GST_TYPE_LABELS[t.gstType] : 'GST',
        taxes: t.totalTax,
        taxRows,
        igst,
        cgst,
        sgst,
        igstFormatted: money(igst),
        cgstFormatted: money(cgst),
        sgstFormatted: money(sgst),
        totalTaxFormatted: money(t.totalTax),
        roundOffAmountFormatted: signed(t.roundOffAmount),
        grandTotalFormatted: money(t.grandTotal),
        amountInWords: amountInWords(t.grandTotal, currency, formats),
        hasDiscount: t.totalDiscount > 0,
        hasLumpSumDiscount: t.lumpSumDiscount > 0,
    };

    const custom: Record<string, string> = {};
    const customList: PdfContext['customList'] = [];
    for (const field of input.customFields) {
        const value = formatCustomValue(source.customValues[field.fieldKey], field.fieldType, currency, formats);
        custom[field.fieldKey] = value;
        if (value) customList.push({ key: field.fieldKey, label: field.label, value });
    }

    const quotation = {
        id: source.id,
        code: source.code,
        title: source.title,
        subject: source.subject || source.title,
        date: formatDate(source.date, formats),
        validUntil: formatDate(source.validUntil, formats),
        stage: source.stage,
        opportunityName: source.opportunityName,
        opportunityCode: source.opportunityCode,
        preparedFor: source.preparedFor,
        otherRef: source.otherRef,
        validationPeriod: source.validationPeriod,
        issuingCompany: source.issuingCompany,
        currency,
        remarks: source.remarks,
    };

    const theme = input.theme;
    return {
        company: {
            companyName: theme.companyName || source.issuingCompany,
            companyAddress: theme.companyAddress,
            companyPhone: theme.companyPhone,
            companyEmail: theme.companyEmail,
            companyGstin: theme.companyGstin,
            companyWebsite: theme.companyWebsite,
            ...(theme.logoAssetKey ? { logoAssetKey: theme.logoAssetKey } : {}),
            logoDataUri: input.logoDataUri,
        },
        record: quotation,
        quotation,
        customer: {
            organizationName: source.organizationName,
            mailingName: source.mailingName,
            displayName: source.mailingName || source.organizationName || source.contactName,
            gstNo: source.gstNo,
            contactName: source.contactName,
            contactMobile: source.contactMobile,
            contactEmail: source.contactEmail,
        },
        billing: buildAddress(source.billing),
        shipping: buildAddress(source.shipping),
        salesPerson: source.salesPerson,
        lineItems,
        totals,
        terms: source.terms,
        custom,
        customList,
        currency,
        meta: { generatedAt: formatDateTime(new Date(), input.timeZone, formats), generatedBy: input.generatedBy },
    };
}

// ─── Database loader ────────────────────────────────────────────────────────────

const notFound = () => HttpError.notFound('Quotation not found');

function fileBaseName(code: string, organizationName: string | null, contactName: string): string {
    const who = slugify(organizationName || contactName || '');
    const safeCode = code.replace(/[^A-Za-z0-9_-]+/g, '-');
    return [safeCode, who].filter(Boolean).join('_') || 'quotation';
}

async function loadRecordMeta(recordId: string, user: AuthUser): Promise<RecordMeta> {
    const row = await prisma.quotation.findFirst({
        where: { id: recordId, isDeleted: false },
        select: {
            id: true,
            quotationCode: true,
            quotationTitle: true,
            organizationName: true,
            contact: true,
            updatedAt: true,
            assignedTo: true,
            createdBy: true,
        },
    });
    if (!row) throw notFound();
    assertRecordAccess(user, row, 'quotations', 'view');
    // Numbers without an admin-added series stay in the backend.
    const code = (await shownNumberModules()).has('quotation') ? row.quotationCode : '';
    return {
        id: row.id,
        updatedAt: row.updatedAt,
        fileBaseName: fileBaseName(code, row.organizationName, row.contact),
        title: code ? `${code} · ${row.quotationTitle}` : row.quotationTitle,
    };
}

async function loadSource(recordId: string): Promise<QuotationSource> {
    const row = await prisma.quotation.findFirst({
        where: { id: recordId, isDeleted: false },
        include: { lineItems: lineItemsInclude, opportunityRecord: { select: { opportunityCode: true } } },
    });
    if (!row) throw notFound();
    const user = row.assignedTo
        ? await prisma.user.findUnique({ where: { username: row.assignedTo }, select: { username: true, fullName: true, phone: true, email: true } })
        : null;

    const shown = await shownNumberModules();
    return {
        id: row.id,
        // Numbers without an admin-added series stay in the backend (blank, so `hideIfEmpty` fields drop out).
        code: shown.has('quotation') ? row.quotationCode : '',
        title: row.quotationTitle,
        subject: text(row.quotationSubject),
        date: row.quotationDate,
        validUntil: row.validUntil,
        stage: row.quoteStage,
        opportunityName: row.opportunity,
        opportunityCode: shown.has('opportunity') ? (row.opportunityRecord?.opportunityCode ?? '') : '',
        preparedFor: row.preparedFor,
        otherRef: text(row.otherRef),
        validationPeriod: text(row.validationPeriod),
        issuingCompany: row.company,
        currency: row.currency,
        remarks: text(row.remarks),
        organizationName: text(row.organizationName),
        mailingName: text(row.mailingName),
        gstNo: text(row.gstNumber),
        contactName: row.contact,
        contactMobile: text(row.contactNumber),
        contactEmail: text(row.contactEmail),
        billing: {
            street: row.billingAddress,
            city: row.billingCity,
            state: row.billingState,
            postalCode: row.billingPostalCode,
            country: row.billingCountry,
        },
        shipping: row.copyAddressFromBilling
            ? { street: row.billingAddress, city: row.billingCity, state: row.billingState, postalCode: row.billingPostalCode, country: row.billingCountry }
            : {
                  street: text(row.shippingAddress),
                  city: text(row.shippingCity),
                  state: text(row.shippingState),
                  postalCode: text(row.shippingPostalCode),
                  country: text(row.shippingCountry),
              },
        salesPerson: {
            username: row.assignedTo,
            fullName: user?.fullName || row.assignedTo,
            phone: text(user?.phone),
            email: text(user?.email),
        },
        totals: {
            totalAmount: decimalToNumber(row.totalAmount),
            totalDiscount: decimalToNumber(row.totalDiscount),
            lumpSumDiscount: decimalToNumber(row.lumpSumDiscount),
            subtotal: decimalToNumber(row.subtotal),
            actualBeforeTax: decimalToNumber(row.actualBeforeTax),
            gstType: toGstType(row.gstType),
            totalTax: decimalToNumber(row.totalTax),
            roundOff: row.roundOff,
            roundOffAmount: decimalToNumber(row.roundOffAmount),
            grandTotal: decimalToNumber(row.grandTotal),
        },
        terms: {
            paymentTerms: text(row.paymentTerms),
            paymentTermsDescription: text(row.paymentTermsDescription),
            termsAndCondition: text(row.termsAndCondition),
            termsAndConditionDescription: text(row.termsAndConditionDescription || row.termsAndConditions),
        },
        lineItems: (row.lineItems ?? []).map((item) => ({
            productName: item.productName,
            description: text(item.description),
            note: text(item.note),
            quantity: decimalToNumber(item.quantity),
            rate: decimalToNumber(item.rate),
            grossAmount: decimalToNumber(item.grossAmount),
            discount: decimalToNumber(item.discount),
            discountType: toDiscountType(item.discountType),
            discountAmount: decimalToNumber(item.discountAmount),
            taxRate: item.taxRate,
            taxableAmount: decimalToNumber(item.taxableAmount),
        })),
        customValues: parseCustomFields(row.customDataJson),
    };
}

/** Loads the quotation (404 when missing / soft-deleted) and assembles its PDF context. */
export async function buildQuotationPdfContext(recordId: string, input: ContextBuildInput): Promise<PdfContext> {
    return assembleQuotationContext(await loadSource(recordId), input);
}

export function sampleCustomValues(customFields: CustomFieldMeta[]): Record<string, unknown> {
    const values: Record<string, unknown> = {};
    for (const field of customFields) {
        values[field.fieldKey] =
            field.fieldType === 'date' ? '2026-11-20' : field.fieldType === 'checkbox' ? true : ['number', 'amount', 'percentage'].includes(field.fieldType) ? 12 : `Sample ${field.label}`;
    }
    return values;
}

export const quotationPdfAdapter = {
    auditEntityType: 'Quotation',
    loadRecordMeta,
    buildContext: buildQuotationPdfContext,
} satisfies Omit<PdfModuleAdapter, 'buildSampleContext'>;
