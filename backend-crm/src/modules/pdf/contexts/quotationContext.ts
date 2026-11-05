import { prisma } from '../../../config/prisma.js';
import { HttpError } from '../../../utils/httpError.js';
import { decimalToNumber, parseCustomFields, text } from '../../../utils/mappers.js';
import { lineItemsInclude } from '../../shared/lineItems.js';
import type { CustomFieldMeta } from '../fieldRegistry.js';
import { flattenVisibility, visibleColumns } from '../fieldVisibility.js';
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
    amount: number;
    discount: number;
    discountType: string;
    salePrice: number;
    taxRate: string;
    taxAmount: number;
    total: number;
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
    groupName: string;
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
    totals: { totalAmount: number; totalDiscount: number; lumpSumDiscount: number; subtotal: number; totalTax: number; grandTotal: number };
    terms: { paymentTerms: string; paymentTermsDescription: string; termsAndCondition: string; termsAndConditionDescription: string };
    lineItems: QuotationSourceLineItem[];
    customValues: Record<string, unknown>;
}

function buildAddress(parts: Omit<PdfAddress, 'full'>, prefix: 'billing' | 'shipping', show: Record<string, boolean>): PdfAddress {
    const visible = (key: string) => show[`${prefix}${key}`] !== false;
    const cityLine = [visible('City') ? parts.city : '', visible('State') ? parts.state : ''].filter(Boolean).join(', ');
    const cityWithPin = [cityLine, visible('PostalCode') ? parts.postalCode : ''].filter(Boolean).join(' - ');
    const full = [visible('Street') ? parts.street : '', cityWithPin, visible('Country') ? parts.country : ''].filter((p) => p && p.trim()).join('\n');
    return { ...parts, full };
}

