import { prisma } from '../../config/prisma.js';
import { isFieldTombstoned } from '../form-configs/formConfig.defaults.js';
import type { LineItemColumnDefinition, PdfFieldDefinition, PdfFieldGroup, PdfFieldRegistry, PdfFieldType, PdfModule } from './pdf.types.js';

/**
 * Printable fields per PDF module. `key` drives visibility (`show.<key>` / `{{#ifShow "key"}}`), `path` is
 * what the "Insert field" picker inserts (`{{path}}`). Paths point at preformatted strings; raw numbers
 * stay available next to them (`totals.grandTotal` vs `totals.grandTotalFormatted`).
 *
 * To add a module: add its static fields + line-item columns here, a context builder in
 * contexts/<module>Context.ts, and register both in moduleAdapters.ts.
 */

const f = (key: string, path: string, label: string, group: PdfFieldGroup, type: PdfFieldType = 'text', defaultVisible = true): PdfFieldDefinition => ({
    key,
    path,
    label,
    group,
    type,
    defaultVisible,
});

const COMPANY_FIELDS: PdfFieldDefinition[] = [
    f('companyLogo', 'company.logoDataUri', 'Logo', 'Company', 'image'),
    f('companyName', 'company.companyName', 'Company Name', 'Company'),
    f('companyAddress', 'company.companyAddress', 'Company Address', 'Company', 'multiline'),
    f('companyPhone', 'company.companyPhone', 'Company Phone', 'Company'),
    f('companyEmail', 'company.companyEmail', 'Company Email', 'Company'),
    f('companyGstin', 'company.companyGstin', 'Company GSTIN', 'Company'),
    f('companyWebsite', 'company.companyWebsite', 'Company Website', 'Company', 'text', false),
];

const address = (prefix: 'billing' | 'shipping', group: PdfFieldGroup, defaultVisible: boolean): PdfFieldDefinition[] => {
    const label = prefix === 'billing' ? 'Billing' : 'Shipping';
    return [
        f(`${prefix}Address`, `${prefix}.full`, `${label} Address (block)`, group, 'multiline', defaultVisible),
        f(`${prefix}Street`, `${prefix}.street`, `${label} Street`, group, 'multiline'),
        f(`${prefix}City`, `${prefix}.city`, `${label} City`, group),
        f(`${prefix}State`, `${prefix}.state`, `${label} State`, group),
        f(`${prefix}PostalCode`, `${prefix}.postalCode`, `${label} Postal Code`, group),
        f(`${prefix}Country`, `${prefix}.country`, `${label} Country`, group),
    ];
};

const QUOTATION_FIELDS: PdfFieldDefinition[] = [
    ...COMPANY_FIELDS,
    f('quotationCode', 'quotation.code', 'Quotation No.', 'Quotation'),
    f('quotationTitle', 'quotation.title', 'Quotation Title', 'Quotation', 'text', false),
    f('quotationSubject', 'quotation.subject', 'Subject', 'Quotation'),
    f('quotationDate', 'quotation.date', 'Quotation Date', 'Quotation', 'date'),
    f('validUntil', 'quotation.validUntil', 'Valid Until', 'Quotation', 'date'),
    f('quoteStage', 'quotation.stage', 'Stage', 'Quotation', 'text', false),
    f('opportunityName', 'quotation.opportunityName', 'Opportunity', 'Quotation', 'text', false),
    f('opportunityCode', 'quotation.opportunityCode', 'Opportunity No.', 'Quotation', 'text', false),
    f('preparedFor', 'quotation.preparedFor', 'Prepared For', 'Quotation', 'text', false),
    f('otherRef', 'quotation.otherRef', 'Other Reference', 'Quotation', 'text', false),
    f('validationPeriod', 'quotation.validationPeriod', 'Validation Period', 'Quotation', 'text', false),
    f('issuingCompany', 'quotation.issuingCompany', 'Issuing Company', 'Quotation', 'text', false),
    f('groupName', 'quotation.groupName', 'Group', 'Quotation', 'text', false),
    f('currency', 'quotation.currency', 'Currency', 'Quotation', 'text', false),
    f('remarks', 'quotation.remarks', 'Remarks', 'Quotation', 'multiline'),
    f('organizationName', 'customer.organizationName', 'Organization', 'Customer'),
    f('mailingName', 'customer.mailingName', 'Mailing Name', 'Customer', 'text', false),
    f('gstNo', 'customer.gstNo', 'Customer GSTIN', 'Customer'),
    f('contactName', 'customer.contactName', 'Contact Person', 'Customer'),
    f('contactMobile', 'customer.contactMobile', 'Contact Mobile', 'Customer'),
    f('contactEmail', 'customer.contactEmail', 'Contact Email', 'Customer'),
    ...address('billing', 'Billing Address', true),
    ...address('shipping', 'Shipping Address', false),
    f('salesPersonName', 'salesPerson.fullName', 'Sales Person', 'Sales Person'),
    f('salesPersonPhone', 'salesPerson.phone', 'Sales Person Phone', 'Sales Person'),
    f('salesPersonEmail', 'salesPerson.email', 'Sales Person Email', 'Sales Person'),
    f('totalAmount', 'totals.totalAmountFormatted', 'Gross Amount', 'Totals', 'currency', false),
    f('totalDiscount', 'totals.totalDiscountFormatted', 'Item Discount', 'Totals', 'currency'),
    f('lumpSumDiscount', 'totals.lumpSumDiscountFormatted', 'Lump-sum Discount', 'Totals', 'currency'),
    f('subtotal', 'totals.subtotalFormatted', 'Subtotal', 'Totals', 'currency'),
    f('totalTax', 'totals.totalTaxFormatted', 'Tax', 'Totals', 'currency'),
    f('grandTotal', 'totals.grandTotalFormatted', 'Grand Total', 'Totals', 'currency'),
    f('amountInWords', 'totals.amountInWords', 'Amount in Words', 'Totals'),
    f('paymentTerms', 'terms.paymentTerms', 'Payment Terms', 'Terms'),
    f('paymentTermsDescription', 'terms.paymentTermsDescription', 'Payment Terms Details', 'Terms', 'multiline'),
    f('termsAndCondition', 'terms.termsAndCondition', 'Terms & Conditions', 'Terms', 'text', false),
    f('termsAndConditionDescription', 'terms.termsAndConditionDescription', 'Terms & Conditions Details', 'Terms', 'multiline'),
];