function formatCustomValue(value: unknown, fieldType: string, currency: string): string {
    if (value === null || value === undefined) return '';
    if (Array.isArray(value)) return value.map((v) => String(v)).join(', ');
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (fieldType === 'date') return formatDate(value);
    if (fieldType === 'amount') return formatCurrency(value, currency);
    if (fieldType === 'number') return formatNumber(value);
    if (fieldType === 'percentage') return `${formatNumber(value)}%`;
    if (fieldType === 'checkbox') return value === 'true' || value === 1 ? 'Yes' : 'No';
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

export function assembleQuotationContext(source: QuotationSource, input: ContextBuildInput): PdfContext {
    const currency = source.currency;
    const money = (value: number) => formatCurrency(value, currency);
    const show = flattenVisibility(input.visibility);

    const lineItems: PdfLineItem[] = source.lineItems.map((item, index) => ({
        srNo: index + 1,
        productName: item.productName,
        description: item.description,
        note: item.note,
        quantity: item.quantity,
        quantityFormatted: formatNumber(item.quantity),
        amount: item.amount,
        amountFormatted: money(item.amount),
        discount: item.discount,
        discountType: item.discountType,
        discountFormatted: item.discount ? (item.discountType === 'percentage' ? `${formatNumber(item.discount)}%` : money(item.discount)) : '-',
        salePrice: item.salePrice,
        salePriceFormatted: money(item.salePrice),
        taxRate: item.taxRate,
        taxAmount: item.taxAmount,
        taxAmountFormatted: money(item.taxAmount),
        total: item.total,
        totalFormatted: money(item.total),
    }));

    const t = source.totals;
    const totals = {
        ...t,
        totalAmountFormatted: money(t.totalAmount),
        totalDiscountFormatted: money(t.totalDiscount),
        lumpSumDiscountFormatted: money(t.lumpSumDiscount),
        subtotalFormatted: money(t.subtotal),
        totalTaxFormatted: money(t.totalTax),
        grandTotalFormatted: money(t.grandTotal),
        amountInWords: amountInWords(t.grandTotal, currency),
        hasDiscount: t.totalDiscount > 0,
        hasLumpSumDiscount: t.lumpSumDiscount > 0,
    };

    const custom: Record<string, string> = {};
    const customList: PdfContext['customList'] = [];
    for (const field of input.customFields) {
        const value = formatCustomValue(source.customValues[field.fieldKey], field.fieldType, currency);
        custom[field.fieldKey] = value;
        if (value && show[field.fieldKey]) customList.push({ key: field.fieldKey, label: field.label, value });
    }

    const quotation = {
        id: source.id,
        code: source.code,
        title: source.title,
        subject: source.subject || source.title,
        date: formatDate(source.date),
        validUntil: formatDate(source.validUntil),
        stage: source.stage,
        opportunityName: source.opportunityName,
        opportunityCode: source.opportunityCode,
        preparedFor: source.preparedFor,
        otherRef: source.otherRef,
        validationPeriod: source.validationPeriod,
        issuingCompany: source.issuingCompany,
        groupName: source.groupName,
        currency,
        remarks: source.remarks,
    };

    // A logo is only "shown" when there is one to show.
    show.companyLogo = Boolean(show.companyLogo && input.logoDataUri);

    return {
        company: { ...input.branding, companyName: input.branding.companyName || source.issuingCompany, logoDataUri: input.logoDataUri },
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
        billing: buildAddress(source.billing, 'billing', show),
        shipping: buildAddress(source.shipping, 'shipping', show),
        salesPerson: source.salesPerson,
        lineItems,
        totals,
        terms: source.terms,
        custom,
        customList,
        show,
        columns: visibleColumns(input.registry, input.visibility),
        currency,
        meta: { generatedAt: formatDateTime(new Date(), input.timeZone), generatedBy: input.generatedBy },
    };
}

// ─── Database loader ────────────────────────────────────────────────────────────

const notFound = () => HttpError.notFound('Quotation not found');

function fileBaseName(code: string, organizationName: string | null, contactName: string): string {
    const who = slugify(organizationName || contactName || '');
    const safeCode = code.replace(/[^A-Za-z0-9_-]+/g, '-');
    return who ? `${safeCode}_${who}` : safeCode;
}

async function loadRecordMeta(recordId: string): Promise<RecordMeta> {
    const row = await prisma.quotation.findFirst({
        where: { id: recordId, isDeleted: false },
        select: { id: true, quotationCode: true, quotationTitle: true, organizationName: true, contactName: true, updatedAt: true },
    });
    if (!row) throw notFound();
    return {
        id: row.id,
        updatedAt: row.updatedAt,
        fileBaseName: fileBaseName(row.quotationCode, row.organizationName, row.contactName),
        title: `${row.quotationCode} · ${row.quotationTitle}`,
    };
}

async function loadSource(recordId: string): Promise<QuotationSource> {
    const row = await prisma.quotation.findFirst({
        where: { id: recordId, isDeleted: false },
        include: { lineItems: lineItemsInclude, opportunity: { select: { opportunityCode: true } } },
    });
    if (!row) throw notFound();
    const user = row.assignedTo
        ? await prisma.user.findUnique({ where: { username: row.assignedTo }, select: { username: true, fullName: true, phone: true, email: true } })
        : null;

    return {
        id: row.id,
        code: row.quotationCode,
        title: row.quotationTitle,
        subject: text(row.quotationSubject),
        date: row.quotationDate,
        validUntil: row.validUntil,
        stage: row.quoteStage,
        opportunityName: row.opportunityName,
        opportunityCode: row.opportunity?.opportunityCode ?? '',
        preparedFor: row.preparedFor,
        otherRef: text(row.otherRef),
        validationPeriod: row.validationPeriod,
        issuingCompany: row.company,
        groupName: text(row.groupName),
        currency: row.currency,
        remarks: text(row.remarks),
        organizationName: text(row.organizationName),
        mailingName: text(row.mailingName),
        gstNo: text(row.gstNo),
        contactName: row.contactName,
        contactMobile: text(row.contactMobile),
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
            totalTax: decimalToNumber(row.totalTax),
            grandTotal: decimalToNumber(row.grandTotal),
        },
        terms: {
            paymentTerms: row.paymentTerms,
            paymentTermsDescription: text(row.paymentTermsDescription),
            termsAndCondition: row.termsAndCondition,
            termsAndConditionDescription: text(row.termsAndConditionDescription || row.termsAndConditions),
        },
        lineItems: (row.lineItems ?? []).map((item) => ({
            productName: item.productName,
            description: text(item.description),
            note: text(item.note),
            quantity: decimalToNumber(item.quantity),
            amount: decimalToNumber(item.amount),
            discount: decimalToNumber(item.discount),
            discountType: item.discountType,
            salePrice: decimalToNumber(item.salePrice),
            taxRate: item.taxRate,
            taxAmount: decimalToNumber(item.taxAmount),
            total: decimalToNumber(item.total),
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