/** Line-item column catalogue (default order = array order). */
export const QUOTATION_LINE_ITEM_COLUMNS: LineItemColumnDefinition[] = [
    { key: 'srNo', label: 'Sr. No.', defaultVisible: true, align: 'center', widthPct: 6 },
    { key: 'productName', label: 'Item Name', defaultVisible: true, align: 'left' },
    { key: 'description', label: 'Description', defaultVisible: true, align: 'left' },
    { key: 'note', label: 'Note', defaultVisible: false, align: 'left' },
    { key: 'quantity', label: 'Qty', defaultVisible: true, align: 'right', widthPct: 7 },
    { key: 'amount', label: 'Unit Price', defaultVisible: true, align: 'right', widthPct: 12 },
    { key: 'discount', label: 'Discount', defaultVisible: true, align: 'right', widthPct: 9 },
    { key: 'salePrice', label: 'Sale Price', defaultVisible: false, align: 'right', widthPct: 12 },
    { key: 'taxRate', label: 'Tax', defaultVisible: true, align: 'right', widthPct: 9 },
    { key: 'taxAmount', label: 'Tax Amount', defaultVisible: false, align: 'right', widthPct: 11 },
    { key: 'total', label: 'Total', defaultVisible: true, align: 'right', widthPct: 13 },
];

interface ModuleFieldConfig {
    /** FormFieldDefinition.module whose active custom fields are appended. */
    formModule: string;
    fields: PdfFieldDefinition[];
    lineItemColumns: LineItemColumnDefinition[];
}

const MODULE_FIELDS: Record<PdfModule, ModuleFieldConfig> = {
    QUOTATION: { formModule: 'quotations', fields: QUOTATION_FIELDS, lineItemColumns: QUOTATION_LINE_ITEM_COLUMNS },
};

const CUSTOM_TYPE_MAP: Record<string, PdfFieldType> = {
    textarea: 'multiline',
    number: 'number',
    amount: 'currency',
    percentage: 'number',
    date: 'date',
    checkbox: 'boolean',
};

/** The static part of a module's registry (no database). */
export function getStaticFieldRegistry(module: PdfModule): PdfFieldRegistry {
    const config = MODULE_FIELDS[module];
    return { module, fields: [...config.fields], lineItemColumns: [...config.lineItemColumns] };
}

export interface CustomFieldMeta {
    fieldKey: string;
    label: string;
    fieldType: string;
}

/** Active admin-defined custom fields of the module, in form order. */
export async function loadCustomFieldMeta(module: PdfModule): Promise<CustomFieldMeta[]> {
    const rows = await prisma.formFieldDefinition.findMany({
        where: { module: MODULE_FIELDS[module].formModule, isActive: true, isSystem: false },
        orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
        select: { fieldKey: true, label: true, fieldType: true, validationRulesJson: true },
    });
    return rows.filter((r) => !isFieldTombstoned(r.validationRulesJson)).map(({ fieldKey, label, fieldType }) => ({ fieldKey, label, fieldType }));
}

/** Static fields + `custom.<fieldKey>` entries (hidden by default). */
export function buildFieldRegistry(module: PdfModule, customFields: CustomFieldMeta[]): PdfFieldRegistry {
    const base = getStaticFieldRegistry(module);
    const custom = customFields.map((c) =>
        f(c.fieldKey, `custom.${c.fieldKey}`, c.label, 'Custom Fields', CUSTOM_TYPE_MAP[c.fieldType] ?? 'text', false),
    );
    return { ...base, fields: [...base.fields, ...custom] };
}

export async function getFieldRegistry(module: PdfModule): Promise<PdfFieldRegistry> {
    return buildFieldRegistry(module, await loadCustomFieldMeta(module));
}
